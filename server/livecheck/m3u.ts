export interface ParsedM3uEntry {
  name: string;
  url: string;
  logo: string;
  group: string;
  tvgId: string;
  userAgent: string;
  referrer: string;
}

const attr = (line: string, k: string): string => {
  const m = line.match(new RegExp(`${k}="([^"]*)"`, 'i'));
  return m ? m[1].trim() : '';
};

export const normName = (s: string): string =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(hd|fhd|uhd|4k|sd|hevc|tv|live|ch)\b/g, '')
    .replace(/[^a-z0-9\u0980-\u09ff]+/g, ' ')
    .trim();

/**
 * Parses an M3U / M3U8 playlist into structured channel entries.
 * Supports quoted attributes, #EXTVLCOPT User-Agent/Referrer, and filters out non-HTTP(S) schemes.
 */
export function parseM3u(text: string): ParsedM3uEntry[] {
  const out: ParsedM3uEntry[] = [];
  let cur: Omit<ParsedM3uEntry, 'url'> | null = null;

  for (const raw of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF')) {
      const lastQuote = line.lastIndexOf('"');
      const comma = line.indexOf(',', lastQuote > 0 ? lastQuote : 0);
      const rawTitle = comma >= 0 ? line.slice(comma + 1).trim() : '';
      cur = {
        name: rawTitle || attr(line, 'tvg-name') || 'Unnamed',
        logo: attr(line, 'tvg-logo'),
        group: attr(line, 'group-title'),
        tvgId: attr(line, 'tvg-id'),
        userAgent: attr(line, 'http-user-agent'),
        referrer: attr(line, 'http-referrer'),
      };
    } else if (/^#EXTVLCOPT:/i.test(line) && cur) {
      const ua = line.match(/http-user-agent=(.+)$/i);
      if (ua) cur.userAgent = ua[1].trim();
      const rf = line.match(/http-referrer=(.+)$/i);
      if (rf) cur.referrer = rf[1].trim();
    } else if (line.startsWith('#')) {
      continue;
    } else if (/^https?:\/\//i.test(line)) {
      const base = cur || {
        name: 'Unnamed',
        logo: '',
        group: '',
        tvgId: '',
        userAgent: '',
        referrer: '',
      };
      out.push({ ...base, url: line });
      cur = null;
    }
  }

  return out;
}
