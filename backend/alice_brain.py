"""
Alice's own brain — no external API, no model weights, nothing to train.

This is a small rule/intent engine: it looks for patterns in what the
user typed (danger keywords, tool names, greetings, "what can you do")
and answers from hand-written templates that know exactly what this
site offers. It won't hold a free-flowing conversation like a real LLM,
but for "help me pick the right tool" and "give me safe next steps"
— which is all Alice is actually for here — it doesn't need to.

Keeping it deterministic also means the safety-advice behavior (always
passive, always "go to the authorities") can never be talked out of
itself the way a prompt-only guardrail on a real LLM sometimes can.
"""

import re
import unicodedata

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _norm(text: str) -> str:
    """lowercase + strip accents, so 'pederasta' matches 'PEDERASTA' etc."""
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def _contains_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


# --------------------------------------------------------------------------
# Knowledge: the tools that actually exist on this site (kept in sync by
# hand with js/dashboard.js — not auto-generated, but it's a short list).
# --------------------------------------------------------------------------

TOOLS = [
    {"name": "Web Databases", "category": "Intel", "keywords": ["web databases", "breach", "filtracion", "leak", "brecha"],
     "desc": "busca en bases de filtraciones y brechas de datos por email, usuario, telefono o contrasena."},
    {"name": "Background Check", "category": "Intel", "keywords": ["background check", "antecedentes"],
     "desc": "arma un informe de antecedentes de una persona."},
    {"name": "Reverse Face Search", "category": "Intel", "keywords": ["reverse face", "face search", "busqueda de rostro", "rostro"],
     "desc": "busca coincidencias de una cara subida en perfiles y paginas publicas."},
    {"name": "Image Geolocation", "category": "Intel", "keywords": ["geolocation", "geolocaliza", "donde se tomo"],
     "desc": "estima donde se tomo una foto a partir de la imagen."},
    {"name": "Gmail Lookup", "category": "Intel", "keywords": ["gmail"],
     "desc": "revisa datos y actividad asociada a una cuenta de Gmail."},
    {"name": "Hudson Rock", "category": "Intel", "keywords": ["hudson rock", "infostealer", "malware"],
     "desc": "busca credenciales expuestas por malware infostealer."},
    {"name": "SEON", "category": "Intel", "keywords": ["seon", "fraude"],
     "desc": "evalua riesgo de fraude de un email, telefono o IP."},
    {"name": "Phone Search", "category": "US Search", "keywords": ["phone search", "telefono", "numero"],
     "desc": "identifica operador, dueno y ubicacion de un numero de telefono (EE.UU.)."},
    {"name": "Address Search", "category": "US Search", "keywords": ["address search", "direccion"],
     "desc": "busca residentes e historial de una direccion (EE.UU.)."},
    {"name": "Email Search", "category": "US Search", "keywords": ["email search", "correo"],
     "desc": "busca identidad asociada a un email (EE.UU.)."},
    {"name": "Person Search", "category": "US Search", "keywords": ["person search", "buscar persona"],
     "desc": "arma un perfil de identidad completo por nombre (EE.UU.)."},
    {"name": "Court Records", "category": "US Search", "keywords": ["court records", "antecedentes penales", "juicios"],
     "desc": "busca registros judiciales y penales (EE.UU.)."},
    {"name": "Cell Tower", "category": "Infrastructure", "keywords": ["cell tower", "torre celular", "antena"],
     "desc": "ubica una antena/torre celular."},
    {"name": "IP Info", "category": "Infrastructure", "keywords": ["ip info", "geolocalizar ip", "de donde es esta ip"],
     "desc": "muestra ubicacion, ISP y datos de red de una IP. Esta activa de verdad — probala desde el menu Infrastructure."},
    {"name": "Whois", "category": "Infrastructure", "keywords": ["whois", "dueno del dominio"],
     "desc": "muestra registrador, fechas y nameservers de un dominio. Activa de verdad."},
    {"name": "DNS Recon", "category": "Infrastructure", "keywords": ["dns recon", "registros dns", "dns"],
     "desc": "trae los registros A, MX, TXT, NS de un dominio. Activa de verdad."},
    {"name": "Shodan", "category": "Infrastructure", "keywords": ["shodan"],
     "desc": "muestra puertos abiertos y banners de una IP. Activa si el sitio tiene configurada una key de Shodan."},
    {"name": "Certificate Lookup", "category": "Infrastructure", "keywords": ["certificate lookup", "certificado ssl", "crt.sh"],
     "desc": "historial de certificados SSL de un dominio. Activa de verdad."},
    {"name": "Wayback Machine", "category": "Infrastructure", "keywords": ["wayback", "archive.org", "version anterior de una web"],
     "desc": "busca capturas archivadas de una pagina. Activa de verdad."},
    {"name": "VirusTotal", "category": "Infrastructure", "keywords": ["virustotal", "virus total"],
     "desc": "analiza si un hash, IP o dominio esta marcado como malicioso. Activa si el sitio tiene configurada una key."},
    {"name": "Usernames", "category": "Social", "keywords": ["usernames", "buscar usuario en varias redes"],
     "desc": "chequea un usuario en mas de 40 plataformas."},
    {"name": "GitHub", "category": "Social", "keywords": ["github"],
     "desc": "trae el perfil publico de GitHub de un usuario, incluido el email si lo puso publico. Activa de verdad."},
    {"name": "Discord", "category": "Social", "keywords": ["discord"],
     "desc": "busca perfil y servidores de un ID de Discord."},
    {"name": "Roblox", "category": "Social", "keywords": ["roblox"],
     "desc": "busca perfil de Roblox por usuario: seguidores, amigos, fecha de creacion, avatar. Activa de verdad."},
    {"name": "Cases", "category": "Cases", "keywords": ["cases", "caso", "organizar investigacion", "notas"],
     "desc": "organiza tu investigacion en notas enlazadas con vista de grafo, estilo Obsidian."},
    {"name": "Países", "category": "Países", "keywords": ["paises", "dni", "cedula", "documento de identidad"],
     "desc": "buscadores de documento de identidad por pais (DNI, cedula, etc.)."},
]

