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
    authority = (
        f"Denuncialo ante {COUNTRY_AUTHORITIES[country]}, que es quien tiene jurisdicción para esto en {country.title()}."
        if country else
        "Denuncialo ante la policía o la unidad de delitos informáticos de tu país (decime el país si querés que te diga a quién contactar puntualmente)."
    )
    return _report(
        summary=(
            f"Mencionaste una situación de riesgo (extorsión, amenaza o acoso), {nickname}. "
            "Esto es la guía de seguridad estándar para esta situación — no una evaluación de un caso "
            "concreto, porque todavía no tengo detalles verificables sobre el tuyo."
        ),
        risk=(
            "NO EVALUABLE con lo compartido hasta ahora — depende de la urgencia, el plazo impuesto y si "
            "hay riesgo físico inmediato. Contame más detalles (o los indicadores del contacto — alias, "
            "email, teléfono) si querés que lo evalúe puntualmente."
        ),
        recommendations=[
            "Guardá toda la evidencia que ya tengas (capturas, mensajes, perfiles, IPs) sin alterarla ni publicarla.",
            "No confrontes directamente a la persona ni expongas lo que encontraste en redes — podés alertarla, perder evidencia, o exponerte vos.",
            authority,
            "Si hay un menor involucrado o hay riesgo inmediato, priorizá el contacto con la policía por sobre seguir investigando.",
        ],
        followup="¿Querés que te ayude a organizar lo que ya recopilaste antes de denunciar?",
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
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b")
_DOMAIN_RE = re.compile(r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}\b")
_GITHUB_URL_RE = re.compile(r"github\.com/([A-Za-z0-9-]{1,39})", re.IGNORECASE)

_STOPWORDS = {
    "github", "roblox", "usuario", "username", "alias", "de", "en", "el", "la", "un", "una", "por", "para",
    "investiga", "investigame", "busca", "buscame", "info", "sobre", "a", "al", "perfil", "es", "del",
    "companero", "compañero", "otra", "otro", "y", "tambien", "esta", "este",
}

# Platform/brand names that show up constantly in normal phrasing ("su
# alias es de tiktok", "el otro es de instagram") and would otherwise get
# picked up as the LAST leftover token and investigated as if they were
# someone's personal handle — that's a false lead, not a finding, and it
# pollutes a case with junk nodes. Alice already has dedicated tools/
# keywords for these platforms; this list only blocks them from being
# mistaken for an alias by the generic last-token heuristic.
_ALIAS_NOISE = {
    "alice", "tiktok", "instagram", "facebook", "whatsapp", "telegram",
    "snapchat", "gmail", "hotmail", "outlook", "youtube", "twitter", "x",
    "discord", "twitch", "linkedin", "pinterest", "reddit",
}


def _username_after_keyword(raw_text: str, keyword: str) -> str | None:
    if keyword not in _norm(raw_text):
        return None
    tokens = re.findall(r"[A-Za-z0-9_-]+", raw_text)
    candidates = [t for t in tokens if _norm(t) not in _STOPWORDS and _norm(t) not in _ALIAS_NOISE]
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

    # Must run before _DOMAIN_RE — "user@gmail.com" also matches the domain
    # pattern on its "gmail.com" tail, which would silently drop the local
    # part and investigate the wrong thing (the domain, not the mailbox).
    m = _EMAIL_RE.search(raw_text)
    if m:
        return {"type": "email", "value": m.group(0)}

    m = _DOMAIN_RE.search(raw_text)
    if m and "roblox.com" not in m.group(0).lower():
        return {"type": "domain", "value": m.group(0)}

    user = _username_after_keyword(raw_text, "github")
    if user:
        return {"type": "github", "value": user}

    user = _username_after_keyword(raw_text, "roblox")
    if user:
        return {"type": "roblox", "value": user}

    # Generic alias/username lookup (cross-platform public profile check) —
    # only fires on an explicit keyword so a stray short word in normal
    # conversation never gets mistaken for someone's handle.
    for keyword in ("alias", "username", "usuario"):
        user = _username_after_keyword(raw_text, keyword)
        if user:
            return {"type": "username", "value": user}

    return None


def _fmt_date(value) -> str:
    if not value:
        return "—"
    return str(value)[:10]


# --------------------------------------------------------------------------
# Structured report assembly — every investigation answer (and the safety
# response) goes through this so hechos/indicadores/fuentes/confianza stay
# in a consistent, auditable shape instead of free-form prose. Sections
# with nothing in them are simply omitted, not printed empty — a plain
# "hola" or a tool description never goes through here at all, only actual
# investigation output does.
# --------------------------------------------------------------------------

def _report(summary: str, facts=None, indicators=None, sources=None, relations=None,
            inferences=None, hypotheses=None, confidence=None, risk=None,
            recommendations=None, followup=None) -> str:
    def block(label, items):
        if not items:
            return None
        body = items if isinstance(items, str) else "\n".join(f"- {i}" for i in items)
        return f"[{label}]\n{body}"

    parts = [f"[RESUMEN]\n{summary}"]
    for label, val in (
        ("HECHOS", facts), ("INDICADORES", indicators), ("RELACIONES", relations),
        ("FUENTES", sources), ("INFERENCIAS", inferences),
        ("HIPÓTESIS ALTERNATIVAS", hypotheses),
    ):
        b = block(label, val)
        if b:
            parts.append(b)
    if confidence:
        parts.append(f"[NIVEL DE CONFIANZA]\n{confidence}")
    if risk:
        parts.append(f"[NIVEL DE RIESGO]\n{risk}")
    b = block("RECOMENDACIONES DEFENSIVAS", recommendations)
    if b:
        parts.append(b)

    text = "\n\n".join(parts)
    if followup:
        text += f"\n\n{followup}"
    return text


def format_ip_report(nickname: str, ip: str, ipinfo: dict, shodan_data: dict | None, shodan_error: str | None) -> str:
    conn = ipinfo.get("connection", {}) or {}
    facts = [
        f"País: {ipinfo.get('country', '—')} (ciudad: {ipinfo.get('city', '—')})",
        f"ISP: {conn.get('isp', '—')}",
        f"Organización: {conn.get('org', '—')}",
        f"ASN: AS{conn.get('asn', '—')}",
    ]
    sources = ["ipinfo.io (geolocalización IP)"]
    indicators = [f"IP: {ip}"]

    if shodan_data:
        ports = shodan_data.get("ports", [])
        facts.append(f"Shodan — puertos abiertos: {', '.join(str(p) for p in ports) or 'ninguno detectado'}")
        if shodan_data.get("org"):
            facts.append(f"Shodan — organización: {shodan_data['org']}")
        hostnames = shodan_data.get("hostnames") or []
        if hostnames:
            facts.append(f"Shodan — hostnames: {', '.join(hostnames)}")
            indicators.extend(f"Hostname: {h}" for h in hostnames)
        sources.append("Shodan (puertos y banners)")
    elif shodan_error:
        facts.append(f"Shodan no disponible: {shodan_error}")

    return _report(
        summary=f"Consulta de infraestructura sobre la IP **{ip}**, {nickname}.",
        facts=facts,
        indicators=indicators,
        sources=sources,
        confidence="Alto — datos obtenidos en tiempo real directo de la fuente.",
        followup="¿Querés que profundice en algo puntual?",
    )


def format_domain_report(nickname: str, domain: str, whois_data: dict | None, whois_err: str | None,
                          dns_data: dict | None, dns_err: str | None, wayback_data: dict | None) -> str:
    facts = []
    sources = []
    indicators = [f"Dominio: {domain}"]

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

        facts.append(f"Whois — registrador: {registrar}")
        facts.append(f"Whois — creado: {ev('registration')}")
        facts.append(f"Whois — expira: {ev('expiration')}")
        sources.append("RDAP/Whois")
    else:
        facts.append(f"Whois no disponible ({whois_err or 'sin datos'}).")

    if dns_data:
        any_records = False
        for rtype, answers in dns_data.items():
            if answers:
                any_records = True
                values = ", ".join(a.get("data", "") for a in answers[:4])
                facts.append(f"DNS {rtype}: {values}")
                if rtype == "A":
                    indicators.extend(f"IP: {a.get('data')}" for a in answers[:4] if a.get("data"))
        if not any_records:
            facts.append("DNS: sin registros encontrados.")
        sources.append("DNS recursivo")
    else:
        facts.append(f"DNS no disponible ({dns_err or 'sin datos'}).")

    snap = ((wayback_data or {}).get("archived_snapshots") or {}).get("closest")
    if snap:
        ts = snap.get("timestamp", "")
        readable = f"{ts[6:8]}/{ts[4:6]}/{ts[:4]}" if len(ts) >= 8 else ts
        facts.append(f"Wayback Machine: captura archivada del {readable}.")
        sources.append("Wayback Machine (archive.org)")
    else:
        facts.append("Wayback Machine: no hay capturas archivadas.")

    return _report(
        summary=f"Investigación de infraestructura sobre el dominio **{domain}**, {nickname}.",
        facts=facts,
        indicators=indicators,
        sources=sources,
        confidence="Alto — Whois, DNS y Wayback consultados en vivo.",
        followup="¿Querés que profundice en algo puntual — certificados SSL, o Shodan si tenés la IP?",
    )


def format_github_report(nickname: str, d: dict) -> str:
    facts = [
        f"Nombre: {d.get('name') or '—'}",
        f"Bio: {d.get('bio') or '—'}",
        f"Repos públicos: {d.get('public_repos', 0)}",
        f"Seguidores: {d.get('followers', 0)}",
        f"Cuenta creada: {_fmt_date(d.get('created_at'))}",
    ]
    indicators = [f"Usuario de GitHub: {d.get('login')}"]
    if d.get("email"):
        facts.append(f"Email público: {d['email']}")
        indicators.append(f"Email: {d['email']}")
    if d.get("twitter_username"):
        facts.append(f"Twitter/X vinculado: @{d['twitter_username']}")
        indicators.append(f"Usuario de Twitter/X: {d['twitter_username']}")
    if d.get("location"):
        facts.append(f"Ubicación declarada: {d['location']}")
    if d.get("blog"):
        facts.append(f"Sitio/enlace: {d['blog']}")
        indicators.append(f"URL: {d['blog']}")
    if not d.get("email"):
        facts.append("Sin email público en el perfil (GitHub ya no lo expone vía API salvo que el usuario lo haya hecho público a propósito).")

    return _report(
        summary=f"Perfil público de GitHub de **{d.get('login')}**, {nickname}.",
        facts=facts,
        indicators=indicators,
        sources=["GitHub API (perfil público)"],
        confidence="Alto — perfil público consultado directamente en GitHub.",
        hypotheses=["Nombre y ubicación son autodeclarados por el usuario en su perfil — no verificados de forma independiente."] if (d.get("location") or d.get("name")) else None,
        followup=f"Perfil: {d.get('html_url', '—')}",
    )


def format_roblox_report(nickname: str, d: dict) -> str:
    facts = [
        f"Nombre para mostrar: {d.get('displayName') or '—'}",
        f"ID permanente: {d.get('id')}",
        f"Seguidores: {d.get('followers', 0)}",
        f"Siguiendo: {d.get('following', 0)}",
        f"Amigos: {d.get('friends', 0)}",
        f"Cuenta creada: {_fmt_date(d.get('created'))}",
    ]
    if d.get("description"):
        facts.append(f"Descripción: {d['description']}")
    if d.get("isBanned"):
        facts.append("⚠️ Esta cuenta está baneada.")

    return _report(
        summary=f"Perfil público de Roblox de **{d.get('name')}**, {nickname}.",
        facts=facts,
        indicators=[f"Usuario de Roblox: {d.get('name')}", f"ID de Roblox: {d.get('id')}"],
        sources=["Roblox API (perfil público)"],
        confidence="Alto — perfil público consultado directamente en Roblox.",
        followup=f"Perfil: https://www.roblox.com/users/{d.get('id')}/profile",
    )


def format_email_report(nickname: str, email: str, d: dict) -> str:
    data = d.get("data", {}) or {}
    accounts = list(data.get("domains") or [])
    google = data.get("google_account")
    if google:
        accounts.append(f"Google ({google.get('name') or google.get('full_name') or 'perfil público'})")
    if data.get("gravatar_url"):
        accounts.append("Gravatar (foto de perfil)")

    facts = []
    sources = ["Holehe (existencia de cuenta por servicio)"]
    if accounts:
        facts.append("Cuentas vinculadas encontradas: " + ", ".join(accounts))
    else:
        facts.append("No se encontraron cuentas vinculadas entre los servicios chequeados.")
    if data.get("quota_exhausted"):
        facts.append("⚠️ Sin cuota disponible por ahora — este resultado puede estar incompleto.")
    elif data.get("holehe_error"):
        facts.append(f"⚠️ {data['holehe_error']}")

    recommendations = None
    lc = data.get("leakcheck")
    if lc and lc.get("success"):
        found = lc.get("found", 0)
        facts.append(f"Encontrado en {found} filtracion{'es' if found != 1 else ''} de datos (sin exponer credenciales crudas).")
        lc_sources = lc.get("sources") or []
        if lc_sources:
            facts.append("Filtraciones de: " + ", ".join(s.get("name", "—") for s in lc_sources[:10]))
        sources.append("LeakCheck (bases de filtraciones públicas)")
        if found:
            recommendations = [
                "Cambiar la contraseña de este email y de cualquier cuenta que la reutilice.",
                "Activar autenticación en dos pasos donde esté disponible.",
            ]
    else:
        facts.append(data.get("leakcheck_error") or "Sin resultados de filtraciones.")

    return _report(
        summary=f"Investigación OSINT sobre el email **{email}**, {nickname}.",
        facts=facts,
        indicators=[f"Email: {email}"] + [f"Cuenta vinculada: {a}" for a in accounts],
        sources=sources,
        confidence="Alto — existencia de cuenta y filtraciones consultadas en vivo.",
        recommendations=recommendations,
        followup="¿Querés que profundice en algo puntual, o que use Hudson Rock para ver si hay credenciales de infostealer expuestas para este email?",
    )


def format_username_report(nickname: str, username: str, d: dict) -> str:
    platforms = d.get("platforms") or {}
    found = [(name, info) for name, info in platforms.items() if info.get("exists") is True]

    facts = (
        [f"Perfil público encontrado en {name}: {info.get('url', '—')}" for name, info in found]
        if found else
        ["No se encontró un perfil público con ese alias en ninguna de las plataformas chequeadas (GitHub, GitLab, DEV.to, SoundCloud, Keybase, Hacker News)."]
    )

    return _report(
        summary=f'Chequeo de existencia de perfil público para el alias **"{username}"**, {nickname}.',
        facts=facts,
        indicators=[f"Alias: {username}"],
        sources=["GitHub, GitLab, DEV.to, SoundCloud, Keybase, Hacker News (existencia de perfil público)"],
        inferences=["Que el/los perfil(es) encontrados pertenezcan a la persona que estás investigando es una inferencia — la coincidencia de alias por sí sola no confirma identidad sin más señales que lo crucen (foto, bio, actividad, otros datos compartidos)."] if found else None,
        confidence="Moderado — coincidencia de alias, no identificación confirmada." if found else "Alto — no se encontró coincidencia en las plataformas chequeadas.",
        followup="¿Querés que lo sume al caso o que pruebe otra variante del alias?",
    )


def format_crypto_report(nickname: str, d: dict) -> str:
    def btc(sat):
        return f"{(sat or 0) / 1e8:.8f} BTC"

    facts = [
        f"Balance actual: {btc(d.get('final_balance'))}",
        f"Total recibido: {btc(d.get('total_received'))}",
        f"Total enviado: {btc(d.get('total_sent'))}",
        f"Transacciones: {d.get('n_tx', 0)}",
    ]
    return _report(
        summary=f"Análisis on-chain de la dirección **{d.get('address')}**, {nickname}.",
        facts=facts,
        indicators=[f"Dirección BTC: {d.get('address')}"],
        sources=["Blockchain pública (blockchain.info)"],
        confidence="Alto — datos on-chain, públicos y verificables por cualquiera.",
    )


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
