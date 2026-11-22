/**
 * M R S IPTV - Comprehensive Channel Logo & Thumbnail Resolver
 * 
 * Provides:
 * 1. Curated high-resolution SVG/PNG vector brand logos for major global networks
 * 2. Live match event sport badges (Cricket, Football/Soccer, NFL, MLB, NBA, Tennis, F1, Combat, etc.)
 * 3. Automatic HTTPS upgrader and backend logo proxy wrapper
 * 4. Crisp zero-dependency SVG fallback generator so no channel ever shows a broken image
 */

// Helper to strip lone UTF-16 surrogates and escape XML entities for SVG
function sanitizeSvgText(input: string): string {
  const wellFormed = typeof (input as any).toWellFormed === 'function'
    ? (input as any).toWellFormed()
    : String(input || '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return wellFormed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeEncodeSvg(svg: string): string {
  try {
    const cleanSvg = typeof (svg as any).toWellFormed === 'function'
      ? (svg as any).toWellFormed()
      : svg.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    return `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
  } catch {
    return 'data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200"%3E%3Crect width="360" height="200" fill="%230f172a"/%3E%3C/svg%3E';
  }
}

// Helper to create an encoded SVG data URI
function createSvgBadge(opts: {
  bg: string;
  text: string;
  subText?: string;
  accentColor?: string;
  symbolSvg?: string;
  fontFamily?: string;
}): string {
  const { bg = '#050816', text, subText, accentColor = '#00D9FF', symbolSvg = '', fontFamily = 'sans-serif' } = opts;
  const safeText = sanitizeSvgText(text);
  const safeSubText = subText ? sanitizeSvgText(subText.toUpperCase()) : '';
  const charLen = Array.from(text || '').length;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg}" />
        <stop offset="100%" stop-color="#050816" />
      </linearGradient>
      <linearGradient id="brandBar" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00D9FF" />
        <stop offset="50%" stop-color="#176BFF" />
        <stop offset="100%" stop-color="#B832F5" />
      </linearGradient>
    </defs>
    <rect width="360" height="200" fill="url(#grad)" />
    <rect x="0" y="194" width="360" height="6" fill="url(#brandBar)" />
    <circle cx="310" cy="30" r="60" fill="#00D9FF" opacity="0.10" />
    <circle cx="50" cy="170" r="50" fill="#B832F5" opacity="0.10" />
    ${symbolSvg}
    <text x="180" y="${safeSubText ? '104' : '112'}" 
          font-family="'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, ${fontFamily}" 
          font-size="${charLen > 12 ? '24' : charLen > 8 ? '28' : '36'}" 
          font-weight="900" 
          letter-spacing="1px"
          fill="#FFFFFF" 
          text-anchor="middle" 
          dominant-baseline="middle">
      ${safeText}
    </text>
    ${
      safeSubText
        ? `<text x="180" y="144" 
                 font-family="'Outfit', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" 
                 font-size="13" 
                 font-weight="700" 
                 letter-spacing="2px" 
                 fill="${accentColor}" 
                 text-anchor="middle">
            ${safeSubText}
           </text>`
        : ''
    }
  </svg>`;
  return safeEncodeSvg(svg);
}

// Sport Event Badge Generator
export function getLiveEventBadge(sportName: string, subDetail?: string): string {
  const sport = (sportName || '').toLowerCase();

  // Cricket
  if (sport.includes('cricket') || sport.includes('cpl') || sport.includes('ipl') || sport.includes('bpl') || sport.includes('t20')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'CRICKET LIVE',
      subText: subDetail || 'MATCH ACTION',
      accentColor: '#00D9FF',
      symbolSvg: `<path d="M180 32 a 16 16 0 1 0 0.1 0 Z" fill="#176BFF" stroke="#00D9FF" stroke-width="2" opacity="0.9"/>
                  <line x1="174" y1="22" x2="186" y2="42" stroke="#FFFFFF" stroke-dasharray="2 2" stroke-width="1.5"/>`
    });
  }

  // Soccer / Football
  if (sport.includes('soccer') || sport.includes('laliga') || sport.includes('serie a') || sport.includes('ligue 1') || sport.includes('copa') || sport.includes('premier league') || sport.includes('champions')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'SOCCER LIVE',
      subText: subDetail || 'PREMIUM LEAGUE',
      accentColor: '#00D9FF',
      symbolSvg: `<circle cx="180" cy="38" r="16" fill="#FFFFFF" opacity="0.9"/>
                  <polygon points="180,26 188,32 185,42 175,42 172,32" fill="#050816"/>`
    });
  }

  // American Football
  if (sport.includes('american football') || sport.includes('nfl') || sport.includes('ncaaf')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'FOOTBALL LIVE',
      subText: subDetail || 'GRIDIRON CLASH',
      accentColor: '#00D9FF',
      symbolSvg: `<ellipse cx="180" cy="38" rx="20" ry="12" fill="#176BFF" stroke="#00D9FF" stroke-width="1.5"/>
                  <line x1="168" y1="38" x2="192" y2="38" stroke="#FFFFFF" stroke-width="2"/>`
    });
  }

  // Baseball
  if (sport.includes('baseball') || sport.includes('mlb')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'BASEBALL LIVE',
      subText: subDetail || 'MLB ACTION',
      accentColor: '#00D9FF',
      symbolSvg: `<circle cx="180" cy="38" r="15" fill="#FFFFFF" stroke="#176BFF" stroke-width="1.5" stroke-dasharray="3 3"/>`
    });
  }

  // Basketball
  if (sport.includes('basketball') || sport.includes('nba')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'BASKETBALL LIVE',
      subText: subDetail || 'NBA COURT ACTION',
      accentColor: '#00D9FF',
      symbolSvg: `<circle cx="180" cy="38" r="16" fill="#176BFF" stroke="#00D9FF" stroke-width="2"/>
                  <line x1="180" y1="22" x2="180" y2="54" stroke="#FFFFFF" stroke-width="1.5"/>
                  <line x1="164" y1="38" x2="196" y2="38" stroke="#FFFFFF" stroke-width="1.5"/>`
    });
  }

  // Tennis
  if (sport.includes('tennis') || sport.includes('us open') || sport.includes('wimbledon') || sport.includes('atp') || sport.includes('wta')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'TENNIS LIVE',
      subText: subDetail || 'GRAND SLAM TOUR',
      accentColor: '#00D9FF',
      symbolSvg: `<circle cx="180" cy="38" r="15" fill="#00D9FF" stroke="#176BFF" stroke-width="1.5"/>
                  <path d="M172 26 C176 34, 176 42, 172 50" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
                  <path d="M188 26 C184 34, 184 42, 188 50" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>`
    });
  }

  // Racing / Motorsport / F1
  if (sport.includes('racing') || sport.includes('f1') || sport.includes('formula') || sport.includes('motorsport') || sport.includes('nascar')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'FORMULA 1',
      subText: subDetail || 'RACE GRAND PRIX',
      accentColor: '#00D9FF',
      symbolSvg: `<rect x="166" y="26" width="14" height="12" fill="#FFFFFF"/>
                  <rect x="180" y="26" width="14" height="12" fill="#176BFF"/>
                  <rect x="166" y="38" width="14" height="12" fill="#176BFF"/>
                  <rect x="180" y="38" width="14" height="12" fill="#FFFFFF"/>`
    });
  }

  // Combat / UFC / Boxing / Wrestling
  if (sport.includes('ufc') || sport.includes('boxing') || sport.includes('fight') || sport.includes('wwe') || sport.includes('tna') || sport.includes('mma')) {
    return createSvgBadge({
      bg: '#081229',
      text: 'FIGHT NIGHT',
      subText: subDetail || 'UFC / COMBAT SPORTS',
      accentColor: '#00D9FF',
      symbolSvg: `<polygon points="180,24 192,29 197,41 192,53 180,58 168,53 163,41 168,29" fill="none" stroke="#00D9FF" stroke-width="2.5"/>`
    });
  }

  return createSvgBadge({
    bg: '#081229',
    text: sportName.toUpperCase(),
    subText: 'LIVE EVENT',
    accentColor: '#00D9FF'
  });
}

