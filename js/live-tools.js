console.log('=== live-tools.js loading ===');

/* ---------------------------------------------------------
   Real, working integrations for the tools where a live lookup
   is actually possible. Every call below hits our own FastAPI
   backend (see backend/main.py), which proxies the real external
   API server-side — this avoids the browser CORS wall some of
   these services put up (crt.sh in particular) and keeps API
   keys out of any third-party request the browser makes directly.
   Everything else in the dashboard stays a visual mock — see the
   chat for the full breakdown of why (no public API, needs a
   paid data-broker account, or the data itself is off-limits).
--------------------------------------------------------- */

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Every href="${...}"/src="${...}" below embeds a URL from a third-party
   API response — some of these tools exist specifically to inspect
   adversary-supplied artifacts (link resolver, Discord connected
   accounts, breach records), so that URL has to be treated as hostile
   input. Rejects anything that isn't http(s) (blocks javascript:, data:,
   vbscript:, etc.) and HTML-attribute-escapes what's left. */
function safeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url), window.location.origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return escapeHtml(u.href);
  } catch (e) {
    return '';
  }
}

function stripUrl(query) {
  return query.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

/* Calls our own backend. Throws a friendly Error on any non-2xx,
   using FastAPI's {detail: "..."} body when present. */
async function apiGet(path, params) {
  const url = new URL(path, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    throw new Error('No se pudo conectar con el backend. ¿Está corriendo `uvicorn backend.main:app`?');
  }

  if (!res.ok) {
    let detail = `El backend respondió con estado ${res.status}.`;
    try { detail = (await res.json()).detail || detail; } catch (e) { /* not JSON, keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

/* Same as apiGet but posts a File as multipart/form-data — used by tools
   that take an image upload instead of a text query. */
async function apiPostFile(path, fieldName, file) {
  const fd = new FormData();
  fd.append(fieldName, file);

  let res;
  try {
    res = await fetch(path, { method: 'POST', body: fd });
  } catch (e) {
    throw new Error('No se pudo conectar con el backend. ¿Está corriendo `uvicorn backend.main:app`?');
  }

  if (!res.ok) {
    let detail = `El backend respondió con estado ${res.status}.`;
    try { detail = (await res.json()).detail || detail; } catch (e) { /* not JSON, keep default */ }
    throw new Error(detail);
  }
  return res.json();
}

/* ---------- IP Info — /api/ip-info ---------- */
async function ipInfoRun(query) {
  const d = await apiGet(`/api/ip-info/${encodeURIComponent(query.trim())}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-3 mb-5">
        <span class="text-3xl">${d.flag?.emoji || ''}</span>
        <div>
          <p class="text-lg font-semibold font-mono">${escapeHtml(d.ip)}</p>
          <p class="text-sm text-gray-400">${[d.city, d.region, d.country].filter(Boolean).map(escapeHtml).join(', ')}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">ISP</p><p>${escapeHtml(d.connection?.isp || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Organización</p><p>${escapeHtml(d.connection?.org || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">ASN</p><p>AS${d.connection?.asn ?? '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Tipo</p><p>${escapeHtml(d.type || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Zona horaria</p><p>${escapeHtml(d.timezone?.id || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Coordenadas</p><p>${d.latitude?.toFixed(3)}, ${d.longitude?.toFixed(3)}</p></div>
      </div>
      ${d.ipapi_co ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Fuente cruzada (ipapi.co)</p>
        ${embedFieldGrid({
          city: d.ipapi_co.city, region: d.ipapi_co.region, country: d.ipapi_co.country_name,
          org: d.ipapi_co.org, asn: d.ipapi_co.asn, timezone: d.ipapi_co.timezone,
        })}` : `<p class="text-[11px] text-gray-600 mt-4">ipapi.co: sin datos (rate limit o IP no encontrada ahí).</p>`}
      ${rawJsonBlock(d, `ip-info-${query.trim()}.json`)}
    </div>`;
}

/* ---------- Whois — /api/whois (RDAP) ---------- */
async function whoisRun(query) {
  const domain = stripUrl(query);
  const d = await apiGet(`/api/whois/${encodeURIComponent(domain)}`);

  const event = (action) => d.events?.find(e => e.eventAction === action)?.eventDate;
  const registrar = d.entities?.find(e => e.roles?.includes('registrar'));
  const registrarName = registrar?.vcardArray?.[1]?.find(f => f[0] === 'fn')?.[3] || registrar?.handle || '—';

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="text-lg font-semibold mb-3 font-mono">${escapeHtml(d.ldhName || domain)}</p>
      <div class="flex flex-wrap gap-2 mb-5">
        ${(d.status || []).map(s => `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-gray-400">${escapeHtml(s)}</span>`).join('') || '<span class="text-sm text-gray-600">Sin estado reportado</span>'}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-6">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Registrador</p><p>${escapeHtml(registrarName)}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Creado</p><p>${fmtDate(event('registration'))}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Expira</p><p>${fmtDate(event('expiration'))}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Últ. modificación</p><p>${fmtDate(event('last changed'))}</p></div>
      </div>
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Nameservers</p>
      <div class="flex flex-wrap gap-2">
        ${(d.nameservers || []).map(n => `<span class="pill rounded-full px-2.5 py-1 text-[11px] font-mono text-gray-300">${escapeHtml(n.ldhName)}</span>`).join('') || '<span class="text-sm text-gray-600">—</span>'}
      </div>
    </div>`;
}

/* ---------- DNS Recon — /api/dns (Cloudflare DoH, proxied) ---------- */
async function dnsReconRun(query) {
  const domain = stripUrl(query);
  const d = await apiGet(`/api/dns/${encodeURIComponent(domain)}`);
  const groups = Object.entries(d).filter(([, answers]) => answers.length);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6 space-y-5">
      ${groups.map(([type, answers]) => `
        <div>
          <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">${type}</p>
          <div class="space-y-1.5">
            ${answers.map(a => `
              <div class="flex items-center justify-between text-sm font-mono bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">
                <span class="text-gray-300 truncate">${escapeHtml(a.data)}</span>
                <span class="text-[11px] text-gray-500 ml-3 shrink-0">TTL ${a.TTL}s</span>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

/* ---------- Wayback Machine — /api/wayback ---------- */
async function waybackRun(query) {
  const d = await apiGet('/api/wayback', { url: query.trim() });
  const snap = d.archived_snapshots.closest;
  const ts = snap.timestamp;
  const readable = `${ts.slice(6, 8)}/${ts.slice(4, 6)}/${ts.slice(0, 4)} ${ts.slice(8, 10)}:${ts.slice(10, 12)} UTC`;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="w-2.5 h-2.5 rounded-full ${snap.available ? 'bg-emerald-400' : 'bg-gray-600'}"></span>
        <p class="font-semibold">${snap.available ? 'Snapshot disponible' : 'No disponible'}</p>
      </div>
      <p class="text-sm text-gray-400 mb-1">Fecha de captura: <span class="text-gray-200 font-mono">${escapeHtml(readable)}</span></p>
      <p class="text-sm text-gray-400 mb-5">Status HTTP: <span class="text-gray-200 font-mono">${escapeHtml(String(snap.status || '—'))}</span></p>
      <a href="${safeUrl(snap.url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium transition-colors">Ver snapshot ↗</a>
    </div>`;
}

/* ---------- GitHub — /api/github ---------- */
async function githubRun(query) {
  const username = query.trim().replace(/^@/, '');
  const [d, emailResult] = await Promise.all([
    apiGet(`/api/github/${encodeURIComponent(username)}`),
    apiGet(`/api/github-email/${encodeURIComponent(username)}`).then(r => ({ ok: true, ...r })).catch(e => ({ ok: false, error: e.message })),
  ]);

  // Email Finder — same "git log trick" as github-email-finder.netlify.app:
  // GitHub's commit search API returns the raw git commit author email,
  // which is real even when the profile's own email field is private.
  const emailFinderCard = `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6 mt-4">
      <div class="flex items-center gap-2 mb-4 text-sm font-medium text-gray-300">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>
        EMAIL FINDER
      </div>
      ${emailResult.ok
        ? `
          <p class="text-lg font-mono text-primary-300 mb-3 break-all">${escapeHtml(emailResult.email || '—')}</p>
          ${embedFieldGrid({ name: emailResult.name, repository: emailResult.repository, date: emailResult.date, commit_url: emailResult.commit_url })}`
        : `<p class="text-sm text-gray-500">${escapeHtml(emailResult.error || 'No se encontró email en el historial de commits.')}</p>`}
    </div>`;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        <img src="${safeUrl(d.avatar_url)}" class="w-16 h-16 rounded-xl border border-white/10" alt="">
        <div>
          <p class="font-semibold text-lg">${escapeHtml(d.name || d.login)}</p>
          <p class="text-sm text-gray-500">@${escapeHtml(d.login)}</p>
        </div>
      </div>
      ${d.bio ? `<p class="text-sm text-gray-300 mb-5">${escapeHtml(d.bio)}</p>` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Repos públicos</p><p class="font-semibold">${d.public_repos}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Seguidores</p><p class="font-semibold">${d.followers}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Siguiendo</p><p class="font-semibold">${d.following}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Cuenta creada</p><p class="font-semibold">${fmtDate(d.created_at)}</p></div>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-5">
        ${d.email ? `<span>✉️ ${escapeHtml(d.email)}</span>` : ''}
        ${d.twitter_username ? `<span>🐦 @${escapeHtml(d.twitter_username)}</span>` : ''}
        ${d.location ? `<span>📍 ${escapeHtml(d.location)}</span>` : ''}
        ${d.company ? `<span>🏢 ${escapeHtml(d.company)}</span>` : ''}
        ${d.blog ? `<span>🔗 ${escapeHtml(d.blog)}</span>` : ''}
      </div>
      ${!d.email ? '<p class="text-[11px] text-gray-600 mb-4">Este usuario no puso su email como público en el perfil.</p>' : ''}
      <a href="${safeUrl(d.html_url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
    </div>
    ${emailFinderCard}`;
}

/* ---------- Roblox — /api/roblox (proxied — Roblox never sends CORS headers) ---------- */
async function robloxRun(query) {
  const username = query.trim().replace(/^@/, '');
  const d = await apiGet(`/api/roblox/${encodeURIComponent(username)}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        ${d.avatarUrl ? `<img src="${safeUrl(d.avatarUrl)}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
        <div>
          <p class="font-semibold text-lg flex items-center gap-1.5">${escapeHtml(d.displayName || d.name)} ${d.hasVerifiedBadge ? '✅' : ''}</p>
          <p class="text-sm text-gray-500">@${escapeHtml(d.name)} · ID ${d.id}</p>
        </div>
      </div>
      ${d.description ? `<p class="text-sm text-gray-300 mb-5 whitespace-pre-wrap">${escapeHtml(d.description)}</p>` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Seguidores</p><p class="font-semibold">${(d.followers || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Siguiendo</p><p class="font-semibold">${(d.following || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Amigos</p><p class="font-semibold">${(d.friends || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Cuenta creada</p><p class="font-semibold">${fmtDate(d.created)}</p></div>
      </div>
      ${d.isBanned ? '<p class="text-xs text-red-400 mb-2">⚠️ Esta cuenta está baneada.</p>' : ''}
      <a href="https://www.roblox.com/users/${encodeURIComponent(String(d.id))}/profile" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
    </div>`;
}

/* ---------- TikTok — /api/tiktok (no key, scrapes the profile page) ---------- */
async function tiktokRun(query) {
  const username = query.trim().replace(/^@/, '');
  const d = await apiGet(`/api/tiktok/${encodeURIComponent(username)}`);
  const u = d.user || {};
  const s = d.stats || {};

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        ${u.avatarLarger ? `<img src="${safeUrl(u.avatarLarger)}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
        <div>
          <p class="font-semibold text-lg flex items-center gap-1.5">${escapeHtml(u.nickname || u.uniqueId)} ${u.verified ? '✅' : ''}</p>
          <p class="text-sm text-gray-500">@${escapeHtml(u.uniqueId)}</p>
        </div>
      </div>
      ${u.signature ? `<p class="text-sm text-gray-300 mb-5 whitespace-pre-wrap">${escapeHtml(u.signature)}</p>` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Seguidores</p><p class="font-semibold">${(s.followerCount || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Siguiendo</p><p class="font-semibold">${(s.followingCount || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Likes</p><p class="font-semibold">${(s.heartCount || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Videos</p><p class="font-semibold">${(s.videoCount || 0).toLocaleString()}</p></div>
      </div>
      ${u.privateAccount ? '<p class="text-xs text-amber-400 mb-2">🔒 Cuenta privada.</p>' : ''}
      ${d.region ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Región</p>
        <div class="grid grid-cols-2 gap-3 mb-5">
          <div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Activa</p>
            <p class="text-sm font-mono text-gray-200">${d.region.active?.flag || ''} ${escapeHtml(d.region.active?.name || '—')}</p>
          </div>
          <div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Registrada</p>
            <p class="text-sm font-mono text-gray-200">${d.region.locked?.flag || ''} ${escapeHtml(d.region.locked?.name || '—')}</p>
          </div>
        </div>
        <p class="text-[11px] text-gray-600 mb-4">"Registrada" es más difícil de falsear que "Activa" — suele indicar el país donde se creó la cuenta.</p>`
    : `<p class="text-[11px] text-gray-600 mt-5 mb-4">Región no disponible en este momento — probá buscar de nuevo en unos segundos.</p>`}
      <a href="https://www.tiktok.com/@${encodeURIComponent(u.uniqueId || username)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
    </div>`;
}

/* ---------- Epic Games / Fortnite — /api/epicgames (server's own free key, fortnite-api.com) ---------- */
async function epicGamesRun(query) {
  const d = await apiGet(`/api/epicgames/${encodeURIComponent(query.trim())}`);
  const acc = d.account || {};
  const overall = d.stats?.all?.overall || {};

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="font-semibold text-lg mb-1">${escapeHtml(acc.name || query)}</p>
      <p class="text-sm text-gray-500 font-mono mb-5">${escapeHtml(acc.id || '—')}</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Victorias</p><p class="font-semibold">${(overall.wins || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Partidas</p><p class="font-semibold">${(overall.matches || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Kills</p><p class="font-semibold">${(overall.kills || 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">K/D</p><p class="font-semibold">${overall.kd ?? '—'}</p></div>
      </div>
      ${rawJsonBlock(d)}
    </div>`;
}

/* ---------- Phone — /api/phone-osint. Numverify (server's own free key)
   is wired; other requested sources (Truecaller, CloudSINT, SNUS,
   BreachVIP) stay pending — see backend/main.py phone_osint(). ---------- */
async function phoneSearchRun(query) {
  const number = query.trim();
  const d = await apiGet(`/api/phone-osint/${encodeURIComponent(number)}`);
  const nv = d.numverify;

  const numverifyBlock = nv
    ? `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">País</p><p class="font-semibold">${escapeHtml(nv.country_name || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Ubicación</p><p class="font-semibold">${escapeHtml(nv.location || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Operador</p><p class="font-semibold">${escapeHtml(nv.carrier || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Tipo de línea</p><p class="font-semibold">${escapeHtml(nv.line_type || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Formato internacional</p><p class="font-semibold font-mono">${escapeHtml(nv.international_format || '—')}</p></div>
      </div>`
    : `<p class="text-sm text-gray-500 mb-5">${escapeHtml(d.numverify_error || 'Sin resultados.')}</p>`;

  const tc = d.truecaller?.data?.[0];
  const truecallerBlock = tc
    ? `
      <div class="flex items-center gap-3 mb-2 pt-4 border-t border-white/10">
        <div class="tool-empty-icon">${icon('user', 'width="16" height="16"')}</div>
        <div>
          <p class="font-semibold">${escapeHtml(tc.name || 'Sin nombre')}</p>
          <p class="text-sm text-gray-500">${[tc.altName, tc.internetAddresses?.[0]?.id].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</p>
        </div>
      </div>`
    : `<p class="text-sm text-gray-500 mb-5 pt-4 border-t border-white/10">No se pudo encontrar información adicional de este número.</p>`;

  // WhatsApp's wa.me page moved to a client-side JS app a while back, so a
  // server-side request can no longer tell "has WhatsApp" from "doesn't" —
  // and Telegram has no public API to check a phone number without logging
  // a real account into it. Instead of faking a result, give a direct link
  // to check by hand in one click — same digits either way, no country
  // code guessing needed since Numverify's international_format has it.
  const digits = (nv?.international_format || number).replace(/\D/g, '');
  const checkLinks = digits ? `
    <div class="flex flex-wrap gap-2 mb-5">
      <a href="https://wa.me/${digits}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Revisar en WhatsApp ↗</a>
      <a href="https://t.me/+${digits}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Revisar en Telegram ↗</a>
    </div>
    <p class="text-[11px] text-gray-600 mb-5">No se puede confirmar automáticamente si el número tiene WhatsApp/Telegram (ninguna de las dos expone eso por API pública) — estos links abren el chat directo para verificarlo a mano.</p>` : '';

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="font-mono text-sm text-gray-300 mb-4 break-all">${escapeHtml(number)}</p>
      ${numverifyBlock}
      ${truecallerBlock}
      ${checkLinks}
      ${rawJsonBlock(d, `phone-${number}.json`)}
    </div>`;
}

/* ---------- App Store Search — /api/appstore ---------- */
async function appStoreRun(query) {
  const d = await apiGet('/api/appstore', { term: query.trim() });

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${d.results.map(app => `
        <a href="${safeUrl(app.trackViewUrl)}" target="_blank" rel="noopener" class="card p-4 flex gap-3 items-start">
          <img src="${safeUrl(app.artworkUrl100)}" class="w-12 h-12 rounded-xl shrink-0" alt="">
          <div class="min-w-0">
            <p class="font-medium text-sm truncate">${escapeHtml(app.trackName)}</p>
            <p class="text-xs text-gray-500 truncate mb-1">${escapeHtml(app.artistName)}</p>
            <div class="flex items-center gap-2 text-[11px] text-gray-500">
              <span>${escapeHtml(app.primaryGenreName || '')}</span>
              <span>·</span>
              <span>${app.formattedPrice || 'Gratis'}</span>
              ${app.averageUserRating ? `<span>· ⭐ ${app.averageUserRating.toFixed(1)}</span>` : ''}
            </div>
          </div>
        </a>`).join('')}
    </div>`;
}

/* ---------- Crypto Address Analyzer — /api/crypto (BTC) ---------- */
async function cryptoRun(query) {
  const addr = query.trim();
  const isBtc = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{20,60}$/i.test(addr);
  if (!isBtc) throw new Error('Por ahora solo se soporta Bitcoin (BTC). Para ETH u otras redes haría falta una API key (ej. Etherscan).');

  const d = await apiGet(`/api/crypto/${encodeURIComponent(addr)}`);
  const btc = (sat) => (sat / 1e8).toFixed(8);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="font-mono text-sm text-gray-300 mb-5 break-all">${escapeHtml(d.address)}</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-6">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Balance</p><p class="font-semibold text-primary-300">${btc(d.final_balance)} BTC</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Recibido</p><p class="font-semibold">${btc(d.total_received)} BTC</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Enviado</p><p class="font-semibold">${btc(d.total_sent)} BTC</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Transacciones</p><p class="font-semibold">${d.n_tx}</p></div>
      </div>
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Transacciones recientes</p>
      <div class="space-y-1.5">
        ${(d.txs || []).slice(0, 6).map(tx => `
          <div class="flex items-center justify-between text-xs font-mono bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">
            <span class="truncate text-gray-400">${escapeHtml(tx.hash)}</span>
            <span class="text-gray-500 ml-3 shrink-0">${new Date(tx.time * 1000).toLocaleDateString()}</span>
          </div>`).join('') || '<p class="text-sm text-gray-600">Sin transacciones.</p>'}
      </div>
    </div>`;
}

/* ---------- Certificate Lookup — /api/certificate (crt.sh, proxied) ----------
   This one only works now because the backend makes the request —
   crt.sh never sends Access-Control-Allow-Origin, so a direct
   browser fetch() is always blocked no matter what. */
async function certificateRun(query) {
  const domain = stripUrl(query);
  const data = await apiGet(`/api/certificate/${encodeURIComponent(domain)}`);

  const seen = new Set();
  const rows = data
    .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
    .sort((a, b) => new Date(b.entry_timestamp) - new Date(a.entry_timestamp))
    .slice(0, 20);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="text-sm text-gray-500 mb-4">${data.length} certificados encontrados (mostrando los ${rows.length} más recientes)</p>
      <div class="space-y-2">
        ${rows.map(c => `
          <div class="border border-white/10 rounded-lg px-3 py-2.5">
            <p class="text-sm font-mono text-gray-200 truncate">${escapeHtml(c.common_name || c.name_value)}</p>
            <div class="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
              <span>${escapeHtml((c.issuer_name || '—').split(',')[0])}</span>
              <span>·</span>
              <span>Válido: ${fmtDate(c.not_before)} → ${fmtDate(c.not_after)}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

/* ---------- Shodan — /api/shodan (uses the server's own API key) ---------- */
async function shodanRun(query) {
  const target = query.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) {
    throw new Error('Shodan Host Lookup necesita una IP, no un dominio. Resolvé el dominio primero con DNS Recon.');
  }

  const d = await apiGet(`/api/shodan/${encodeURIComponent(target)}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-3 mb-5">
        <p class="font-mono text-lg font-semibold">${escapeHtml(d.ip_str)}</p>
        <span class="text-sm text-gray-500">${[d.city, d.country_name].filter(Boolean).map(escapeHtml).join(', ')}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-6">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Organización</p><p>${escapeHtml(d.org || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">ISP</p><p>${escapeHtml(d.isp || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Sistema operativo</p><p>${escapeHtml(d.os || 'Desconocido')}</p></div>
      </div>
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Puertos abiertos (${d.ports?.length || 0})</p>
      <div class="flex flex-wrap gap-2 mb-6">
        ${(d.ports || []).map(p => `<span class="pill rounded-full px-2.5 py-1 text-xs font-mono text-primary-300">${p}</span>`).join('') || '<span class="text-sm text-gray-600">—</span>'}
      </div>
      ${d.hostnames?.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Hostnames</p>
        <div class="flex flex-wrap gap-2 mb-6">${d.hostnames.map(h => `<span class="pill rounded-full px-2.5 py-1 text-xs font-mono text-gray-300">${escapeHtml(h)}</span>`).join('')}</div>` : ''}
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Banners por servicio</p>
      <div class="space-y-2">
        ${(d.data || []).slice(0, 6).map(s => `
          <div class="border border-white/10 rounded-lg px-3 py-2.5">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-primary-300">${s.port}/${escapeHtml(s.transport)}</span>
              ${s.product ? `<span class="text-xs text-gray-400">${escapeHtml(s.product)} ${escapeHtml(s.version || '')}</span>` : ''}
            </div>
            <p class="text-[11px] font-mono text-gray-600 truncate">${escapeHtml((s.data || '').slice(0, 140))}</p>
          </div>`).join('') || '<p class="text-sm text-gray-600">Sin banners disponibles.</p>'}
      </div>
    </div>`;
}

/* ---------- VirusTotal — /api/virustotal (uses the server's own API key) ---------- */
async function virustotalRun(query) {
  const q = query.trim();
  const d = await apiGet(`/api/virustotal/${encodeURIComponent(q)}`);
  const stats = d.data.attributes.last_analysis_stats;
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const malicious = stats.malicious || 0;
  const flagged = Object.entries(d.data.attributes.last_analysis_results || {}).filter(([, v]) => v.category === 'malicious').slice(0, 8);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-6">
        <div class="w-16 h-16 rounded-full border-4 ${malicious > 0 ? 'border-red-500' : 'border-emerald-500'} flex items-center justify-center shrink-0">
          <span class="text-sm font-bold">${malicious}/${total}</span>
        </div>
        <div>
          <p class="font-semibold">${malicious > 0 ? 'Motores lo marcan como malicioso' : 'Sin detecciones maliciosas'}</p>
          <p class="text-sm text-gray-500 font-mono">${escapeHtml(q)}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-6">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Maliciosos</p><p class="font-semibold text-red-400">${stats.malicious || 0}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Sospechosos</p><p class="font-semibold text-amber-400">${stats.suspicious || 0}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Sin detección</p><p class="font-semibold">${stats.harmless || 0}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">No analizado</p><p class="font-semibold">${stats.undetected || 0}</p></div>
      </div>
      ${flagged.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Motores que lo marcaron</p>
        <div class="flex flex-wrap gap-2">${flagged.map(([name]) => `<span class="pill rounded-full px-2.5 py-1 text-xs text-red-300">${escapeHtml(name)}</span>`).join('')}</div>` : ''}
    </div>`;
}

/* ---------- OathNet: Web Databases (breach search) — /api/oathnet/breach ---------- */
function recordRow(fields) {
  const chips = fields.filter(([, v]) => v).map(([k, v]) => `<span>${k}: ${escapeHtml(String(v))}</span>`).join('');
  return `<div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 font-mono">${chips}</div>`;
}

/* Downloads the exact JSON blob passed in as a file — pure <a download>
   with a data: URI, no click handler needed since this HTML gets injected
   via innerHTML (inline onclick wouldn't have a `data` to close over). */
function downloadJsonButton(filename, data) {
  const href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
  return `<a href="${href}" download="${escapeHtml(filename)}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] font-medium text-gray-300 transition-colors shrink-0">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Descargar JSON
    </a>`;
}

/* Full, unfiltered JSON exactly as the API sent it — collapsed by default
   so the curated view above stays readable, but nothing is hidden, and it
   can always be saved as a file even without expanding it. */
function rawJsonBlock(data, filename = 'resultado.json') {
  return `
    <div class="mt-5 pt-4 border-t border-white/10">
      <div class="flex items-center justify-between gap-3 mb-2">
        <span class="text-[11px] text-gray-500 uppercase tracking-wider">Resultado completo</span>
        ${downloadJsonButton(filename, data)}
      </div>
      <details>
        <summary class="cursor-pointer text-[11px] text-gray-500 hover:text-gray-300">Ver JSON crudo</summary>
        <pre class="mt-2 text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-all bg-black/30 border border-white/10 rounded-lg p-4 max-h-[32rem] overflow-auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      </details>
    </div>`;
}

/* Red-tinted "breach intel" card shell — every /api/oathnet/* result below
   uses this instead of the neutral card so OathNet output reads as its own
   distinct, alarming category at a glance rather than blending in with the
   plain lookups (whois, ip info, etc.). */
function oathnetCardOpen() {
  return `<div class="rounded-2xl border border-red-500/25 bg-gradient-to-b from-red-950/25 to-black/60 p-6 shadow-[0_0_40px_-22px_rgba(239,68,68,0.45)]">`;
}

/* Renders every scalar field of an object as its own small embed-style
   box (label on top, value below) — a Discord-embed-field grid — instead
   of a hand-picked subset, so whatever the API actually returned shows up.
   Arrays of objects and nested objects are skipped (callers render those
   as their own dedicated section below the grid); image-looking keys
   (avatar/banner/picture/...) render a thumbnail instead of a raw URL. */
function embedFieldGrid(obj, labels = {}) {
  const IMAGE_KEY = /avatar|banner|picture|image|photo|icon/i;
  const boxes = Object.entries(obj || {}).map(([key, rawValue]) => {
    let value = rawValue;
    if (value === null || value === undefined || value === '') return '';
    if (Array.isArray(value)) {
      if (!value.length || typeof value[0] === 'object') return '';
      value = value.join(', ');
    } else if (typeof value === 'object') {
      return '';
    }
    const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isUrl = /^https?:\/\//.test(String(value));
    if (IMAGE_KEY.test(key) && isUrl) {
      return `<div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
          <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">${escapeHtml(label)}</p>
          <img src="${safeUrl(value)}" class="w-10 h-10 rounded-lg border border-white/10 object-cover" alt="">
        </div>`;
    }
    return `<div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${escapeHtml(label)}</p>
        ${isUrl
          ? `<a href="${safeUrl(value)}" target="_blank" rel="noopener" class="text-sm font-mono text-primary-300 hover:underline break-all">Abrir ↗</a>`
          : `<p class="text-sm font-mono text-gray-200 break-all">${escapeHtml(String(value))}</p>`}
      </div>`;
  }).filter(Boolean);

  return boxes.length ? `<div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">${boxes.join('')}</div>` : '';
}

async function webDatabasesRun(query) {
  const d = await apiGet(`/api/oathnet/breach/${encodeURIComponent(query.trim())}`);
  const items = d.data?.items || [];
  if (!items.length) {
    return `${oathnetCardOpen()}<p class="text-center text-sm text-gray-500 py-4">Sin resultados en bases de filtraciones para "${escapeHtml(query)}".</p>${rawJsonBlock(d, `oathnet-breach-${query}.json`)}</div>`;
  }
  return `
    ${oathnetCardOpen()}
      <p class="text-sm text-red-300/80 mb-4">${items.length} registro${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'} en bases de filtraciones</p>
      <div class="space-y-2">
        ${items.slice(0, 30).map(it => `
          <div class="border border-red-500/15 bg-red-500/[0.03] rounded-lg px-3 py-2.5">
            <div class="flex items-center justify-between gap-3 mb-1.5">
              <span class="font-mono text-sm text-gray-200 truncate">${escapeHtml(it.email || it.username || it.id || '—')}</span>
              <span class="text-[11px] text-gray-500 shrink-0">${escapeHtml(it.dbname || '—')}</span>
            </div>
            ${recordRow([['user', it.username], ['pass', it.password], ['hash', it.password_hash?.slice(0, 24)], ['indexado', fmtDate(it.indexed_at)]])}
          </div>`).join('')}
      </div>
      ${rawJsonBlock(d, `oathnet-breach-${query}.json`)}
    </div>`;
}

/* ---------- OathNet: Hudson Rock (infostealer logs) — /api/oathnet/stealer ---------- */
async function hudsonRockRun(query) {
  const d = await apiGet(`/api/oathnet/stealer/${encodeURIComponent(query.trim())}`);
  const items = d.data?.items || [];
  const hr = d.hudsonrock;
  const stealers = hr?.stealers || [];

  const hudsonRockBlock = hr
    ? (stealers.length
      ? `
        <p class="text-sm text-red-400 mb-4">⚠️ ${escapeHtml(hr.message || 'Infectado por un infostealer.')}</p>
        <div class="space-y-2 mb-5">
          ${stealers.slice(0, 10).map(s => `
            <div class="border border-red-500/20 rounded-lg px-3 py-2.5 bg-red-500/5">
              <div class="flex items-center justify-between gap-3 mb-1.5">
                <span class="font-mono text-sm text-gray-200">${escapeHtml(s.computer_name || 'Equipo desconocido')} · ${escapeHtml(s.operating_system || '—')}</span>
                <span class="text-[11px] text-gray-500 shrink-0">${fmtDate(s.date_compromised)}</span>
              </div>
              ${recordRow([['ip', s.ip], ['servicios', s.total_user_services], ['corporativos', s.total_corporate_services]])}
              ${s.top_logins?.length ? `<p class="text-[11px] text-gray-500 mt-1.5 font-mono truncate">logins: ${s.top_logins.map(escapeHtml).join(', ')}</p>` : ''}
            </div>`).join('')}
        </div>`
      : `<p class="text-sm text-emerald-400 mb-5">✅ Sin infecciones de infostealer encontradas.</p>`)
    : `<p class="text-sm text-gray-500 mb-5">${escapeHtml(d.hudsonrock_error || 'Sin resultados.')}</p>`;

  if (!items.length && !stealers.length) {
    return `${oathnetCardOpen()}<p class="text-center text-sm text-gray-500 py-4">No se encontraron credenciales robadas por malware para "${escapeHtml(query)}".${hr ? '' : `<br><span class="text-xs">${escapeHtml(d.hudsonrock_error || '')}</span>`}</p>${rawJsonBlock(d, `hudsonrock-${query}.json`)}</div>`;
  }

  return `
    ${oathnetCardOpen()}
      ${hudsonRockBlock}
      ${items.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">${items.length} registro${items.length === 1 ? '' : 's'} adicional${items.length === 1 ? '' : 'es'}</p>
        <div class="space-y-2">
          ${items.slice(0, 30).map(it => `
            <div class="border border-red-500/15 bg-red-500/[0.03] rounded-lg px-3 py-2.5">
              <p class="font-mono text-sm text-gray-200 truncate mb-1.5">${escapeHtml(it.url || (it.domain || [])[0] || '—')}</p>
              ${recordRow([['user', it.username], ['pass', it.password], ['pwned', fmtDate(it.pwned_at)], ['indexado', fmtDate(it.indexed_at)]])}
            </div>`).join('')}
        </div>` : ''}
      ${rawJsonBlock(d, `hudsonrock-${query}.json`)}
    </div>`;
}

/* ---------- OathNet: Gmail Lookup (GHunt) — /api/oathnet/gmail ---------- */
async function gmailLookupRun(query) {
  const d = await apiGet(`/api/oathnet/gmail/${encodeURIComponent(query.trim())}`);
  const p = d.data || {};
  return `
    ${oathnetCardOpen()}
      ${embedFieldGrid(p) || `<p class="text-sm text-gray-500">Sin datos públicos para "${escapeHtml(query)}".</p>`}
      ${rawJsonBlock(d, `gmail-${query}.json`)}
    </div>`;
}

/* ---------- Email OSINT — merged Mail OSINT + Email Search into one
   report: LeakCheck (breach/leak data), Holehe via OathNet (which
   services an email is registered on), GHunt via OathNet (a full Google
   account profile when one is exposed), and Gravatar. Was two separate
   cards hitting the same email — one combined report instead —
   /api/email-osint ---------- */
function linkedAccountCard(service, subtitle, statusLabel, statusColor, fields) {
  return `
    <details class="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <summary class="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <div>
          <p class="font-medium text-sm">${escapeHtml(service)} ${subtitle ? `<span class="text-gray-500 font-normal">· ${escapeHtml(subtitle)}</span>` : ''}</p>
          <p class="text-[11px] font-semibold mt-0.5" style="color:${statusColor}">${escapeHtml(statusLabel)}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500 shrink-0"><path d="M7 10l5 5 5-5"/></svg>
      </summary>
      <div class="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${fields.map(([label, value, isImage]) => `
          <div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${escapeHtml(label)}</p>
            ${isImage
              ? (value ? `<img src="${safeUrl(value)}" class="w-9 h-9 rounded-full border border-white/10" alt="">` : `<div class="w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center">${icon('user', 'width="16" height="16" class="text-primary-300"')}</div>`)
              : `<p class="text-sm font-mono text-gray-200 break-all">${value ? escapeHtml(String(value)) : '—'}</p>`}
          </div>`).join('')}
      </div>
    </details>`;
}

async function emailOsintRun(query) {
  const email = query.replace(/\s+/g, '');
  const d = await apiGet(`/api/email-osint/${encodeURIComponent(email)}`);
  const domains = d.data?.domains || [];
  const g = d.data?.google_account;
  const lc = d.data?.leakcheck;

  const cards = [];
  if (g) {
    const avatar = g.profile_picture || g.profile_pic_url || g.avatar;
    cards.push(linkedAccountCard(
      'Google', g.name || g.full_name || null, 'REGISTERED', '#34d399',
      [
        ['Account ID', g.gaia_id || g.account_id || g.id],
        ['Full Name', g.name || g.full_name],
        ['Parsed', email],
        ['Profile Image', avatar, true],
      ]
    ));
  }
  domains.forEach(dm => {
    cards.push(linkedAccountCard(dm, null, 'REGISTERED', '#34d399', [['Parsed', email]]));
  });
  if (d.data?.gravatar_url) {
    cards.push(linkedAccountCard('Gravatar', null, 'REGISTERED', '#34d399', [['Parsed', email], ['Profile Image', d.data.gravatar_url, true]]));
  }

  const leakcheckBlock = lc?.success
    ? `
      <p class="text-sm text-gray-300 mb-3">Encontrado en <span class="font-semibold text-red-400">${escapeHtml(String(lc.found ?? 0))}</span> filtracion${lc.found === 1 ? '' : 'es'} (sin datos crudos)</p>
      ${lc.sources?.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Fuentes</p>
        <div class="flex flex-wrap gap-2 mb-4">
          ${lc.sources.slice(0, 30).map(s => `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-gray-300">${escapeHtml(s.name || '—')}${s.date ? ` · ${escapeHtml(s.date)}` : ''}</span>`).join('')}
        </div>` : ''}
      ${lc.fields?.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Tipos de datos expuestos</p>
        <div class="flex flex-wrap gap-2">
          ${lc.fields.map(f => `<span class="pill rounded-full px-2.5 py-1 text-[11px] font-mono text-gray-400">${escapeHtml(f)}</span>`).join('')}
        </div>` : ''}`
    : `<p class="text-sm text-gray-500">${escapeHtml(d.data?.leakcheck_error || 'Sin resultados.')}</p>`;

  return `
    ${oathnetCardOpen()}
      <div class="flex items-center gap-2 mb-4 text-sm font-medium text-gray-300">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        LINKED ACCOUNTS (${cards.length})
      </div>
      ${d.data?.quota_exhausted ? `<p class="text-[11px] text-amber-400 mb-3">⚠️ Sin cuota disponible por ahora — mostrando solo lo que se pudo encontrar.</p>` : ''}
      ${d.data?.holehe_error ? `<p class="text-[11px] text-amber-400 mb-3">⚠️ ${escapeHtml(d.data.holehe_error)}</p>` : ''}
      ${cards.length ? `<div class="space-y-2 mb-5">${cards.join('')}</div>` : `<p class="text-sm text-gray-500 text-center py-6">No se encontraron cuentas vinculadas a "${escapeHtml(email)}".</p>`}

      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 pt-4 border-t border-white/10">Filtraciones</p>
      ${leakcheckBlock}
      ${rawJsonBlock(d, `email-osint-${email}.json`)}
    </div>`;
}

/* ---------- OathNet: Discord — /api/oathnet/discord ---------- */
async function discordRun(query) {
  const d = await apiGet(`/api/oathnet/discord/${encodeURIComponent(query.trim())}`);
  const u = d.data || {};
  const gridData = { ...u, username_history: (u.username_history || []).map(h => (h && h.name) || h) };
  delete gridData.breach_records;
  delete gridData.stealer_records;
  delete gridData.avatar_url;
  delete gridData.banner_url;
  delete gridData.username;
  delete gridData.global_name;
  delete gridData.discord_api;
  delete gridData.discord_api_error;
  delete gridData.connected_accounts;
  delete gridData.connections_error;

  // Real public_flags/accent_color from Discord's own API (needs a free
  // bot token, see .env.example) — separate from OathNet's "badges" above,
  // which aren't always this precise.
  const api = u.discord_api;
  const discordApiBlock = api
    ? `
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Discord API (oficial)</p>
      <div class="flex flex-wrap items-center gap-2 mb-1">
        ${api.accent_color && /^#[0-9a-f]{6}$/i.test(api.accent_color) ? `<span class="w-5 h-5 rounded-full border border-white/20 shrink-0" style="background:${api.accent_color}" title="${api.accent_color}"></span>` : ''}
        ${api.is_bot ? `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-gray-300">Bot</span>` : ''}
        ${api.is_system ? `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-gray-300">Sistema</span>` : ''}
        ${(api.public_flags_badges || []).map(b => `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-gray-300">${escapeHtml(b)}</span>`).join('')}
        ${!api.accent_color && !api.is_bot && !api.is_system && !api.public_flags_badges?.length ? `<span class="text-sm text-gray-500">Sin badges públicos.</span>` : ''}
      </div>`
    : `<p class="text-[11px] text-gray-600 mt-5">Discord API: ${escapeHtml(u.discord_api_error || 'sin datos.')}</p>`;

  // Only what the account owner already chose to show publicly on their
  // profile (via Indicia) — never anything requiring OAuth consent.
  const connections = u.connected_accounts;
  let connectionsBlock;
  if (connections && Object.keys(connections).length) {
    let i = 0;
    const cards = Object.entries(connections).flatMap(([platform, value]) => {
      const list = Array.isArray(value) ? value : [value];
      return list.map(acc => {
        const delay = (i++ * 0.06).toFixed(2);
        return `
          <div class="animate-pop-in bg-black/30 border border-white/10 rounded-lg px-3 py-2.5" style="animation-delay:${delay}s">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${escapeHtml(platform)}</p>
            ${acc.link
              ? `<a href="${safeUrl(acc.link)}" target="_blank" rel="noopener" class="text-sm font-mono text-primary-300 hover:underline break-all">${escapeHtml(acc.name || acc.link)}</a>`
              : `<p class="text-sm font-mono text-gray-200 break-all">${escapeHtml(acc.name || acc.id || '—')}</p>`}
          </div>`;
      });
    });
    connectionsBlock = `
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Conexiones públicas</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${cards.join('')}</div>`;
  } else {
    connectionsBlock = `<p class="text-[11px] text-gray-600 mt-5">Conexiones: ${escapeHtml(u.connections_error || 'ninguna pública visible.')}</p>`;
  }

  return `
    ${oathnetCardOpen()}
      ${u.banner_url ? `<img src="${safeUrl(u.banner_url)}" class="w-full h-28 sm:h-36 object-cover rounded-xl border border-white/10 mb-[-2.5rem]" alt="">` : ''}
      <div class="flex items-end gap-4 mb-5 ${u.banner_url ? 'pl-2' : ''}">
        ${u.avatar_url ? `<img src="${safeUrl(u.avatar_url)}" class="w-20 h-20 rounded-2xl border-4 border-black/60 shadow-lg" alt="">` : ''}
        <div class="pb-1">
          <p class="font-semibold text-lg">${escapeHtml(u.global_name || u.username)}</p>
          <p class="text-sm text-gray-500 font-mono">@${escapeHtml(u.username)}</p>
        </div>
      </div>
      ${embedFieldGrid(gridData, { id: 'ID', global_name: 'Nombre', creation_date: 'Cuenta creada', badges: 'Badges', username_history: 'Nombres anteriores' })}
      ${discordApiBlock}
      ${connectionsBlock}
      ${u.breach_records?.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Registros cruzados (Web Databases)</p>
        <div class="space-y-2">
          ${u.breach_records.slice(0, 10).map(r => `
            <div class="border border-white/10 rounded-lg px-3 py-2.5">
              <div class="flex items-center justify-between gap-3 mb-1">
                <span class="text-sm text-gray-200">${escapeHtml(r.dbname || '—')}</span>
                <span class="text-[11px] text-gray-500 shrink-0">${fmtDate(r.timestamp || r.indexed_at)}</span>
              </div>
              ${recordRow([['tipo', r.type], ['categoría', r.user_category], ['motivo', r.decision_ground]])}
            </div>`).join('')}
        </div>` : ''}
      ${u.stealer_records?.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Registros cruzados (stealer logs)</p>
        <div class="space-y-2">
          ${u.stealer_records.slice(0, 10).map(r => `
            <div class="border border-red-500/15 bg-red-500/[0.03] rounded-lg px-3 py-2.5">
              <p class="font-mono text-sm text-gray-200 truncate mb-1.5">${escapeHtml(r.url || (r.domain || [])[0] || '—')}</p>
              ${recordRow([['user', r.username], ['pass', r.password], ['pwned', fmtDate(r.pwned_at)]])}
            </div>`).join('')}
        </div>` : ''}
      ${rawJsonBlock(d, `discord-${query}.json`)}
    </div>`;
}

/* ---------- OathNet: Xbox — /api/oathnet/xbox ---------- */
async function xboxRun(query) {
  const d = await apiGet(`/api/oathnet/xbox/${encodeURIComponent(query.trim())}`);
  const x = d.data || {};
  const meta = x.meta || {};
  const gridData = { ...x, ...meta };
  delete gridData.meta;

  return `
    ${oathnetCardOpen()}
      ${embedFieldGrid(gridData, { id: 'Xbox ID', avatar: 'Avatar', gamertag: 'Gamertag', profile_url: 'Perfil' })}
      ${rawJsonBlock(d, `xbox-${query}.json`)}
    </div>`;
}

/* ---------- Link Resolver — /api/link-resolver (no key). Merged three
   overlapping URL tools into one: follows the real redirect chain,
   cross-checks the final domain against Phishunt's phishing-domain feed,
   and shows the URL-encoded/decoded forms — instead of three separate
   cards (Link Resolver, Phishing Feed, URL Encode/Decode) for the same
   underlying URL. ---------- */
async function linkResolverRun(query) {
  const d = await apiGet('/api/link-resolver', { url: query.trim() });
  const pm = d.phishing_match;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">URL final</p>
      <a href="${safeUrl(d.final_url)}" target="_blank" rel="noopener" class="text-sm font-mono text-primary-300 break-all hover:underline">${escapeHtml(d.final_url)}</a>

      ${pm
        ? `<div class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
             <p class="text-sm font-semibold text-red-400 mb-1">⚠️ Dominio marcado como phishing</p>
             <p class="text-[11px] text-gray-400">Empresa suplantada: ${escapeHtml(pm.company || '—')} · Visto: ${escapeHtml(pm.first_seen || pm.date || '—')}</p>
           </div>`
        : `<p class="mt-4 text-[11px] text-gray-500">✓ No aparece en el feed de dominios de phishing (últimas ~48h).</p>`}

      <p class="text-sm text-gray-500 mt-5 mb-2">Cadena de redirecciones (${d.chain.length} salto${d.chain.length === 1 ? '' : 's'})</p>
      <div class="space-y-1.5">
        ${d.chain.map((h, i) => `
          <div class="flex items-center gap-3 text-xs font-mono bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">
            <span class="text-gray-600 shrink-0">${i + 1}.</span>
            <span class="text-gray-300 truncate flex-1">${escapeHtml(h.url)}</span>
            <span class="text-[11px] ${h.status < 400 ? 'text-emerald-400' : 'text-red-400'} shrink-0">${h.status}</span>
          </div>`).join('')}
      </div>

      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5 pt-4 border-t border-white/10">Decodificada (input)</p>
      <p class="text-xs font-mono text-gray-300 break-all bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">${escapeHtml(d.decoded)}</p>
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-3">Codificada (URL final)</p>
      <p class="text-xs font-mono text-gray-300 break-all bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">${escapeHtml(d.encoded)}</p>

      ${rawJsonBlock(d)}
    </div>`;
}

/* ---------- Usernames — /api/usernames (no key, checks a curated set of
   platforms whose 200/404 is actually reliable — see backend for why not
   all "40+ platforms" claimed by the tool description are checkable this way) ---------- */
async function usernamesRun(query) {
  const username = query.trim().replace(/^@/, '');
  const d = await apiGet(`/api/usernames/${encodeURIComponent(username)}`);
  const entries = Object.entries(d.platforms);
  const found = entries.filter(([, v]) => v.exists === true);

  const cards = entries.map(([name, v]) => {
    const status = v.exists === true ? 'REGISTERED' : v.exists === false ? 'NOT FOUND' : 'NO VERIFICADO';
    const color = v.exists === true ? '#34d399' : v.exists === false ? '#6b7280' : '#fbbf24';
    return linkedAccountCard(name, null, status, color, [['URL', v.url]]);
  });

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-2 mb-4 text-sm font-medium text-gray-300">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        PLATAFORMAS (${found.length}/${entries.length})
      </div>
      <div class="space-y-2">${cards.join('')}</div>
      ${rawJsonBlock(d, `usernames-${username}.json`)}
    </div>`;
}

/* ---------- Roblox Profile Scraper — /api/oathnet/roblox (richer than the
   free Roblox tool: adds old-username history and linked Discord) ---------- */
async function robloxScraperRun(query) {
  const d = await apiGet(`/api/oathnet/roblox/${encodeURIComponent(query.trim().replace(/^@/, ''))}`);
  const p = d.data || {};
  const gridData = { ...p };
  delete gridData.provider_statuses;

  return `
    ${oathnetCardOpen()}
      ${embedFieldGrid(gridData)}
      ${rawJsonBlock(d, `roblox-scraper-${query}.json`)}
    </div>`;
}

/* ---------- PlayStation — /api/playstation (real PSN mobile-app OAuth flow, server's own NPSSO) ---------- */
async function playstationRun(query) {
  const p = await apiGet(`/api/playstation/${encodeURIComponent(query.trim())}`);
  const avatar = (p.avatarUrls || [])[0]?.avatarUrl;
  const trophies = p.trophySummary?.earnedTrophies;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        ${avatar ? `<img src="${safeUrl(avatar)}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
        <div>
          <p class="font-semibold text-lg flex items-center gap-1.5">${escapeHtml(p.onlineId)} ${p.isOfficiallyVerified ? '✅' : ''}</p>
          <p class="text-sm text-gray-500">Nivel de trofeos: ${p.trophySummary?.level ?? '—'} ${p.plus ? '· PS Plus' : ''}</p>
        </div>
      </div>
      ${p.aboutMe ? `<p class="text-sm text-gray-300 mb-5">${escapeHtml(p.aboutMe)}</p>` : ''}
      ${trophies ? `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
          <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">🏆 Platino</p><p class="font-semibold">${trophies.platinum ?? 0}</p></div>
          <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">🥇 Oro</p><p class="font-semibold">${trophies.gold ?? 0}</p></div>
          <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">🥈 Plata</p><p class="font-semibold">${trophies.silver ?? 0}</p></div>
          <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">🥉 Bronce</p><p class="font-semibold">${trophies.bronze ?? 0}</p></div>
        </div>` : ''}
      ${p.presences?.length ? `<p class="text-sm text-gray-500 mb-2">Estado: <span class="text-gray-200">${escapeHtml(p.presences[0].onlineStatus || '—')}</span></p>` : ''}
      ${rawJsonBlock(p)}
    </div>`;
}

/* ---------- Image Geolocation — /api/image-geolocation (proxies to a
   self-hosted Netryx Astra V2 instance — see backend/main.py) ---------- */
async function imageGeolocationRun(file) {
  const d = await apiPostFile('/api/image-geolocation', 'image', file);
  const lat = d.lat ?? d.latitude;
  const lon = d.lon ?? d.lng ?? d.longitude;
  const hasCoords = typeof lat === 'number' && typeof lon === 'number';
  const mapsUrl = hasCoords ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}` : null;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-3 mb-5">
        <div class="tool-empty-icon">${icon('pin', 'width="20" height="20"')}</div>
        <div>
          <p class="text-lg font-semibold font-mono">${hasCoords ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'Sin coordenadas'}</p>
          <p class="text-sm text-gray-400">${[d.city, d.region, d.country].filter(Boolean).join(', ') || '—'}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Confianza</p><p class="font-semibold">${d.confidence != null ? `${(d.confidence * 100).toFixed(0)}%` : '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Radio de búsqueda</p><p class="font-semibold">${d.radius_km != null ? `${d.radius_km} km` : '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Fuente</p><p class="font-semibold">Alice${d.source === 'exif' ? ' · EXIF' : ''}</p></div>
      </div>
      ${mapsUrl ? `<a href="${safeUrl(mapsUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300">Ver en el mapa →</a>` : ''}
      ${rawJsonBlock(d, 'image-geolocation.json')}
    </div>`;
}

window.LIVE_HANDLERS = {
  'ip-info': { run: ipInfoRun },
  'whois': { run: whoisRun },
  'dns-recon': { run: dnsReconRun },
  'wayback-machine': { run: waybackRun },
  'github': { run: githubRun },
  'roblox': { run: robloxRun },
  'app-store-search': { run: appStoreRun },
  'crypto-address-analyzer': { run: cryptoRun },
  'certificate-lookup': { run: certificateRun },
  'shodan': { run: shodanRun },
  'virustotal': { run: virustotalRun },
  'web-databases': { run: webDatabasesRun },
  'hudson-rock': { run: hudsonRockRun },
  'gmail-lookup': { run: gmailLookupRun },
  'email-osint': { run: emailOsintRun },
  'discord': { run: discordRun },
  'xbox': { run: xboxRun },
  'link-resolver': { run: linkResolverRun },
  'usernames': { run: usernamesRun },
  'roblox-profile-scraper': { run: robloxScraperRun },
  'playstation': { run: playstationRun },
  'tiktok': { run: tiktokRun },
  'epic-games': { run: epicGamesRun },
  'phone-search': { run: phoneSearchRun },
  'image-geolocation': { run: imageGeolocationRun },
};

console.log('LIVE_HANDLERS loaded:', Object.keys(window.LIVE_HANDLERS));