CAPABILITIES_LIST = [
    ("Intel", "filtraciones, antecedentes, reconocimiento facial, geolocalizacion de fotos"),
    ("US Search", "telefono, direccion, email y persona (Estados Unidos)"),
    ("Países", "documento de identidad por pais"),
    ("Infrastructure", "IP, whois, DNS, Shodan, certificados, Wayback Machine, VirusTotal"),
    ("Social", "usuarios, GitHub, Discord, Roblox y mas"),
    ("Cases", "organizar la investigacion en notas enlazadas, con grafo"),
]

# Lets "que tenes para redes sociales" match the whole Social category,
# not just a single tool with that exact word in its keyword list.
CATEGORY_KEYWORDS = {
    "Intel": ["intel", "inteligencia"],
    "US Search": ["us search", "busqueda en estados unidos"],
    "Países": ["paises", "identificacion por pais"],
    "Infrastructure": ["infraestructura", "infrastructure", "de red"],
    "Social": ["redes sociales", "red social", "social"],
    "Cases": ["organizar mi investigacion"],
}

# --------------------------------------------------------------------------
# Safety: keywords that trigger passive-advice mode, and per-country
# authorities. Agency names only — no phone numbers, those change and a
# wrong one here would be worse than not giving one.
# --------------------------------------------------------------------------

DANGER_KEYWORDS = [
    "pederast", "pedofil", "abuso sexual", "abusador", "grooming",
    "trata de personas", "explotacion sexual", "explotacion infantil",
    "extorsion", "chantaje", "acosador", "acoso", "stalker",
    "amenaza", "secuestro", "trafico de personas", "pornografia infantil",
]

COUNTRY_AUTHORITIES = {
    "peru": "la PNP - DIVINDAT (Division de Investigacion de Delitos de Alta Tecnologia)",
    "colombia": "la Policia Nacional (CAI Virtual / DIJIN) o el ICBF si hay un menor involucrado",
    "argentina": "la Division de Delitos Tecnologicos de la Policia Federal",
    "mexico": "la Guardia Nacional - Division Cientifica, o el Centro Ciber Alerta",
    "chile": "la PDI - Brigada del Cibercrimen (BRICIB)",
    "espana": "la Policia Nacional (Brigada de Investigacion Tecnologica) o la Guardia Civil (GDT)",
    "estados unidos": "el FBI (IC3 - Internet Crime Complaint Center) y, si hay un menor, el NCMEC",
    "venezuela": "el CICPC - Division Contra Delitos Informaticos",
    "ecuador": "la Policia Nacional - Direccion de Delitos Informaticos",
    "brasil": "la Policia Civil (Delegacia de Crimes Ciberneticos) de tu estado",
    "uruguay": "la Direccion de Represion del Crimen Organizado e Interpol (DGRCOI)",
    "bolivia": "la Division de Delitos Informaticos de la Policia Boliviana",
    "paraguay": "la Division de Delitos Informaticos de la Policia Nacional",
    "republica dominicana": "la DICAT (Direccion Central de Investigaciones de Crimenes y Delitos de Alta Tecnologia)",
    "panama": "la Direccion de Investigacion Judicial (DIJ)",
}


