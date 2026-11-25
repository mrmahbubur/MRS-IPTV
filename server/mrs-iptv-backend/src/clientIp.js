import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const SINGLE_IP_CDN_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-appengine-user-ip',
  'fastly-client-ip',
  'x-client-ip',
];

const CLOUDFLARE_IPV4_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

const CLOUDFLARE_IPV6_CIDRS = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

function ipv4ToUint32(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function expandIpv6Hextets(ip) {
  const clean = String(ip || '').split('%')[0].toLowerCase();
  if (!net.isIPv6(clean)) return null;
  const halves = clean.split('::');
  if (halves.length > 2) return null;
  const parsePart = (part) => {
    if (!part) return [];
    const tokens = part.split(':');
    const out = [];
    for (const tok of tokens) {
      if (tok.includes('.')) {
        const v4 = ipv4ToUint32(tok);
        if (v4 === null) return null;
        out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
      } else {
        const val = Number.parseInt(tok, 16);
        if (!Number.isFinite(val) || val < 0 || val > 0xffff) return null;
        out.push(val);
      }
    }
    return out;
  };
  const left = parsePart(halves[0]);
  if (left === null) return null;
  if (halves.length === 1) {
    return left.length === 8 ? left : null;
  }
  const right = parsePart(halves[1]);
  if (right === null) return null;
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function isIpv4InCidr(ip, cidr) {
  const [netIp, prefixStr] = cidr.split('/');
  const prefix = Number.parseInt(prefixStr, 10);
  const ipNum = ipv4ToUint32(ip);
  const netNum = ipv4ToUint32(netIp);
  if (ipNum === null || netNum === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
  return (ipNum & mask) === (netNum & mask);
}

function isIpv6InCidr(ip, cidr) {
  const [netIp, prefixStr] = cidr.split('/');
  const prefix = Number.parseInt(prefixStr, 10);
  const ipHextets = expandIpv6Hextets(ip);
  const netHextets = expandIpv6Hextets(netIp);
  if (!ipHextets || !netHextets || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) return false;
  let remaining = prefix;
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const bits = Math.min(16, remaining);
    const mask = (0xffff << (16 - bits)) & 0xffff;
    if ((ipHextets[i] & mask) !== (netHextets[i] & mask)) return false;
    remaining -= bits;
  }
  return true;
}

/**
 * Checks if an IP belongs to Cloudflare's published edge proxy CIDR ranges.
 */
export function isCloudflareProxyIp(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return false;
  if (net.isIPv4(ip)) {
    return CLOUDFLARE_IPV4_CIDRS.some((cidr) => isIpv4InCidr(ip, cidr));
  }
  if (net.isIPv6(ip)) {
    return CLOUDFLARE_IPV6_CIDRS.some((cidr) => isIpv6InCidr(ip, cidr));
  }
  return false;
}

/**
 * Normalizes a raw IP address or header value:
 * - Handles array header values
 * - Strips quotes, bracketed IPv6 ports ([::1]:443), IPv6 zone IDs, IPv4:port
 * - Converts both ::ffff:a.b.c.d and hex ::ffff:xxxx:yyyy IPv4-mapped IPv6 forms to dotted IPv4
 * - Validates via node:net so malformed / non-IP header values are safely discarded
 */
export function normalizeIp(raw) {
  if (Array.isArray(raw)) {
    raw = raw[raw.length - 1];
  }
  let s = String(raw ?? '').trim();
  if (!s) return '';

  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // Bracketed IPv6 (with optional :port), e.g. "[2001:db8::1]:4711"
  if (s.startsWith('[')) {
    const endBracket = s.indexOf(']');
    if (endBracket > 1) {
      s = s.slice(1, endBracket);
    }
  }

  // Strip IPv6 zone identifier if present (e.g. fe80::1%eth0)
  const zoneIdx = s.indexOf('%');
  if (zoneIdx > 0) {
    s = s.slice(0, zoneIdx);
  }

  // IPv4 with port, e.g. "203.0.113.10:54321"
  const firstColon = s.indexOf(':');
  if (firstColon > 0 && firstColon === s.lastIndexOf(':')) {
    const hostPart = s.slice(0, firstColon);
    const portPart = s.slice(firstColon + 1);
    if (net.isIPv4(hostPart) && /^\d{1,5}$/.test(portPart)) {
      s = hostPart;
    }
  }

  // IPv4-mapped IPv6, e.g. "::ffff:203.0.113.10" or "::ffff:7f00:1"
  if (s.toLowerCase().startsWith('::ffff:')) {
    const mapped = s.slice(7);
    if (net.isIPv4(mapped)) {
      s = mapped;
    } else if (net.isIPv6(s)) {
      const hextets = expandIpv6Hextets(s);
      if (hextets && hextets[5] === 0xffff) {
        const hi = hextets[6];
        const lo = hextets[7];
        s = `${(hi >>> 8) & 0xff}.${hi & 0xff}.${(lo >>> 8) & 0xff}.${lo & 0xff}`;
      }
    }
  }

  if (s === 'localhost') return 'localhost';
  return net.isIP(s) ? s : '';
}

/**
 * Returns true for loopback, link-local, RFC-1918 private, CGNAT, multicast, or unspecified addresses.
 */
export function isPrivateIpAddress(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip || ip === 'localhost') return true;
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||                                // 0.0.0.0/8 ("this host")
      a === 10 ||                               // 10.0.0.0/8 (RFC-1918)
      (a === 100 && b >= 64 && b <= 127) ||     // 100.64.0.0/10 (CGNAT / Cloud LB)
      a === 127 ||                              // 127.0.0.0/8 (Loopback)
      (a === 169 && b === 254) ||               // 169.254.0.0/16 (Link-local / Cloud IMDS)
      (a === 172 && b >= 16 && b <= 31) ||      // 172.16.0.0/12 (RFC-1918)
      (a === 192 && b === 168) ||               // 192.168.0.0/16 (RFC-1918)
      a >= 224                                  // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved
    );
  }
  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return true;
  const isAllZeroExceptLast = hextets.slice(0, 7).every((h) => h === 0);
  if (isAllZeroExceptLast && (hextets[7] === 0 || hextets[7] === 1)) return true; // :: or ::1
  const h0 = hextets[0];
  if ((h0 & 0xfe00) === 0xfc00) return true; // fc00::/7 Unique Local
  if ((h0 & 0xffc0) === 0xfe80) return true; // fe80::/10 Link-Local
  if ((h0 & 0xff00) === 0xff00) return true; // ff00::/8 Multicast
  return false;
}

