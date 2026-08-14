"""
Abyssal OSINT backend.

Serves the static frontend (index.html, dashboard.html, css/, js/, assets/)
and proxies the "LIVE" tools through the server instead of the browser.

Why a backend at all, when the frontend was already calling these APIs
directly? Two reasons:
  1. CORS: some public APIs (crt.sh) never send
     Access-Control-Allow-Origin, so a browser refuses the request no
     matter what. A server-to-server call has no such restriction.
  2. Shodan / VirusTotal need an API key. That key lives in `.env` on
     this server and is used for every visitor — the browser never sees
     it, and nobody using the site needs a key of their own.

     Heads up: this means every visitor spends *your* quota/credits on
     those two. Fine for a demo or a small group; if this ever goes
     properly public, put rate limiting in front of it.

Alice AI (/api/alice/chat) does NOT call any external API — it's a
self-contained rule engine, see backend/alice_brain.py.

Setup:
    cp .env.example .env    # then fill in your Shodan/VirusTotal keys
Run:
    ./venv/bin/uvicorn backend.main:app --reload --port 8000
Then open http://localhost:8000/dashboard.html
"""

import asyncio
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend import alice_brain

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

SHODAN_API_KEY = os.environ.get("SHODAN_API_KEY", "")
VIRUSTOTAL_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "")
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")
OATHNET_API_KEY = os.environ.get("OATHNET_API_KEY", "")
OATHNET_BASE = "https://oathnet.org/api/service"
PSN_NPSSO = os.environ.get("PSN_NPSSO", "")

app = FastAPI(title="Abyssal OSINT API")

HTTP_TIMEOUT = httpx.Timeout(12.0)


async def get_json(url: str, **kwargs):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        try:
            r = await client.get(url, **kwargs)
        except httpx.RequestError as exc:
            raise HTTPException(502, f"No se pudo conectar con el servicio externo: {exc}") from exc

    if r.status_code == 404:
        raise HTTPException(404, "No se encontraron resultados.")
    if r.status_code == 401:
        raise HTTPException(401, "API key inválida.")
    if r.status_code >= 400:
        raise HTTPException(r.status_code, f"El servicio externo respondió con estado {r.status_code}.")

    try:
        return r.json()
    except ValueError as exc:
        raise HTTPException(502, "El servicio externo devolvió una respuesta inválida.") from exc


# ---------------------------------------------------------------- IP Info
@app.get("/api/ip-info/{ip}")
async def ip_info(ip: str):
    data = await get_json(f"https://ipwho.is/{ip}")
    if not data.get("success", True):
        raise HTTPException(404, data.get("message", "IP inválida o no encontrada."))
    return data


# ---------------------------------------------------------------- Whois (RDAP)
@app.get("/api/whois/{domain}")
async def whois(domain: str):
    return await get_json(f"https://rdap.org/domain/{domain}")


# ---------------------------------------------------------------- DNS Recon
@app.get("/api/dns/{domain}")
async def dns_recon(domain: str):
    types = ["A", "AAAA", "MX", "TXT", "NS", "CNAME"]
    out = {}
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        for t in types:
            try:
                r = await client.get(
                    "https://cloudflare-dns.com/dns-query",
                    params={"name": domain, "type": t},
                    headers={"accept": "application/dns-json"},
                )
                out[t] = r.json().get("Answer", [])
            except httpx.RequestError:
                out[t] = []
    if not any(out.values()):
        raise HTTPException(404, "No se encontraron registros DNS para ese dominio.")
    return out


# ---------------------------------------------------------------- Wayback Machine
@app.get("/api/wayback")
async def wayback(url: str = Query(...)):
    # archive.org's own query parser doesn't like the "://" percent-encoded
    # (httpx's params= does that automatically) — it silently returns no
    # snapshots instead of erroring, so build the querystring by hand here,
    # leaving : and / untouched.
    safe_url = quote(url, safe=":/")
    data = await get_json(f"https://archive.org/wayback/available?url={safe_url}")
    if not data.get("archived_snapshots", {}).get("closest"):
        raise HTTPException(404, "No hay snapshots archivados para esa URL.")
    return data


# ---------------------------------------------------------------- GitHub
@app.get("/api/github/{username}")
async def github_user(username: str):
    return await get_json(f"https://api.github.com/users/{username}")


