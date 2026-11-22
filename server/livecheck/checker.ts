/**
 * Real stream health check engine. A channel passes ONLY if ALL hold:
 *  1. URL resolves to public IP (SSRF guard) and answers HTTP 2xx within timeout (follows up to 4 redirects, SSRF-checking each hop)
 *  2. Body is NOT an HTML/XML/JSON error or Cloudflare login page returned with status 200
 *  3. HLS: valid playlist (#EXTM3U), master resolves to variant, has segments, NOT VOD (#EXT-X-ENDLIST / PLAYLIST-TYPE:VOD unless acceptVod),
 *     and a real segment downloads with real media bytes (MPEG-TS 0x47 sync, fMP4 boxes, FLV, AAC/MP3/ID3, Ogg, Matroska)
 *  4. HLS freshness: live playlist sequence / segment list advances (rejects frozen/looping streams)
 *  5. Direct streams: first bytes match real media container magic bytes
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../mrs-iptv-backend/src/config.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const PROFILE_USER_AGENTS: Record<string, string> = {
  default: config.checker.userAgent,
  vlc: 'VLC/3.0.18 LibVLC/3.0.18',
  smarters: 'IPTVSmartersPro/3.1.5 (Linux; Android 11; TV)',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  smarttv: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146 TV Safari/537.36',
};

export interface CheckStreamInput {
  url: string;
  userAgent?: string | null;
  referrer?: string | null;
}

export interface CheckStreamOverrides {
  timeoutMs?: number;
  freshnessCheck?: boolean;
  freshnessMaxWaitMs?: number;
  acceptVod?: boolean;
  allowPrivateNetworks?: boolean;
  userAgent?: string;
  disableUaFallback?: boolean;
}

export interface CheckStreamResult {
  live: boolean;
  reason: string;
  latencyMs: number;
  kind?: string;
  bestProfile?: string;
  httpStatus?: number;
  cors?: number | null;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const l = ip.toLowerCase();
  return (
    l === '::1' ||
    l === '::' ||
    l.startsWith('fe80') ||
    l.startsWith('fc') ||
    l.startsWith('fd') ||
    (l.startsWith('::ffff:') && isPrivateIp(l.slice(7)))
  );
}

function isBlockedHostByEnv(hostname: string): boolean {
  const blocked = String(process.env.BLOCKED_SOURCE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (!blocked.length) return false;
  const host = hostname.toLowerCase();
  return blocked.some((b) => host === b || host.endsWith(`.${b}`));
}

export async function assertPublic(urlStr: string, allowPrivate: boolean): Promise<URL> {
  const u = new URL(urlStr);
  if (!/^https?:$/.test(u.protocol)) throw new Error('bad_protocol');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostByEnv(host)) throw new Error('blocked_source_host');
  if (allowPrivate) return u;
  if (host.toLowerCase() === 'localhost') throw new Error('blocked_private_address');
  const ips = net.isIP(host)
    ? [host]
    : await Promise.race([
        dns.lookup(host, { all: true }).then((rows) => rows.map((r) => r.address)),
        sleep(3500).then(() => {
          throw new Error('dns_timeout');
        }),
      ]);
  if (!ips.length || ips.some(isPrivateIp)) throw new Error('blocked_private_address');
  return u;
}

async function fetchLimited(
  urlStr: string,
  {
    headers = {},
    timeoutMs,
    maxBytes = 262144,
    allowPrivate = false,
    maxRedirects = 4,
  }: {
    headers?: Record<string, string>;
    timeoutMs: number;
    maxBytes?: number;
    allowPrivate?: boolean;
    maxRedirects?: number;
  }
): Promise<{ status: number; headers: Headers; body: Buffer; finalUrl: string }> {
  let url = urlStr;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublic(url, allowPrivate);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, redirect: 'manual', signal: ctl.signal });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location')!, url).toString();
        try {
          await res.body?.cancel();
        } catch {
          // ignore stream cancel errors
        }
        continue;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      if (res.body) {
        const reader = res.body.getReader();
        while (size < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const buf = Buffer.from(value);
            chunks.push(buf);
            size += buf.length;
          }
        }
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
      }
      return {
        status: res.status,
        headers: res.headers,
        body: Buffer.concat(chunks),
        finalUrl: url,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('too_many_redirects');
}

export function looksLikeHtml(buf: Buffer): boolean {
  const s = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  return (
    s.startsWith('<!doctype') ||
    s.startsWith('<html') ||
    s.startsWith('<head') ||
    s.startsWith('<?xml') ||
    s.startsWith('{') ||
    s.startsWith('<')
  );
}

export function sniffSmall(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  const h4 = buf.slice(4, 8).toString('latin1');
  if (['ftyp', 'styp', 'moof', 'moov', 'sidx'].includes(h4)) return 'fmp4';
  if (buf.slice(0, 3).toString('latin1') === 'FLV') return 'flv';
  if (buf.slice(0, 3).toString('latin1') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio';
  if (buf.slice(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (buf.slice(0, 4).toString('latin1') === 'ICY ') return 'icecast';
  if (buf[0] === 0x1a && buf[1] === 0x45) return 'matroska';
  return null;
}

export function sniffMedia(buf: Buffer): string | null {
  if (!buf || buf.length < 188) return buf && buf.length >= 12 ? sniffSmall(buf) : null;
  // MPEG-TS: sync byte 0x47 repeating every 188 bytes across 3 packets
  for (let off = 0; off < Math.min(188, buf.length - 376); off++) {
    if (buf[off] === 0x47 && buf[off + 188] === 0x47 && buf[off + 376] === 0x47) return 'mpegts';
  }
  // 192-byte M2TS packets or 2-packet fallback when payload is small (<564B)
  if (buf.length < 564 && buf.length >= 189 && buf[0] === 0x47 && buf[188] === 0x47) {
    return 'mpegts';
  }
  return sniffSmall(buf);
}

export interface ParsedMediaPlaylist {
  segments: string[];
  endList: boolean;
  vodType: boolean;
  seq: number;
  target: number;
  map: string | null;
  encrypted: boolean;
}

export function parseMedia(text: string, baseUrl: string): ParsedMediaPlaylist {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const info: ParsedMediaPlaylist = {
    segments: [],
    endList: /#EXT-X-ENDLIST/.test(text),
    vodType: /#EXT-X-PLAYLIST-TYPE:VOD/.test(text),
    seq: 0,
    target: 6,
    map: null,
    encrypted: /#EXT-X-KEY:METHOD=(?!NONE)/.test(text),
  };

  const seqM = text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
  if (seqM) info.seq = Number(seqM[1]);
  const tdM = text.match(/#EXT-X-TARGETDURATION:(\d+)/);
  if (tdM) info.target = Number(tdM[1]);
  const mapM = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  if (mapM) {
    try {
      info.map = new URL(mapM[1], baseUrl).toString();
    } catch {
      info.map = mapM[1];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXTINF')) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          try {
            info.segments.push(new URL(lines[j], baseUrl).toString());
          } catch {
            // skip invalid segment URL
          }
          i = j;
          break;
        }
      }
    }
  }
  return info;
}

export function pickVariant(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const vars: Array<{ bw: number; url: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
      const bw = bwMatch ? Number(bwMatch[1]) : 0;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] && !lines[j].startsWith('#')) {
          try {
            vars.push({ bw, url: new URL(lines[j], baseUrl).toString() });
          } catch {
            // ignore bad variant URI
          }
          break;
        }
      }
    }
  }
  if (!vars.length) return null;
  vars.sort((a, b) => a.bw - b.bw);
  return vars[0].url; // lowest bandwidth = cheapest probe proving stream plays
}

function unwrapProxyUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (s.startsWith('/api/proxy?url=')) {
    try {
      const parsed = new URL(s, 'http://localhost');
      return parsed.searchParams.get('url') || s;
    } catch {
      return decodeURIComponent(s.replace('/api/proxy?url=', '').split('&')[0]);
    }
  }
  return s;
}

async function probeOnce(
  cleanUrl: string,
  profileName: string,
  userAgent: string,
  referrer: string | null | undefined,
  c: {
    timeoutMs: number;
    freshnessCheck: boolean;
    freshnessMaxWaitMs: number;
    acceptVod: boolean;
    allowPrivateNetworks: boolean;
  }
): Promise<CheckStreamResult> {
  const started = Date.now();
  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: '*/*',
  };
  if (referrer) headers.Referer = referrer;

  const opt = {
    headers,
    timeoutMs: c.timeoutMs,
    allowPrivate: c.allowPrivateNetworks,
  };

  let cors: number | null = null;
  const done = (live: boolean, reason: string, kind?: string, httpStatus?: number): CheckStreamResult => ({
    live,
    reason,
    kind,
    bestProfile: live ? profileName : undefined,
    httpStatus,
    cors,
    latencyMs: Date.now() - started,
  });

  try {
    const first = await fetchLimited(cleanUrl, opt);
    cors = first.headers.get('access-control-allow-origin') ? 1 : 0;
    if (first.status >= 400) return done(false, `http_${first.status}`, undefined, first.status);

    const ct = String(first.headers.get('content-type') || '').toLowerCase();
    const body = first.body;
    if (!body.length) return done(false, 'empty_body', undefined, first.status);

    const bodyStart = body.slice(0, 16).toString('utf8').trimStart();
    const isPlaylist =
      bodyStart.startsWith('#EXTM3U') ||
      /mpegurl/.test(ct) ||
      /\.m3u8?(\?|$)/i.test(first.finalUrl);

    if (!isPlaylist) {
      if (/text\/html|application\/json|text\/plain/.test(ct) && looksLikeHtml(body)) {
        return done(false, 'html_not_stream', undefined, first.status);
      }
      if (looksLikeHtml(body)) return done(false, 'html_not_stream', undefined, first.status);
      const media = sniffMedia(body);
      if (!media && !/^(video|audio)\//.test(ct)) return done(false, 'not_media', undefined, first.status);
      if (!media) return done(false, 'unrecognized_media_bytes', undefined, first.status);
      return done(true, 'ok_direct', media, first.status);
    }

    // ---------- HLS playlist path
    let text = body.toString('utf8').replace(/^\uFEFF/, '');
    if (!text.trimStart().startsWith('#EXTM3U')) {
      return done(false, looksLikeHtml(body) ? 'html_not_stream' : 'invalid_playlist', undefined, first.status);
    }

    let mediaUrl = first.finalUrl;
    if (/#EXT-X-STREAM-INF/.test(text)) {
      const variant = pickVariant(text, first.finalUrl);
      if (!variant) return done(false, 'empty_master', undefined, first.status);
      const sub = await fetchLimited(variant, opt);
      if (sub.status >= 400) return done(false, `variant_http_${sub.status}`, undefined, sub.status);
      text = sub.body.toString('utf8').replace(/^\uFEFF/, '');
      mediaUrl = sub.finalUrl;
      if (!text.trimStart().startsWith('#EXTM3U')) return done(false, 'invalid_variant', undefined, sub.status);
    }

    const info = parseMedia(text, mediaUrl);
    if (!info.segments.length) return done(false, 'no_segments', undefined, 200);
    if (!c.acceptVod && (info.endList || info.vodType)) return done(false, 'vod_not_live', undefined, 200);

    // Download last segment (up to 64 KB) and verify real media bytes
    const seg = info.segments[info.segments.length - 1];
    const sres = await fetchLimited(seg, { ...opt, maxBytes: 65536 });
    if (sres.status >= 400) return done(false, `segment_http_${sres.status}`, undefined, sres.status);
    if (!sres.body.length) return done(false, 'segment_empty', undefined, sres.status);
    if (looksLikeHtml(sres.body)) return done(false, 'segment_is_html', undefined, sres.status);
    if (!info.encrypted && !sniffMedia(sres.body) && !info.map) {
      return done(false, 'segment_not_media', undefined, sres.status);
    }

    // Freshness verification: confirm HLS media sequence or segment URIs advance (rejects frozen/loop streams)
    if (c.freshnessCheck && !info.endList) {
      const wait = Math.min(Math.max(info.target * 1000 + 500, 1500), c.freshnessMaxWaitMs);
      const lastSeg = info.segments[info.segments.length - 1];
      await sleep(wait);
      const again = await fetchLimited(mediaUrl, opt);
      if (again.status >= 400) return done(false, `refresh_http_${again.status}`, undefined, again.status);
      const info2 = parseMedia(again.body.toString('utf8'), mediaUrl);
      const advanced =
        info2.seq > info.seq ||
        info2.segments.some((s) => !info.segments.includes(s)) ||
        info2.segments[info2.segments.length - 1] !== lastSeg;
      if (!advanced) return done(false, 'stale_playlist_not_advancing', undefined, 200);
    }

    return done(true, 'ok_hls', 'hls', 200);
  } catch (e: any) {
    const m =
      e?.name === 'AbortError'
        ? 'timeout'
        : (e?.cause && e.cause.code) || e?.message || 'error';
    return done(false, String(m).slice(0, 60));
  }
}

