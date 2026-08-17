/* ---------------------------------------------------------
   Visual-only dashboard shell. No real search / API calls —
   clicking a tool just swaps the panel template client-side.
--------------------------------------------------------- */

const ICON_PATHS = {
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9"/>',
  sparkle: '<path d="M12 3l1.8 5.7L19 10.5l-5.2 1.8L12 18l-1.8-5.7L5 10.5l5.2-1.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/>',
  scan: '<rect x="3" y="4" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M14 9l4 2-4 2"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  bug: '<path d="M9 9V7a3 3 0 116 0v2M5 12h14M6 8l-2-2M18 8l2-2M6 16l-2 2M18 16l2 2"/><rect x="7" y="9" width="10" height="10" rx="4"/>',
  alert: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="15.5" r="0.6" fill="currentColor" stroke="none"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
  house: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9"/><path d="M9 20v-6h6v6"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-4 7.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/>',
  gavel: '<path d="M13 4l4 4-3 3-4-4z"/><path d="M9 11L4 16l3 3 5-5"/><line x1="14" y1="19" x2="20" y2="19"/>',
  tower: '<path d="M12 2v20M8 6l4-4 4 4M6 12l6-6 6 6M4 18l8-8 8 8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 4 6 4 9s-1.5 6.3-4 9c-2.5-2.7-4-6-4-9s1.5-6.3 4-9z"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/>',
  server: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><circle cx="7" cy="7" r=".8" fill="currentColor" stroke="none"/><circle cx="7" cy="17" r=".8" fill="currentColor" stroke="none"/>',
  radar: '<circle cx="12" cy="12" r="9"/><path d="M12 12L19 7"/><path d="M12 3a9 9 0 019 9"/>',
  award: '<circle cx="12" cy="8" r="5"/><path d="M9 12.5L7 21l5-3 5 3-2-8.5"/>',
  history: '<path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 7v5l4 2"/>',
  wifi: '<path d="M5 12a11 11 0 0114 0"/><path d="M8.5 15.5a6 6 0 017 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none"/>',
  link: '<path d="M9 15l6-6"/><path d="M10 6l1-1a4 4 0 116 6l-1 1"/><path d="M14 18l-1 1a4 4 0 11-6-6l1-1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2 0 012.5-1c1.4 0 2.5.7 2.5 2s-1.1 1.7-2.5 2c-1.4.3-2.5.9-2.5 2s1.1 2 2.5 2 2.5-.5 2.5-1.3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1"/>',
  apps: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  discord: '<circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M6 8.5C7 6.5 9.3 5.5 12 5.5s5 1 6 3M5 15c0 2 1 4 2.5 4.5L8 17M19 15c0 2-1 4-2.5 4.5L16 17"/>',
  github: '<path d="M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1-1.5-1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.6-1.4-2.2-.2-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.2-.5-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 015 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.5.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.8-4.6 5 .3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A10 10 0 0012 2z" fill="currentColor" stroke="none"/>',
  flag: '<path d="M4 4l7 7-7 9M11 4h9v9"/>',
  music: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  xbox: '<circle cx="12" cy="12" r="9"/><path d="M8 8c1.5 3 2.5 5 4 8 1.5-3 2.5-5 4-8M6 17c1.5-3 3.5-5 6-5s4.5 2 6 5M9.5 7c.8-.6 1.6-1 2.5-1s1.7.4 2.5 1"/>',
  playstation: '<path d="M9 4v15l3 1V6.5c1 .3 1.5.9 1.5 1.7 0 1-.7 1.5-1.8 1.3v2c2.5.5 4.3-.6 4.3-3 0-2-1.5-3.4-4-4.1L9 4z"/><path d="M4 18l6 2M20 15.5c0 1.2-2 2-4.5 1.2l-1-.3"/>',
  epic: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16c0-1.4 1.1-2.2 2.5-2.2S11 14.6 11 16"/><line x1="13.5" y1="9.5" x2="18" y2="9.5"/><line x1="13.5" y1="12.5" x2="18" y2="12.5"/>',
  tag: '<path d="M12 3h6a2 2 0 012 2v6l-9 9-8-8 9-9z"/><circle cx="15.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/><line x1="14" y1="7" x2="17" y2="10"/>',
  link2: '<path d="M9 15l6-6"/><path d="M10 6l1-1a4 4 0 116 6l-1 1"/><path d="M14 18l-1 1a4 4 0 11-6-6l1-1"/>',
  graph: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="13" r="2.2"/><circle cx="6" cy="19" r="2.2"/><line x1="7.6" y1="7.4" x2="10.6" y2="11.6"/><line x1="16.4" y1="7.4" x2="13.4" y2="11.6"/><line x1="10.9" y1="14.9" x2="7.4" y2="17.6"/>',
  fileText: '<path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v4h4"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><line x1="8" y1="9" x2="11" y2="9"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 5l3 3M13 8l2 2"/>',
};