# ---------------------------------------------------------------- Roblox
# Public, unauthenticated endpoints — but they never send
# Access-Control-Allow-Origin, so (like crt.sh) this only works proxied
# through the backend, never as a direct browser fetch().
@app.get("/api/roblox/{username}")
async def roblox_user(username: str):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.post(
            "https://users.roblox.com/v1/usernames/users",
            json={"usernames": [username], "excludeBannedUsers": False},
        )
        matches = (r.json() or {}).get("data", [])
        if not matches:
            raise HTTPException(404, "No existe ese usuario en Roblox.")
        uid = matches[0]["id"]

        profile_r, followers_r, following_r, friends_r, avatar_r = await asyncio.gather(
            client.get(f"https://users.roblox.com/v1/users/{uid}"),
            client.get(f"https://friends.roblox.com/v1/users/{uid}/followers/count"),
            client.get(f"https://friends.roblox.com/v1/users/{uid}/followings/count"),
            client.get(f"https://friends.roblox.com/v1/users/{uid}/friends/count"),
            client.get(f"https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={uid}&size=150x150&format=Png"),
        )

    profile = profile_r.json()
    avatar_data = (avatar_r.json() or {}).get("data", [])
    profile["followers"] = (followers_r.json() or {}).get("count", 0)
    profile["following"] = (following_r.json() or {}).get("count", 0)
    profile["friends"] = (friends_r.json() or {}).get("count", 0)
    profile["avatarUrl"] = avatar_data[0]["imageUrl"] if avatar_data else None
    return profile


# ---------------------------------------------------------------- Reddit (public JSON, no key —
# but Reddit rate-limits/blocks the default httpx UA, so we send a real one)
@app.get("/api/reddit/{username}")
async def reddit_user(username: str):
    data = await get_json(
        f"https://www.reddit.com/user/{username}/about.json",
        headers={"User-Agent": "AbyssalOSINT/1.0 (by /u/abyssal-osint)"},
    )
    if not data.get("data"):
        raise HTTPException(404, "No existe ese usuario en Reddit.")
    return data["data"]


# ---------------------------------------------------------------- Link Resolver (no key —
# just follows the redirect chain server-side and reports every hop)
@app.get("/api/link-resolver")
async def link_resolver(url: str = Query(...)):
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        try:
            r = await client.get(url)
        except httpx.RequestError as exc:
            raise HTTPException(502, f"No se pudo resolver el link: {exc}") from exc

    chain = [{"url": str(h.url), "status": h.status_code} for h in r.history]
    chain.append({"url": str(r.url), "status": r.status_code})
    return {"original_url": url, "final_url": str(r.url), "status": r.status_code, "chain": chain}


# ---------------------------------------------------------------- Usernames (no key — checks a
# curated set of platforms whose existence check is actually reliable via
# plain HTTP status/body, unlike sites that soft-404 behind a 200 login wall)
async def _check_status_200(client: httpx.AsyncClient, url: str):
    try:
        r = await client.get(url)
        return r.status_code == 200
    except httpx.RequestError:
        return None


async def _check_keybase(client: httpx.AsyncClient, username: str):
    try:
        r = await client.get("https://keybase.io/_/api/1.0/user/lookup.json", params={"usernames": username})
        return bool(r.json().get("them"))
    except (httpx.RequestError, ValueError):
        return None


async def _check_hackernews(client: httpx.AsyncClient, username: str):
    try:
        r = await client.get(f"https://hacker-news.firebaseio.com/v0/user/{username}.json")
        return r.text.strip() != "null"
    except httpx.RequestError:
        return None