/**
 * Anonymizes an IP address to its /24 IPv4 or /48 IPv6 subnet prefix for privacy-safe security telemetry.
 */
export function maskClientIp(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return 'unknown';
  if (ip === 'localhost') return '127.0.0.0/24';
  if (net.isIPv4(ip)) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return 'unknown';
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) {
    return '::1/128';
  }
  return `${hextets[0].toString(16)}:${hextets[1].toString(16)}:${hextets[2].toString(16)}::/48`;
}

export function resolveTrustProxyConfig(req) {
  const setting = typeof req?.app?.get === 'function' ? req.app.get('trust proxy') : undefined;
  if (setting !== undefined && setting !== null) {
    if (typeof setting === 'boolean') return { enabled: setting, source: 'express', setting };
    if (typeof setting === 'number') return { enabled: Number.isFinite(setting) && setting > 0, source: 'express', setting };
    if (typeof setting === 'string') {
      const trimmed = setting.trim().toLowerCase();
      const enabled = Boolean(trimmed && trimmed !== '0' && trimmed !== 'false' && trimmed !== 'off' && trimmed !== 'no');
      return { enabled, source: 'express', setting };
    }
    if (Array.isArray(setting)) return { enabled: setting.length > 0, source: 'express', setting };
    if (typeof setting === 'function') return { enabled: true, source: 'express', setting: 'function' };
  }

  const envEnabled = Boolean(
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_INSTANCE_ID ||
    process.env.K_SERVICE ||
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_CDN_GEO === '1'
  );
  return { enabled: envEnabled, source: envEnabled ? 'env' : 'none', setting: envEnabled ? 1 : 0 };
}

