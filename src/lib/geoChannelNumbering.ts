import { Channel } from '../types';

const GEO_NUMBERED_CHANNELS_KEY = 'mrs_tv_geo_country_first_v4';
const GEO_REGION_DETECTED_KEY = 'mrs_tv_geo_region_detected_v4';

export interface GeoRegionProfile {
  regionCode: string;
  regionName: string;
  countryName: string;
  flagEmoji: string;
  keywords: string[];
  priorityCategoryKeywords: string[];
}

export interface ExactCountryOption {
  code: string;
  name: string;
  flagEmoji: string;
  nativeName?: string;
  description: string;
}

export const SUPPORTED_EXACT_COUNTRIES: ExactCountryOption[] = [
  { code: 'AUTO', name: 'Auto-Detect', flagEmoji: '⚡', description: 'Automatic based on IP & Location' },
  { code: 'BD', name: 'Bangladesh', flagEmoji: '🇧🇩', nativeName: 'বাংলাদেশ', description: 'T Sports, Somoy, Jamuna, NTV, GTV' },
  { code: 'IN', name: 'India', flagEmoji: '🇮🇳', nativeName: 'भारत', description: 'Star Sports, Sony, Aaj Tak, Zee TV' },
  { code: 'PK', name: 'Pakistan', flagEmoji: '🇵🇰', nativeName: 'پاکستان', description: 'PTV, Geo, ARY, Hum TV, A Sports' },
  { code: 'ME', name: 'Middle East', flagEmoji: '🇸🇦', nativeName: 'الشرق الأوسط', description: 'beIN Sports, Al Jazeera, MBC, SSC' },
  { code: 'UK', name: 'United Kingdom', flagEmoji: '🇬🇧', nativeName: 'UK', description: 'Sky Sports, BBC, ITV, TNT Sports' },
  { code: 'US', name: 'United States', flagEmoji: '🇺🇸', nativeName: 'USA', description: 'ESPN, Fox Sports, NBC, CBS, HBO' },
  { code: 'CA', name: 'Canada', flagEmoji: '🇨🇦', nativeName: 'Canada', description: 'TSN, Sportsnet, CBC, CTV' },
  { code: 'AU', name: 'Australia', flagEmoji: '🇦🇺', nativeName: 'Australia', description: 'Optus, Fox Sports Australia, Stan' },
  { code: 'EU', name: 'Europe', flagEmoji: '🇪🇺', nativeName: 'Europa', description: 'Eurosport, Canal+, DAZN, Sky' },
  { code: 'GLOBAL', name: 'Global All', flagEmoji: '🌐', nativeName: 'International', description: 'All 8,890+ International Channels' }
];