def _detect_country(text: str) -> str | None:
    for country in COUNTRY_AUTHORITIES:
        if country in text:
            return country
    return None


# --------------------------------------------------------------------------
# Response builders
# --------------------------------------------------------------------------

def _safety_response(nickname: str, text: str) -> str:
    country = _detect_country(text)
    if country:
        authority_line = f"\n3. Denuncialo ante {COUNTRY_AUTHORITIES[country]}, que es quien tiene jurisdiccion para esto en {country.title()}."
    else:
        authority_line = "\n3. Denuncialo ante la policia o la unidad de delitos informaticos de tu pais (decime el pais si queres que te diga a quien contactar puntualmente)."

    return (
        f"Entiendo, {nickname}. Si estas investigando a alguien que representa un peligro real, "
        "lo mas importante es que no actues solo/a ni te expongas — la salida siempre es pasiva y legal:\n\n"
        "1. Guarda toda la evidencia que ya tengas (capturas, mensajes, perfiles, IPs) sin alterarla ni publicarla.\n"
        "2. No confrontes directamente a la persona ni expongas lo que encontraste en redes — podes alertarla, perder evidencia, o exponerte vos.\n"
        f"{authority_line}\n"
        "4. Si hay un menor involucrado o hay riesgo inmediato, priorizá el contacto con la policia por sobre seguir investigando.\n\n"
        "¿Queres que te ayude a organizar lo que ya recopilaste antes de denunciar?"
    )


def _tool_response(nickname: str, matches: list[dict]) -> str:
    if len(matches) == 1:
        t = matches[0]
        return f"Para eso usa **{t['name']}** (menu {t['category']}): {t['desc']}"
    lines = [f"Encontre {len(matches)} herramientas que podrian servirte, {nickname}:"]
    for i, t in enumerate(matches[:5], 1):
        lines.append(f"{i}. **{t['name']}** ({t['category']}) — {t['desc']}")
    return "\n".join(lines)


def _capabilities_response(nickname: str) -> str:
    lines = [f"Puedo ayudarte a orientarte entre las herramientas de Abyssal, {nickname}. Por categoria:"]
    for i, (cat, desc) in enumerate(CAPABILITIES_LIST, 1):
        lines.append(f"{i}. **{cat}** — {desc}")
    lines.append("\nDecime que estas buscando (un dominio, una IP, un usuario, una persona...) y te digo cual usar. Si estas en medio de una investigacion delicada, tambien puedo darte los pasos correctos para denunciarlo.")
    return "\n".join(lines)


def _category_response(nickname: str, category: str) -> str:
    tools_in_cat = [t for t in TOOLS if t["category"] == category]
    lines = [f"En **{category}** tenes estas herramientas, {nickname}:"]
    for i, t in enumerate(tools_in_cat, 1):
        lines.append(f"{i}. **{t['name']}** — {t['desc']}")
    lines.append(f"\nLas encontras en el menu lateral, bajo '{category}'.")
    return "\n".join(lines)


GREETINGS = ["hola", "hey", "buenas", "que tal", "buen dia", "buenas tardes", "buenas noches"]
THANKS = ["gracias", "genial gracias", "perfecto gracias", "10 4"]


# --------------------------------------------------------------------------
# Investigation planning — Alice doesn't just talk about the tools, she can
# run them. If the message contains something investigable (an IP, a
# domain, a GitHub user, a BTC address) main.py fetches the real data and
# hands it back here to turn into a report.
# --------------------------------------------------------------------------

_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_BTC_RE = re.compile(r"\b(?:1|3|bc1)[a-zA-HJ-NP-Z0-9]{20,60}\b")
_DOMAIN_RE = re.compile(r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}\b")
_GITHUB_URL_RE = re.compile(r"github\.com/([A-Za-z0-9-]{1,39})", re.IGNORECASE)

_STOPWORDS = {
    "github", "roblox", "usuario", "de", "en", "el", "la", "un", "una", "por", "para",
    "investiga", "investigame", "busca", "buscame", "info", "sobre", "a", "al", "perfil",
}


def _username_after_keyword(raw_text: str, keyword: str) -> str | None:
    if keyword not in _norm(raw_text):
        return None
    tokens = re.findall(r"[A-Za-z0-9_-]+", raw_text)
    candidates = [t for t in tokens if _norm(t) not in _STOPWORDS]
    return candidates[-1] if candidates else None