// Major Broadcast & Cable Networks Verified Vector Dictionary
const NETWORK_LOGOS: Record<string, string> = {
  // Sports Networks
  espn: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
  'espn 2': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
  espn2: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
  espnu: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
  'espn news': 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
  'fox sports': 'https://upload.wikimedia.org/wikipedia/commons/9/90/Fox_Sports_logo.svg',
  fs1: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Fox_Sports_logo.svg',
  fs2: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Fox_Sports_logo.svg',
  'sky sports': 'https://upload.wikimedia.org/wikipedia/commons/3/36/Sky_Sports_logo_2020.svg',
  'tnt sports': 'https://upload.wikimedia.org/wikipedia/commons/e/ec/TNT_Sports_%28UK%29_logo.svg',
  tsn: 'https://upload.wikimedia.org/wikipedia/commons/2/23/TSN_logo.svg',
  'bein sports': 'https://upload.wikimedia.org/wikipedia/commons/4/43/BeIN_Sports_logo.svg',
  dazn: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/DAZN_Logo_Master.svg',
  'nfl network': 'https://upload.wikimedia.org/wikipedia/en/7/75/NFL_Network_logo.svg',
  'nba tv': 'https://upload.wikimedia.org/wikipedia/en/d/df/NBA_TV.svg',
  'mlb network': 'https://upload.wikimedia.org/wikipedia/en/9/9c/MLB_Network_logo.svg',
  'nhl network': 'https://upload.wikimedia.org/wikipedia/en/9/91/NHL_Network_logo.svg',
  'golf channel': 'https://upload.wikimedia.org/wikipedia/commons/4/46/Golf_Channel_logo.svg',
  'tennis channel': 'https://upload.wikimedia.org/wikipedia/en/9/99/Tennis_Channel_logo.svg',
  'cbs sports': 'https://upload.wikimedia.org/wikipedia/commons/9/9a/CBS_Sports_Network_logo.svg',
  'nbc sports': 'https://upload.wikimedia.org/wikipedia/commons/8/8a/NBC_Sports_logo_%282023%29.svg',
  'willow sports': 'https://upload.wikimedia.org/wikipedia/en/a/a7/Willow_logo.svg',
  willow: 'https://upload.wikimedia.org/wikipedia/en/a/a7/Willow_logo.svg',
  
  // Movies & Cinema
  hbo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/HBO_logo.svg',
  cinemax: 'https://upload.wikimedia.org/wikipedia/commons/d/dd/Cinemax_logo_2020.svg',
  showtime: 'https://upload.wikimedia.org/wikipedia/commons/2/22/Showtime.svg',
  starz: 'https://upload.wikimedia.org/wikipedia/commons/4/41/Starz_2022.svg',
  tcm: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Turner_Classic_Movies_logo_2021.svg',
  'turner classic': 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Turner_Classic_Movies_logo_2021.svg',
  mgm: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/MGM%2B_logo.svg',
  amc: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/Amc_logo.svg',
  hallmark: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Hallmark_Channel_logo.svg',
  'lifetime movie': 'https://upload.wikimedia.org/wikipedia/commons/d/d3/LMN_logo_2020.svg',

  // News & Information
  cnn: 'https://upload.wikimedia.org/wikipedia/commons/6/66/CNN_International_logo.svg',
  'bbc news': 'https://upload.wikimedia.org/wikipedia/commons/6/62/BBC_News_2022.svg',
  'bbc world': 'https://upload.wikimedia.org/wikipedia/commons/6/62/BBC_News_2022.svg',
  'fox news': 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Fox_News_Channel_logo.svg',
  msnbc: 'https://upload.wikimedia.org/wikipedia/commons/8/87/MSNBC_2021.svg',
  cnbc: 'https://upload.wikimedia.org/wikipedia/commons/e/e3/CNBC_logo.svg',
  bloomberg: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Bloomberg_Television_logo_2020.svg',
  'weather channel': 'https://upload.wikimedia.org/wikipedia/en/c/c8/The_Weather_Channel_logo_2005.svg',
  accuweather: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/AccuWeather_logo_2019.svg',
  newsmax: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/Newsmax_TV_logo.svg',
  newsnation: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/NewsNation_logo.svg',
  'c-span': 'https://upload.wikimedia.org/wikipedia/commons/3/30/C-SPAN_logo_2019.svg',

  // Kids & Family
  disney: 'https://upload.wikimedia.org/wikipedia/commons/d/d2/2019_Disney_Channel_logo.svg',
  nickelodeon: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Nickelodeon_2023.svg',
  'cartoon network': 'https://upload.wikimedia.org/wikipedia/commons/8/80/Cartoon_Network_2010_logo.svg',
  boomerang: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Boomerang_2014_logo.svg',
  'pbs kids': 'https://upload.wikimedia.org/wikipedia/commons/7/73/PBS_Kids_logo_2022.svg',

  // Documentary & Knowledge
  discovery: 'https://upload.wikimedia.org/wikipedia/commons/2/27/Discovery_2019.svg',
  'nat geo': 'https://upload.wikimedia.org/wikipedia/commons/6/6a/National_Geographic_Channel_logo.svg',
  'national geographic': 'https://upload.wikimedia.org/wikipedia/commons/6/6a/National_Geographic_Channel_logo.svg',
  history: 'https://upload.wikimedia.org/wikipedia/commons/f/f5/History_Logo.svg',
  'animal planet': 'https://upload.wikimedia.org/wikipedia/commons/2/20/Animal_Planet_2018.svg',
  smithsonian: 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Smithsonian_Channel_logo.svg',

  // Entertainment
  abc: 'https://upload.wikimedia.org/wikipedia/commons/3/32/2021_ABC_logo.svg',
  cbs: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/CBS_logo.svg',
  nbc: 'https://upload.wikimedia.org/wikipedia/commons/a/a2/NBC_logo_2022.svg',
  fox: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Fox_Broadcasting_Company_logo_%282019%29.svg',
  cw: 'https://upload.wikimedia.org/wikipedia/commons/0/0a/The_CW_2024.svg',
  fx: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/FX_2013_logo.svg',
  tbs: 'https://upload.wikimedia.org/wikipedia/commons/6/66/TBS_logo_2019.svg',
  tnt: 'https://upload.wikimedia.org/wikipedia/commons/c/cb/TNT_2016_logo.svg',
  'usa network': 'https://upload.wikimedia.org/wikipedia/commons/9/91/USA_Network_logo_2016.svg',
  bet: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/BET_2021.svg',
  bravo: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Bravo_2017_logo.svg',
  'comedy central': 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Comedy_Central_2018.svg',
  paramount: 'https://upload.wikimedia.org/wikipedia/commons/8/87/Paramount_Network_2018.svg',
  'a&e': 'https://upload.wikimedia.org/wikipedia/commons/c/cf/A%26E_Network_logo_2017.svg',
  telemundo: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Telemundo_logo.svg',
  univision: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Univision_2019.svg',

  // Music & Lifestyle
  mtv: 'https://upload.wikimedia.org/wikipedia/commons/0/07/MTV_Logo_2021.svg',
  vh1: 'https://upload.wikimedia.org/wikipedia/commons/5/54/VH1_2013_logo.svg',
  'food network': 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Food_Network_logo.svg',
  hgtv: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/HGTV_2015.svg',
  tlc: 'https://upload.wikimedia.org/wikipedia/commons/1/14/TLC_Logo_2020.svg',

  // Bangladeshi Broadcasters
  't sports': 'https://upload.wikimedia.org/wikipedia/en/9/9b/T_Sports_logo.svg',
  somoy: 'https://upload.wikimedia.org/wikipedia/en/3/30/Somoy_TV_logo.png',
  'channel i': 'https://upload.wikimedia.org/wikipedia/en/7/7b/Channel_i_logo.png',
  jamuna: 'https://upload.wikimedia.org/wikipedia/en/5/52/Jamuna_Television_logo.png',
  btv: 'https://upload.wikimedia.org/wikipedia/en/9/93/BTV_logo.png',
  ntv: 'https://upload.wikimedia.org/wikipedia/en/6/6b/NTV_Bangladesh_logo.png'
};