export function getProfileByRegionCode(code: string): GeoRegionProfile {
  const c = (code || '').toUpperCase().trim();
  switch (c) {
    case 'BD':
      return getBangladeshProfile();
    case 'IN':
      return getIndiaProfile();
    case 'PK':
      return {
        regionCode: 'PK',
        regionName: 'Pakistan',
        countryName: 'Pakistan',
        flagEmoji: '🇵🇰',
        keywords: ['ptv', 'geo', 'ary', 'hum tv', 'express', 'dunya', 'bol news', 'samaa', 'ten sports pakistan', 'a sports', 'pakistan', 'urdu'],
        priorityCategoryKeywords: ['pakistani', 'pakistan', 'sports', 'cricket', 'news']
      };
    case 'ME':
    case 'SA':
    case 'ARAB':
    case 'AE':
    case 'QA':
      return {
        regionCode: 'ME',
        regionName: 'Middle East & Arab World',
        countryName: 'Middle East',
        flagEmoji: '🇸🇦',
        keywords: ['bein', 'al jazeera', 'mbc', 'dubai sports', 'abu dhabi', 'alarabiya', 'ssc', 'alkass', 'rotana', 'arabic', 'saudi'],
        priorityCategoryKeywords: ['arabic', 'bein', 'sports', 'football', 'middle east', 'news']
      };
    case 'UK':
    case 'GB':
      return {
        regionCode: 'UK',
        regionName: 'United Kingdom',
        countryName: 'United Kingdom',
        flagEmoji: '🇬🇧',
        keywords: ['sky sports', 'bbc', 'itv', 'tnt sports', 'bt sport', 'eurosport', 'premier sports', 'channel 4', 'channel 5', 'sky news', 'sky cinema', 'uk'],
        priorityCategoryKeywords: ['uk', 'sky sports', 'football', 'premier league', 'sports', 'news']
      };
    case 'US':
    case 'USA':
      return {
        regionCode: 'US',
        regionName: 'USA & North America',
        countryName: 'United States',
        flagEmoji: '🇺🇸',
        keywords: ['espn', 'fox sports', 'cbs', 'nbc', 'cnn', 'hbo', 'abc', 'usa', 'tnt', 'nba', 'nfl', 'mlb', 'msnbc'],
        priorityCategoryKeywords: ['usa', 'sports', 'news', 'entertainment', 'movies']
      };
    case 'CA':
      return {
        regionCode: 'CA',
        regionName: 'Canada',
        countryName: 'Canada',
        flagEmoji: '🇨🇦',
        keywords: ['tsn', 'sportsnet', 'cbc', 'ctv', 'global news', 'canada'],
        priorityCategoryKeywords: ['canada', 'sports', 'news']
      };
    case 'AU':
      return {
        regionCode: 'AU',
        regionName: 'Australia',
        countryName: 'Australia',
        flagEmoji: '🇦🇺',
        keywords: ['optus', 'fox sports australia', 'stan', 'abc australia', 'channel 7', 'channel 9', 'channel 10', 'sbs', 'australia'],
        priorityCategoryKeywords: ['australia', 'cricket', 'sports', 'afl', 'nrl', 'news']
      };
    case 'EU':
    case 'DE':
    case 'FR':
    case 'IT':
    case 'ES':
      return {
        regionCode: 'EU',
        regionName: 'Europe',
        countryName: 'Europe',
        flagEmoji: '🇪🇺',
        keywords: ['eurosport', 'canal+', 'sky', 'dazn', 'bein sport', 'zdf', 'ard', 'rtve', 'rai'],
        priorityCategoryKeywords: ['europe', 'football', 'sports', 'news']
      };
    case 'GLOBAL':
    default:
      return {
        regionCode: 'GLOBAL',
        regionName: 'Global International',
        countryName: 'Global',
        flagEmoji: '🌐',
        keywords: ['sports', 'cricket', 'football', 'espn', 'sky', 'star', 't sports', 'live', 'news', 'hd'],
        priorityCategoryKeywords: ['sports', 'news', 'entertainment', 'general']
      };
  }
}

let backendCountryCache: string | null = null;

export function setBackendDetectedCountry(code: string): void {
  if (!code) return;
  backendCountryCache = code.toUpperCase().trim();
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('mrs_tv_backend_country', backendCountryCache);
    } catch {}
  }
}

export async function fetchAndSyncBackendCountry(): Promise<GeoRegionProfile> {
  if (typeof window === 'undefined') return detectUserGeoRegion();
  try {
    const res = await fetch('/api/geo/my-country');
    if (res.ok) {
      const data = await res.json();
      if (data && data.code) {
        setBackendDetectedCountry(data.code);
        const manual = getUserSelectedCountry();
        if (!manual || manual === 'AUTO') {
          const profile = getProfileByRegionCode(data.code);
          window.dispatchEvent(new CustomEvent('mrs_country_changed', { detail: { countryCode: data.code, profile } }));
          return profile;
        }
      }
    }
  } catch (e) {
    console.warn('[Geo Numbering] Failed to sync backend country:', e);
  }
  return detectUserGeoRegion();
}

/**
 * Persist user's explicit country selection and broadcast change event
 */
export function setUserSelectedCountry(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!code || code === 'AUTO') {
      localStorage.removeItem('mrs_tv_selected_country');
    } else {
      localStorage.setItem('mrs_tv_selected_country', code.toUpperCase());
    }
    // Invalidate cached numbering so it re-generates immediately with the selected country
    localStorage.removeItem(GEO_NUMBERED_CHANNELS_KEY);
    localStorage.removeItem(GEO_REGION_DETECTED_KEY);
    
    window.dispatchEvent(new CustomEvent('mrs_country_changed', { detail: { countryCode: code } }));
  } catch (e) {
    console.warn('[Geo Numbering] Failed to set user country:', e);
  }
}

/**
 * Get active user-selected country code (or 'AUTO')
 */
export function getUserSelectedCountry(): string {
  if (typeof window === 'undefined') return 'AUTO';
  try {
    return localStorage.getItem('mrs_tv_selected_country') || 'AUTO';
  } catch {
    return 'AUTO';
  }
}

/**
 * Helper to open targeted Google Search for exact stream finding
 */