function icon(name, extra) {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra || ''}>${ICON_PATHS[name] || ICON_PATHS.search}</svg>`;
}

/* Top-level, non-categorized nav */
const TOP_NAV = [
  { id: 'dashboard', label: 'Dashboard', iconKey: 'home' },
  { id: 'alice', label: 'Alice AI', iconKey: 'sparkle' },
  { id: 'cases', label: 'Cases', iconKey: 'folder' },
  { id: 'activity', label: 'Activity', iconKey: 'activity' },
  { id: 'paises', label: 'Países', iconKey: 'globe' },
];

/* Categorized tools */
const SECTIONS = [
  {
    label: 'Intel',
    items: [
      { id: 'web-databases', label: 'Web Databases', iconKey: 'database', desc: 'Search breach and leak databases across multiple sources', placeholder: 'Enter email, username, phone, or password...' },
      { id: 'background-check', label: 'Background Check', iconKey: 'shield', desc: 'Run a comprehensive background report on a person', placeholder: 'Enter full name...' },
      { id: 'reverse-face-search', label: 'Reverse Face Search', iconKey: 'scan', desc: 'Find matches for a face across social profiles and the open web', placeholder: 'Upload a photo to search...' },
      { id: 'image-geolocation', label: 'Image Geolocation', iconKey: 'pin', desc: 'Estimate where a photo was taken using Alice AI', placeholder: 'Upload an image to geolocate...', inputType: 'file' },
      { id: 'gmail-lookup', label: 'Gmail Lookup', iconKey: 'mail', desc: 'Check Gmail account details and linked activity', placeholder: 'Enter a Gmail address...' },
      { id: 'email-osint', label: 'Email OSINT', iconKey: 'mail', desc: 'Breaches, linked accounts, and Google profile for an email — merged Mail OSINT + Email Search', placeholder: 'Enter an email address...' },
      { id: 'hudson-rock', label: 'Hudson Rock', iconKey: 'bug', desc: 'Search infostealer malware logs for exposed credentials', placeholder: 'Enter email, username, or domain...' },
    ],
  },
  {
    label: 'General Search',
    items: [
      { id: 'phone-search', label: 'Phone Search', iconKey: 'phone', desc: 'Lookup carrier, location, and owner info for a phone number', placeholder: 'Enter phone number...' },
      { id: 'address-search', label: 'Address Search', iconKey: 'house', desc: 'Find residents and property history for an address', placeholder: 'Enter a street address...' },
      { id: 'person-search', label: 'Person Search', iconKey: 'user', desc: 'Build out a full identity profile', placeholder: 'Enter full name...' },
      { id: 'court-records', label: 'Court Records', iconKey: 'gavel', desc: 'Search court and criminal records', placeholder: 'Enter full name...' },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'cell-tower', label: 'Cell Tower', iconKey: 'tower', desc: 'Lookup cell tower location data', placeholder: 'Enter cell tower ID or coordinates...' },
      { id: 'ip-info', label: 'IP Info', iconKey: 'globe', desc: 'Geolocation, ISP, and network details for an IP', placeholder: 'Enter an IP address...' },
      { id: 'whois', label: 'Whois', iconKey: 'info', desc: 'Domain registration and ownership info', placeholder: 'Enter a domain...' },
      { id: 'dns-recon', label: 'DNS Recon', iconKey: 'server', desc: 'DNS records, subdomains, and mail servers', placeholder: 'Enter a domain...' },
      { id: 'shodan', label: 'Shodan', iconKey: 'radar', desc: 'Open ports, banners, and exposed services', placeholder: 'Enter an IP or domain...' },
      { id: 'certificate-lookup', label: 'Certificate Lookup', iconKey: 'award', desc: 'SSL/TLS certificate history for a domain', placeholder: 'Enter a domain...' },
      { id: 'wayback-machine', label: 'Wayback Machine', iconKey: 'history', desc: 'Browse archived snapshots of a webpage', placeholder: 'Enter a URL...' },
      { id: 'wifi-network-map', label: 'Wi-Fi Network Map', iconKey: 'wifi', desc: 'Map Wi-Fi networks by location', placeholder: 'Enter an SSID or BSSID...' },
      { id: 'location-to-bssid', label: 'Location to BSSID', iconKey: 'pin', desc: 'Find nearby Wi-Fi access points for a location', placeholder: 'Enter coordinates...' },
      { id: 'virustotal', label: 'VirusTotal', iconKey: 'shield', desc: 'Malware and threat intelligence lookup', placeholder: 'Enter a file hash, IP, domain, or URL...' },
      { id: 'virustotal-content-search', label: 'VirusTotal Content Search', iconKey: 'search', desc: "Search VirusTotal's indexed file corpus", placeholder: 'Enter a search query...' },
    ],
  },
  {
    /* Native integrations only (GitHub, TikTok, Discord, Xbox,
       PlayStation, Epic, Roblox). SocialCrawl-powered platforms and Steam
       were removed. */
    label: 'Social',
    items: [
      { id: 'usernames', label: 'Usernames', iconKey: 'target', desc: 'Check a username across 40+ platforms', placeholder: 'Enter a username...' },
      { id: 'github', label: 'GitHub', iconKey: 'github', desc: 'Search GitHub users for profile and repo info', placeholder: 'Enter a GitHub username...' },
      { id: 'roblox', label: 'Roblox', iconKey: 'flag', desc: 'Search Roblox users for profile info', placeholder: 'Enter a Roblox username or ID...' },
      { id: 'discord', label: 'Discord', iconKey: 'discord', desc: 'Search Discord users for profile and server info', placeholder: 'Enter Discord user ID...' },
      { id: 'tiktok', label: 'TikTok', iconKey: 'music', desc: 'Search TikTok users for profile info', placeholder: 'Enter a TikTok username...' },
      { id: 'xbox', label: 'Xbox', iconKey: 'xbox', desc: 'Search Xbox Live profiles', placeholder: 'Enter a gamertag...' },
      { id: 'playstation', label: 'PlayStation', iconKey: 'playstation', desc: 'Search PlayStation Network profiles', placeholder: 'Enter a PSN ID...' },
      { id: 'epic-games', label: 'Epic Games', iconKey: 'epic', desc: 'Search Epic Games / Fortnite profiles', placeholder: 'Enter an Epic Games username...' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'app-store-search', label: 'App Store Search', iconKey: 'apps', desc: 'Search iOS/Android app store listings', placeholder: 'Enter an app name or developer...' },
      { id: 'link-resolver', label: 'Link Resolver', iconKey: 'link', desc: 'Resolve shortened/redirected links, check for phishing, and view encoded/decoded forms', placeholder: 'Enter a shortened URL...' },
      { id: 'crypto-address-analyzer', label: 'Crypto Address Analyzer', iconKey: 'coin', desc: 'Analyze cryptocurrency wallet activity', placeholder: 'Enter a wallet address...' },
      { id: 'double-counter-bypass', label: 'Double Counter Bypass', iconKey: 'copy', desc: 'Bypass duplicate-check protections', placeholder: 'Enter a username or ID...' },
      { id: 'discord-alt-identifier', label: 'Discord Alt Identifier', iconKey: 'discord', desc: 'Detect linked and alt Discord accounts', placeholder: 'Enter a Discord user ID...' },
      { id: 'roblox-profile-scraper', label: 'Roblox Profile Scraper', iconKey: 'flag', desc: 'Scrape full Roblox profile data', placeholder: 'Enter a Roblox username or ID...' },
      { id: 'intelx-downloader', label: 'IntelX Downloader', iconKey: 'download', desc: 'Download files found via IntelX search', placeholder: 'Enter an IntelX result URL...' },
      { id: 'virustotal-downloader', label: 'VirusTotal Downloader', iconKey: 'download', desc: 'Download samples from VirusTotal', placeholder: 'Enter a file hash...' },
    ],
  },
];

/* Países — collapsible module. Each entry's desc/placeholder reflects
   that country's real national ID authority and document. */
const COUNTRY_ITEMS = [
  { id: 'country-af', label: '🇦🇫 Afganistán', iconKey: 'idcard', desc: 'ACCRA — Tazkira (documento nacional de identidad)', placeholder: 'Ingresa el número de Tazkira...' },
  { id: 'country-al', label: '🇦🇱 Albania', iconKey: 'idcard', desc: 'Dirección General del Estado Civil — Letërnjoftim (ID electrónico)', placeholder: 'Ingresa el número de Letërnjoftim...' },
  { id: 'country-de', label: '🇩🇪 Alemania', iconKey: 'idcard', desc: 'Ministerio del Interior (BMI) — Personalausweis', placeholder: 'Ingresa el número de Personalausweis...' },
  { id: 'country-ao', label: '🇦🇴 Angola', iconKey: 'idcard', desc: 'Dirección Nacional de Identificación Civil — Bilhete de Identidade (BI)', placeholder: 'Ingresa el número de BI...' },
  { id: 'country-sa', label: '🇸🇦 Arabia Saudita', iconKey: 'idcard', desc: 'Ministerio del Interior (Absher) — Tarjeta de Identidad Nacional (Hawiya)', placeholder: 'Ingresa el número de Hawiya...' },
  { id: 'country-dz', label: '🇩🇿 Argelia', iconKey: 'idcard', desc: 'DGSN — Cédula Nacional de Identidad Biométrica', placeholder: 'Ingresa el número de cédula...' },
  { id: 'country-ar', label: '🇦🇷 Argentina', iconKey: 'idcard', desc: 'RENAPER — Documento Nacional de Identidad (DNI)', placeholder: 'Ingresa el número de DNI...' },
  { id: 'country-at', label: '🇦🇹 Austria', iconKey: 'idcard', desc: 'Ministerio del Interior (BMI) — Personalausweis', placeholder: 'Ingresa el número de Personalausweis...' },
  { id: 'country-az', label: '🇦🇿 Azerbaiyán', iconKey: 'idcard', desc: 'Servicio Estatal de Migración (ASAN) — Şəxsiyyət Vəsiqəsi', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-bd', label: '🇧🇩 Bangladés', iconKey: 'idcard', desc: 'Comisión Electoral — Tarjeta de Identidad Nacional (NID)', placeholder: 'Ingresa el número de NID...' },
  { id: 'country-bh', label: '🇧🇭 Baréin', iconKey: 'idcard', desc: 'Central Population Registry (CPR) — Tarjeta de Identidad', placeholder: 'Ingresa el número de CPR...' },
  { id: 'country-be', label: '🇧🇪 Bélgica', iconKey: 'idcard', desc: 'Registro Nacional — eID (Cédula Electrónica Belga)', placeholder: 'Ingresa el número de eID...' },
  { id: 'country-by', label: '🇧🇾 Bielorrusia', iconKey: 'idcard', desc: 'Ministerio del Interior (MVD) — Tarjeta de Identidad Biométrica', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-bo', label: '🇧🇴 Bolivia', iconKey: 'idcard', desc: 'SEGIP — Cédula de Identidad', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-bw', label: '🇧🇼 Botsuana', iconKey: 'idcard', desc: 'DCNR — Omang', placeholder: 'Ingresa el número de Omang...' },
  { id: 'country-br', label: '🇧🇷 Brasil', iconKey: 'idcard', desc: 'Receita Federal / SSP — CPF y RG (Registro Geral)', placeholder: 'Digite o CPF ou RG...' },
  { id: 'country-ca', label: '🇨🇦 Canadá', iconKey: 'idcard', desc: 'Service Canada — Social Insurance Number (SIN)', placeholder: 'Ingresa el número de SIN...' },
  { id: 'country-qa', label: '🇶🇦 Catar', iconKey: 'idcard', desc: 'Ministerio del Interior — Qatar ID (QID)', placeholder: 'Ingresa el número de QID...' },
  { id: 'country-cl', label: '🇨🇱 Chile', iconKey: 'idcard', desc: 'Registro Civil — Rol Único Nacional (RUN/RUT)', placeholder: 'Ingresa el RUN...' },
  { id: 'country-cn', label: '🇨🇳 China', iconKey: 'idcard', desc: 'Ministerio de Seguridad Pública — Documento de Identidad de Residente (居民身份证)', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-co', label: '🇨🇴 Colombia', iconKey: 'idcard', desc: 'Registraduría Nacional — Cédula de Ciudadanía (CC)', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-kr', label: '🇰🇷 Corea del Sur', iconKey: 'idcard', desc: 'Ministerio del Interior y Seguridad — Número de Registro de Residente (RRN)', placeholder: 'Ingresa el número de RRN...' },
  { id: 'country-sv', label: '🇸🇻 El Salvador', iconKey: 'idcard', desc: 'RNPN — Documento Único de Identidad (DUI)', placeholder: 'Ingresa el número de DUI...' },
  { id: 'country-es', label: '🇪🇸 España', iconKey: 'idcard', desc: 'Dirección General de la Policía — DNI', placeholder: 'Ingresa el número de DNI...' },
  { id: 'country-us', label: '🇺🇸 Estados Unidos', iconKey: 'idcard', desc: 'Social Security Administration — Social Security Number (SSN)', placeholder: 'Enter SSN...' },
  { id: 'country-ph', label: '🇵🇭 Filipinas', iconKey: 'idcard', desc: 'PSA — PhilID (PhilSys)', placeholder: 'Ingresa el número de PhilID...' },
  { id: 'country-fr', label: '🇫🇷 Francia', iconKey: 'idcard', desc: 'ANTS — Carte Nationale d’Identité (CNI)', placeholder: 'Ingresa el número de CNI...' },
  { id: 'country-gr', label: '🇬🇷 Grecia', iconKey: 'idcard', desc: 'Policía Helénica — Δελτίο Ταυτότητας (documento de identidad)', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-in', label: '🇮🇳 India', iconKey: 'idcard', desc: 'UIDAI — Aadhaar', placeholder: 'Ingresa el número de Aadhaar...' },
  { id: 'country-ir', label: '🇮🇷 Irán', iconKey: 'idcard', desc: 'Organización Nacional de Registro Civil — Código Nacional (Kart-e Melli)', placeholder: 'Ingresa el código nacional...' },
  { id: 'country-il', label: '🇮🇱 Israel', iconKey: 'idcard', desc: 'Ministerio del Interior — Teudat Zehut', placeholder: 'Ingresa el número de Teudat Zehut...' },
  { id: 'country-it', label: '🇮🇹 Italia', iconKey: 'idcard', desc: 'Ministerio del Interior — Carta d’Identità Elettronica (CIE)', placeholder: 'Ingresa el número de CIE...' },
  { id: 'country-jp', label: '🇯🇵 Japón', iconKey: 'idcard', desc: 'J-LIS — My Number Card', placeholder: 'Ingresa el My Number...' },
  { id: 'country-my', label: '🇲🇾 Malasia', iconKey: 'idcard', desc: 'Jabatan Pendaftaran Negara (JPN) — MyKad', placeholder: 'Ingresa el número de MyKad...' },
  { id: 'country-ma', label: '🇲🇦 Marruecos', iconKey: 'idcard', desc: 'DGSN — CNIE (Cédula Nacional de Identidad Electrónica)', placeholder: 'Ingresa el número de CNIE...' },
  { id: 'country-mx', label: '🇲🇽 México', iconKey: 'idcard', desc: 'RENAPO — Clave Única de Registro de Población (CURP)', placeholder: 'Ingresa la CURP...' },
  { id: 'country-na', label: '🇳🇦 Namibia', iconKey: 'idcard', desc: 'Ministerio del Interior — Documento Nacional de Identidad', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-ng', label: '🇳🇬 Nigeria', iconKey: 'idcard', desc: 'NIMC — Número de Identificación Nacional (NIN)', placeholder: 'Ingresa el número de NIN...' },
  { id: 'country-no', label: '🇳🇴 Noruega', iconKey: 'idcard', desc: 'Skatteetaten — Fødselsnummer', placeholder: 'Ingresa el Fødselsnummer...' },
  { id: 'country-om', label: '🇴🇲 Omán', iconKey: 'idcard', desc: 'Royal Oman Police — Tarjeta de Identidad Civil', placeholder: 'Ingresa el número de identidad civil...' },
  { id: 'country-nl', label: '🇳🇱 Países Bajos', iconKey: 'idcard', desc: 'RvIG — BSN / Cédula de Identidad Neerlandesa', placeholder: 'Ingresa el BSN...' },
  { id: 'country-pk', label: '🇵🇰 Pakistán', iconKey: 'idcard', desc: 'NADRA — CNIC (Computerized National Identity Card)', placeholder: 'Ingresa el número de CNIC...' },
  { id: 'country-ps', label: '🇵🇸 Palestina', iconKey: 'idcard', desc: 'Ministerio del Interior (ANP) — Hawiya Palestina', placeholder: 'Ingresa el número de Hawiya...' },
  { id: 'country-pa', label: '🇵🇦 Panamá', iconKey: 'idcard', desc: 'Tribunal Electoral — Cédula de Identidad Personal', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-py', label: '🇵🇾 Paraguay', iconKey: 'idcard', desc: 'Policía Nacional — Cédula de Identidad Civil', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-pe', label: '🇵🇪 Perú', iconKey: 'idcard', desc: 'RENIEC — Documento Nacional de Identidad (DNI)', placeholder: 'Ingresa el número de DNI...' },
  { id: 'country-pt', label: '🇵🇹 Portugal', iconKey: 'idcard', desc: 'IRN — Cartão de Cidadão', placeholder: 'Ingresa el número de Cartão de Cidadão...' },
  { id: 'country-pr', label: '🇵🇷 Puerto Rico', iconKey: 'idcard', desc: 'DTOP — Licencia REAL ID / Certificado de Nacimiento de PR', placeholder: 'Ingresa el número de documento...' },
  { id: 'country-gb', label: '🇬🇧 Reino Unido', iconKey: 'idcard', desc: 'DWP / HMRC — National Insurance Number (NINo)', placeholder: 'Enter National Insurance Number...' },
  { id: 'country-do', label: '🇩🇴 República Dominicana', iconKey: 'idcard', desc: 'JCE — Cédula de Identidad y Electoral', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-ru', label: '🇷🇺 Rusia', iconKey: 'idcard', desc: 'Ministerio del Interior (MVD) — Pasaporte Interno', placeholder: 'Ingresa el número de pasaporte interno...' },
  { id: 'country-rs', label: '🇷🇸 Serbia', iconKey: 'idcard', desc: 'MUP — JMBG / Lična Karta', placeholder: 'Ingresa el número de JMBG...' },
  { id: 'country-sg', label: '🇸🇬 Singapur', iconKey: 'idcard', desc: 'ICA — NRIC (National Registration Identity Card)', placeholder: 'Ingresa el número de NRIC...' },
  { id: 'country-za', label: '🇿🇦 Sudáfrica', iconKey: 'idcard', desc: 'Department of Home Affairs — Número de Identidad Sudafricano (13 dígitos)', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-sd', label: '🇸🇩 Sudán', iconKey: 'idcard', desc: 'Registro Civil — Número Nacional de Identidad', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-se', label: '🇸🇪 Suecia', iconKey: 'idcard', desc: 'Skatteverket — Personnummer', placeholder: 'Ingresa el Personnummer...' },
  { id: 'country-ch', label: '🇨🇭 Suiza', iconKey: 'idcard', desc: 'Oficina Federal de Policía (fedpol) — Tarjeta de Identidad Suiza', placeholder: 'Ingresa el número de identidad...' },
  { id: 'country-tr', label: '🇹🇷 Turquía', iconKey: 'idcard', desc: 'Dirección General de Población — T.C. Kimlik No', placeholder: 'Ingresa el T.C. Kimlik No...' },
  { id: 'country-ua', label: '🇺🇦 Ucrania', iconKey: 'idcard', desc: 'Servicio Estatal de Migración — Pasaporte / Tarjeta de Identidad', placeholder: 'Ingresa el número de documento...' },
  { id: 'country-uy', label: '🇺🇾 Uruguay', iconKey: 'idcard', desc: 'DNIC — Cédula de Identidad', placeholder: 'Ingresa el número de Cédula...' },
  { id: 'country-vn', label: '🇻🇳 Vietnam', iconKey: 'idcard', desc: 'Ministerio de Seguridad Pública — CCCD (Tarjeta de Identidad Ciudadana)', placeholder: 'Ingresa el número de CCCD...' },
];

/* Build lookups */
const TOOL_BY_ID = {};
SECTIONS.forEach(s => s.items.forEach(i => { TOOL_BY_ID[i.id] = i; }));
TOP_NAV.forEach(i => { TOOL_BY_ID[i.id] = i; });
COUNTRY_ITEMS.forEach(i => { TOOL_BY_ID[i.id] = i; });

function buildSidebar() {
  const nav = document.getElementById('navList');
  let html = '';
  TOP_NAV.forEach(item => {
    html += navItemHtml(item);
  });

  SECTIONS.forEach(section => {
    html += `<p class="nav-cat">${section.label}</p>`;
    section.items.forEach(item => { html += navItemHtml(item); });
  });
  nav.innerHTML = html;

  nav.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => selectTool(el.dataset.id));
  });
}

function navItemHtml(item) {
  return `<div class="nav-item" data-id="${item.id}" title="${item.label}">
    ${icon(item.iconKey)}
    <span class="nav-label truncate">${item.label}</span>
  </div>`;
}

function setActive(id) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
}

function selectTool(id) {
  setActive(id);
  const main = document.getElementById('mainPanel');

  if (id === 'dashboard') { main.innerHTML = renderDashboard(); }
  else if (id === 'alice') { main.innerHTML = renderAliceChat(); mountAliceChat(); }
  else if (id === 'cases') { main.innerHTML = renderCases(); }
  else if (id === 'activity') { main.innerHTML = renderActivity(); }
  else if (id === 'paises') { main.innerHTML = renderCountries(); }
  else {
    const tool = TOOL_BY_ID[id];
    main.innerHTML = renderTool(tool);
    mountTool(tool);
  }

  main.scrollTop = 0;
  window.location.hash = id;
}

/* ---------- Templates ---------- */

function renderTool(tool) {
  const live = window.LIVE_HANDLERS && window.LIVE_HANDLERS[tool.id];

  return `
  <div class="max-w-5xl mx-auto px-8 py-8">
    <div class="flex items-start justify-between mb-8 gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300">${icon(tool.iconKey)}</div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="font-semibold text-lg leading-tight">${tool.label}</h1>
            ${live ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-400/30">LIVE</span>' : ''}
          </div>
          <p class="text-sm text-gray-500">${tool.desc}</p>
        </div>
      </div>
      <button class="px-3 py-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 flex items-center gap-2 transition-colors">
        ${icon('folder')} Add To Case
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>

    ${live && live.needsKey ? `
    <div class="flex items-center gap-3 mb-3">
      <div class="flex-1 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
        ${icon('key', 'class="text-gray-500 shrink-0"')}
        <input id="toolApiKey" type="password" autocomplete="off" placeholder="Tu API key de ${live.keyLabel}..." value="${localStorage.getItem(live.keyStorage) || ''}" class="flex-1 bg-transparent outline-none text-xs placeholder-gray-500 font-mono">
      </div>
      <span class="text-[11px] text-gray-500">Se guarda solo en tu navegador</span>
    </div>` : ''}

    <div class="flex items-center gap-3 mb-8">
      ${tool.inputType === 'file' ? `
      <label for="toolFileInput" class="flex-1 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 cursor-pointer">
        ${icon('pin', 'class="text-gray-500 shrink-0"')}
        <span id="toolFileLabel" class="flex-1 text-sm text-gray-500 truncate">${tool.placeholder}</span>
        <input id="toolFileInput" type="file" accept="image/*" class="hidden">
      </label>` : `
      <div class="flex-1 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        ${icon('search', 'class="text-gray-500 shrink-0"')}
        <input id="toolQueryInput" type="text" name="q_${Math.random().toString(36).slice(2)}" autocomplete="off" readonly onfocus="this.removeAttribute('readonly')" placeholder="${tool.placeholder}" class="flex-1 bg-transparent outline-none text-sm placeholder-gray-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-600 shrink-0"><path d="M7 10l5-5 5 5M7 14l5 5 5-5"/></svg>
      </div>`}
      <button id="toolSearchBtn" class="px-5 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 font-medium text-sm flex items-center gap-2 transition-colors shrink-0 disabled:opacity-50">
        ${icon('search', 'width="14" height="14"')}
        <span id="toolSearchBtnLabel">Search</span>
      </button>
    </div>

    <div class="flex items-center gap-2 mb-3 text-sm font-medium text-gray-300">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="14" y2="18"/></svg>
      Results
    </div>
    <div id="toolResults" class="rounded-2xl border border-white/10 py-24 flex flex-col items-center justify-center gap-3 text-center">
      <div class="tool-empty-icon">${icon(tool.iconKey, 'width="22" height="22"')}</div>
      <p class="font-semibold">No results yet</p>
      <p class="text-sm text-gray-500">${tool.inputType === 'file' ? 'Upload a photo above to search — this one calls a real API.' : (live ? 'Enter a query above to search — this one calls a real API.' : 'Enter a query above to search.')}</p>
    </div>
  </div>`;
}

const RESULTS_EMPTY_CLASS = 'rounded-2xl border border-white/10 py-24 flex flex-col items-center justify-center gap-3 text-center';

function mountTool(tool) {
  const live = window.LIVE_HANDLERS && window.LIVE_HANDLERS[tool.id];
  if (!live) return;

  const isFile = tool.inputType === 'file';
  const input = document.getElementById(isFile ? 'toolFileInput' : 'toolQueryInput');
  const fileLabel = isFile ? document.getElementById('toolFileLabel') : null;
  const keyInput = document.getElementById('toolApiKey');
  const btn = document.getElementById('toolSearchBtn');
  const btnLabel = document.getElementById('toolSearchBtnLabel');
  const results = document.getElementById('toolResults');

  if (isFile) {
    input.addEventListener('change', () => {
      fileLabel.textContent = input.files[0] ? input.files[0].name : tool.placeholder;
    });
  }

  async function run() {
    const value = isFile ? input.files[0] : input.value.trim();
    if (!value) { input.focus(); if (isFile) input.click(); return; }

    let apiKey = '';
    if (live.needsKey) {
      apiKey = (keyInput.value || '').trim();
      if (!apiKey) {
        results.className = RESULTS_EMPTY_CLASS;
        results.innerHTML = errorBlock('Falta la API key', `Pega tu API key de ${live.keyLabel} arriba para poder consultar en vivo.`);
        keyInput.focus();
        return;
      }
      localStorage.setItem(live.keyStorage, apiKey);
    }

    btn.disabled = true;
    const prevLabel = btnLabel.textContent;
    btnLabel.textContent = 'Buscando...';
    results.className = RESULTS_EMPTY_CLASS;
    results.innerHTML = loadingBlock();

    try {
      const html = await live.run(value, apiKey);
      results.className = '';
      results.innerHTML = html;
    } catch (err) {
      results.className = RESULTS_EMPTY_CLASS;
      results.innerHTML = errorBlock('No se pudo completar la búsqueda', err && err.message ? err.message : String(err));
    } finally {
      btn.disabled = false;
      btnLabel.textContent = prevLabel;
    }
  }

  btn.addEventListener('click', run);
  if (!isFile) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

function loadingBlock() {
  return `
    <div class="flex flex-col items-center justify-center gap-3 text-center">
      <span class="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin"></span>
      <p class="text-sm text-gray-500">Consultando la API en vivo...</p>
    </div>`;
}

function errorBlock(title, detail) {
  return `
    <div class="flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
      <div class="tool-empty-icon text-red-400">${icon('alert', 'width="22" height="22"')}</div>
      <p class="font-semibold text-red-300">${title}</p>
      <p class="text-sm text-gray-500">${detail}</p>
    </div>`;
}

function renderCountries() {
  if (!COUNTRY_ITEMS.length) {
    return `
    <div class="max-w-5xl mx-auto px-8 py-8">
      <h1 class="text-2xl font-semibold mb-1">Países</h1>
      <p class="text-sm text-gray-500 mb-8">Elige un país para buscar por su documento de identidad.</p>
      <div class="rounded-2xl border border-white/10 py-24 flex flex-col items-center justify-center gap-3 text-center">
        <div class="tool-empty-icon">${icon('globe', 'width="22" height="22"')}</div>
        <p class="font-semibold">Aún no hay países</p>
        <p class="text-sm text-gray-500">Dime cuáles agregar y los sumo con su tipo de documento.</p>
      </div>
    </div>`;
  }

  return `
  <div class="max-w-6xl mx-auto px-8 py-8">
    <h1 class="text-2xl font-semibold mb-1">Países</h1>
    <p class="text-sm text-gray-500 mb-8">Elige un país para buscar por su documento de identidad.</p>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      ${COUNTRY_ITEMS.map(c => `
        <button data-id="${c.id}" class="country-card card p-5 text-left flex flex-col gap-4 aspect-square">
          <span class="text-4xl leading-none">${c.label.split(' ')[0]}</span>
          <div>
            <p class="font-semibold text-sm mb-1">${c.label.replace(/^\S+\s/, '')}</p>
            <p class="text-[11px] text-gray-500 leading-snug">${c.desc}</p>
          </div>
        </button>
      `).join('')}
    </div>
  </div>`;
}

function renderDashboard() {
  const stats = [
    { label: 'Tools available', value: String(Object.keys(TOOL_BY_ID).length), iconKey: 'search' },
    { label: 'Searches this month', value: '0', iconKey: 'search' },
    { label: 'Active cases', value: '0', iconKey: 'folder' },
    { label: 'Saved results', value: '0', iconKey: 'database' },
  ];
  const shortcuts = ['discord', 'usernames', 'ip-info', 'person-search'];

  return `
  <div class="max-w-5xl mx-auto px-8 py-8">
    <h1 class="text-2xl font-semibold mb-1">Welcome back.</h1>
    <p class="text-sm text-gray-500 mb-8">Here's an overview of your workspace.</p>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      ${stats.map(s => `
        <div class="card p-5">
          <div class="w-9 h-9 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300 mb-4">${icon(s.iconKey)}</div>
          <p class="text-2xl font-semibold">${s.value}</p>
          <p class="text-xs text-gray-500 mt-1">${s.label}</p>
        </div>
      `).join('')}
    </div>

    <p class="text-sm font-medium text-gray-300 mb-3">Quick actions</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
      ${shortcuts.map(id => {
        const t = TOOL_BY_ID[id];
        return `<button data-id="${id}" class="quick-action card p-4 text-left flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300 shrink-0">${icon(t.iconKey)}</div>
          <span class="text-sm">${t.label}</span>
        </button>`;
      }).join('')}
    </div>

    <p class="text-sm font-medium text-gray-300 mb-3">Recent activity</p>
    <div class="rounded-2xl border border-white/10 py-16 flex flex-col items-center justify-center gap-2 text-center">
      <div class="tool-empty-icon">${icon('activity', 'width="22" height="22"')}</div>
      <p class="font-semibold">No activity yet</p>
      <p class="text-sm text-gray-500">Your searches and case updates will show up here.</p>
    </div>
  </div>`;
}