/**
 * Returns the exact verified logo for any channel.
 * Upgrades HTTP to HTTPS, proxies restricted image CDNs, or provides SVG brand graphics.
 */
export function getChannelLogo(channel: { name: string; iconUrl?: string; category?: string }): string {
  const name = (channel.name || '').toLowerCase().trim();

  // 1. Check for Live Match Events: e.g. "[American Football] ...", "[Cricket] ...", "[Soccer] ..."
  const matchEventRegex = /\[(.*?)\]/;
  const matchMatch = channel.name.match(matchEventRegex);
  if (matchMatch) {
    const sportName = matchMatch[1].trim();
    // Check if channel has team names (e.g. Team A vs Team B)
    const vsMatch = channel.name.match(/\]\s*(.*?)\s*(?:vs\.?|at|\|)\s*(.*?)(?:\||$)/i);
    const sub = vsMatch ? `${vsMatch[1].trim().split(' ')[0]} VS ${vsMatch[2].trim().split(' ')[0]}` : undefined;
    return getLiveEventBadge(sportName, sub);
  }

  // 2. Exact match against verified major broadcast networks
  for (const [key, logoUrl] of Object.entries(NETWORK_LOGOS)) {
    if (name.includes(key)) {
      return logoUrl;
    }
  }

  // 3. If stream already has a non-generic iconUrl from M3U:
  if (
    channel.iconUrl &&
    channel.iconUrl.trim() &&
    !channel.iconUrl.includes('placeholder') &&
    !channel.iconUrl.includes('Chat-GPT-Image') &&
    !channel.iconUrl.includes('i.postimg.cc/mD7bXkP3') &&
    !channel.iconUrl.includes('i.postimg.cc/bJxcVY8r') &&
    !channel.iconUrl.includes('postimg.cc/404') &&
    !channel.iconUrl.includes('dummy')
  ) {
    let url = channel.iconUrl.trim();

    // Auto-upgrade insecure http:// to https:// to prevent Mixed Content browser blocks
    if (url.startsWith('http://')) {
      url = 'https://' + url.slice(7);
    }

    // If host has known hotlink blocking (1000logos.net, schedulesdirect, imgur, etc.)
    // Route through backend logo proxy for guaranteed 200 OK delivery
    if (
      url.includes('1000logos.net') ||
      url.includes('schedulesdirect') ||
      url.includes('amazonaws.com') ||
      url.includes('imgur.com')
    ) {
      return `/api/logo-proxy?url=${encodeURIComponent(url)}`;
    }

    return url;
  }

  // 4. Default high-contrast category SVG badge
  return getChannelFallbackLogo(channel);
}

/**
 * Returns a high-contrast fallback vector badge when an image fails to load.
 */
export function getChannelFallbackLogo(channel: { name: string; category?: string }): string {
  const name = channel.name || 'IPTV';
  // Strip bracketed tags and non-BMP surrogate emojis when computing clean text initials
  const cleanName = name
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'TV';

  const initials = cleanName
    .split(' ')
    .filter(w => w && w !== '-')
    .slice(0, 3)
    .map(w => Array.from(w)[0] || '')
    .join('')
    .toUpperCase() || Array.from(cleanName).slice(0, 3).join('').toUpperCase();

  const bg = '#081229';
  const accent = '#00D9FF';

  const codePoints = Array.from(cleanName);
  const safeSub = codePoints.length > 20 ? codePoints.slice(0, 18).join('') + '...' : cleanName;

  return createSvgBadge({
    bg,
    text: initials,
    subText: safeSub,
    accentColor: accent
  });
}
