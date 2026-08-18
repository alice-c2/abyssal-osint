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
import io
import ipaddress
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote, unquote

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from backend import alice_brain

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

SHODAN_API_KEY = os.environ.get("SHODAN_API_KEY", "")
VIRUSTOTAL_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "")
FORTNITE_API_KEY = os.environ.get("FORTNITE_API_KEY", "")
NUMVERIFY_API_KEY = os.environ.get("NUMVERIFY_API_KEY", "")
INDICIA_HUDSONROCK_KEY = os.environ.get("INDICIA_HUDSONROCK_KEY", "")
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
INDICIA_BASE = "https://api.indicia.app"
OATHNET_API_KEY = os.environ.get("OATHNET_API_KEY", "")
OATHNET_BASE = "https://oathnet.org/api/service"
PSN_NPSSO = os.environ.get("PSN_NPSSO", "")
WIGLE_API_NAME = os.environ.get("WIGLE_API_NAME", "")
WIGLE_API_TOKEN = os.environ.get("WIGLE_API_TOKEN", "")
OPENCELLID_API_KEY = os.environ.get("OPENCELLID_API_KEY", "")
NETRYX_ASTRA_URL = os.environ.get("NETRYX_ASTRA_URL", "").rstrip("/")
TRUECALLER_INSTALLATION_ID = os.environ.get("TRUECALLER_INSTALLATION_ID", "")
TRUECALLER_LOOKUP_SCRIPT = ROOT_DIR / "backend" / "truecaller_cli" / "lookup.js"
DASHBOARD_ACCESS_KEY = os.environ.get("DASHBOARD_ACCESS_KEY", "")

app = FastAPI(title="Abyssal OSINT API")

HTTP_TIMEOUT = httpx.Timeout(12.0)