@app.get("/api/usernames/{username}")
async def usernames_check(username: str):
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.0), follow_redirects=True,
                                  headers={"User-Agent": "Mozilla/5.0 (AbyssalOSINT)"}) as client:
        names = ["GitHub", "GitLab", "DEV.to", "SoundCloud", "Reddit"]
        urls = [
            f"https://github.com/{username}",
            f"https://gitlab.com/{username}",
            f"https://dev.to/{username}",
            f"https://soundcloud.com/{username}",
            f"https://www.reddit.com/user/{username}/about.json",
        ]
        checks = [_check_status_200(client, u) for u in urls]
        keybase_task = _check_keybase(client, username)
        hn_task = _check_hackernews(client, username)
        results = await asyncio.gather(*checks, keybase_task, hn_task)

    profile_urls = {
        "GitHub": f"https://github.com/{username}",
        "GitLab": f"https://gitlab.com/{username}",
        "DEV.to": f"https://dev.to/{username}",
        "SoundCloud": f"https://soundcloud.com/{username}",
        "Reddit": f"https://reddit.com/user/{username}",
        "Keybase": f"https://keybase.io/{username}",
        "Hacker News": f"https://news.ycombinator.com/user?id={username}",
    }
    exists = dict(zip(names + ["Keybase", "Hacker News"], results))
    return {"username": username, "platforms": {n: {"exists": exists[n], "url": profile_urls[n]} for n in profile_urls}}


# ---------------------------------------------------------------- Steam (server's own key, free to get)
@app.get("/api/steam/{identifier}")
async def steam_user(identifier: str):
    if not STEAM_API_KEY:
        raise HTTPException(503, "El servidor todavía no tiene configurada una API key de Steam (.env) — es gratis en steamcommunity.com/dev/apikey.")

    steamid = identifier
    if not identifier.isdigit():
        resolved = await get_json(
            "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/",
            params={"key": STEAM_API_KEY, "vanityurl": identifier},
        )
        response = resolved.get("response", {})
        if response.get("success") != 1:
            raise HTTPException(404, "No existe ese usuario de Steam.")
        steamid = response["steamid"]

    data = await get_json(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
        params={"key": STEAM_API_KEY, "steamids": steamid},
    )
    players = data.get("response", {}).get("players", [])
    if not players:
        raise HTTPException(404, "No existe ese usuario de Steam.")
    return players[0]


# ---------------------------------------------------------------- PlayStation
# No public PSN API exists — this uses the same OAuth flow the official PSN
# mobile app uses internally (client_id/secret and endpoints are public
# knowledge, documented by the psn-api project). Auth starts from an NPSSO
# token (a cookie you get by visiting https://ca.account.sony.com/api/v1/ssocookie
# while logged into playstation.com) — that token is exchanged for a
# short-lived access token, cached here and refreshed as needed so we don't
# redo the NPSSO exchange on every request.
PSN_AUTH_BASE = "https://ca.account.sony.com/api/authz/v3/oauth"
PSN_CLIENT_BASIC_AUTH = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A="
PSN_REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect"

_psn_access_token: str | None = None
_psn_refresh_token: str | None = None
_psn_access_expires_at: float = 0.0
_psn_auth_lock = asyncio.Lock()


async def _psn_exchange_npsso_for_code(client: httpx.AsyncClient) -> str:
    r = await client.get(
        f"{PSN_AUTH_BASE}/authorize",
        params={
            "access_type": "offline",
            "client_id": "09515159-7237-4370-9b40-3806e67c0891",
            "redirect_uri": PSN_REDIRECT_URI,
            "response_type": "code",
            "scope": "psn:mobile.v2.core psn:clientapp",
        },
        headers={"Cookie": f"npsso={PSN_NPSSO}"},
        follow_redirects=False,
    )
    location = r.headers.get("location", "")
    if "code=" not in location:
        raise HTTPException(401, "El NPSSO de PlayStation no es válido o venció (duran ~2 meses) — conseguí uno nuevo.")
    return dict(p.split("=") for p in location.split("?", 1)[1].split("&"))["code"]


async def _psn_get_access_token() -> str:
    global _psn_access_token, _psn_refresh_token, _psn_access_expires_at

    if not PSN_NPSSO:
        raise HTTPException(503, "El servidor todavía no tiene configurado un NPSSO de PlayStation (.env).")

    async with _psn_auth_lock:
        if _psn_access_token and time.time() < _psn_access_expires_at:
            return _psn_access_token

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            if _psn_refresh_token:
                body = {
                    "refresh_token": _psn_refresh_token,
                    "grant_type": "refresh_token",
                    "token_format": "jwt",
                    "scope": "psn:mobile.v2.core psn:clientapp",
                }
            else:
                code = await _psn_exchange_npsso_for_code(client)
                body = {
                    "code": code,
                    "redirect_uri": PSN_REDIRECT_URI,
                    "grant_type": "authorization_code",
                    "token_format": "jwt",
                }

            r = await client.post(
                f"{PSN_AUTH_BASE}/token",
                headers={"Authorization": PSN_CLIENT_BASIC_AUTH, "Content-Type": "application/x-www-form-urlencoded"},
                data=body,
            )
            data = r.json()

        if "access_token" not in data:
            # Refresh token probably expired — fall back to a fresh NPSSO exchange once.
            _psn_refresh_token = None
            raise HTTPException(401, f"No se pudo autenticar con PlayStation: {data.get('error_description', data)}")

        _psn_access_token = data["access_token"]
        _psn_refresh_token = data.get("refresh_token", _psn_refresh_token)
        _psn_access_expires_at = time.time() + data.get("expires_in", 3600) - 60
        return _psn_access_token