function getHeaderRaw(headers, name) {
  if (!headers) return '';
  if (typeof headers[name] === 'string' || Array.isArray(headers[name])) {
    return headers[name];
  }
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return '';
}

function safeSecretEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

function canTrustCloudflareHeaders(req, remoteIp, expressIp) {
  const headers = req?.headers;
  const cfOriginSecret = String(process.env.CF_ORIGIN_SECRET || '').trim();
  if (cfOriginSecret) {
    const provided = getHeaderRaw(headers, 'x-cf-origin-secret');
    return safeSecretEqual(Array.isArray(provided) ? provided[0] : provided, cfOriginSecret);
  }

  const strictMode = /^(1|true|yes)$/i.test(String(process.env.CLOUDFLARE_STRICT_ORIGIN || ''));
  const trustCdnGeo = /^(1|true|yes)$/i.test(String(process.env.TRUST_CDN_GEO || ''));
  const hasCfRay = Boolean(String(getHeaderRaw(headers, 'cf-ray') || '').trim());
  const edgeIsCloudflare = isCloudflareProxyIp(expressIp) || isCloudflareProxyIp(remoteIp);

  if (strictMode) {
    return trustCdnGeo || (edgeIsCloudflare && hasCfRay);
  }

  // If Express already resolved a public non-Cloudflare edge IP, reject unverified CF headers
  // unless TRUST_CDN_GEO=1 is set so direct Render visitors cannot spoof CF-Connecting-IP.
  if (expressIp && !isPrivateIpAddress(expressIp) && !isCloudflareProxyIp(expressIp) && !trustCdnGeo) {
    return false;
  }

  return true;
}

function extractRightmostFromList(rawList) {
  const text = Array.isArray(rawList) ? rawList.join(',') : String(rawList || '');
  if (!text.trim()) return { publicIp: '', anyIp: '' };
  const hops = text
    .split(',')
    .map((part) => normalizeIp(part))
    .filter(Boolean);

  for (let i = hops.length - 1; i >= 0; i--) {
    if (!isPrivateIpAddress(hops[i])) {
      return { publicIp: hops[i], anyIp: hops[hops.length - 1] || '' };
    }
  }
  return { publicIp: '', anyIp: hops[hops.length - 1] || '' };
}

function extractRightmostFromForwardedHeader(rawForwarded) {
  const text = Array.isArray(rawForwarded) ? rawForwarded.join(',') : String(rawForwarded || '');
  if (!text.trim()) return { publicIp: '', anyIp: '' };
  const entries = text.split(',');
  const ips = [];
  for (const entry of entries) {
    const directives = entry.split(';');
    for (const dir of directives) {
      const match = dir.trim().match(/^for\s*=\s*(.+)$/i);
      if (match && match[1]) {
        const ip = normalizeIp(match[1]);
        if (ip) ips.push(ip);
      }
    }
  }
  for (let i = ips.length - 1; i >= 0; i--) {
    if (!isPrivateIpAddress(ips[i])) {
      return { publicIp: ips[i], anyIp: ips[ips.length - 1] || '' };
    }
  }
  return { publicIp: '', anyIp: ips[ips.length - 1] || '' };
}

/**
 * Resolves the trusted client IP along with diagnostic source metadata (used for security telemetry).
 */