# Every /api/* route below spends a paid quota (OathNet, Shodan, VirusTotal,
# Indicia/Hudson Rock, Wigle, Numverify, Truecaller...) that lives server-side
# specifically so visitors don't need their own key. Without this gate,
# anyone who knows (or guesses) an endpoint URL can hit it directly and burn
# that quota — no browser, no dashboard, just curl. Same 503-if-unset style
# as the rest of this file: refuse to run unconfigured rather than silently
# serving unauthenticated. The frontend sends the key back as X-Access-Key
# (see js/live-tools.js) — this is a shared secret for a small/private
# deployment, not real multi-user auth.
@app.middleware("http")
async def require_access_key(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        if not DASHBOARD_ACCESS_KEY:
            return JSONResponse(status_code=503, content={"detail": "El servidor no tiene configurada una clave de acceso (.env: DASHBOARD_ACCESS_KEY)."})
        if request.headers.get("x-access-key") != DASHBOARD_ACCESS_KEY:
            return JSONResponse(status_code=401, content={"detail": "Clave de acceso inválida o faltante."})
    return await call_next(request)


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

    # Second, independent source (ipapi.co, also free/keyless — 1k req/day)
    # to cross-check geolocation/ASN, since providers sometimes disagree.
    # ipapi.co reports failure as HTTP 200 + {"error": true, "reason": "..."}
    # instead of a real error status, and its free tier rate-limits fairly
    # easily — either way this must not take down the primary ipwho.is result.
    ipapi_co = None
    try:
        candidate = await get_json(f"https://ipapi.co/{ip}/json/", headers={"User-Agent": "AbyssalOSINT/1.0"})
        if not candidate.get("error"):
            ipapi_co = candidate
    except HTTPException:
        pass
    data["ipapi_co"] = ipapi_co

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


# ---------------------------------------------------------------- GitHub Email Finder (the "git log
# trick" — same technique github-email-finder.netlify.app uses: GitHub's
# own commit search API returns the raw git commit author, which always
# has a real email even when the account's profile email is private).
# Public, no key — but GitHub rate-limits unauthenticated Search API calls
# hard (10/min), so this fails fast under load rather than hanging.
@app.get("/api/github-email/{username}")
async def github_email(username: str):
    data = await get_json(
        "https://api.github.com/search/commits",
        params={"q": f"author:{username}", "per_page": 1, "sort": "author-date", "order": "desc"},
        headers={"Accept": "application/vnd.github.cloak-preview+json"},
    )
    items = data.get("items") or []
    if not items:
        raise HTTPException(404, "No se encontró ningún email público en el historial de commits de este usuario.")

    author = items[0].get("commit", {}).get("author", {})
    return {
        "email": author.get("email"),
        "name": author.get("name"),
        "commit_url": items[0].get("html_url"),
        "repository": items[0].get("repository", {}).get("full_name"),
        "date": author.get("date"),
    }


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


# ---------------------------------------------------------------- Link Resolver (no key —
# follows the redirect chain server-side, cross-checks the final domain
# against Phishunt's free/keyless phishing-domain feed, and reports the
# URL-encoded/decoded forms — merged Link Resolver + Phishing Feed +
# URL Encode/Decode into one "everything about this URL" tool instead of
# three separate cards, since a resolved link is exactly when you'd also
# want to know if it's decoded/phishing.
#
# SSRF guard: this endpoint fetches a URL the caller fully controls, so
# every hop (the initial URL AND every redirect target) is resolved and
# checked against private/loopback/link-local/reserved ranges before we
# connect — otherwise this server becomes an open proxy into Vercel's
# internal network. follow_redirects=True doesn't give a per-hop
# validation point, so redirects are followed manually instead.
_MAX_REDIRECTS = 5


async def _assert_public_host(host: str) -> None:
    if not host:
        raise HTTPException(400, "URL inválida.")
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    except OSError as exc:
        raise HTTPException(502, f"No se pudo resolver el host: {host}") from exc
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast or addr.is_unspecified:
            raise HTTPException(400, "No se permite resolver URLs que apunten a redes internas/privadas.")


@app.get("/api/link-resolver")
async def link_resolver(url: str = Query(...)):
    current = httpx.URL(url)
    if current.scheme not in ("http", "https"):
        raise HTTPException(400, "Solo se admiten URLs http:// o https://.")

    chain = []
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=False) as client:
        for _ in range(_MAX_REDIRECTS + 1):
            await _assert_public_host(current.host)
            try:
                r = await client.get(current)
            except httpx.RequestError as exc:
                raise HTTPException(502, f"No se pudo resolver el link: {exc}") from exc
            chain.append({"url": str(current), "status": r.status_code})
            if r.is_redirect and (location := r.headers.get("location")):
                current = current.join(location)
                if current.scheme not in ("http", "https"):
                    raise HTTPException(400, "Redirección a un esquema no permitido.")
                continue
            break
        else:
            raise HTTPException(502, "Demasiadas redirecciones.")

    final_url = str(current)
    final_domain = current.host

    phishing_match = None
    try:
        feed = await get_json("https://phishunt.io/api/v1/domains")
        phishing_match = next((e for e in feed.get("results", []) if e.get("domain") == final_domain), None)
    except HTTPException:
        pass

    return {
        "original_url": url,
        "final_url": final_url,
        "status": r.status_code,
        "chain": chain,
        "decoded": unquote(url),
        "encoded": quote(final_url, safe=""),
        "phishing_match": phishing_match,
    }


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
        # A miss comes back as {"them": [null]} — a non-empty list whose
        # only element is None — so checking truthiness of the list alone
        # (the previous check) reports every username as "found".
        them = r.json().get("them") or []
        return bool(them) and them[0] is not None
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
        names = ["GitHub", "GitLab", "DEV.to", "SoundCloud"]
        urls = [
            f"https://github.com/{username}",
            f"https://gitlab.com/{username}",
            f"https://dev.to/{username}",
            f"https://soundcloud.com/{username}",
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
        "Keybase": f"https://keybase.io/{username}",
        "Hacker News": f"https://news.ycombinator.com/user?id={username}",
    }
    exists = dict(zip(names + ["Keybase", "Hacker News"], results))
    return {"username": username, "platforms": {n: {"exists": exists[n], "url": profile_urls[n]} for n in profile_urls}}


# ---------------------------------------------------------------- Epic Games / Fortnite (fortnite-api.com — free,
# server's own key: fortnite-api.com's general endpoints (news, cosmetics)
# are keyless, but /v2/stats needs a free key from their dashboard to
# curb abuse — same "free but needs signup" shape as Steam.
@app.get("/api/epicgames/{username}")
async def epicgames_user(username: str):
    if not FORTNITE_API_KEY:
        raise HTTPException(503, "El servidor todavía no tiene configurada una API key de Fortnite-API (.env) — es gratis en fortnite-api.com/dashboard.")

    data = await get_json(
        "https://fortnite-api.com/v2/stats/br/v2",
        params={"name": username},
        headers={"Authorization": FORTNITE_API_KEY},
    )
    if data.get("status") != 200 or not data.get("data"):
        raise HTTPException(404, "No existe esa cuenta de Epic Games/Fortnite, o no tiene estadísticas públicas.")
    return data["data"]