@app.get("/api/playstation/{username}")
async def playstation_user(username: str):
    token = await _psn_get_access_token()

    fields = ",".join([
        "npId,onlineId,accountId,avatarUrls,plus,aboutMe,languagesUsed",
        "trophySummary(@default,level,progress,earnedTrophies)",
        "isOfficiallyVerified,personalDetail(@default,profilePictureUrls),personalDetailSharing",
        "primaryOnlineStatus,presences(@default,@titleInfo,platform,lastOnlineDate,hasBroadcastData)",
    ])

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        r = await client.get(
            f"https://us-prof.np.community.playstation.net/userProfile/v1/users/{username}/profile2",
            params={"fields": fields},
            headers={"Authorization": f"Bearer {token}"},
        )

    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(502, "PlayStation devolvió una respuesta inválida.") from exc

    if "error" in data:
        raise HTTPException(404, data["error"].get("message", "No existe ese usuario de PlayStation."))

    return data["profile"]


# ---------------------------------------------------------------- App Store Search
@app.get("/api/appstore")
async def appstore(term: str = Query(...)):
    data = await get_json(
        "https://itunes.apple.com/search",
        params={"term": term, "entity": "software", "limit": 8},
    )
    if not data.get("results"):
        raise HTTPException(404, "No se encontraron apps con ese nombre.")
    return data


# ---------------------------------------------------------------- Crypto (BTC)
@app.get("/api/crypto/{address}")
async def crypto_address(address: str):
    return await get_json(f"https://blockchain.info/rawaddr/{address}", params={"limit": 6, "cors": "true"})


# ---------------------------------------------------------------- Certificate Lookup (crt.sh)
@app.get("/api/certificate/{domain}")
async def certificate_lookup(domain: str):
    data = await get_json("https://crt.sh/", params={"q": f"%.{domain}", "output": "json"})
    if not data:
        raise HTTPException(404, "No se encontraron certificados para ese dominio.")
    return data


# ---------------------------------------------------------------- Shodan (server's own key)
@app.get("/api/shodan/{ip}")
async def shodan_host(ip: str):
    if not SHODAN_API_KEY:
        raise HTTPException(503, "El servidor todavía no tiene configurada una API key de Shodan (.env).")
    return await get_json(f"https://api.shodan.io/shodan/host/{ip}", params={"key": SHODAN_API_KEY})


# ---------------------------------------------------------------- VirusTotal (server's own key)
@app.get("/api/virustotal/{query}")
async def virustotal(query: str):
    if not VIRUSTOTAL_API_KEY:
        raise HTTPException(503, "El servidor todavía no tiene configurada una API key de VirusTotal (.env).")

    if len(query) in (32, 40, 64) and all(c in "0123456789abcdefABCDEF" for c in query):
        endpoint = f"files/{query}"
    elif query.replace(".", "").isdigit() and query.count(".") == 3:
        endpoint = f"ip_addresses/{query}"
    else:
        endpoint = f"domains/{query}"

    return await get_json(f"https://www.virustotal.com/api/v3/{endpoint}", headers={"x-apikey": VIRUSTOTAL_API_KEY})