def plan_investigation(raw_text: str) -> dict | None:
    """Returns {'type': ..., 'value': ...} for the first investigable thing
    found in the message, or None if there's nothing to go look up."""

    m = _BTC_RE.search(raw_text)
    if m:
        return {"type": "crypto", "value": m.group(0)}

    m = _GITHUB_URL_RE.search(raw_text)
    if m:
        return {"type": "github", "value": m.group(1)}

    m = _IP_RE.search(raw_text)
    if m:
        return {"type": "ip", "value": m.group(0)}

    m = _DOMAIN_RE.search(raw_text)
    if m and "roblox.com" not in m.group(0).lower():
        return {"type": "domain", "value": m.group(0)}

    user = _username_after_keyword(raw_text, "github")
    if user:
        return {"type": "github", "value": user}

    user = _username_after_keyword(raw_text, "roblox")
    if user:
        return {"type": "roblox", "value": user}

    return None


def _fmt_date(value) -> str:
    if not value:
        return "—"
    return str(value)[:10]


def format_ip_report(nickname: str, ip: str, ipinfo: dict, shodan_data: dict | None, shodan_error: str | None) -> str:
    conn = ipinfo.get("connection", {}) or {}
    lines = [f"Esto encontré sobre **{ip}**, {nickname}:\n", "**Ubicación y red**"]
    lines.append(f"1. País: {ipinfo.get('country', '—')} ({ipinfo.get('city', '—')})")
    lines.append(f"2. ISP: {conn.get('isp', '—')}")
    lines.append(f"3. Organización: {conn.get('org', '—')}")
    lines.append(f"4. ASN: AS{conn.get('asn', '—')}")

    if shodan_data:
        ports = shodan_data.get("ports", [])
        lines.append("\n**Shodan**")
        lines.append(f"1. Puertos abiertos: {', '.join(str(p) for p in ports) or 'ninguno detectado'}")
        if shodan_data.get("org"):
            lines.append(f"2. Organización (Shodan): {shodan_data['org']}")
        hostnames = shodan_data.get("hostnames") or []
        if hostnames:
            lines.append(f"3. Hostnames: {', '.join(hostnames)}")
    elif shodan_error:
        lines.append(f"\n**Shodan**: {shodan_error}")

    lines.append("\n¿Querés que profundice en algo puntual?")
    return "\n".join(lines)


def format_domain_report(nickname: str, domain: str, whois_data: dict | None, whois_err: str | None,
                          dns_data: dict | None, dns_err: str | None, wayback_data: dict | None) -> str:
    lines = [f"Investigación completa de **{domain}**, {nickname}:\n", "**Whois**"]
    if whois_data:
        events = whois_data.get("events", []) or []

        def ev(action):
            for e in events:
                if e.get("eventAction") == action:
                    return _fmt_date(e.get("eventDate"))
            return "—"

        registrar = "—"
        for e in whois_data.get("entities", []) or []:
            if "registrar" in (e.get("roles") or []):
                name = None
                for field in (e.get("vcardArray") or [None, []])[1]:
                    if field[0] == "fn":
                        name = field[3]
                        break
                registrar = name or e.get("handle") or registrar

        lines.append(f"1. Registrador: {registrar}")
        lines.append(f"2. Creado: {ev('registration')}")
        lines.append(f"3. Expira: {ev('expiration')}")
    else:
        lines.append(f"No se pudo obtener ({whois_err or 'sin datos'}).")

    lines.append("\n**DNS**")
    if dns_data:
        i = 0
        for rtype, answers in dns_data.items():
            if answers:
                i += 1
                values = ", ".join(a.get("data", "") for a in answers[:4])
                lines.append(f"{i}. {rtype}: {values}")
        if i == 0:
            lines.append("Sin registros encontrados.")
    else:
        lines.append(f"No se pudo obtener ({dns_err or 'sin datos'}).")

    lines.append("\n**Wayback Machine**")
    snap = ((wayback_data or {}).get("archived_snapshots") or {}).get("closest")
    if snap:
        ts = snap.get("timestamp", "")
        readable = f"{ts[6:8]}/{ts[4:6]}/{ts[:4]}" if len(ts) >= 8 else ts
        lines.append(f"Hay una captura archivada del {readable}.")
    else:
        lines.append("No hay capturas archivadas.")

    lines.append("\n¿Querés que profundice en algo puntual — certificados SSL, o Shodan si tenés la IP?")
    return "\n".join(lines)