# ---------------------------------------------------------------- TikTok (no key — parses the SIGI/UNIVERSAL_DATA
# JSON TikTok embeds in the profile page's HTML for its own React app to
# hydrate from. No official public API exists for arbitrary profile lookup;
# this is the same "public data, browser-only" situation as crt.sh/Roblox,
# except here the workaround is parsing embedded JSON instead of calling a
# separate endpoint. Needs real browser-like headers or TikTok's edge WAF
# 403s the request.
TIKTOK_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    "Accept": "text/html",
}


@app.get("/api/tiktok/{username}")
async def tiktok_user(username: str):
    username = username.lstrip("@")
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        try:
            r = await client.get(f"https://www.tiktok.com/@{username}", params={"lang": "en"}, headers=TIKTOK_HEADERS)
        except httpx.RequestError as exc:
            raise HTTPException(502, f"No se pudo conectar con TikTok: {exc}") from exc

    match = re.search(
        r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">(.*?)</script>',
        r.text,
    )
    if not match:
        raise HTTPException(502, "TikTok devolvió una página inesperada (posible bloqueo anti-bot).")

    try:
        payload = json.loads(match.group(1))
    except ValueError as exc:
        raise HTTPException(502, "No se pudo leer los datos del perfil de TikTok.") from exc

    user_detail = payload.get("__DEFAULT_SCOPE__", {}).get("webapp.user-detail", {})
    if user_detail.get("statusCode"):
        raise HTTPException(404, f"No existe ese usuario de TikTok ({user_detail.get('statusMsg', 'no encontrado')}).")

    user_info = user_detail.get("userInfo", {})
    if not user_info:
        raise HTTPException(404, "No existe ese usuario de TikTok.")

    region, region_error = await tiktok_region_lookup(username)

    return {"user": user_info.get("user", {}), "stats": user_info.get("stats", {}), "region": region, "region_error": region_error}


def _flag_emoji(iso2: str) -> str:
    if not iso2 or len(iso2) != 2 or not iso2.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(c.upper()) - ord("A")) for c in iso2)


# Registered/locked region — genuinely free & unauthenticated, no key, no
# captcha. user.tikmatrix.com (the previous source, confirmed working
# 2026-08-15) died within two days — TCP connect now times out entirely,
# host is gone or blackholing us, not just rate-limiting. Replaced with the
# Cloudflare Worker that tikip.us's own frontend calls (found by inspecting
# its network traffic): it 403s without a Referer/Origin matching tikip.us,
# so those are spoofed the same way TIKTOK_HEADERS spoofs a browser UA
# above. This is exactly as fragile as the service it replaces — expect it
# to rot too and need swapping again.
TIKTOK_REGION_API = "https://shinyfrydgdghfdgdgmouse-a6de.issam1996kech.workers.dev/api/v1/profile"
TIKTOK_REGION_HEADERS = {
    **TIKTOK_HEADERS,
    "Referer": "https://tikip.us/",
    "Origin": "https://tikip.us",
}