export function openGoogleSearchForChannel(query: string, customSuffix: string = 'live stream watch online free'): void {
  if (!query || !query.trim()) return;
  const clean = query.trim();
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${clean} ${customSuffix}`)}`;
  window.open(searchUrl, '_blank', 'noopener,noreferrer');
}

/**
 * Detect user's geographic country and region using fast, multi-factor browser signals:
 * 1. Intl DateTimeFormat timezones (Asia/Dhaka, Asia/Kolkata, America/New_York, etc.)
 * 2. navigator.languages / navigator.language (bn-BD, hi-IN, en-US, ar-SA, etc.)
 * 3. LocalStorage override if previously selected
 */
export function detectUserGeoRegion(): GeoRegionProfile {
  // Check user manual override if set
  if (typeof window !== 'undefined') {
    try {
      const manualCountry = localStorage.getItem('mrs_tv_selected_country') || localStorage.getItem('shahintv_user_type');
      if (manualCountry && manualCountry !== 'AUTO') {
        const mappedCode = manualCountry.toUpperCase();
        if (['BD', 'IN', 'PK', 'ME', 'SA', 'UK', 'GB', 'US', 'USA', 'CA', 'AU', 'EU', 'GLOBAL'].includes(mappedCode)) {
          return getProfileByRegionCode(mappedCode);
        }
      }
    } catch (e) {}
  }

  // Check backend IP auto-detected country (from /api/geo/my-country or /api/all-channels)
  const backendCode = backendCountryCache || (typeof window !== 'undefined' ? sessionStorage.getItem('mrs_tv_backend_country') : null);
  if (backendCode && backendCode !== 'AUTO') {
    return getProfileByRegionCode(backendCode);
  }

  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (e) {}

  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch (e) {}

  const languages = typeof navigator !== 'undefined' 
    ? (navigator.languages ? Array.from(navigator.languages) : [navigator.language || ''])
    : [];

  const langStr = (languages.join(',') + ',' + locale).toLowerCase();
  const tzLower = timezone.toLowerCase();

  // 1. Bangladesh (Asia/Dhaka, bn-BD, bn, bd)
  if (
    tzLower.includes('dhaka') || 
    tzLower.includes('bangladesh') ||
    langStr.includes('bn') || 
    langStr.includes('bd')
  ) {
    return getBangladeshProfile();
  }

  // 2. India (Asia/Kolkata, Asia/Calcutta, hi-IN, ta-IN, te-IN, in)
  if (
    tzLower.includes('kolkata') || 
    tzLower.includes('calcutta') || 
    tzLower.includes('india') ||
    langStr.includes('hi') || 
    langStr.includes('ta') || 
    langStr.includes('te') || 
    langStr.includes('ml') || 
    langStr.includes('kn') || 
    langStr.includes('gu') || 
    langStr.includes('mr') || 
    langStr.includes('pa') ||
    langStr.includes('-in')
  ) {
    return getIndiaProfile();
  }

  // 3. Pakistan (Asia/Karachi, ur-PK, pk)
  if (
    tzLower.includes('karachi') ||
    tzLower.includes('pakistan') ||
    langStr.includes('ur') ||
    langStr.includes('-pk')
  ) {
    return {
      regionCode: 'PK',
      regionName: 'Pakistan',
      countryName: 'Pakistan',
      flagEmoji: '🇵🇰',
      keywords: ['ptv', 'geo', 'ary', 'hum tv', 'express', 'dunya', 'bol news', 'samaa', 'ten sports pakistan', 'a sports', 'pakistan', 'urdu'],
      priorityCategoryKeywords: ['pakistani', 'pakistan', 'sports', 'cricket', 'news']
    };
  }

  // 4. Middle East & Arab Region (Asia/Riyadh, Asia/Dubai, Qatar, Kuwait, Cairo, etc.)
  if (
    tzLower.includes('riyadh') || 
    tzLower.includes('dubai') || 
    tzLower.includes('qatar') || 
    tzLower.includes('cairo') || 
    tzLower.includes('kuwait') || 
    tzLower.includes('muscat') || 
    tzLower.includes('bahrain') || 
    tzLower.includes('baghdad') || 
    tzLower.includes('amman') || 
    langStr.includes('ar')
  ) {
    return {
      regionCode: 'ME',
      regionName: 'Middle East & Arab World',
      countryName: 'Middle East',
      flagEmoji: '🇸🇦',
      keywords: ['bein', 'al jazeera', 'mbc', 'dubai sports', 'abu dhabi', 'alarabiya', 'ssc', 'alkass', 'rotana', 'arabic', 'saudi'],
      priorityCategoryKeywords: ['arabic', 'bein', 'sports', 'football', 'middle east', 'news']
    };
  }

  // 5. United Kingdom (Europe/London, en-GB)
  if (
    tzLower.includes('london') || 
    tzLower.includes('belfast') ||
    langStr.includes('en-gb')
  ) {
    return {
      regionCode: 'UK',
      regionName: 'United Kingdom',
      countryName: 'United Kingdom',
      flagEmoji: '🇬🇧',
      keywords: ['sky sports', 'bbc', 'itv', 'tnt sports', 'bt sport', 'eurosport', 'premier sports', 'channel 4', 'channel 5', 'sky news', 'sky cinema', 'uk'],
      priorityCategoryKeywords: ['uk', 'sky sports', 'football', 'premier league', 'sports', 'news']
    };
  }

  // 6. United States & North America (America/New_York, Chicago, Los_Angeles, etc.)
  if (
    tzLower.includes('america') || 
    tzLower.includes('new_york') || 
    tzLower.includes('chicago') || 
    tzLower.includes('los_angeles') || 
    tzLower.includes('denver') ||
    tzLower.includes('phoenix') ||
    langStr.includes('en-us')
  ) {
    return {
      regionCode: 'US',
      regionName: 'USA & North America',
      countryName: 'United States',
      flagEmoji: '🇺🇸',
      keywords: ['espn', 'fox sports', 'cbs', 'nbc', 'cnn', 'hbo', 'abc', 'usa', 'tnt', 'nba', 'nfl', 'mlb', 'msnbc'],
      priorityCategoryKeywords: ['usa', 'sports', 'news', 'entertainment', 'movies']
    };
  }

  // 7. Canada (America/Toronto, Vancouver, Montreal, etc.)
  if (
    tzLower.includes('toronto') || 
    tzLower.includes('vancouver') || 
    tzLower.includes('montreal') || 
    tzLower.includes('edmonton') ||
    langStr.includes('en-ca') ||
    langStr.includes('fr-ca')
  ) {
    return {
      regionCode: 'CA',
      regionName: 'Canada',
      countryName: 'Canada',
      flagEmoji: '🇨🇦',
      keywords: ['tsn', 'sportsnet', 'cbc', 'ctv', 'global news', 'canada'],
      priorityCategoryKeywords: ['canada', 'sports', 'news']
    };
  }

  // 8. Europe (Paris, Berlin, Madrid, Rome, Amsterdam, etc.)
  if (
    tzLower.includes('paris') ||
    tzLower.includes('berlin') ||
    tzLower.includes('madrid') ||
    tzLower.includes('rome') ||
    tzLower.includes('amsterdam') ||
    tzLower.includes('europe')
  ) {
    return {
      regionCode: 'EU',
      regionName: 'Europe',
      countryName: 'Europe',
      flagEmoji: '🇪🇺',
      keywords: ['eurosport', 'canal+', 'sky', 'dazn', 'bein sport', 'zdf', 'ard', 'rtve', 'rai'],
      priorityCategoryKeywords: ['europe', 'football', 'sports', 'news']
    };
  }

  // 9. Global Fallback
  return {
    regionCode: 'GLOBAL',
    regionName: 'Global International',
    countryName: 'Global',
    flagEmoji: '🌐',
    keywords: ['sports', 'cricket', 'football', 'espn', 'sky', 'star', 't sports', 'live', 'news', 'hd'],
    priorityCategoryKeywords: ['sports', 'news', 'entertainment', 'general']
  };
}

