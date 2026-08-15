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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

/* ---------- IP Info — /api/ip-info ---------- */
async function ipInfoRun(query) {
  const d = await apiGet(`/api/ip-info/${encodeURIComponent(query.trim())}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-3 mb-5">
        <span class="text-3xl">${d.flag?.emoji || ''}</span>
        <div>
          <p class="text-lg font-semibold font-mono">${d.ip}</p>
          <p class="text-sm text-gray-400">${[d.city, d.region, d.country].filter(Boolean).join(', ')}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">ISP</p><p>${escapeHtml(d.connection?.isp || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Organización</p><p>${escapeHtml(d.connection?.org || '—')}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">ASN</p><p>AS${d.connection?.asn ?? '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Tipo</p><p>${d.type || '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Zona horaria</p><p>${d.timezone?.id || '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Coordenadas</p><p>${d.latitude?.toFixed(3)}, ${d.longitude?.toFixed(3)}</p></div>
      </div>
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
      <p class="text-lg font-semibold mb-3 font-mono">${d.ldhName || domain}</p>
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
      <p class="text-sm text-gray-400 mb-1">Fecha de captura: <span class="text-gray-200 font-mono">${readable}</span></p>
      <p class="text-sm text-gray-400 mb-5">Status HTTP: <span class="text-gray-200 font-mono">${snap.status || '—'}</span></p>
      <a href="${snap.url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium transition-colors">Ver snapshot ↗</a>
    </div>`;
}

/* ---------- GitHub — /api/github ---------- */
async function githubRun(query) {
  const username = query.trim().replace(/^@/, '');
  const d = await apiGet(`/api/github/${encodeURIComponent(username)}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        <img src="${d.avatar_url}" class="w-16 h-16 rounded-xl border border-white/10" alt="">
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
      <a href="${d.html_url}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
    </div>`;
}

/* ---------- Roblox — /api/roblox (proxied — Roblox never sends CORS headers) ---------- */
async function robloxRun(query) {
  const username = query.trim().replace(/^@/, '');
  const d = await apiGet(`/api/roblox/${encodeURIComponent(username)}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        ${d.avatarUrl ? `<img src="${d.avatarUrl}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
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
      <a href="https://www.roblox.com/users/${d.id}/profile" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
    </div>`;
}

/* ---------- Steam — /api/steam (server's own free key) ---------- */
const STEAM_STATES = ['Offline', 'Online', 'Ocupado', 'Ausente', 'Durmiendo', 'Buscando intercambio', 'Buscando partida'];
async function steamRun(query) {
  const id = query.trim().replace(/^https?:\/\/steamcommunity\.com\/(id|profiles)\//, '').replace(/\/$/, '');
  const d = await apiGet(`/api/steam/${encodeURIComponent(id)}`);

  const isPublic = d.communityvisibilitystate === 3;
  const created = d.timecreated ? new Date(d.timecreated * 1000).toLocaleDateString() : '—';
  const lastSeen = d.lastlogoff ? new Date(d.lastlogoff * 1000).toLocaleString() : '—';

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        <img src="${d.avatarfull}" class="w-16 h-16 rounded-xl border border-white/10" alt="">
        <div>
          <p class="font-semibold text-lg">${escapeHtml(d.personaname)}</p>
          <p class="text-sm text-gray-500">SteamID64: ${d.steamid}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Estado</p><p class="font-semibold">${STEAM_STATES[d.personastate] || '—'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Perfil</p><p class="font-semibold">${isPublic ? 'Público' : 'Privado'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Cuenta creada</p><p class="font-semibold">${created}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Última conexión</p><p class="font-semibold">${lastSeen}</p></div>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-5">
        ${d.realname ? `<span>🧑 ${escapeHtml(d.realname)}</span>` : ''}
        ${d.loccountrycode ? `<span>📍 ${d.loccountrycode}</span>` : ''}
        ${d.gameextrainfo ? `<span>🎮 Jugando: ${escapeHtml(d.gameextrainfo)}</span>` : ''}
      </div>
      <a href="${d.profileurl}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
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
        ${u.avatarLarger ? `<img src="${u.avatarLarger}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
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
    : `<p class="text-sm text-gray-500 mb-5">${escapeHtml(d.numverify_error || 'Sin resultados en Numverify.')}</p>`;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="font-mono text-sm text-gray-300 mb-4 break-all">${escapeHtml(number)}</p>
      ${numverifyBlock}
      ${d.pending_sources?.length ? `<p class="text-[11px] text-gray-600 mt-1 pt-4 border-t border-white/10">Fuentes pendientes: ${d.pending_sources.map(escapeHtml).join(', ')}.</p>` : ''}
      ${rawJsonBlock(d)}
    </div>`;
}

/* ---------- App Store Search — /api/appstore ---------- */
async function appStoreRun(query) {
  const d = await apiGet('/api/appstore', { term: query.trim() });

  return `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      ${d.results.map(app => `
        <a href="${app.trackViewUrl}" target="_blank" rel="noopener" class="card p-4 flex gap-3 items-start">
          <img src="${app.artworkUrl100}" class="w-12 h-12 rounded-xl shrink-0" alt="">
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
      <p class="font-mono text-sm text-gray-300 mb-5 break-all">${d.address}</p>
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
            <span class="truncate text-gray-400">${tx.hash}</span>
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
        <p class="font-mono text-lg font-semibold">${d.ip_str}</p>
        <span class="text-sm text-gray-500">${[d.city, d.country_name].filter(Boolean).join(', ')}</span>
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
              <span class="text-xs font-mono text-primary-300">${s.port}/${s.transport}</span>
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
          <img src="${value}" class="w-10 h-10 rounded-lg border border-white/10 object-cover" alt="">
        </div>`;
    }
    return `<div class="bg-black/30 border border-white/10 rounded-lg px-3 py-2">
        <p class="text-[10px] text-gray-500 uppercase tracking-wider mb-1">${escapeHtml(label)}</p>
        ${isUrl
          ? `<a href="${value}" target="_blank" rel="noopener" class="text-sm font-mono text-primary-300 hover:underline break-all">Abrir ↗</a>`
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
      : `<p class="text-sm text-emerald-400 mb-5">✅ Sin infecciones de infostealer encontradas (Hudson Rock, vía Indicia).</p>`)
    : `<p class="text-sm text-gray-500 mb-5">Hudson Rock (Indicia): ${escapeHtml(d.hudsonrock_error || 'sin resultados.')}</p>`;

  if (!items.length && !stealers.length) {
    return `${oathnetCardOpen()}<p class="text-center text-sm text-gray-500 py-4">No se encontraron credenciales robadas por malware para "${escapeHtml(query)}".${hr ? '' : `<br><span class="text-xs">${escapeHtml(d.hudsonrock_error || '')}</span>`}</p>${rawJsonBlock(d, `hudsonrock-${query}.json`)}</div>`;
  }

  return `
    ${oathnetCardOpen()}
      ${hudsonRockBlock}
      ${items.length ? `
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">${items.length} registro${items.length === 1 ? '' : 's'} adicional${items.length === 1 ? '' : 'es'} (OathNet)</p>
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

/* ---------- Mail OSINT — LeakCheck (public, no key) via /api/mail-osint.
   Other requested sources (Hudson Rock, IntelX, OSINT Industries, Indicia)
   aren't wired in yet — see backend/main.py mail_osint() for why. The
   backend already reports them as pending_sources so the UI can say so
   instead of silently omitting them. ---------- */
async function mailOsintRun(query) {
  const email = query.trim();
  const d = await apiGet(`/api/mail-osint/${encodeURIComponent(email)}`);
  const lc = d.leakcheck;

  const leakcheckBlock = lc?.success
    ? `
      <p class="text-sm text-gray-300 mb-3">Encontrado en <span class="font-semibold text-red-400">${escapeHtml(String(lc.found ?? 0))}</span> filtracion${lc.found === 1 ? '' : 'es'} (LeakCheck, plan público — sin datos crudos)</p>
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
    : `<p class="text-sm text-gray-500">${escapeHtml(d.leakcheck_error || 'Sin resultados en LeakCheck.')}</p>`;

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="font-mono text-sm text-gray-300 mb-4 break-all">${escapeHtml(email)}</p>
      ${leakcheckBlock}
      ${d.pending_sources?.length ? `<p class="text-[11px] text-gray-600 mt-5 pt-4 border-t border-white/10">Fuentes pendientes de integrar (falta API key/docs confirmados): ${d.pending_sources.map(escapeHtml).join(', ')}.</p>` : ''}
      ${rawJsonBlock(d)}
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

/* ---------- OathNet: Email Search — "Linked Accounts" panel, combining
   Holehe (which services an email is registered on) with GHunt (a full
   Google account profile when one is exposed) — /api/oathnet/email-search ---------- */
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
              ? (value ? `<img src="${value}" class="w-9 h-9 rounded-full border border-white/10" alt="">` : `<div class="w-9 h-9 rounded-full bg-primary-500/20 flex items-center justify-center">${icon('user', 'width="16" height="16" class="text-primary-300"')}</div>`)
              : `<p class="text-sm font-mono text-gray-200 break-all">${value ? escapeHtml(String(value)) : '—'}</p>`}
          </div>`).join('')}
      </div>
    </details>`;
}

async function emailSearchRun(query) {
  const email = query.replace(/\s+/g, '');
  const d = await apiGet(`/api/oathnet/email-search/${encodeURIComponent(email)}`);
  const domains = d.data?.domains || [];
  const g = d.data?.google_account;

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

  return `
    ${oathnetCardOpen()}
      <div class="flex items-center gap-2 mb-4 text-sm font-medium text-gray-300">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        LINKED ACCOUNTS (${cards.length})
      </div>
      ${d.data?.quota_exhausted ? `<p class="text-[11px] text-amber-400 mb-3">⚠️ Holehe sin cuota por ahora — mostrando solo lo que Google (GHunt) y Gravatar pudieron encontrar.</p>` : ''}
      ${d.data?.holehe_error ? `<p class="text-[11px] text-amber-400 mb-3">⚠️ Holehe: ${escapeHtml(d.data.holehe_error)}</p>` : ''}
      ${cards.length ? `<div class="space-y-2">${cards.join('')}</div>` : `<p class="text-sm text-gray-500 text-center py-8">No se encontraron cuentas vinculadas a "${escapeHtml(email)}".</p>`}
      ${rawJsonBlock(d, `email-search-${email}.json`)}
    </div>`;
}

/* ---------- OathNet: Discord — /api/oathnet/discord ---------- */
async function discordRun(query) {
  const d = await apiGet(`/api/oathnet/discord/${encodeURIComponent(query.trim())}`);
  const u = d.data || {};
  const gridData = { ...u, username_history: (u.username_history || []).map(h => (h && h.name) || h) };
  delete gridData.breach_records;
  delete gridData.stealer_records;

  return `
    ${oathnetCardOpen()}
      ${embedFieldGrid(gridData, { id: 'ID', global_name: 'Nombre', avatar_url: 'Avatar', banner_url: 'Banner', creation_date: 'Cuenta creada', badges: 'Badges', username_history: 'Nombres anteriores' })}
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
        <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2 mt-5">Registros cruzados (Hudson Rock / stealer logs)</p>
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

/* ---------- Reddit — /api/reddit (public JSON, no key) ---------- */
async function redditRun(query) {
  const username = query.trim().replace(/^u\//, '').replace(/^\//, '');
  const d = await apiGet(`/api/reddit/${encodeURIComponent(username)}`);

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <div class="flex items-center gap-4 mb-5">
        ${d.icon_img ? `<img src="${d.icon_img.split('?')[0]}" class="w-16 h-16 rounded-full border border-white/10" alt="">` : ''}
        <div>
          <p class="font-semibold text-lg">u/${escapeHtml(d.name)}</p>
          <p class="text-sm text-gray-500">Cuenta creada: ${d.created_utc ? new Date(d.created_utc * 1000).toLocaleDateString() : '—'}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-5">
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Karma posts</p><p class="font-semibold">${(d.link_karma ?? 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Karma comentarios</p><p class="font-semibold">${(d.comment_karma ?? 0).toLocaleString()}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Premium</p><p class="font-semibold">${d.is_gold ? 'Sí' : 'No'}</p></div>
        <div><p class="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Verificado</p><p class="font-semibold">${d.verified ? 'Sí' : 'No'}</p></div>
      </div>
      <a href="https://reddit.com/user/${escapeHtml(d.name)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors">Ver perfil ↗</a>
      ${rawJsonBlock(d)}
    </div>`;
}

/* ---------- Link Resolver — /api/link-resolver (no key, follows the real redirect chain) ---------- */
async function linkResolverRun(query) {
  const d = await apiGet('/api/link-resolver', { url: query.trim() });

  return `
    <div class="rounded-2xl border border-white/10 bg-black/40 p-6">
      <p class="text-[11px] text-gray-500 uppercase tracking-wider mb-2">URL final</p>
      <a href="${d.final_url}" target="_blank" rel="noopener" class="text-sm font-mono text-primary-300 break-all hover:underline">${escapeHtml(d.final_url)}</a>
      <p class="text-sm text-gray-500 mt-4 mb-2">Cadena de redirecciones (${d.chain.length} salto${d.chain.length === 1 ? '' : 's'})</p>
      <div class="space-y-1.5">
        ${d.chain.map((h, i) => `
          <div class="flex items-center gap-3 text-xs font-mono bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">
            <span class="text-gray-600 shrink-0">${i + 1}.</span>
            <span class="text-gray-300 truncate flex-1">${escapeHtml(h.url)}</span>
            <span class="text-[11px] ${h.status < 400 ? 'text-emerald-400' : 'text-red-400'} shrink-0">${h.status}</span>
          </div>`).join('')}
      </div>
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
        ${avatar ? `<img src="${avatar}" class="w-16 h-16 rounded-xl border border-white/10" alt="">` : ''}
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

window.LIVE_HANDLERS = {
  'ip-info': { run: ipInfoRun },
  'whois': { run: whoisRun },
  'dns-recon': { run: dnsReconRun },
  'wayback-machine': { run: waybackRun },
  'github': { run: githubRun },
  'roblox': { run: robloxRun },
  'steam': { run: steamRun },
  'app-store-search': { run: appStoreRun },
  'crypto-address-analyzer': { run: cryptoRun },
  'certificate-lookup': { run: certificateRun },
  'shodan': { run: shodanRun },
  'virustotal': { run: virustotalRun },
  'web-databases': { run: webDatabasesRun },
  'hudson-rock': { run: hudsonRockRun },
  'gmail-lookup': { run: gmailLookupRun },
  'mail-osint': { run: mailOsintRun },
  'email-search': { run: emailSearchRun },
  'discord': { run: discordRun },
  'xbox': { run: xboxRun },
  'reddit': { run: redditRun },
  'link-resolver': { run: linkResolverRun },
  'usernames': { run: usernamesRun },
  'roblox-profile-scraper': { run: robloxScraperRun },
  'playstation': { run: playstationRun },
  'tiktok': { run: tiktokRun },
  'epic-games': { run: epicGamesRun },
  'phone-search': { run: phoneSearchRun },
};
