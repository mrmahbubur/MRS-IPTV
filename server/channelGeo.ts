import type express from 'express';
import geoip from 'geoip-lite';

export interface CoarseLocation {
  country: string;
  region: string | null;
  regionLabel: string;
}

export interface RegionOption {
  code: string;
  country: string;
  region: string | null;
  regionLabel: string;
  flagEmoji: string;
}

export const REGION_OPTIONS: RegionOption[] = [
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
  { code: 'GLOBAL', country: 'GLOBAL', region: 'GLOBAL', regionLabel: 'Global', flagEmoji: '🌐' },
];

const COUNTRY_NAMES: Record<string, string> = {
  BD: 'Bangladesh',
  IN: 'India',
  PK: 'Pakistan',
  ME: 'Middle East',
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  QA: 'Qatar',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  EU: 'Europe',
  DE: 'Germany',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  GLOBAL: 'Global',
};

export function isPrivateIpAddress(rawIp: string): boolean {
  if (!rawIp) return true;
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

/**
 * Extracts a verified socket/trusted-hop client IP without trusting spoofable arbitrary
 * X-Forwarded-For or query parameters when not running behind a verified proxy.
 */
function extractTrustedIp(req: express.Request): string | null {
  let remote = req.socket?.remoteAddress || '';
  if (remote.startsWith('::ffff:')) remote = remote.slice(7);

  const behindTrustedProxy = Boolean(
    process.env.K_SERVICE ||
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_INSTANCE_ID ||
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_CDN_GEO === '1'
  );

  // Only read forwarded headers when behind a verified proxy AND the socket peer is local/internal (or synthetic)
  if (behindTrustedProxy && (!remote || isPrivateIpAddress(remote))) {
    const xForwarded = req.headers['x-forwarded-for'];
    if (typeof xForwarded === 'string' && xForwarded.trim()) {
      const hops = xForwarded.split(',').map((h) => h.trim()).filter(Boolean);
      for (let i = hops.length - 1; i >= 0; i--) {
        const candidate = hops[i].startsWith('::ffff:') ? hops[i].slice(7) : hops[i];
        if (candidate && !isPrivateIpAddress(candidate)) {
          return candidate;
        }
      }
    }
    const gcpIp = req.headers['x-appengine-user-ip'];
    if (typeof gcpIp === 'string' && gcpIp.trim()) {
      const candidate = gcpIp.trim().startsWith('::ffff:') ? gcpIp.trim().slice(7) : gcpIp.trim();
      if (!isPrivateIpAddress(candidate)) return candidate;
    }
  }

  if (!remote || isPrivateIpAddress(remote)) {
    return null;
  }
  return remote;
}

export function getRegionLabel(countryCode: string, regionCode?: string | null): string {
  const upperReg = (regionCode || '').toUpperCase().trim();
  const matchedOption = REGION_OPTIONS.find((opt) => opt.code === upperReg);
  if (matchedOption) return matchedOption.regionLabel;

  const upperCountry = (countryCode || '').toUpperCase().trim();
  const countryName = COUNTRY_NAMES[upperCountry] || upperCountry || 'Global';
  if (upperReg && upperReg.includes('-') && !upperReg.endsWith('-')) {
    const sub = upperReg.split('-').slice(1).join('-');
    if (sub === 'DHAKA') return `Dhaka, ${countryName}`;
    return `${countryName} (${sub})`;
  }
  return countryName;
}

/**
 * Resolves a request's coarse { country, region, regionLabel } strictly from trusted socket/proxy IP
 * and geoip-lite. Never exposes the client IP, precise coordinates, or raw geoip payload.
 */
export function trustedGeoLookup(req: express.Request): CoarseLocation | null {
  const ip = extractTrustedIp(req);
  if (!ip) return null;

  try {
    const geo = geoip.lookup(ip);
    if (!geo || !geo.country || geo.country.length !== 2) {
      return null;
    }
    const country = geo.country.toUpperCase();
    let region: string | null = country;

    if (country === 'BD') {
      const cityLower = (geo.city || '').toLowerCase();
      const regionStr = (geo.region || '').toUpperCase();
      if (cityLower.includes('dhaka') || regionStr === 'C' || regionStr === '13') {
        region = 'BD-DHAKA';
      } else {
        region = 'BD';
      }
    } else if (geo.region && /^[A-Z0-9]{1,6}$/i.test(geo.region)) {
      region = `${country}-${geo.region.toUpperCase()}`;
    }

    return {
      country,
      region,
      regionLabel: getRegionLabel(country, region),
    };
  } catch {
    return null;
  }
}

export function resolveDisplayRegionOverride(overrideCode?: string | null): CoarseLocation | null {
  const code = (overrideCode || '').toUpperCase().trim();
  if (!code || code === 'AUTO') return null;

  const exact = REGION_OPTIONS.find((opt) => opt.code === code);
  if (exact) {
    return {
      country: exact.country,
      region: exact.region,
      regionLabel: exact.regionLabel,
    };
  }

  if (code.includes('-')) {
    const [country] = code.split('-');
    return {
      country,
      region: code,
      regionLabel: getRegionLabel(country, code),
    };
  }

  return {
    country: code === 'UK' ? 'GB' : code,
    region: code === 'UK' ? 'GB' : code,
    regionLabel: getRegionLabel(code === 'UK' ? 'GB' : code, code),
  };
}

function inferChannelGeoMeta(ch: any): {
  countries: string[];
  regions: string[];
  global: boolean;
  regionalOrder: number;
  audioLanguage: string;
} {
  const id = String(ch.id || '').toLowerCase();
  const name = String(ch.name || '').toLowerCase();
  const cat = String(ch.category || '').toLowerCase();
  // Do NOT include ch.provider (e.g. "M R S IPTV Official HD" contains "ptv"!)
  const combined = `${id} ${name} ${cat}`;

  const countries = new Set<string>(Array.isArray(ch.countries) ? ch.countries.map((c: string) => String(c).toUpperCase()) : []);
  const regions = new Set<string>(Array.isArray(ch.regions) ? ch.regions.map((r: string) => String(r).toUpperCase()) : []);
  let regionalOrder = typeof ch.regionalOrder === 'number' ? ch.regionalOrder : 500;
  let audioLanguage = typeof ch.audioLanguage === 'string' && ch.audioLanguage ? ch.audioLanguage : 'English';

  const isExplicitForeignBrand =
    /\b(bbc|sky\s*sports|sky\s*news|sky\s*cinema|tnt\s*sports|bt\s*sport|espn|cnn|fox\s*sports|cbs|nbc|msnbc|ptv|ary|a\s*sports|star\s*sports|sony\s*sports|bein)\b/i.test(name);

  const isBd =
    !isExplicitForeignBrand &&
    (id.startsWith('bd') ||
      id.startsWith('ben') ||
      cat === 'bangladeshi' ||
      cat === 'bangla' ||
      /\b(t[\s_-]?sports|somoy|jamuna|gazi|gtv|nagorik|desh[\s_-]?tv|ekattor|deepto|btv|rtv|maasranga|dbc[\s_-]?news|boishakhi|banglavision|duronto|bijoy[\s_-]?tv|channel[\s_-]?i(?:\s|$|-|hd)|channel[\s_-]?9|independent[\s_-]?tv|news[\s_-]?24|ananda[\s_-]?tv|atn[\s_-]?bangla|atn[\s_-]?news|ntv|bangla|khushboo[\s_-]?bangla)\b/i.test(
        `${name} ${id}`
      ));

  if (isBd) {
    countries.add('BD');
    regions.add('BD');
    regions.add('BD-DHAKA');
    audioLanguage = 'Bengali';
    if (/\bt[\s_-]?sports\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 1);
    else if (/\bsomoy\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 2);
    else if (/\bjamuna\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 3);
    else if (/\b(gtv|gazi)\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 4);
    else if (/\bchannel[\s_-]?i(?:\b|$)/i.test(name)) regionalOrder = Math.min(regionalOrder, 5);
    else if (/\bntv\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 6);
    else if (/\bbtv\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 7);
    else if (/\bekattor\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 8);
    else regionalOrder = Math.min(regionalOrder, 25);
  }

  const isIn =
    !isBd &&
    (id.startsWith('in-') ||
      id.startsWith('in_') ||
      cat === 'indian' ||
      cat === 'hindi' ||
      cat.includes('india') ||
      /\b(star[\s_-]?sports|sony[\s_-]?sports|sony[\s_-]?ten|sony[\s_-]?six|zee[\s_-]?[a-z0-9]*|aaj[\s_-]?tak|india[\s_-]?today|ndtv|dd[\s_-]?sports|colors|star[\s_-]?plus|sony[\s_-]?sab|sun[\s_-]?tv|asianet)\b/i.test(
        combined
      ));

  if (isIn) {
    countries.add('IN');
    regions.add('IN');
    audioLanguage = cat.includes('tamil') ? 'Tamil' : cat.includes('telugu') ? 'Telugu' : 'Hindi';
    if (/\b(star[\s_-]?sports|sony[\s_-]?sports)\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 5);
    else regionalOrder = Math.min(regionalOrder, 40);
  }

  const isPk =
    id.startsWith('pk-') ||
    id.startsWith('pk_') ||
    cat.includes('pakistan') ||
    /\b(ptv|geo[\s_-]?news|geo[\s_-]?tv|ary|hum[\s_-]?tv|samaa|a[\s_-]?sports|express[\s_-]?news|bol[\s_-]?news|dunya[\s_-]?news|ten[\s_-]?sports[\s_-]?pakistan)\b/i.test(
      `${id} ${name}`
    );

  if (isPk) {
    countries.add('PK');
    regions.add('PK');
    audioLanguage = 'Urdu';
    if (/\b(ptv|a[\s_-]?sports)\b/i.test(name)) regionalOrder = Math.min(regionalOrder, 5);
    else regionalOrder = Math.min(regionalOrder, 45);
  }

  const isMe =
    cat.includes('arabic') ||
    cat.includes('middle east') ||
    /\b(bein|al[\s_-]?jazeera|mbc|dubai[\s_-]?sports|abu[\s_-]?dhabi|ssc|alkass|rotana|al[\s_-]?arabiya)\b/i.test(
      combined
    );

  if (isMe) {
    countries.add('ME');
    countries.add('SA');
    countries.add('AE');
    countries.add('QA');
    regions.add('ME');
    audioLanguage = 'Arabic';
    regionalOrder = Math.min(regionalOrder, 55);
  }

  const isGb =
    id.startsWith('uk-') ||
    id.startsWith('uk_') ||
    id.startsWith('gb-') ||
    id.startsWith('gb_') ||
    cat === 'uk' ||
    cat.includes('united kingdom') ||
    /\b(sky[\s_-]?sports|bbc|itv|tnt[\s_-]?sports|bt[\s_-]?sport|channel[\s_-]?4|channel[\s_-]?5|sky[\s_-]?news|sky[\s_-]?cinema)\b/i.test(
      `${id} ${name} ${cat}`
    );

  if (isGb) {
    countries.add('GB');
    countries.add('UK');
    regions.add('GB');
    regions.add('EU');
    audioLanguage = 'English';
    if (/\b(sky[\s_-]?sports|tnt[\s_-]?sports|bbc[\s_-]?one|bbc[\s_-]?news)\b/i.test(name)) {
      regionalOrder = Math.min(regionalOrder, 10);
    } else {
      regionalOrder = Math.min(regionalOrder, 55);
    }
  }

  const isUs =
    id.startsWith('us-') ||
    id.startsWith('us_') ||
    cat === 'usa' ||
    cat.includes('united states') ||
    /\b(espn|fox[\s_-]?sports|cbs|nbc|cnn|hbo|abc[\s_-]?news|usa[\s_-]?network|msnbc|nfl[\s_-]?network|mlb[\s_-]?network|cnbc)\b/i.test(
      `${id} ${name}`
    );

  if (isUs) {
    countries.add('US');
    regions.add('US');
    audioLanguage = 'English';
    if (/\b(espn|cnn|fox[\s_-]?sports|cbs[\s_-]?news|nbc)\b/i.test(name)) {
      regionalOrder = Math.min(regionalOrder, 10);
    } else {
      regionalOrder = Math.min(regionalOrder, 55);
    }
  }

  if (
    id.startsWith('ca-') ||
    id.startsWith('ca_') ||
    cat === 'canada' ||
    /\b(tsn|sportsnet|cbc|ctv|global[\s_-]?news)\b/i.test(`${id} ${name}`)
  ) {
    countries.add('CA');
    regions.add('CA');
    audioLanguage = 'English';
    regionalOrder = Math.min(regionalOrder, 65);
  }

  if (
    id.startsWith('au-') ||
    id.startsWith('au_') ||
    cat === 'australia' ||
    /\b(optus|fox[\s_-]?sports[\s_-]?australia|stan|abc[\s_-]?australia|channel[\s_-]?7|channel[\s_-]?9|channel[\s_-]?10|sbs)\b/i.test(
      `${id} ${name}`
    )
  ) {
    countries.add('AU');
    regions.add('AU');
    audioLanguage = 'English';
    regionalOrder = Math.min(regionalOrder, 65);
  }

  const isGlobal =
    typeof ch.global === 'boolean'
      ? ch.global
      : countries.size === 0 ||
        cat.includes('sport') ||
        cat.includes('world cup') ||
        cat.includes('news') ||
        /\b(espn|bein|bbc|cnn|al[\s_-]?jazeera)\b/i.test(name);

  return {
    countries: Array.from(countries),
    regions: Array.from(regions),
    global: isGlobal,
    regionalOrder,
    audioLanguage,
  };
}

export function enrichChannelWithRegionMeta<T extends Record<string, any>>(ch: T, index: number): T {
  const meta = inferChannelGeoMeta(ch);
  const number = typeof ch.number === 'number' ? ch.number : index + 1;
  const logo = ch.logo || ch.iconUrl || ch.icon || '';
  const streamUrl = ch.streamUrl || ch.m3u8Url || '';
  const streamType = ch.streamType || 'hls';
  const isLive = typeof ch.isLive === 'boolean' ? ch.isLive : ch.status !== 'offline';

  return {
    ...ch,
    number,
    logo,
    streamUrl,
    streamType,
    isLive,
    audioLanguage: meta.audioLanguage,
    countries: meta.countries,
    regions: meta.regions,
    regionalOrder: meta.regionalOrder,
    global: meta.global,
  };
}

/**
 * Deterministic 4-tier regional prioritization:
 * 0 = exact region match -> 1 = country match -> 2 = global -> 3 = rest.
 * Never excludes any channel from the full catalog.
 */
export function prioritizeRegionalChannels<T extends Record<string, any>>(
  channels: T[],
  location: { country?: string | null; region?: string | null } | null
): T[] {
  if (!Array.isArray(channels) || channels.length === 0) return [];
  const country = location?.country ? location.country.toUpperCase().trim() : null;
  const region = location?.region ? location.region.toUpperCase().trim() : null;

  const groupFor = (ch: T): number => {
    const chRegions = Array.isArray(ch.regions) ? ch.regions.map((r: string) => String(r).toUpperCase()) : [];
    const chCountries = Array.isArray(ch.countries) ? ch.countries.map((c: string) => String(c).toUpperCase()) : [];

    if (region && region !== 'GLOBAL' && chRegions.includes(region)) return 0;
    if (country && country !== 'GLOBAL' && chCountries.includes(country)) return 1;
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

    const na = typeof a.number === 'number' ? a.number : 999999;
    const nb = typeof b.number === 'number' ? b.number : 999999;
    return na - nb;
  });
}

/**
 * Strips query parameters & signed URLs/tokens before logging or surfacing errors.
 */
export function sanitizePlaybackError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Playback unavailable');
  return raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[stream-redacted]')
    .replace(/([?&])(token|sig|signature|key|expires|auth|url)=[^&\s]+/gi, '$1$2=[redacted]')
    .slice(0, 240);
}