function getBangladeshProfile(): GeoRegionProfile {
  return {
    regionCode: 'BD',
    regionName: 'Bangladesh & South Asia',
    countryName: 'Bangladesh',
    flagEmoji: '🇧🇩',
    keywords: [
      'bangla', 'bangladesh', 'dhaka', 'somoy', 'jamuna', 'ntv', 'channel i', 't sports', 
      'gazi', 'gtv', 'nagorik', 'desh tv', 'ekattor', '71', 'deepto', 'atn', 'btv', 
      'independent tv', 'independent', 'news 24', 'news24', 'rtv', 'maasranga', 'bijoy', 
      'duronto', 'boishakhi', 'saatv', 'saa tv', 'my tv', 'asian tv', 'bangla vision', 
      'banglavision', 'channel 24', 'dbc', 'nexus', 'ananda tv', 'global tv'
    ],
    priorityCategoryKeywords: ['bangladeshi', 'bangla', 'bangladesh', 'news', 'sports']
  };
}

function getIndiaProfile(): GeoRegionProfile {
  return {
    regionCode: 'IN',
    regionName: 'India & South Asia',
    countryName: 'India',
    flagEmoji: '🇮🇳',
    keywords: [
      'star sports', 'sony sports', 'sony ten', 'sony six', 'star plus', 'colors', 
      'zee tv', 'aaj tak', 'india today', 'ndtv', 'dd sports', 'hindi', 'tamil', 
      'telugu', 'bengali', 'malayalam', 'kannada', 'marathi', 'punjabi', 'zee bangla', 
      'star jalsha', 'set india', 'sab tv', 'sun tv'
    ],
    priorityCategoryKeywords: ['indian', 'india', 'hindi', 'sports', 'cricket', 'tamil', 'telugu', 'news']
  };
}