/* ================= Cases (Obsidian-like note graph) ================= */

let CASES = [];

const workspace = { caseId: null, noteId: null, view: 'note', editing: false };

/* Node color by tag — Obsidian-style typed graph instead of one flat color */
const TAG_COLORS = {
  person:         { base: 'rgba(248,113,113,0.92)', glow: 'rgba(239,68,68,0.85)' },
  social:         { base: 'rgba(96,165,250,0.92)',  glow: 'rgba(59,130,246,0.8)' },
  infrastructure: { base: 'rgba(52,211,153,0.92)',  glow: 'rgba(16,185,129,0.8)' },
  found:          { base: 'rgba(251,191,36,0.92)',  glow: 'rgba(245,158,11,0.8)' },
  default:        { base: 'rgba(209,213,219,0.88)', glow: 'rgba(156,163,175,0.6)' },
};

function primaryTag(note) {
  const tags = note.tags || [];
  if (tags.includes('found')) return 'found';
  for (const key of ['person', 'social', 'infrastructure']) if (tags.includes(key)) return key;
  return 'default';
}

/* Which live tool a free-text graph search maps to, and what tag the
   resulting node should carry — a lightweight "framework" so the case
   graph grows from whatever the investigation actually turns up. */
const TOOL_TAG = {
  'ip-info': 'infrastructure', 'whois': 'infrastructure', 'dns-recon': 'infrastructure',
  'shodan': 'infrastructure', 'virustotal': 'infrastructure', 'certificate-lookup': 'infrastructure',
  'discord': 'social', 'usernames': 'social', 'github': 'social',
  'tiktok': 'social', 'xbox': 'social', 'playstation': 'social',
  'epic-games': 'social', 'roblox': 'social', 'roblox-profile-scraper': 'social',
  'email-osint': 'person', 'gmail-lookup': 'person',
  'web-databases': 'person', 'hudson-rock': 'person', 'phone-search': 'person',
};