export function resolveTrustedClientIpDetails(req) {
  const expressIp = normalizeIp(req?.ip);
  const remoteIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
  const trustConfig = resolveTrustProxyConfig(req);

  const peerTrusted =
    !remoteIp ||
    isPrivateIpAddress(remoteIp) ||
    Boolean(expressIp && remoteIp && expressIp !== remoteIp);

  if (trustConfig.enabled && peerTrusted) {
    const headers = req?.headers;
    const cfAllowed = canTrustCloudflareHeaders(req, remoteIp, expressIp);
    let fallbackPrivateHeaderIp = '';

    // 1. Authoritative single-IP CDN / edge headers
    for (const headerName of SINGLE_IP_CDN_HEADERS) {
      if ((headerName === 'cf-connecting-ip' || headerName === 'true-client-ip') && !cfAllowed) {
        continue;
      }
      const candidate = normalizeIp(getHeaderRaw(headers, headerName));
      if (!candidate) continue;
      if (!isPrivateIpAddress(candidate)) {
        return {
          ip: candidate,
          source: headerName,
          trustProxyEnabled: true,
          cloudflareVerified: (headerName === 'cf-connecting-ip' || headerName === 'true-client-ip') && (isCloudflareProxyIp(expressIp) || Boolean(process.env.CF_ORIGIN_SECRET)),
        };
      }
      if (!fallbackPrivateHeaderIp) fallbackPrivateHeaderIp = candidate;
    }

    // 2. Express-resolved req.ip (respects configured hop count, subnets, and custom trust functions)
    if (expressIp && !isPrivateIpAddress(expressIp)) {
      return {
        ip: expressIp,
        source: 'express-req-ip',
        trustProxyEnabled: true,
        cloudflareVerified: isCloudflareProxyIp(expressIp),
      };
    }

    // 3. X-Forwarded-For walked right-to-left (ignores spoofed client-supplied prefix entries)
    const xff = extractRightmostFromList(getHeaderRaw(headers, 'x-forwarded-for'));
    if (xff.publicIp) {
      return { ip: xff.publicIp, source: 'x-forwarded-for', trustProxyEnabled: true, cloudflareVerified: false };
    }
    if (!fallbackPrivateHeaderIp && xff.anyIp) fallbackPrivateHeaderIp = xff.anyIp;

    // 4. RFC 7239 Forwarded header walked right-to-left
    const fwd = extractRightmostFromForwardedHeader(getHeaderRaw(headers, 'forwarded'));
    if (fwd.publicIp) {
      return { ip: fwd.publicIp, source: 'forwarded', trustProxyEnabled: true, cloudflareVerified: false };
    }
    if (!fallbackPrivateHeaderIp && fwd.anyIp) fallbackPrivateHeaderIp = fwd.anyIp;

    // 5. X-Real-IP (Nginx / Ingress)
    const realIp = normalizeIp(getHeaderRaw(headers, 'x-real-ip'));
    if (realIp && !isPrivateIpAddress(realIp)) {
      return { ip: realIp, source: 'x-real-ip', trustProxyEnabled: true, cloudflareVerified: false };
    }
    if (!fallbackPrivateHeaderIp && realIp) fallbackPrivateHeaderIp = realIp;

    if (expressIp) {
      return { ip: expressIp, source: 'express-private', trustProxyEnabled: true, cloudflareVerified: false };
    }
    if (fallbackPrivateHeaderIp) {
      return { ip: fallbackPrivateHeaderIp, source: 'header-private', trustProxyEnabled: true, cloudflareVerified: false };
    }
  }

  return {
    ip: remoteIp || expressIp || '127.0.0.1',
    source: remoteIp ? 'socket' : (expressIp ? 'express-direct' : 'fallback'),
    trustProxyEnabled: trustConfig.enabled,
    cloudflareVerified: false,
  };
}

/**
 * Centralized trusted client IP resolver.
 */
export function getTrustedClientIp(req) {
  return resolveTrustedClientIpDetails(req).ip;
}