/**
 * Checks if a channel belongs strictly to the user's detected country/region.
 */
export function isUserCountryChannel(channel: Channel, profile: GeoRegionProfile): boolean {
  if (!channel) return false;

  const catLower = (channel.category || '').toLowerCase().trim();
  const nameLower = (channel.name || '').toLowerCase().trim();
  const provLower = (channel.provider || '').toLowerCase().trim();
  const groupTitle = (channel as any).groupTitle ? String((channel as any).groupTitle).toLowerCase().trim() : '';
  const combined = `${nameLower} ${catLower} ${provLower} ${groupTitle}`;

  // 1. Bangladesh Match
  if (profile.regionCode === 'BD') {
    if (catLower === 'bangladeshi' || catLower === 'bangla') return true;
    const bdTerms = [
      'bangla', 'bangladesh', 'dhaka', 'somoy', 'jamuna', 'ntv', 'channel i', 't sports', 
      'gazi', 'gtv', 'nagorik', 'desh tv', 'ekattor', 'deepto', 'atn bangla', 'atn news', 'btv', 
      'independent tv', 'news 24', 'news24', 'rtv', 'maasranga', 'bijoy', 'duronto', 
      'boishakhi', 'saatv', 'saa tv', 'my tv', 'asian tv', 'bangla vision', 'banglavision', 
      'channel 24', 'dbc news', 'nexus tv', 'ananda tv', 'global tv'
    ];
    return bdTerms.some(term => combined.includes(term));
  }

  // 2. India Match
  if (profile.regionCode === 'IN') {
    if (catLower === 'indian' || catLower === 'hindi') return true;
    const inTerms = [
      'star sports', 'sony sports', 'sony ten', 'sony six', 'star plus', 'colors', 
      'zee tv', 'aaj tak', 'india today', 'ndtv', 'dd sports', 'hindi', 'tamil', 
      'telugu', 'zee bangla', 'star jalsha', 'set india', 'sab tv', 'sun tv'
    ];
    return inTerms.some(term => combined.includes(term));
  }

  // 3. Pakistan Match
  if (profile.regionCode === 'PK') {
    if (catLower.includes('pakistan')) return true;
    const pkTerms = ['ptv', 'geo news', 'geo tv', 'ary', 'hum tv', 'express news', 'dunya', 'bol news', 'samaa', 'a sports'];
    return pkTerms.some(term => combined.includes(term));
  }

  // 4. Middle East Match
  if (profile.regionCode === 'ME') {
    if (catLower.includes('arabic') || catLower.includes('middle east')) return true;
    const meTerms = ['bein', 'al jazeera', 'mbc', 'dubai sports', 'abu dhabi', 'alarabiya', 'ssc', 'alkass', 'rotana'];
    return meTerms.some(term => combined.includes(term));
  }

  // 5. United Kingdom Match
  if (profile.regionCode === 'UK') {
    if (catLower === 'uk') return true;
    const ukTerms = ['sky sports', 'bbc', 'itv', 'tnt sports', 'bt sport', 'channel 4', 'channel 5', 'sky news', 'sky cinema'];
    return ukTerms.some(term => combined.includes(term));
  }

  // 6. USA Match
  if (profile.regionCode === 'US') {
    if (catLower === 'usa') return true;
    const usTerms = ['espn', 'fox sports', 'cbs', 'nbc', 'cnn', 'hbo', 'abc', 'usa network', 'tnt', 'nba', 'nfl', 'mlb', 'msnbc'];
    return usTerms.some(term => combined.includes(term));
  }

  // General Regional Match
  return profile.keywords.some(kw => combined.includes(kw));
}