# ---------------------------------------------------------------- OathNet (server's own key)
# docs.oathnet.org — breach/stealer log search plus a handful of OSINT
# lookups (Gmail via GHunt, Discord, Xbox, email-service checker via
# Holehe). Same "key lives server-side" pattern as Shodan/VirusTotal.
async def oathnet_get(path: str, params: dict):
    if not OATHNET_API_KEY:
        raise HTTPException(503, "El servidor todavía no tiene configurada una API key de OathNet (.env).")

    # Some OathNet services (e.g. roblox-userinfo, which sweeps several
    # providers) report their own module timeout at 12s — give it real
    # headroom instead of racing our own default 12s client timeout.
    async with httpx.AsyncClient(timeout=httpx.Timeout(25.0)) as client:
        try:
            r = await client.get(f"{OATHNET_BASE}{path}", params=params, headers={"x-api-key": OATHNET_API_KEY})
        except httpx.RequestError as exc:
            raise HTTPException(502, f"No se pudo conectar con OathNet: {exc}") from exc

    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(502, "OathNet devolvió una respuesta inválida.") from exc

    # OathNet reports failures both via HTTP status and via {"success": false, "message": ...}
    # in an otherwise-200 body — surface whichever message it gives instead of a generic one.
    if r.status_code >= 400 or data.get("success") is False:
        message = data.get("message") or (data.get("errors") or {}).get("error") or f"OathNet respondió con estado {r.status_code}."
        raise HTTPException(r.status_code if r.status_code >= 400 else 502, message)

    return data


@app.get("/api/oathnet/breach/{query}")
async def oathnet_breach(query: str):
    return await oathnet_get("/v2/breach/search", {"q": query})


@app.get("/api/oathnet/stealer/{query}")
async def oathnet_stealer(query: str):
    return await oathnet_get("/v2/stealer/search", {"q": query})


# Richer than /api/roblox (adds old-username history and linked Discord,
# which the free Roblox API never exposes) — powers Roblox Profile Scraper.
@app.get("/api/oathnet/roblox/{identifier}")
async def oathnet_roblox(identifier: str):
    key = "user_id" if identifier.isdigit() else "username"
    return await oathnet_get("/roblox-userinfo", {key: identifier})


@app.get("/api/oathnet/gmail/{email}")
async def oathnet_gmail(email: str):
    return await oathnet_get("/ghunt", {"email": email})


async def _gravatar_photo(email: str) -> str | None:
    # Fully free, no key, no quota — Gravatar's own avatar endpoint returns
    # a real 404 (via ?d=404) when the email has no public photo, and the
    # actual image otherwise. Doesn't require OathNet or any account.
    email_hash = hashlib.md5(email.strip().lower().encode()).hexdigest()
    url = f"https://www.gravatar.com/avatar/{email_hash}?d=404"
    async with httpx.AsyncClient(timeout=httpx.Timeout(6.0)) as client:
        try:
            r = await client.head(url, follow_redirects=True)
        except httpx.RequestError:
            return None
    return url if r.status_code == 200 else None


@app.get("/api/oathnet/email-search/{email}")
async def oathnet_email_search(email: str):
    email = email.strip()
    if " " in email or "@" not in email:
        raise HTTPException(422, f'"{email}" no es un email válido (revisá que no tenga espacios de más).')

    # Holehe (account-existence sweep across ~20 services) and GHunt (a
    # richer Google profile — name, Gaia ID, picture, the actual "linked
    # accounts" visualization) are independent OathNet services with
    # separate quotas. Holehe's is much smaller (10/session vs GHunt's 25)
    # and runs out fast — that must not take GHunt down with it, since
    # GHunt alone already covers the visualization use case. Gravatar is
    # a third, entirely free source layered on top of both.
    try:
        result = await oathnet_get("/holehe", {"email": email})
    except HTTPException as exc:
        is_quota_error = "quota" in str(exc.detail).lower()
        result = {"success": False, "message": exc.detail, "data": {"domains": [], "quota_exhausted": is_quota_error, "holehe_error": None if is_quota_error else exc.detail}}

    try:
        ghunt = await oathnet_get("/ghunt", {"email": email})
        google_data = ghunt.get("data", {})
        result["data"]["google_account"] = google_data if "error" not in google_data else None
    except HTTPException:
        result["data"]["google_account"] = None

    result["data"]["gravatar_url"] = await _gravatar_photo(email)

    return result