async def tiktok_region_lookup(username: str):
    # Same reasoning as before: a connection-level failure (RequestError)
    # means the whole service is down, so it fails fast with no retry.
    # A 429 gets a couple of quick retries since that one's just this
    # worker's own rate limit, not the upstream being gone.
    # The worker itself takes ~4-5s per call (it's doing its own round trip
    # to TikTok internally) — a 5s timeout was right on the edge and flaked
    # intermittently in testing, hence 9s here.
    last_error = "Sin datos de región para este usuario."
    async with httpx.AsyncClient(timeout=httpx.Timeout(9.0)) as client:
        for attempt in range(3):
            if attempt:
                await asyncio.sleep(1.5 * attempt)
            try:
                r = await client.get(TIKTOK_REGION_API, params={"username": username}, headers=TIKTOK_REGION_HEADERS)
            except httpx.RequestError as exc:
                return None, f"No se pudo conectar con el buscador de región: {exc or type(exc).__name__}"

            if r.status_code == 429:
                last_error = "El buscador de región está saturado ahora mismo."
                continue
            if r.status_code != 200:
                return None, "El buscador de región no tiene datos para este usuario."

            try:
                data = r.json()
            except ValueError:
                return None, "El buscador de región devolvió una respuesta inválida."

            if data.get("status") != "success":
                return None, "Sin datos de región para este usuario."

            d = data.get("data", {})
            current_code = d.get("current_region")
            registered_code = d.get("registered_region")
            active = {"flag": _flag_emoji(current_code), "name": d.get("current_region_name")} if current_code else None
            locked = {"flag": _flag_emoji(registered_code), "name": d.get("registered_region_name")} if registered_code else None
            if not active and not locked:
                return None, "Sin datos de región para este usuario."

            return {"active": active, "locked": locked}, None

    return None, last_error


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
        raise HTTPException(503, "Este servicio no está disponible por ahora.")

    # Some OathNet services (e.g. roblox-userinfo, which sweeps several
    # providers) report their own module timeout at 12s — give reads real
    # headroom instead of racing our own default 12s client timeout. But
    # split out the connect phase: when OathNet is fully down (confirmed
    # 2026-08-15 — TCP handshake never completes, not even a fast RST),
    # a 25s connect timeout means every OathNet-dependent module —
    # including independent ones merged in after, like Hudson Rock in
    # oathnet_stealer() — hangs for 25s before anything else can run.
    # Fail the connect phase fast; keep the long budget for an established
    # connection that's just slow to respond.
    timeout = httpx.Timeout(25.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            r = await client.get(f"{OATHNET_BASE}{path}", params=params, headers={"x-api-key": OATHNET_API_KEY})
        except httpx.RequestError as exc:
            raise HTTPException(502, "No se pudo conectar con el servicio externo.") from exc

    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(502, "El servicio externo devolvió una respuesta inválida.") from exc

    # OathNet reports failures both via HTTP status and via {"success": false, "message": ...}
    # in an otherwise-200 body — surface whichever message it gives instead of a generic one.
    if r.status_code >= 400 or data.get("success") is False:
        message = data.get("message") or (data.get("errors") or {}).get("error") or f"El servicio respondió con estado {r.status_code}."
        raise HTTPException(r.status_code if r.status_code >= 400 else 502, message)

    # OathNet embeds our account's plan/quota/queries-left-today under
    # "_meta" in every response body (not headers) — strip it before it
    # reaches the client. Anyone who can see it can watch our quota drain
    # in real time and knows exactly how many free shots they have left.
    data.pop("_meta", None)
    return data


@app.get("/api/oathnet/breach/{query}")
async def oathnet_breach(query: str):
    return await oathnet_get("/v2/breach/search", {"q": query})


# Real Hudson Rock data via Indicia (api.indicia.app) — a scoped key that
# only has access to Indicia's Hudson Rock module. Confirmed working
# 2026-08-15 against Indicia's actual SDK-documented endpoint. Merged into
# the OathNet stealer search below since the two draw from different
# infostealer-log indexes and aren't redundant.
async def indicia_hudsonrock(query: str):
    if not INDICIA_HUDSONROCK_KEY:
        return None, "Este servicio no está disponible por ahora."

    query_type = "email" if "@" in query else "username"
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            r = await client.post(
                f"{INDICIA_BASE}/v1/search/intelligence/hudsonrock",
                json={"type": query_type, "query": query},
                headers={"x-api-key": INDICIA_HUDSONROCK_KEY, "Content-Type": "application/json"},
            )
        except httpx.RequestError:
            return None, "No se pudo conectar con el servicio externo."

    try:
        data = r.json()
    except ValueError:
        return None, "El servicio externo devolvió una respuesta inválida."

    if r.status_code >= 400 or data.get("success") is False:
        return None, data.get("error") or f"El servicio respondió con estado {r.status_code}."

    return data.get("data"), None


@app.get("/api/oathnet/stealer/{query}")
async def oathnet_stealer(query: str):
    # Hudson Rock (via Indicia) is an independent source from OathNet's own
    # stealer search — don't let OathNet being down (it was, 2026-08-15)
    # take Hudson Rock down with it. Degrade to an empty OathNet block
    # instead of raising, so Indicia still gets queried below.
    try:
        data = await oathnet_get("/v2/stealer/search", {"q": query})
    except HTTPException as exc:
        data = {"success": False, "data": {"items": []}, "oathnet_error": str(exc.detail)}

    hudsonrock_data, hudsonrock_error = await indicia_hudsonrock(query)
    data["hudsonrock"] = hudsonrock_data
    data["hudsonrock_error"] = hudsonrock_error
    return data


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


@app.get("/api/email-osint/{email}")
async def email_osint(email: str):
    # Merged Mail OSINT + Email Search into one module — both hit the same
    # email and were splitting the same investigation across two cards for
    # no reason. Combines: LeakCheck (breach/leak data, public+keyless),
    # Holehe via OathNet (account-existence sweep across ~20 services),
    # GHunt via OathNet (Google account profile — name, Gaia ID, picture),
    # and Gravatar (free photo lookup). Holehe and GHunt are independent
    # OathNet services with separate quotas — Holehe's is much smaller
    # (10/session vs GHunt's 25) and runs out fast, so a Holehe failure
    # must not take GHunt down with it.
    email = email.strip()
    if " " in email or "@" not in email:
        raise HTTPException(422, f'"{email}" no es un email válido (revisá que no tenga espacios de más).')

    leakcheck_error = None
    try:
        leakcheck = await get_json("https://leakcheck.io/api/public", params={"check": email})
    except HTTPException as exc:
        leakcheck, leakcheck_error = None, exc.detail

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
    result["data"]["leakcheck"] = leakcheck
    result["data"]["leakcheck_error"] = leakcheck_error

    return result


# Discord's own public_flags bitfield (from GET /users/{id}, official Bot
# API — free, just needs a bot token from discord.com/developers). Decoded
# here so the badge names are exact instead of whatever OathNet reports.
DISCORD_PUBLIC_FLAGS = {
    1 << 0: "Discord Employee",
    1 << 1: "Partnered Server Owner",
    1 << 2: "HypeSquad Events",
    1 << 3: "Bug Hunter Level 1",
    1 << 6: "HypeSquad Bravery",
    1 << 7: "HypeSquad Brilliance",
    1 << 8: "HypeSquad Balance",
    1 << 9: "Early Supporter",
    1 << 14: "Bug Hunter Level 2",
    1 << 16: "Verified Bot",
    1 << 17: "Early Verified Bot Developer",
    1 << 18: "Discord Certified Moderator",
    1 << 22: "Active Developer",
}


async def discord_bot_lookup(discord_id: str):
    if not DISCORD_BOT_TOKEN:
        return None, "El servidor todavía no tiene configurado un bot token de Discord (.env) — es gratis en discord.com/developers."

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            r = await client.get(
                f"https://discord.com/api/v10/users/{discord_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
            )
        except httpx.RequestError as exc:
            return None, f"No se pudo conectar con la API de Discord: {exc}"

    if r.status_code == 404:
        return None, "Ese ID de Discord no existe."
    if r.status_code >= 400:
        return None, f"La API de Discord respondió con estado {r.status_code}."

    try:
        data = r.json()
    except ValueError:
        return None, "Discord devolvió una respuesta inválida."

    flags = data.get("public_flags") or 0
    badges = [name for bit, name in DISCORD_PUBLIC_FLAGS.items() if flags & bit]
    return {
        "public_flags_badges": badges,
        "accent_color": f"#{data['accent_color']:06x}" if data.get("accent_color") is not None else None,
        "is_bot": data.get("bot", False),
        "is_system": data.get("system", False),
    }, None


# Indicia's connectedAccounts — mirrors only what the account owner already
# chose to show publicly on their Discord profile (same data a person sees
# opening the profile in the app), not anything hidden. Any of the 4
# Indicia keys reaches this endpoint (confirmed 2026-08-15 — all fail with
# "Insufficient credits" rather than a permission error), so this stops
# working the moment the account runs dry and starts working again the
# moment it's topped up, with no key changes needed either way.
async def indicia_discord_connections(discord_id: str):
    if not INDICIA_HUDSONROCK_KEY:
        return None, "Este servicio no está disponible por ahora."

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        try:
            r = await client.post(
                f"{INDICIA_BASE}/v1/search/socials/discord",
                json={"query": discord_id},
                headers={"x-api-key": INDICIA_HUDSONROCK_KEY, "Content-Type": "application/json"},
            )
        except httpx.RequestError:
            return None, "No se pudo conectar con el servicio externo."

    try:
        data = r.json()
    except ValueError:
        return None, "El servicio externo devolvió una respuesta inválida."

    if r.status_code >= 400 or data.get("success") is False:
        return None, data.get("error") or f"El servicio respondió con estado {r.status_code}."

    connections = (data.get("data") or {}).get("connectedAccounts")
    if not connections:
        return None, None  # no error, just nothing public to show
    return connections, None


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

    bot_info, bot_error = await discord_bot_lookup(discord_id)
    profile["data"]["discord_api"] = bot_info
    profile["data"]["discord_api_error"] = bot_error

    connections, connections_error = await indicia_discord_connections(discord_id)
    profile["data"]["connected_accounts"] = connections
    profile["data"]["connections_error"] = connections_error

    return profile


@app.get("/api/oathnet/xbox/{gamertag}")
async def oathnet_xbox(gamertag: str):
    return await oathnet_get("/xbox", {"xbl_id": gamertag})


# ---------------------------------------------------------------- Phone OSINT (module scaffold, 2026-08-15).
# Numverify (apilayer) is wired — server's own free key, validates the
# number and returns carrier/line-type/location. NOTE: their free tier is
# http:// only (https:// needs a paid plan), so this is one of the few
# outbound calls in this file that isn't https — that's intentional, not
# a bug.
#
# Truecaller (owner name/email) is wired via truecallerjs
# (github.com/sumithemmadi/truecallerjs) — it's a Node/TS library, no
# Python port exists, so backend/truecaller_cli/lookup.js is a thin CJS
# wrapper we shell out to. It needs an installationId, which isn't an API
# key you generate — it comes from actually registering a Truecaller
# account: run `node backend/truecaller_cli/node_modules/.bin/truecallerjs
# login` (needs a real phone number to receive an OTP), then
# `... -i` to print the installationId, and put it in .env as
# TRUECALLER_INSTALLATION_ID. Until that's set, this source is skipped
# silently rather than shown as an error — logging in requires a real
# person with a real phone, nothing this server can do on its own.
#
# Everything else here is still pending_sources: add the same way once we
# have a key + confirmed endpoint — see email_osint()/oathnet_get() above
# for the pattern.
async def truecaller_lookup(number: str, country_code: str):
    if not TRUECALLER_INSTALLATION_ID:
        return None
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", str(TRUECALLER_LOOKUP_SCRIPT), number, country_code, TRUECALLER_INSTALLATION_ID,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20)
    except (OSError, asyncio.TimeoutError):
        return None
    if proc.returncode != 0:
        return None
    try:
        return json.loads(stdout.decode())
    except ValueError:
        return None


@app.get("/api/phone-osint/{number}")
async def phone_osint(number: str):
    number = number.strip()
    if not number:
        raise HTTPException(422, "Ingresá un número de teléfono.")

    numverify, numverify_error = None, None
    if NUMVERIFY_API_KEY:
        try:
            data = await get_json(
                "http://apilayer.net/api/validate",
                params={"access_key": NUMVERIFY_API_KEY, "number": number},
            )
            if data.get("success") is False:
                numverify_error = (data.get("error") or {}).get("info") or "No se pudo validar el número."
            elif not data.get("valid"):
                numverify_error = "Este número no es válido."
            else:
                numverify = data
        except HTTPException as exc:
            numverify_error = exc.detail
    else:
        numverify_error = "Este servicio no está disponible por ahora."

    truecaller = await truecaller_lookup(number, (numverify or {}).get("country_code") or "US")

    return {
        "number": number,
        "numverify": numverify,
        "numverify_error": numverify_error,
        "truecaller": truecaller,
    }


# ---------------------------------------------------------------- Image Geolocation (module scaffold, 2026-08-17).
# Two sources, tried in order:
#   1. EXIF GPS tags baked into the file itself. Free, instant, no deps
#      beyond Pillow — but only works on unprocessed photos (most social
#      platforms strip EXIF on upload, so this misses screenshots/reposts).
#   2. Netryx Astra V2 (github.com/sparkyniner/Netryx-Astra-V2-Geolocation-Tool),
#      an AI pipeline (MegaLoc + MASt3R) that estimates location from visual
#      content alone — works on photos with no metadata at all, but it's a
#      local ML pipeline, not a hosted API. It needs a GPU and multi-GB
#      model/index downloads, neither of which this box has (no GPU, ~13GB
#      free disk at the time this was wired up). So instead of running it
#      here, this proxies to wherever it's actually deployed: set
#      NETRYX_ASTRA_URL in .env to that host, and stand up a thin wrapper
#      there that exposes POST /geolocate accepting a multipart "image"
#      field and returning JSON (expected shape: {lat, lon, city,
#      radius_km, confidence, ...}).
# The two commercial alternatives (Picarta.ai, GeoSpy.ai) don't help here:
# neither offers a self-serve API — Picarta's API is Enterprise-only
# (email sales), GeoSpy is law-enforcement/gov only.
def _exif_gps(contents: bytes):
    try:
        from PIL import Image
        from PIL.ExifTags import GPSTAGS

        img = Image.open(io.BytesIO(contents))
        exif = img.getexif()
        gps_ifd = exif.get_ifd(0x8825) if exif else None
        if not gps_ifd:
            return None
        gps = {GPSTAGS.get(k, k): v for k, v in gps_ifd.items()}
        lat, lat_ref = gps.get("GPSLatitude"), gps.get("GPSLatitudeRef")
        lon, lon_ref = gps.get("GPSLongitude"), gps.get("GPSLongitudeRef")
        if not (lat and lon and lat_ref and lon_ref):
            return None

        def to_degrees(dms):
            d, m, s = dms
            return float(d) + float(m) / 60.0 + float(s) / 3600.0

        latitude = to_degrees(lat) * (-1 if lat_ref != "N" else 1)
        longitude = to_degrees(lon) * (-1 if lon_ref != "E" else 1)
        return {"lat": latitude, "lon": longitude, "source": "exif"}
    except Exception:
        return None


@app.post("/api/image-geolocation")
async def image_geolocation(image: UploadFile = File(...)):
    contents = await image.read()

    exif_result = _exif_gps(contents)
    if exif_result:
        return exif_result

    if not NETRYX_ASTRA_URL:
        raise HTTPException(404, "No se pudo encontrar la ubicación de esta imagen.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0)) as client:
        try:
            r = await client.post(
                f"{NETRYX_ASTRA_URL}/geolocate",
                files={"image": (image.filename, contents, image.content_type)},
            )
        except httpx.RequestError as exc:
            raise HTTPException(502, f"No se pudo conectar con el motor de visión de Alice: {exc}") from exc

    if r.status_code >= 400:
        raise HTTPException(r.status_code, f"El motor de visión de Alice respondió con estado {r.status_code}.")

    try:
        data = r.json()
    except ValueError as exc:
        raise HTTPException(502, "El motor de visión de Alice devolvió una respuesta inválida.") from exc
    data.setdefault("source", "alice")
    return data


# ---------------------------------------------------------------- Wi-Fi (WiGLE)
# wigle.net — community-crowdsourced WiFi (and cell) survey database.
# Was going to use Mozilla Location Services for both Wi-Fi and Cell Tower
# modules, but MLS has stopped issuing API keys and its own geolocate
# endpoint 404s even for a bare GeoIP fallback — the service is
# effectively dead, not just gated. WiGLE actually works: free self-serve
# signup at wigle.net → Account → your API token, no phone/OTP step.
# Auth is HTTP Basic with (API Name, API Token) from that page.
WIGLE_BASE = "https://api.wigle.net/api/v2"


async def wigle_get(path: str, params: dict):
    if not (WIGLE_API_NAME and WIGLE_API_TOKEN):
        raise HTTPException(503, "Este servicio no está disponible por ahora.")
    return await get_json(f"{WIGLE_BASE}{path}", params=params, auth=(WIGLE_API_NAME, WIGLE_API_TOKEN))


_BSSID_RE = re.compile(r"^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$", re.IGNORECASE)


@app.get("/api/wifi-network/{query}")
async def wifi_network(query: str):
    query = query.strip()
    if _BSSID_RE.match(query):
        data = await wigle_get("/network/detail", {"netid": query})
    else:
        data = await wigle_get("/network/search", {"ssid": query, "onlymine": "false"})
    if not data.get("success", True) or (not data.get("results") and "trilat" not in data):
        raise HTTPException(404, "No se encontraron resultados.")
    return data


@app.get("/api/wifi-nearby")
async def wifi_nearby(lat: float = Query(...), lon: float = Query(...)):
    # ~0.01 degrees is roughly a 1km box at most latitudes — plenty for
    # "what APs are near this point" without pulling in a whole city.
    delta = 0.01
    data = await wigle_get("/network/search", {
        "onlymine": "false",
        "latrange1": lat - delta, "latrange2": lat + delta,
        "longrange1": lon - delta, "longrange2": lon + delta,
    })
    if not data.get("success", True) or not data.get("results"):
        raise HTTPException(404, "No se encontraron resultados.")
    return data


# ---------------------------------------------------------------- Cell Tower (OpenCelliD)
# opencellid.org — community cell-tower database (also fills in for the
# dead Mozilla Location Services). Free self-serve API key from their
# dashboard after signup, email only. Query format for this module's
# single text field: "mcc-mnc-lac-cellid" (dash or comma separated) —
# there's no clean way to ask for 4 separate numbers through the shared
# one-box search UI every other module uses, so this is the compromise.
@app.get("/api/cell-tower/{query}")
async def cell_tower(query: str):
    if not OPENCELLID_API_KEY:
        raise HTTPException(503, "Este servicio no está disponible por ahora.")

    parts = re.split(r"[-,\s]+", query.strip())
    if len(parts) != 4 or not all(p.isdigit() for p in parts):
        raise HTTPException(422, "Formato esperado: mcc-mnc-lac-cellid (todos números).")
    mcc, mnc, lac, cell_id = parts

    data = await get_json("https://opencellid.org/cell/get", params={
        "key": OPENCELLID_API_KEY, "mcc": mcc, "mnc": mnc, "lac": lac, "cellid": cell_id, "format": "json",
    })
    if data.get("error"):
        raise HTTPException(404, "No se encontraron resultados.")
    return data


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
    # Prior turns ({"role": "user"|"assistant", "content": str}), sent by
    # js/alice-chat.js from its own history panel. This endpoint is
    # otherwise stateless per-request — without this, a follow-up like
    # "por Instagram" right after "me estan acosando" looks like a brand
    # new, unrelated one-word message instead of the same conversation.
    history: list[dict] | None = None


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

    if kind == "email":
        try:
            data = await email_osint(value)
        except HTTPException as exc:
            return f"Intenté buscar {value}, {nickname}, pero no obtuve resultados ({exc.detail})."
        return alice_brain.format_email_report(nickname, value, data)

    if kind == "username":
        try:
            data = await usernames_check(value)
        except HTTPException as exc:
            return f'Busqué el alias "{value}", {nickname}, pero no obtuve resultados ({exc.detail}).'
        return alice_brain.format_username_report(nickname, value, data)

    return alice_brain.respond(value, nickname)


@app.post("/api/alice/chat")
async def alice_chat(payload: ChatRequest):
    nickname = payload.nickname or "investigador"
    history = payload.history or []

    # Checked before anything else — tools, investigation, even the
    # extortion/acoso flow all wait. Someone signaling real distress
    # getting a tool menu (or "no entendi eso") back is the worst possible
    # failure mode for a safety-focused assistant.
    distress = alice_brain.detect_distress(payload.message)
    plan = None
    safety_full = False

    if distress:
        reply = alice_brain.distress_response(nickname, distress, payload.message)
    else:
        plan = alice_brain.plan_investigation(payload.message)
        # Resolved against history too, so a short follow-up with no danger
        # keyword of its own ("por Instagram") still counts if the topic was
        # opened a turn or two ago — see resolve_danger_categories().
        danger_categories = alice_brain.resolve_danger_categories(payload.message, history)

        safety_text = None
        if danger_categories:
            safety_text, safety_full = alice_brain.safety_guidance(nickname, payload.message, danger_categories, history)

        if plan:
            # A concrete indicator (alias, email, IP...) was given alongside a
            # danger keyword — e.g. "el alias del extorsionador es X". Do both:
            # actually run the passive lookup the user asked for (that's step 1
            # of the safety advice itself — preservar evidencia) AND still show
            # the safety guidance, instead of the safety text silently
            # swallowing the investigation.
            reply = await _run_investigation(plan, nickname)
            if safety_text:
                reply += "\n\n---\n\n" + safety_text
        elif safety_text:
            reply = safety_text
        else:
            reply = alice_brain.respond(payload.message, nickname)

    async def stream():
        words = reply.split(" ")
        for i, word in enumerate(words):
            chunk = word + (" " if i < len(words) - 1 else "")
            yield f'data: {json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": chunk}})}\n\n'
            await asyncio.sleep(0.025)
        # Lets the frontend know this turn actually investigated something
        # concrete (vs. plain conversation), so it can offer to fold the
        # finding into a case — see js/alice-chat.js's case flow.
        if plan:
            yield f'data: {json.dumps({"type": "investigation", "query": plan["value"], "kind": plan["type"]})}\n\n'
        # Only the FULL safety response ends on the yes/no "¿querés que te
        # ayude a organizar...?" question — the short opener ends on an
        # open question instead, so a plain "sí" after just the opener
        # shouldn't be swallowed as an answer to a question that wasn't
        # actually asked.
        if safety_full:
            yield f'data: {json.dumps({"type": "safety_followup"})}\n\n'

    return StreamingResponse(stream(), media_type="text/event-stream")


# ---------------------------------------------------------------- Static site (must be last)
# Mount only the asset subdirectories the frontend actually needs — never
# ROOT_DIR itself, which also contains .env, .git/, venv/ and backend/
# source that must never be reachable over HTTP.
app.mount("/css", StaticFiles(directory=ROOT_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=ROOT_DIR / "js"), name="js")
app.mount("/assets", StaticFiles(directory=ROOT_DIR / "assets"), name="assets")


@app.get("/")
async def serve_index():
    return FileResponse(ROOT_DIR / "index.html")


@app.get("/dashboard.html")
async def serve_dashboard():
    return FileResponse(ROOT_DIR / "dashboard.html")
