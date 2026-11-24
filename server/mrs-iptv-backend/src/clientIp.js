import net from 'node:net';

const SINGLE_IP_CDN_HEADERS = [
  'cf-connecting-ip',
  'true-client-ip',
  'x-appengine-user-ip',
  'fastly-client-ip',
  'x-client-ip',
];

/**
 * Normalizes a raw IP address or header value:
 * - Handles array header values
 * - Strips quotes, bracketed IPv6 ports ([::1]:443), IPv4:port, and ::ffff: IPv4-mapped IPv6 prefixes
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

  // IPv4-mapped IPv6, e.g. "::ffff:203.0.113.10"
  if (s.toLowerCase().startsWith('::ffff:')) {
    const mapped = s.slice(7);
    if (net.isIPv4(mapped)) {
      s = mapped;
    }
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

  if (s === 'localhost') return 'localhost';
  return net.isIP(s) ? s : '';
}

/**
 * Returns true for loopback, link-local, RFC-1918 private, CGNAT, or unspecified addresses.
 */
export function isPrivateIpAddress(rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip || ip === 'localhost' || ip === '0.0.0.0' || ip === '::') return true;
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  // CGNAT 100.64.0.0/10 (used by cloud reverse proxies & internal tunnels)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  return false;
}

function isTrustProxyEnabled(req) {
  const setting = typeof req?.app?.get === 'function' ? req.app.get('trust proxy') : undefined;
  if (setting !== undefined && setting !== null) {
    if (typeof setting === 'boolean') return setting;
    if (typeof setting === 'number') return Number.isFinite(setting) && setting > 0;
    if (typeof setting === 'string') {
      const trimmed = setting.trim().toLowerCase();
      if (!trimmed || trimmed === '0' || trimmed === 'false' || trimmed === 'off' || trimmed === 'no') {
        return false;
      }
      return true;
    }
    if (Array.isArray(setting)) return setting.length > 0;
    if (typeof setting === 'function') return true;
  }

  return Boolean(
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID ||
    process.env.RENDER_INSTANCE_ID ||
    process.env.K_SERVICE ||
    process.env.TRUST_PROXY === '1' ||
    process.env.TRUST_CDN_GEO === '1'
  );
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
 * Centralized trusted client IP resolver.
 * Honors Express `app.get('trust proxy')` configuration (boolean, hop count, subnet/string, array, function),
 * verified proxy environment flags, and CDN/reverse-proxy headers without trusting spoofable headers from
 * direct public peers or when trust proxy is disabled.
 */
export function getTrustedClientIp(req) {
  const expressIp = normalizeIp(req?.ip);
  const remoteIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress);
  const trustEnabled = isTrustProxyEnabled(req);

  // Only inspect forwarding headers if proxy trust is enabled AND either the direct socket
  // peer is a local/internal proxy OR Express's own proxy-addr already validated the peer.
  const peerTrusted =
    !remoteIp ||
    isPrivateIpAddress(remoteIp) ||
    Boolean(expressIp && remoteIp && expressIp !== remoteIp);

  if (trustEnabled && peerTrusted) {
    const headers = req?.headers;
    let fallbackPrivateHeaderIp = '';

    // 1. Authoritative single-IP CDN / edge headers
    for (const headerName of SINGLE_IP_CDN_HEADERS) {
      const candidate = normalizeIp(getHeaderRaw(headers, headerName));
      if (!candidate) continue;
      if (!isPrivateIpAddress(candidate)) return candidate;
      if (!fallbackPrivateHeaderIp) fallbackPrivateHeaderIp = candidate;
    }

    // 2. Express-resolved req.ip (respects configured hop count, subnets, and custom trust functions)
    if (expressIp && !isPrivateIpAddress(expressIp)) {
      return expressIp;
    }

    // 3. X-Forwarded-For walked right-to-left (ignores spoofed client-supplied prefix entries)
    const xff = extractRightmostFromList(getHeaderRaw(headers, 'x-forwarded-for'));
    if (xff.publicIp) return xff.publicIp;
    if (!fallbackPrivateHeaderIp && xff.anyIp) fallbackPrivateHeaderIp = xff.anyIp;

    // 4. RFC 7239 Forwarded header walked right-to-left
    const fwd = extractRightmostFromForwardedHeader(getHeaderRaw(headers, 'forwarded'));
    if (fwd.publicIp) return fwd.publicIp;
    if (!fallbackPrivateHeaderIp && fwd.anyIp) fallbackPrivateHeaderIp = fwd.anyIp;

    // 5. X-Real-IP (Nginx / Ingress)
    const realIp = normalizeIp(getHeaderRaw(headers, 'x-real-ip'));
    if (realIp && !isPrivateIpAddress(realIp)) return realIp;
    if (!fallbackPrivateHeaderIp && realIp) fallbackPrivateHeaderIp = realIp;

    if (expressIp) return expressIp;
    if (fallbackPrivateHeaderIp) return fallbackPrivateHeaderIp;
  }

  return remoteIp || expressIp || '127.0.0.1';
}