def format_github_report(nickname: str, d: dict) -> str:
    lines = [f"Esto encontré del usuario de GitHub **{d.get('login')}**, {nickname}:\n"]
    lines.append(f"1. Nombre: {d.get('name') or '—'}")
    lines.append(f"2. Bio: {d.get('bio') or '—'}")
    lines.append(f"3. Repos públicos: {d.get('public_repos', 0)}")
    lines.append(f"4. Seguidores: {d.get('followers', 0)}")
    lines.append(f"5. Cuenta creada: {_fmt_date(d.get('created_at'))}")
    n = 6
    if d.get("email"):
        lines.append(f"{n}. Email público: {d['email']}")
        n += 1
    if d.get("twitter_username"):
        lines.append(f"{n}. Twitter/X: @{d['twitter_username']}")
        n += 1
    if d.get("location"):
        lines.append(f"{n}. Ubicación declarada: {d['location']}")
        n += 1
    if d.get("blog"):
        lines.append(f"{n}. Sitio/enlace: {d['blog']}")
        n += 1
    if not d.get("email"):
        lines.append("\n(No tiene email público en el perfil — GitHub ya no expone emails vía la API de eventos, así que si no lo puso público a propósito, no hay forma legítima de conseguirlo desde acá.)")
    lines.append(f"\nPerfil: {d.get('html_url', '—')}")
    return "\n".join(lines)


def format_roblox_report(nickname: str, d: dict) -> str:
    lines = [f"Esto encontré del usuario de Roblox **{d.get('name')}**, {nickname}:\n"]
    lines.append(f"1. Nombre para mostrar: {d.get('displayName') or '—'}")
    lines.append(f"2. ID permanente: {d.get('id')}")
    lines.append(f"3. Seguidores: {d.get('followers', 0)}")
    lines.append(f"4. Siguiendo: {d.get('following', 0)}")
    lines.append(f"5. Amigos: {d.get('friends', 0)}")
    lines.append(f"6. Cuenta creada: {_fmt_date(d.get('created'))}")
    if d.get("description"):
        lines.append(f"7. Descripción: {d['description']}")
    if d.get("isBanned"):
        lines.append("\n⚠️ Esta cuenta está baneada.")
    lines.append(f"\nPerfil: https://www.roblox.com/users/{d.get('id')}/profile")
    return "\n".join(lines)


def format_crypto_report(nickname: str, d: dict) -> str:
    def btc(sat):
        return f"{(sat or 0) / 1e8:.8f} BTC"

    lines = [f"Análisis de la dirección **{d.get('address')}**, {nickname}:\n"]
    lines.append(f"1. Balance actual: {btc(d.get('final_balance'))}")
    lines.append(f"2. Total recibido: {btc(d.get('total_received'))}")
    lines.append(f"3. Total enviado: {btc(d.get('total_sent'))}")
    lines.append(f"4. Transacciones: {d.get('n_tx', 0)}")
    return "\n".join(lines)


def is_danger_message(message: str) -> bool:
    return _contains_any(_norm(message), DANGER_KEYWORDS)


def safety_response(nickname: str, message: str) -> str:
    return _safety_response(nickname, _norm(message))


def respond(message: str, nickname: str) -> str:
    raw = message.strip()
    text = _norm(raw)

    if _contains_any(text, DANGER_KEYWORDS):
        return _safety_response(nickname, text)

    if _contains_any(text, THANKS) and len(text) < 40:
        return f"De nada, {nickname}. Cualquier otra cosa que necesites, avisame."

    if _contains_any(text, GREETINGS) and len(text) < 30:
        return f"¡Hola de nuevo, {nickname}! ¿En que investigacion te ayudo?"

    if any(p in text for p in ["que podes hacer", "que haces", "ayuda", "help", "que sabes hacer", "funciones"]):
        return _capabilities_response(nickname)

    matches = [t for t in TOOLS if any(kw in text for kw in t["keywords"])]
    if matches:
        return _tool_response(nickname, matches)

    for category, kws in CATEGORY_KEYWORDS.items():
        if _contains_any(text, kws):
            return _category_response(nickname, category)

    return (
        f"No estoy segura de haber entendido eso, {nickname}. Puedo ayudarte a elegir que herramienta usar "
        "(por ejemplo Shodan o IP Info para infraestructura, GitHub o Discord para redes, Whois o DNS Recon para un dominio), "
        "o darte los pasos a seguir si estas investigando algo delicado. ¿Podes contarme un poco mas?"
    )