@app.get("/api/oathnet/discord/{discord_id}")
async def oathnet_discord(discord_id: str):
    profile = await oathnet_get("/discord-userinfo", {"discord_id": discord_id})

    try:
        history = await oathnet_get("/discord-username-history", {"discord_id": discord_id})
        profile["data"]["username_history"] = history.get("data", {}).get("history", [])
    except HTTPException:
        profile["data"]["username_history"] = []

    # The Discord ID itself often also turns up in breach-indexed records
    # (e.g. Discord's own moderation/transparency data) and in infostealer
    # logs (malware that grabbed the Discord token/ID off an infected
    # machine) — cross-reference both, the same way oathnet.org's own
    # unified search does, instead of only showing the bare profile.
    try:
        breach = await oathnet_get("/v2/breach/search", {"q": discord_id})
        profile["data"]["breach_records"] = breach.get("data", {}).get("items", [])
    except HTTPException:
        profile["data"]["breach_records"] = []

    try:
        stealer = await oathnet_get("/v2/stealer/search", {"discord_id[]": discord_id})
        profile["data"]["stealer_records"] = stealer.get("data", {}).get("items", [])
    except HTTPException:
        profile["data"]["stealer_records"] = []

    return profile


@app.get("/api/oathnet/xbox/{gamertag}")
async def oathnet_xbox(gamertag: str):
    return await oathnet_get("/xbox", {"xbl_id": gamertag})


# ---------------------------------------------------------------- Alice AI chat
# Alice's own rule-based engine (backend/alice_brain.py) — no external API,
# no key, nothing to configure. If the message contains something
# investigable (an IP, a domain, a GitHub user, a BTC address), she
# actually runs the matching tool(s) above and reports back on the real
# data, instead of just describing what the tool does. The reply streams
# out word by word over the same SSE shape the frontend already parses,
# so it still animates in like a real model's output would.

class ChatRequest(BaseModel):
    nickname: str
    message: str


async def _run_investigation(plan: dict, nickname: str) -> str:
    kind, value = plan["type"], plan["value"]

    if kind == "ip":
        try:
            ipinfo = await ip_info(value)
        except HTTPException as exc:
            return f"Intenté buscar la IP {value}, {nickname}, pero no obtuve resultados ({exc.detail})."
        shodan_data, shodan_error = None, None
        if SHODAN_API_KEY:
            try:
                shodan_data = await shodan_host(value)
            except HTTPException as exc:
                shodan_error = exc.detail
        return alice_brain.format_ip_report(nickname, value, ipinfo, shodan_data, shodan_error)

    if kind == "domain":
        whois_data = dns_data = wayback_data = None
        whois_err = dns_err = None
        try:
            whois_data = await whois(value)
        except HTTPException as exc:
            whois_err = exc.detail
        try:
            dns_data = await dns_recon(value)
        except HTTPException as exc:
            dns_err = exc.detail
        try:
            wayback_data = await wayback(f"https://{value}")
        except HTTPException:
            wayback_data = None
        return alice_brain.format_domain_report(nickname, value, whois_data, whois_err, dns_data, dns_err, wayback_data)

    if kind == "github":
        try:
            gh = await github_user(value)
        except HTTPException as exc:
            return f'Busqué el usuario de GitHub "{value}", {nickname}, pero no encontré nada ({exc.detail}).'
        return alice_brain.format_github_report(nickname, gh)

    if kind == "roblox":
        try:
            rb = await roblox_user(value)
        except HTTPException as exc:
            return f'Busqué el usuario de Roblox "{value}", {nickname}, pero no encontré nada ({exc.detail}).'
        return alice_brain.format_roblox_report(nickname, rb)

    if kind == "crypto":
        try:
            data = await crypto_address(value)
        except HTTPException as exc:
            return f"Intenté analizar la dirección {value}, {nickname}, pero no obtuve resultados ({exc.detail})."
        return alice_brain.format_crypto_report(nickname, data)

    return alice_brain.respond(value, nickname)


@app.post("/api/alice/chat")
async def alice_chat(payload: ChatRequest):
    nickname = payload.nickname or "investigador"

    if alice_brain.is_danger_message(payload.message):
        reply = alice_brain.safety_response(nickname, payload.message)
    else:
        plan = alice_brain.plan_investigation(payload.message)
        reply = await _run_investigation(plan, nickname) if plan else alice_brain.respond(payload.message, nickname)

    async def stream():
        words = reply.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield f'data: {json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": chunk}})}\n\n'
            await asyncio.sleep(0.025)

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------- Static site (must be last)
app.mount("/", StaticFiles(directory=ROOT_DIR, html=True), name="static")