/* Query shape -> which of the modules we already have to pivot through.
   One graph search now fans out across several real handlers (Mail
   OSINT, Hudson Rock, Web Databases, Shodan...) instead of guessing a
   single tool — the graph node is a consolidated report, not a single
   source's half-answer. */
/* Used only to pick the node's color/tag — the actual fan-out below hits
   every live module regardless of query shape, not just this one. */
function primaryToolForQuery(q) {
  const s = q.trim();
  if (/^\d{15,20}$/.test(s)) return 'discord';
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return 'ip-info';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'email-osint';
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return 'whois';
  return 'usernames';
}

/* Most tool.run() calls render a single profile/record, so one satellite
   node per tool is right. A few modules return a LIST of genuinely
   separate findings (each infected machine, each breach hit, each
   platform a username exists on) — those get their own extractor here so
   the graph gets one circle per finding instead of one circle per module
   with everything flattened into a wall of text. Pulls the underlying
   JSON directly (apiGet is global from live-tools.js) instead of
   re-parsing the rendered HTML card. */
const GRAPH_MULTI_ITEM_EXTRACTORS = {
  'hudson-rock': async (query) => {
    const d = await apiGet(`/api/oathnet/stealer/${encodeURIComponent(query.trim())}`);
    const stealers = d.hudsonrock?.stealers || [];
    return stealers.map((s, i) => ({
      label: `Hudson Rock — equipo ${i + 1}${s.computer_name && s.computer_name !== 'Not Found' ? ` (${s.computer_name})` : ''}`,
      plain: [
        `Sistema: ${s.operating_system || '—'}`,
        `Comprometido: ${fmtDate(s.date_compromised)}`,
        `IP: ${s.ip || '—'}`,
        `Servicios de usuario: ${s.total_user_services ?? '—'} · corporativos: ${s.total_corporate_services ?? '—'}`,
        s.top_logins?.length ? `Logins expuestos: ${s.top_logins.join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    }));
  },
  'web-databases': async (query) => {
    const d = await apiGet(`/api/oathnet/breach/${encodeURIComponent(query.trim())}`);
    const items = (d.data?.items || []).slice(0, 15);
    return items.map((it, i) => ({
      label: `Web Databases — ${it.dbname || ('registro ' + (i + 1))}`,
      plain: [
        it.email ? `Email: ${it.email}` : '',
        it.username ? `Usuario: ${it.username}` : '',
        it.password ? `Password: ${it.password}` : '',
        it.password_hash ? `Hash: ${String(it.password_hash).slice(0, 40)}` : '',
        it.indexed_at ? `Indexado: ${it.indexed_at}` : '',
      ].filter(Boolean).join('\n') || '(sin campos legibles)',
    }));
  },
  'usernames': async (query) => {
    const d = await apiGet(`/api/usernames/${encodeURIComponent(query.trim().replace(/^@/, ''))}`);
    const found = Object.entries(d.platforms || {}).filter(([, v]) => v.exists === true);
    return found.map(([name, v]) => ({
      label: `Usernames — ${name}`,
      plain: `URL: ${v.url || '—'}`,
    }));
  },
};

async function fetchGraphToolItems(toolId, query) {
  const extractor = GRAPH_MULTI_ITEM_EXTRACTORS[toolId];
  if (extractor) {
    const items = await extractor(query);
    return items.map(it => ({ toolId, toolLabel: it.label, plain: it.plain }));
  }
  const html = await window.LIVE_HANDLERS[toolId].run(query);
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return [];
  const toolLabel = (TOOL_BY_ID[toolId] && TOOL_BY_ID[toolId].label) || toolId;
  return [{ toolId, toolLabel, plain: plain.slice(0, 500) }];
}

function renderCases() {
  return `
  <div class="max-w-5xl mx-auto px-8 py-8">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-semibold mb-1">Cases</h1>
        <p class="text-sm text-gray-500">Organize investigations as linked notes, Obsidian-style.</p>
      </div>
      <button id="newCaseBtn" class="px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium flex items-center gap-2 transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Case
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      ${CASES.map(c => `
        <button data-case="${c.id}" class="case-card card p-5 text-left">
          <div class="w-10 h-10 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300 mb-4">${icon('folder')}</div>
          <p class="font-semibold mb-1">${escapeHtml(c.name)}</p>
          <p class="text-xs text-gray-500">${c.notes.length} notes · ${c.updated}</p>
        </button>
      `).join('')}
      <button id="newCaseBtn2" class="rounded-2xl border border-dashed border-white/15 p-5 flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-300 hover:border-white/25 transition-colors min-h-[140px]">
        ${icon('bolt', 'width="20" height="20"')}
        <span class="text-sm">New Case</span>
      </button>
    </div>
  </div>`;
}

function newCase() {
  const id = 'case-' + Date.now();
  const noteId = 'n-' + Date.now();
  CASES.push({
    id, name: 'Untitled Case', updated: 'Updated just now',
    notes: [{ id: noteId, title: 'Untitled', tags: [], content: '' }],
  });
  openCase(id);
}

function openCase(caseId) {
  const c = CASES.find(x => x.id === caseId);
  if (!c) return;
  workspace.caseId = caseId;
  workspace.noteId = c.notes[0] ? c.notes[0].id : null;
  workspace.view = 'note';
  workspace.editing = false;
  setActive('cases');
  mountWorkspace();
}

function currentCase() { return CASES.find(x => x.id === workspace.caseId); }

function findNoteByTitle(c, title) {
  const t = title.trim().toLowerCase();
  return c.notes.find(n => n.title.toLowerCase() === t);
}

function parseLinks(content) {
  const out = [];
  const re = /\[\[(.+?)\]\]/g;
  let m;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

function backlinksFor(c, note) {
  return c.notes.filter(n => n.id !== note.id && parseLinks(n.content).some(l => l.toLowerCase() === note.title.toLowerCase()));
}

function renderContentHtml(content) {
  const escaped = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\[\[(.+?)\]\]/g, '<span class="wikilink" data-link="$1">$1</span>')
    .replace(/\n/g, '<br>');
}

function mountWorkspace() {
  const main = document.getElementById('mainPanel');
  main.innerHTML = renderWorkspace();

  const c = currentCase();
  if (!c) return;

  document.getElementById('wsBack').addEventListener('click', () => { selectTool('cases'); });
  document.getElementById('wsTabNote').addEventListener('click', () => { workspace.view = 'note'; mountWorkspace(); });
  document.getElementById('wsTabGraph').addEventListener('click', () => { workspace.view = 'graph'; mountWorkspace(); });

  const newNoteBtn = document.getElementById('wsNewNote');
  if (newNoteBtn) newNoteBtn.addEventListener('click', () => {
    const id = 'n-' + Date.now();
    c.notes.push({ id, title: 'Untitled', tags: [], content: '' });
    workspace.noteId = id;
    workspace.view = 'note';
    workspace.editing = true;
    mountWorkspace();
  });

  main.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => {
      workspace.noteId = el.dataset.note;
      workspace.view = 'note';
      workspace.editing = false;
      mountWorkspace();
    });
  });

  main.querySelectorAll('.wikilink').forEach(el => {
    el.addEventListener('click', () => {
      const target = findNoteByTitle(c, el.dataset.link);
      if (target) {
        workspace.noteId = target.id;
        workspace.editing = false;
        mountWorkspace();
      }
    });
  });

  const editBtn = document.getElementById('wsEditToggle');
  if (editBtn) editBtn.addEventListener('click', () => {
    workspace.editing = !workspace.editing;
    mountWorkspace();
  });

  const titleInput = document.getElementById('wsTitleInput');
  if (titleInput) titleInput.addEventListener('input', () => {
    const note = c.notes.find(n => n.id === workspace.noteId);
    if (note) note.title = titleInput.value;
  });

  const contentArea = document.getElementById('wsContentArea');
  if (contentArea) contentArea.addEventListener('input', () => {
    const note = c.notes.find(n => n.id === workspace.noteId);
    if (note) note.content = contentArea.value;
  });

  if (workspace.view === 'graph') initGraph(c);
}

function renderWorkspace() {
  const c = currentCase();
  if (!c) return renderCases();
  const note = c.notes.find(n => n.id === workspace.noteId) || c.notes[0];

  return `
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
      <div class="flex items-center gap-3">
        <button id="wsBack" class="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5">${icon('chevronLeft')}</button>
        <div class="w-8 h-8 rounded-lg bg-primary-500/15 flex items-center justify-center text-primary-300">${icon('folder', 'width="15" height="15"')}</div>
        <p class="font-semibold">${escapeHtml(c.name)}</p>
      </div>
      <div class="flex items-center gap-1 pill rounded-lg p-1">
        <button id="wsTabNote" class="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${workspace.view === 'note' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}">${icon('fileText', 'width="13" height="13"')} Notes</button>
        <button id="wsTabGraph" class="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${workspace.view === 'graph' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}">${icon('graph', 'width="13" height="13"')} Graph</button>
      </div>
    </div>

    <div class="flex-1 flex min-h-0">
      <!-- note list pane -->
      <div class="w-64 shrink-0 border-r border-white/10 flex flex-col">
        <div class="px-3 py-3 border-b border-white/10">
          <button id="wsNewNote" class="w-full px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:bg-white/5 flex items-center justify-center gap-1.5 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Note
          </button>
        </div>
        <div class="flex-1 overflow-y-auto dash-scroll px-2 py-2">
          ${c.notes.map(n => `
            <div data-note="${n.id}" class="note-item flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer mb-0.5 ${note && n.id === note.id ? 'bg-primary-600/20 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}">
              ${icon('fileText', 'width="13" height="13" class="shrink-0 opacity-70"')}
              <span class="truncate">${escapeHtml(n.title || 'Untitled')}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- content pane -->
      <div class="flex-1 min-w-0 overflow-y-auto dash-scroll">
        ${workspace.view === 'graph' ? renderGraphPane() : renderNotePane(c, note)}
      </div>
    </div>
  </div>`;
}

function renderNotePane(c, note) {
  if (!note) {
    return `<div class="h-full flex items-center justify-center text-gray-500 text-sm">Select or create a note.</div>`;
  }
  const links = backlinksFor(c, note);

  return `
  <div class="max-w-2xl mx-auto px-8 py-8">
    <div class="flex items-start justify-between gap-4 mb-4">
      ${workspace.editing
        ? `<input id="wsTitleInput" value="${escapeHtml(note.title)}" class="text-2xl font-semibold bg-transparent outline-none border-b border-white/10 focus:border-primary-400/50 flex-1 pb-1">`
        : `<h2 class="text-2xl font-semibold">${escapeHtml(note.title || 'Untitled')}</h2>`}
      <button id="wsEditToggle" class="shrink-0 p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
        ${icon(workspace.editing ? 'fileText' : 'pencil', 'width="14" height="14"')}
      </button>
    </div>

    ${note.tags && note.tags.length ? `
      <div class="flex flex-wrap gap-2 mb-5">
        ${note.tags.map(t => `<span class="pill rounded-full px-2.5 py-1 text-[11px] text-primary-300 flex items-center gap-1">${icon('tag', 'width="10" height="10"')}${escapeHtml(t)}</span>`).join('')}
      </div>` : ''}

    ${workspace.editing
      ? `<textarea id="wsContentArea" rows="12" class="w-full bg-white/[0.02] border border-white/10 rounded-xl p-4 text-sm font-mono leading-relaxed outline-none focus:border-primary-400/40 resize-none" placeholder="Write notes here. Link other notes with [[Note Title]]...">${escapeHtml(note.content)}</textarea>`
      : `<div class="text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">${renderContentHtml(note.content) || '<span class="text-gray-600">Empty note — click the pencil to start writing.</span>'}</div>`}

    ${links.length ? `
      <div class="mt-10 pt-5 border-t border-white/10">
        <p class="text-xs tracking-wider uppercase text-gray-500 mb-3 flex items-center gap-1.5">${icon('link2', 'width="12" height="12"')} Linked mentions (${links.length})</p>
        <div class="space-y-2">
          ${links.map(l => `<div data-note="${l.id}" class="note-item card px-3 py-2 text-sm cursor-pointer">${escapeHtml(l.title)}</div>`).join('')}
        </div>
      </div>` : ''}
  </div>`;
}

function renderGraphPane() {
  return `
  <div class="h-full relative">
    <canvas id="caseGraphCanvas" class="w-full h-full"></canvas>

    <div class="absolute top-4 right-4 w-64 max-w-[65vw]">
      <div class="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 backdrop-blur px-3.5 py-2">
        ${icon('search', 'width="13" height="13" class="text-gray-500 shrink-0"')}
        <input id="graphSearchInput" type="text" autocomplete="off" name="q_${Math.random().toString(36).slice(2)}" placeholder="Buscar y pivotar..." class="flex-1 min-w-0 bg-transparent outline-none text-xs placeholder-gray-500">
        <button id="graphSearchBtn" title="Buscar y agregar a la graph" class="shrink-0 w-5 h-5 rounded-full bg-primary-600 hover:bg-primary-500 flex items-center justify-center transition-colors disabled:opacity-50">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
      <p id="graphSearchStatus" class="text-[10px] text-gray-500 mt-1.5 text-right leading-snug"></p>
    </div>

    <p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-gray-500">Drag · Shift+drag to connect · click to open</p>
  </div>`;
}

let graphAbort = null;

function initGraph(c) {
  const canvas = document.getElementById('caseGraphCanvas');
  if (!canvas) return;
  if (graphAbort) graphAbort.abort();
  graphAbort = new AbortController();
  const { signal } = graphAbort;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0;

  function resize() {
    w = container.clientWidth;
    h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  let nodes = c.notes.map(n => ({
    id: n.id, label: n.title,
    x: w / 2 + (Math.random() - 0.5) * w * 0.6,
    y: h / 2 + (Math.random() - 0.5) * h * 0.6,
    vx: 0, vy: 0,
  }));
  let nodeById = {};
  nodes.forEach(n => { nodeById[n.id] = n; });

  let edges = [];
  let degree = {};

  function rebuildEdges() {
    edges = [];
    c.notes.forEach(n => {
      parseLinks(n.content).forEach(l => {
        const target = findNoteByTitle(c, l);
        if (target && target.id !== n.id &&
            !edges.some(e => (e.a === n.id && e.b === target.id) || (e.a === target.id && e.b === n.id))) {
          edges.push({ a: n.id, b: target.id });
        }
      });
    });
    degree = {};
    edges.forEach(e => { degree[e.a] = (degree[e.a] || 0) + 1; degree[e.b] = (degree[e.b] || 0) + 1; });
  }
  rebuildEdges();

  function simulate(iterations) {
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const force = 2200 / (d * d);
          dx /= d; dy /= d;
          a.vx += dx * force; a.vy += dy * force;
          b.vx -= dx * force; b.vy -= dy * force;
        }
      }
      edges.forEach(e => {
        const a = nodeById[e.a], b = nodeById[e.b];
        if (!a || !b) return;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const force = (d - 130) * 0.02;
        dx /= d; dy /= d;
        a.vx += dx * force; a.vy += dy * force;
        b.vx -= dx * force; b.vy -= dy * force;
      });
      nodes.forEach(n => {
        n.vx += (w / 2 - n.x) * 0.001;
        n.vy += (h / 2 - n.y) * 0.001;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(50, Math.min(w - 50, n.x));
        n.y = Math.max(40, Math.min(h - 40, n.y));
      });
    }
  }
  simulate(240);

  let hoverNode = null;
  let connectFrom = null; // node currently being shift-dragged to form a manual link
  let connectPos = null;  // live mouse pos while connecting

  function nodeRadius(n) {
    const active = n.id === workspace.noteId;
    const deg = degree[n.id] || 0;
    return (active ? 9 : 6.5) + Math.min(deg, 6) * 1.1;
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4,4,6,0.32)';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1.2;
    edges.forEach(e => {
      const a = nodeById[e.a], b = nodeById[e.b];
      if (!a || !b) return;
      const dim = hoverNode && hoverNode.id !== a.id && hoverNode.id !== b.id;
      const bright = hoverNode && (hoverNode.id === a.id || hoverNode.id === b.id);
      ctx.strokeStyle = bright ? 'rgba(255,255,255,0.65)' : dim ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    if (connectFrom && connectPos) {
      ctx.strokeStyle = 'rgba(251,191,36,0.8)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(connectFrom.x, connectFrom.y);
      ctx.lineTo(connectPos.x, connectPos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    nodes.forEach(n => {
      const note = c.notes.find(nt => nt.id === n.id);
      const colors = TAG_COLORS[note ? primaryTag(note) : 'default'];
      const active = n.id === workspace.noteId;
      const isHover = hoverNode && hoverNode.id === n.id;
      const dim = hoverNode && !isHover && hoverNode.id !== n.id &&
        !edges.some(e => (e.a === hoverNode.id && e.b === n.id) || (e.b === hoverNode.id && e.a === n.id));
      const r = nodeRadius(n);

      ctx.globalAlpha = dim ? 0.35 : 1;
      ctx.beginPath();
      ctx.fillStyle = colors.base;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = active || isHover ? 20 : 7;
      ctx.arc(n.x, n.y, isHover ? r + 2 : r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = active || isHover ? '#ffffff' : '#c9ccd1';
      ctx.font = active || isHover ? '600 11px Poppins, sans-serif' : '11px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + r + 13);
      ctx.globalAlpha = 1;
    });
  }
  draw();

  function nodeAt(x, y) {
    return nodes.find(n => Math.hypot(n.x - x, n.y - y) < nodeRadius(n) + 6);
  }
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  let dragging = null, dragMoved = false;

  canvas.addEventListener('mousedown', (e) => {
    const p = getPos(e);
    const n = nodeAt(p.x, p.y);
    if (!n) return;
    if (e.shiftKey) {
      connectFrom = n;
      connectPos = p;
      canvas.style.cursor = 'crosshair';
    } else {
      dragging = n; dragMoved = false;
    }
  }, { signal });

  window.addEventListener('mousemove', (e) => {
    const p = getPos(e);

    if (connectFrom) {
      connectPos = p;
      draw();
      return;
    }

    if (dragging) {
      dragging.x = Math.max(20, Math.min(w - 20, p.x));
      dragging.y = Math.max(20, Math.min(h - 20, p.y));
      dragMoved = true;
      draw();
      return;
    }

    const n = nodeAt(p.x, p.y);
    if (n !== hoverNode) {
      hoverNode = n;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      draw();
    }
  }, { signal });

  window.addEventListener('mouseup', (e) => {
    if (connectFrom) {
      const p = getPos(e);
      const target = nodeAt(p.x, p.y);
      if (target && target.id !== connectFrom.id) {
        const sourceNote = c.notes.find(nt => nt.id === connectFrom.id);
        const targetNote = c.notes.find(nt => nt.id === target.id);
        if (sourceNote && targetNote &&
            !parseLinks(sourceNote.content).some(l => l.toLowerCase() === targetNote.title.toLowerCase())) {
          sourceNote.content = (sourceNote.content ? sourceNote.content + '\n\n' : '') + `[[${targetNote.title}]]`;
          rebuildEdges();
          simulate(60);
        }
      }
      connectFrom = null;
      connectPos = null;
      canvas.style.cursor = 'grab';
      draw();
      return;
    }

    if (dragging && !dragMoved) {
      workspace.noteId = dragging.id;
      workspace.view = 'note';
      workspace.editing = false;
      mountWorkspace();
    }
    dragging = null;
  }, { signal });

  window.addEventListener('resize', () => { resize(); draw(); }, { signal });

  /* ---- Graph search: one query fans out across EVERY live module we
     have at once (Mail OSINT, Hudson Rock, Web Databases, Shodan, all
     the Social platforms, everything) so nothing that could surface a
     breach or a profile gets skipped by a narrow guess. Whatever comes
     back gets merged into ONE new node — the query itself — linked back
     to whichever note you last had open. One search, one clean node,
     every source that had something to say. ---- */
  const searchInput = document.getElementById('graphSearchInput');
  const searchBtn = document.getElementById('graphSearchBtn');
  const searchStatus = document.getElementById('graphSearchStatus');

  function addFinding(note, originId) {
    c.notes.push(note);
    nodes.push({
      id: note.id, label: note.title,
      x: (nodeById[originId] ? nodeById[originId].x : w / 2) + (Math.random() - 0.5) * 60,
      y: (nodeById[originId] ? nodeById[originId].y : h / 2) + (Math.random() - 0.5) * 60,
      vx: 0, vy: 0,
    });
    nodeById = {};
    nodes.forEach(n => { nodeById[n.id] = n; });
    rebuildEdges();
    simulate(80);
    draw();
  }

  async function runGraphSearch() {
    const query = searchInput.value.trim();
    if (!query) { searchInput.focus(); return; }

    // Every live module gets a shot, regardless of query shape — a bad
    // fit (e.g. running Whois against a plain username) just fails fast
    // and gets dropped below; this way nothing that could've found a
    // breach or a profile gets skipped by an overly-clever guess.
    const toolIds = Object.keys(window.LIVE_HANDLERS || {});
    if (!toolIds.length) { searchStatus.textContent = 'No hay módulos en vivo configurados.'; return; }

    searchBtn.disabled = true;
    searchStatus.textContent = `Consultando los ${toolIds.length} módulos...`;

    // Race each module against a 12s cap — some upstreams (OathNet, when
    // it's down) hang far longer than that instead of failing fast, and
    // one slow source shouldn't block the whole pivot from showing what
    // the fast ones already found.
    const withTimeout = (p) => Promise.race([
      p,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
    ]);
    const settled = await Promise.allSettled(toolIds.map(id => withTimeout(fetchGraphToolItems(id, query))));

    const results = [];
    settled.forEach((res) => {
      if (res.status === 'fulfilled') results.push(...res.value);
    });

    if (!results.length) {
      searchStatus.textContent = `Sin datos para "${query}" en los ${toolIds.length} módulos consultados.`;
      searchBtn.disabled = false;
      return;
    }

    // The query itself becomes ONE hub node (or reuses the existing note
    // of that name). Every module that found something gets its OWN
    // satellite node — its own circle — wired to the hub, instead of one
    // blob of merged text. Same idea as an Obsidian note with many
    // outgoing links: one origin, many spokes, all draggable/orderable
    // independently.
    const origin = c.notes.find(n => n.id === workspace.noteId) || c.notes[0] || null;
    let hub = findNoteByTitle(c, query);
    const hubIsNew = !hub;
    if (!hub) {
      hub = { id: 'n-' + Date.now(), title: query, tags: ['found', TOOL_TAG[primaryToolForQuery(query)] || 'default'], content: `Punto de partida: **${query}**` };
    }

    if (origin && origin.id !== hub.id &&
        !parseLinks(origin.content).some(l => l.toLowerCase() === hub.title.toLowerCase())) {
      origin.content = (origin.content ? origin.content + '\n\n' : '') + `[[${hub.title}]]`;
    }
    if (hubIsNew) addFinding(hub, origin ? origin.id : null);

    const stamp = new Date().toLocaleTimeString();
    results.forEach((r, idx) => {
      const satTitle = `${query} — ${r.toolLabel}`;
      let sat = findNoteByTitle(c, satTitle);
      const satIsNew = !sat;
      if (!sat) {
        sat = { id: `n-${Date.now()}-${idx}`, title: satTitle, tags: ['found', TOOL_TAG[r.toolId] || 'default'], content: '' };
      }
      sat.content = (sat.content ? sat.content + '\n\n---\n\n' : '') + `**${r.toolLabel}** — ${stamp}\n${r.plain}`;
      if (!parseLinks(sat.content).some(l => l.toLowerCase() === hub.title.toLowerCase())) {
        sat.content += `\n\nRelacionado con [[${hub.title}]].`;
      }
      if (!parseLinks(hub.content).some(l => l.toLowerCase() === sat.title.toLowerCase())) {
        hub.content = (hub.content ? hub.content + '\n\n' : '') + `[[${sat.title}]]`;
      }
      if (satIsNew) addFinding(sat, hub.id);
    });

    rebuildEdges();
    simulate(80);
    draw();

    searchStatus.textContent = `"${query}": ${results.length} círculo${results.length > 1 ? 's' : ''} nuevo${results.length > 1 ? 's' : ''} conectado${results.length > 1 ? 's' : ''} al centro.`;
    searchInput.value = '';
    searchBtn.disabled = false;
  }

  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', runGraphSearch, { signal });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runGraphSearch(); }, { signal });
  }
}

function renderActivity() {
  return `
  <div class="max-w-5xl mx-auto px-8 py-8">
    <h1 class="text-2xl font-semibold mb-1">Activity</h1>
    <p class="text-sm text-gray-500 mb-8">A log of every search and case action on your account.</p>
    <div class="rounded-2xl border border-white/10 py-24 flex flex-col items-center justify-center gap-3 text-center">
      <div class="tool-empty-icon">${icon('activity', 'width="22" height="22"')}</div>
      <p class="font-semibold">No recent activity</p>
      <p class="text-sm text-gray-500">Once you run a search, it'll show up here.</p>
    </div>
  </div>`;
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar();

  const initial = (window.location.hash || '#dashboard').slice(1);
  selectTool(TOOL_BY_ID[initial] ? initial : 'dashboard');

  document.getElementById('mainPanel').addEventListener('click', (e) => {
    const qa = e.target.closest('.quick-action');
    if (qa) { selectTool(qa.dataset.id); return; }

    const caseCard = e.target.closest('.case-card');
    if (caseCard) { openCase(caseCard.dataset.case); return; }

    if (e.target.closest('#newCaseBtn') || e.target.closest('#newCaseBtn2')) { newCase(); return; }

    const countryCard = e.target.closest('.country-card');
    if (countryCard) { selectTool(countryCard.dataset.id); return; }
  });

  const collapseBtn = document.getElementById('collapseBtn');
  collapseBtn.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });

  const sideSearch = document.getElementById('sideSearch');
  sideSearch.addEventListener('input', () => {
    const q = sideSearch.value.trim().toLowerCase();
    document.querySelectorAll('.nav-item').forEach(el => {
      const label = el.textContent.trim().toLowerCase();
      el.style.display = !q || label.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.nav-cat').forEach(cat => {
      let sib = cat.nextElementSibling, visible = false;
      while (sib && !sib.classList.contains('nav-cat')) {
        if (sib.style.display !== 'none') visible = true;
        sib = sib.nextElementSibling;
      }
      cat.style.display = visible ? '' : 'none';
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      sideSearch.focus();
    }
  });
});