/**
 * Computes an internal prominence score within the user's country tier
 * (e.g. flagship sports and national channels first).
 */
function computeUserCountryRankingScore(channel: Channel, profile: GeoRegionProfile): number {
  let score = 0;
  const nameLower = (channel.name || '').toLowerCase();
  const catLower = (channel.category || '').toLowerCase();

  // Flagship national/top sports channels prioritized
  if (profile.regionCode === 'BD') {
    if (nameLower.includes('t sports')) score += 500;
    if (nameLower.includes('somoy')) score += 450;
    if (nameLower.includes('jamuna')) score += 400;
    if (nameLower.includes('gazi') || nameLower.includes('gtv')) score += 350;
    if (nameLower.includes('channel i')) score += 300;
    if (nameLower.includes('ntv')) score += 280;
    if (nameLower.includes('btv')) score += 250;
    if (nameLower.includes('ekattor')) score += 230;
    if (nameLower.includes('channel 24') || nameLower.includes('news 24')) score += 200;
  } else if (profile.regionCode === 'IN') {
    if (nameLower.includes('star sports') || nameLower.includes('sony sports')) score += 500;
    if (nameLower.includes('aaj tak') || nameLower.includes('ndtv')) score += 400;
    if (nameLower.includes('star plus') || nameLower.includes('colors')) score += 350;
  }

  // Live Status boost
  if (channel.status === 'live') {
    score += 150;
  }

  // Sports & HD boost
  if (catLower.includes('sport') || nameLower.includes('sport') || nameLower.includes('hd')) {
    score += 50;
  }

  // Popularity viewers weight
  if (channel.viewersCount && channel.viewersCount > 0) {
    score += Math.min(Math.floor(channel.viewersCount / 50), 40);
  }

  return score;
}

/**
 * Computes the number of channels belonging to the user's country.
 */
export function getUserCountryChannelCount(allChannels: Channel[], profile?: GeoRegionProfile): number {
  const activeProfile = profile || detectUserGeoRegion();
  if (!allChannels || allChannels.length === 0) return 0;
  return allChannels.filter(c => isUserCountryChannel(c, activeProfile)).length;
}

/**
 * Returns fixed numbered channels with the USER'S COUNTRY CHANNELS STRICTLY FIRST:
 * 
 * - TIER 1 (CH 001 to CH N): 100% of the User's Home Country Channels.
 *   Live national channels, high-demand local sports, and premier regional broadcasts.
 * 
 * - TIER 2 (CH N+1 onwards): High-Priority World Cup / Live International Sports & Events.
 * 
 * - TIER 3: All remaining International Entertainment, Movies, News & Documentaries.
 * 
 * - Permanently fixed and stored in local storage for instant playback & stable channel numbers.
 */