export async function checkStream(
  ch: CheckStreamInput,
  overrides: CheckStreamOverrides = {}
): Promise<CheckStreamResult> {
  const cleanUrl = unwrapProxyUrl(ch.url);
  const c = {
    timeoutMs: overrides.timeoutMs ?? config.checker.timeoutMs,
    freshnessCheck: overrides.freshnessCheck ?? (process.env.FRESHNESS_CHECK !== undefined ? process.env.FRESHNESS_CHECK === 'true' : config.checker.freshnessCheck),
    freshnessMaxWaitMs:
      overrides.freshnessMaxWaitMs ??
      (process.env.FRESHNESS_MAX_WAIT_MS ? Number(process.env.FRESHNESS_MAX_WAIT_MS) : config.checker.freshnessMaxWaitMs),
    acceptVod: overrides.acceptVod ?? (process.env.ACCEPT_VOD !== undefined ? process.env.ACCEPT_VOD === 'true' : config.checker.acceptVod),
    allowPrivateNetworks:
      overrides.allowPrivateNetworks ??
      (process.env.ALLOW_PRIVATE_NETWORKS !== undefined ? process.env.ALLOW_PRIVATE_NETWORKS === 'true' : config.checker.allowPrivateNetworks),
  };

  const firstUa = ch.userAgent || overrides.userAgent || PROFILE_USER_AGENTS.default;
  const firstProfile = ch.userAgent ? 'custom' : 'default';

  const firstResult = await probeOnce(cleanUrl, firstProfile, firstUa, ch.referrer, c);
  if (firstResult.live) return firstResult;

  // Multi-UA fallback: some IPTV origin servers block Android/Chrome UA with 401/403 but allow VLC/Smarters.
  // Only fall back when explicit UA was not forced and HTTP status was 401/403 (never mask 404/HTML/frozen/VOD).
  if (
    !overrides.disableUaFallback &&
    !ch.userAgent &&
    (firstResult.httpStatus === 401 || firstResult.httpStatus === 403)
  ) {
    const fallbackProfiles: Array<[string, string]> = [
      ['smarters', PROFILE_USER_AGENTS.smarters],
      ['chrome', PROFILE_USER_AGENTS.chrome],
    ];
    for (const [pName, ua] of fallbackProfiles) {
      const retry = await probeOnce(cleanUrl, pName, ua, ch.referrer, c);
      if (retry.live) return retry;
    }
  }

  return firstResult;
}