export function getOrInitGeoNumberedChannels(allChannels: Channel[]): {
  orderedChannels: Channel[];
  regionProfile: GeoRegionProfile;
  isFirstInitialization: boolean;
  userCountryCount: number;
} {
  const profile = detectUserGeoRegion();
  if (!allChannels || allChannels.length === 0) {
    return { orderedChannels: [], regionProfile: profile, isFirstInitialization: false, userCountryCount: 0 };
  }

  // Purge obsolete legacy cache keys if present
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('mrs_tv_geo_numbered_channels_v1');
      localStorage.removeItem('mrs_tv_geo_numbered_channels_v2');
      localStorage.removeItem('mrs_tv_geo_numbered_channels_v3');
    } catch (e) {}
  }

  // Check if fixed country-first numbering already exists for this exact detected region
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GEO_NUMBERED_CHANNELS_KEY);
      const storedRegionRaw = localStorage.getItem(GEO_REGION_DETECTED_KEY);
      
      if (stored && storedRegionRaw) {
        const parsedRegion: GeoRegionProfile = JSON.parse(storedRegionRaw);
        
        // If detected region matches cached region, rehydrate exact fixed order
        if (parsedRegion.regionCode === profile.regionCode) {
          const savedChannelIds: string[] = JSON.parse(stored);
          if (Array.isArray(savedChannelIds) && savedChannelIds.length > 0) {
            const channelMap = new Map<string, Channel>();
            allChannels.forEach(c => channelMap.set(c.id, c));

            const fixedOrdered: Channel[] = [];
            const seenIds = new Set<string>();

            // 1. Rehydrate channels in the exact saved order
            savedChannelIds.forEach(id => {
              const ch = channelMap.get(id);
              if (ch && !seenIds.has(ch.id)) {
                fixedOrdered.push(ch);
                seenIds.add(ch.id);
              }
            });

            // 2. Append any newly added channels
            allChannels.forEach(c => {
              if (!seenIds.has(c.id)) {
                fixedOrdered.push(c);
                seenIds.add(c.id);
              }
            });

            const countryCount = fixedOrdered.filter(c => isUserCountryChannel(c, profile)).length;

            return {
              orderedChannels: fixedOrdered,
              regionProfile: profile,
              isFirstInitialization: false,
              userCountryCount: countryCount
            };
          }
        }
      }
    } catch (e) {
      console.warn('[Geo Numbering] Error reading fixed numbering cache:', e);
    }
  }

  // -------------------------------------------------------------
  // BUILD STRICT USER-COUNTRY-FIRST ORDERED LINEUP:
  // -------------------------------------------------------------
  const userCountryChannels: Channel[] = [];
  const highPrioritySports: Channel[] = [];
  const remainingChannels: Channel[] = [];

  for (const ch of allChannels) {
    if (isUserCountryChannel(ch, profile)) {
      userCountryChannels.push(ch);
    } else {
      const catLower = (ch.category || '').toLowerCase();
      const nameLower = (ch.name || '').toLowerCase();
      const isSportsOrWC = 
        catLower.includes('recent wc') || 
        catLower.includes('world cup') || 
        catLower.includes('sport') ||
        nameLower.includes('sport') ||
        nameLower.includes('cricket') ||
        nameLower.includes('football') ||
        nameLower.includes('fifa');

      if (isSportsOrWC) {
        highPrioritySports.push(ch);
      } else {
        remainingChannels.push(ch);
      }
    }
  }

  // Sort Tier 1: User's Country Channels (Best and live channels first)
  userCountryChannels.sort((a, b) => {
    const scoreA = computeUserCountryRankingScore(a, profile);
    const scoreB = computeUserCountryRankingScore(b, profile);
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    return (b.viewersCount || 0) - (a.viewersCount || 0);
  });

  // Sort Tier 2: Priority Sports (Live first)
  highPrioritySports.sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    return (b.viewersCount || 0) - (a.viewersCount || 0);
  });

  // Sort Tier 3: Remaining Channels
  remainingChannels.sort((a, b) => {
    if (a.status === 'live' && b.status !== 'live') return -1;
    if (b.status === 'live' && a.status !== 'live') return 1;
    return (b.viewersCount || 0) - (a.viewersCount || 0);
  });

  // STRICT FINAL MERGE:
  // User Country Channels ALWAYS occupy CH 001, CH 002, CH 003 ... CH N
  const finalOrderedLineup = [
    ...userCountryChannels,
    ...highPrioritySports,
    ...remainingChannels
  ];

  // Persist fixed channel IDs for the user's device
  if (typeof window !== 'undefined') {
    try {
      const fixedIds = finalOrderedLineup.map(c => c.id);
      localStorage.setItem(GEO_NUMBERED_CHANNELS_KEY, JSON.stringify(fixedIds));
      localStorage.setItem(GEO_REGION_DETECTED_KEY, JSON.stringify(profile));
      console.log(
        `[Geo Numbering] 📍 ${profile.flagEmoji} ${profile.countryName} Channels FIRST! ` +
        `Total: ${userCountryChannels.length} local channels at CH 001-CH ${String(userCountryChannels.length).padStart(3, '0')}.`
      );
    } catch (e) {
      console.warn('[Geo Numbering] Failed to persist fixed numbering:', e);
    }
  }

  return {
    orderedChannels: finalOrderedLineup,
    regionProfile: profile,
    isFirstInitialization: true,
    userCountryCount: userCountryChannels.length
  };
}

export interface ClientRegionChoice {
  code: string;
  country: string;
  region: string | null;
  regionLabel: string;
  flagEmoji: string;
}

export const CHANNEL_GUIDE_REGION_OPTIONS: ClientRegionChoice[] = [
  { code: 'AUTO', country: 'AUTO', region: null, regionLabel: 'Auto (Network estimate)', flagEmoji: '⚡' },
  { code: 'BD-DHAKA', country: 'BD', region: 'BD-DHAKA', regionLabel: 'Dhaka, Bangladesh', flagEmoji: '🇧🇩' },
  { code: 'BD', country: 'BD', region: 'BD', regionLabel: 'Bangladesh', flagEmoji: '🇧🇩' },
  { code: 'IN', country: 'IN', region: 'IN', regionLabel: 'India', flagEmoji: '🇮🇳' },
  { code: 'PK', country: 'PK', region: 'PK', regionLabel: 'Pakistan', flagEmoji: '🇵🇰' },
  { code: 'ME', country: 'ME', region: 'ME', regionLabel: 'Middle East', flagEmoji: '🇸🇦' },
  { code: 'GB', country: 'GB', region: 'GB', regionLabel: 'United Kingdom', flagEmoji: '🇬🇧' },
  { code: 'US', country: 'US', region: 'US', regionLabel: 'United States', flagEmoji: '🇺🇸' },
  { code: 'CA', country: 'CA', region: 'CA', regionLabel: 'Canada', flagEmoji: '🇨🇦' },
  { code: 'AU', country: 'AU', region: 'AU', regionLabel: 'Australia', flagEmoji: '🇦🇺' },
  { code: 'EU', country: 'EU', region: 'EU', regionLabel: 'Europe', flagEmoji: '🇪🇺' },
  { code: 'GLOBAL', country: 'GLOBAL', region: 'GLOBAL', regionLabel: 'Global All', flagEmoji: '🌐' },
];

export const CHANNEL_REGION_OVERRIDE_KEY = 'mrs_tv_guide_region_override';

export function getStoredChannelRegionOverride(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(CHANNEL_REGION_OVERRIDE_KEY);
    return val && val !== 'AUTO' ? val.toUpperCase().trim() : null;
  } catch {
    return null;
  }
}

export function setStoredChannelRegionOverride(code: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!code || code === 'AUTO') {
      localStorage.removeItem(CHANNEL_REGION_OVERRIDE_KEY);
    } else {
      localStorage.setItem(CHANNEL_REGION_OVERRIDE_KEY, code.toUpperCase().trim());
    }
    window.dispatchEvent(new CustomEvent('mrs_guide_region_changed', { detail: { regionCode: code || 'AUTO' } }));
  } catch {}
}

export function resolveRegionChoice(code?: string | null): { country: string; region: string | null; regionLabel: string } | null {
  if (!code || code === 'AUTO') return null;
  const upper = code.toUpperCase().trim();
  const match = CHANNEL_GUIDE_REGION_OPTIONS.find((r) => r.code === upper);
  if (match) {
    return { country: match.country, region: match.region, regionLabel: match.regionLabel };
  }
  if (upper.includes('-')) {
    const [country] = upper.split('-');
    return { country, region: upper, regionLabel: upper };
  }
  const normalizedCountry = upper === 'UK' ? 'GB' : upper;
  return { country: normalizedCountry, region: normalizedCountry, regionLabel: normalizedCountry };
}

/**
 * Deterministic client-side regional ordering matching GET /api/channels:
 * 0 = exact region, 1 = country, 2 = global, 3 = rest. Order-only: never alters catalog visibility.
 */
export function prioritizeRegionalChannelsClient(
  channels: Channel[],
  location: { country?: string | null; region?: string | null } | null
): Channel[] {
  if (!Array.isArray(channels) || channels.length === 0) return [];
  const country = location?.country ? location.country.toUpperCase().trim() : null;
  const region = location?.region ? location.region.toUpperCase().trim() : null;
  if ((!country && !region) || country === 'GLOBAL' || region === 'GLOBAL') {
    return channels;
  }

  const profileForFallback = getProfileByRegionCode(country === 'GB' ? 'UK' : (country || 'GLOBAL'));

  const groupFor = (ch: Channel): number => {
    const chRegions = Array.isArray(ch.regions) ? ch.regions.map((r) => r.toUpperCase()) : [];
    const chCountries = Array.isArray(ch.countries) ? ch.countries.map((c) => c.toUpperCase()) : [];

    if (region && chRegions.includes(region)) return 0;
    if (country && chCountries.includes(country)) return 1;
    if (country && isUserCountryChannel(ch, profileForFallback)) return 1;
    if (ch.global === true) return 2;
    return 3;
  };

  return [...channels].sort((a, b) => {
    const ga = groupFor(a);
    const gb = groupFor(b);
    if (ga !== gb) return ga - gb;
    const oa = typeof a.regionalOrder === 'number' ? a.regionalOrder : 9999;
    const ob = typeof b.regionalOrder === 'number' ? b.regionalOrder : 9999;
    if (oa !== ob) return oa - ob;
    return (a.number ?? 999999) - (b.number ?? 999999);
  });
}

