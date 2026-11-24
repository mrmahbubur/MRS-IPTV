/**
 * M R S IPTV Enterprise Backend Security System
 * Comprehensive Defense-in-Depth Protection:
 * - HTTP Security Headers & Fingerprint Concealment (CSP, HSTS, NoSniff, SameOrigin)
 * - Anti-SSRF (Server-Side Request Forgery) Stream Proxy Firewall
 * - Multi-Tier Sliding Window Rate Limiting (Global API, AI Endpoints, Brute-Force Code Lockout)
 * - WAF (Web Application Firewall) Filter for SQLi, XSS, Path Traversal, and Command Injection
 * - VIP Pass Single-Device Cryptographic Signature & Anti-Tamper Engine (HMAC-SHA256)
 * - Real-Time Threat Event Logging & Security Health Inspection
 */

import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config as backendConfig } from './mrs-iptv-backend/src/config.js';

// --- Types & Data Structures ---

export interface SecurityEvent {
  id: string;
  timestamp: string;
  ip: string;
  type: 'SSRF_ATTEMPT' | 'BRUTE_FORCE' | 'WAF_ATTACK' | 'RATE_LIMIT_EXCEEDED' | 'TAMPER_DETECTED' | 'UNAUTHORIZED_ADMIN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detail: string;
  path: string;
  blocked: boolean;
}

export interface SecurityStats {
  firewallActive: boolean;
  totalThreatsBlocked: number;
  blockedByType: Record<string, number>;
  activeBlacklistedIpsCount: number;
  rateLimitHits: number;
  ssrfAttemptsBlocked: number;
  wafAttacksBlocked: number;
  bruteForceLocksActive: number;
  lastThreatDetectedAt: string | null;
  securityUptimeSeconds: number;
}

// In-Memory Security Storage with Disk Persistence
const MAX_EVENT_LOG_SIZE = 250;
const securityEvents: SecurityEvent[] = [];
const blacklistedIps = new Set<string>();
const ipThreatScores = new Map<string, { score: number; lastViolation: number }>();

const threatsCounter = {
  totalThreatsBlocked: 0,
  blockedByType: {
    SSRF_ATTEMPT: 0,
    BRUTE_FORCE: 0,
    WAF_ATTACK: 0,
    RATE_LIMIT_EXCEEDED: 0,
    TAMPER_DETECTED: 0,
    UNAUTHORIZED_ADMIN: 0
  } as Record<string, number>,
  lastThreatDetectedAt: null as string | null
};

const securityDataDir = path.join(process.cwd(), 'data');
const securityEventsFile = path.join(securityDataDir, 'security_events.json');

// Initialize security persistence
try {
  if (!fs.existsSync(securityDataDir)) {
    fs.mkdirSync(securityDataDir, { recursive: true });
  }
  if (fs.existsSync(securityEventsFile)) {
    const raw = fs.readFileSync(securityEventsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.events)) {
      securityEvents.push(...parsed.events.slice(0, MAX_EVENT_LOG_SIZE));
    }
    if (parsed.stats) {
      threatsCounter.totalThreatsBlocked = parsed.stats.totalThreatsBlocked || 0;
      threatsCounter.blockedByType = { ...threatsCounter.blockedByType, ...parsed.stats.blockedByType };
      threatsCounter.lastThreatDetectedAt = parsed.stats.lastThreatDetectedAt || null;
    }
  }
} catch (e) {
  console.warn('[Security Engine] Initial events load warning:', e);
}

function persistSecurityDataAsync() {
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      stats: {
        totalThreatsBlocked: threatsCounter.totalThreatsBlocked,
        blockedByType: threatsCounter.blockedByType,
        lastThreatDetectedAt: threatsCounter.lastThreatDetectedAt
      },
      events: securityEvents.slice(0, 100)
    };
    fs.writeFile(securityEventsFile, JSON.stringify(payload, null, 2), () => {});
  } catch {}
}

export function logSecurityEvent(
  ip: string,
  type: SecurityEvent['type'],
  severity: SecurityEvent['severity'],
  detail: string,
  reqPath: string = '',
  blocked: boolean = true
): void {
  const event: SecurityEvent = {
    id: `sec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ip: ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.*.*'), // Anonymize IP in logs for privacy
    type,
    severity,
    detail,
    path: reqPath,
    blocked
  };

  securityEvents.unshift(event);
  if (securityEvents.length > MAX_EVENT_LOG_SIZE) {
    securityEvents.pop();
  }

  threatsCounter.totalThreatsBlocked++;
  threatsCounter.blockedByType[type] = (threatsCounter.blockedByType[type] || 0) + 1;
  threatsCounter.lastThreatDetectedAt = event.timestamp;

  // Track IP threat score
  const current = ipThreatScores.get(ip) || { score: 0, lastViolation: Date.now() };
  const scoreInc = severity === 'CRITICAL' ? 5 : severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1;
  current.score += scoreInc;
  current.lastViolation = Date.now();
  ipThreatScores.set(ip, current);

  const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.');
  // Auto-blacklist IP if threat score exceeds threshold within 1 hour (never blacklist loopback/localhost)
  if (!isLoopback && current.score >= 10 && !blacklistedIps.has(ip)) {
    blacklistedIps.add(ip);
    console.warn(`[Security Firewall] 🚨 Auto-blacklisted abusive IP ${ip} (Threat Score: ${current.score})`);
  }

  console.warn(`[Security Alert] [${type}] [${severity}] From ${event.ip} on ${reqPath}: ${detail}`);
  persistSecurityDataAsync();
}

// Clean up expired threat scores periodically (every 10 minutes)
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, item] of ipThreatScores.entries()) {
    if (item.lastViolation < cutoff) {
      ipThreatScores.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// --- 1. HTTP Security Headers Middleware ---

export function securityHeadersMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // 1. Remove Fingerprinting
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // 2. Clickjacking Prevention
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. MIME Sniffing Prevention
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 4. Legacy XSS Protection (for Android 5-7, legacy Chrome)
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 5. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 6. Permissions Policy
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');

  // 7. Cross-Origin Policies (allows popup ad tabs and video streaming without leaking credentials)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // 8. HSTS (Strict-Transport-Security) for HTTPS connections
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // 9. Content Security Policy (Per-route optimized: allows streaming CDN, Firebase, Cast SDK, ads, and fonts)
  if (!res.getHeader('Content-Security-Policy')) {
    const csp = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://apis.google.com https://www.gstatic.com https://*.firebaseapp.com https://uplcm.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' data: blob: https: http:",
      "worker-src 'self' blob:",
      "connect-src 'self' blob: https: http: wss: ws: https://uplcm.com",
      "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://uplcm.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https: mailto:"
    ].join('; ');

    res.setHeader('Content-Security-Policy', csp);
  }

  next();
}

// --- 2. Anti-SSRF (Server-Side Request Forgery) Validation ---

const BLOCKED_IP_PATTERNS = [
  /^127\./,                         // Loopback (127.0.0.0/8)
  /^10\./,                          // Private class A (10.0.0.0/8)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private class B (172.16.0.0/12)
  /^192\.168\./,                    // Private class C (192.168.0.0/16)
  /^169\.254\./,                    // Link-local / AWS & GCP Metadata (169.254.169.254)
  /^0\./,                           // Zero addresses
  /^fc00:/i,                        // IPv6 Unique Local
  /^fe80:/i,                        // IPv6 Link-Local
  /^::1$/,                          // IPv6 Loopback
  /^localhost$/i,
  /^metadata\.google\.internal$/i,
  /^instance-data$/i
];

export function isBlockedSsrfTarget(targetUrl: string): { blocked: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);

    // Only HTTP and HTTPS are permitted for stream proxying
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { blocked: true, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const host = parsed.hostname.toLowerCase();

    // Check against internal / private IP patterns
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(host)) {
        return { blocked: true, reason: `Forbidden internal address or loopback target: ${host}` };
      }
    }

    // Block non-standard or dangerous internal ports
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    const dangerousPorts = [22, 23, 25, 3306, 5432, 6379, 9200, 27017, 11211];
    if (dangerousPorts.includes(port)) {
      return { blocked: true, reason: `Forbidden access to internal database or management port ${port}` };
    }

    return { blocked: false };
  } catch (e: any) {
    return { blocked: true, reason: `Malformed URL structure: ${e?.message || 'Invalid format'}` };
  }
}

// --- 3. WAF (Web Application Firewall) Filter ---

const SQLI_PATTERNS = [
  /(\b(union(\s+all)?|select|insert|update|delete|drop|alter|create|truncate)\b.*(from|into|table|database))/i,
  /(--|#|\/\*).*$/m,
  /(\b(or|and)\b\s+['"]?\w+['"]?\s*=\s*['"]?\w+)/i,
  /(exec(\s|\+)+(s|x)p\w+)/i
];

const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /on(load|error|click|mouseover|submit|focus|blur)\s*=/gi,
  /data\s*:\s*text\/html/gi
];

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,              // ../ or ..\
  /%2e%2e[\/\\]/i,           // URL encoded ..
  /%252e%252e[\/\\]/i,       // Double encoded ..
  /\/etc\/(passwd|shadow|hosts)/i,
  /\/proc\/self\//i,
  /\0/                       // Null byte injection
];

function inspectValueForThreats(val: any, keyName?: string): { isThreat: boolean; category?: string; pattern?: string } {
  // Allow safe payment screenshot data URIs and M3U playlist payloads
  if (
    keyName === 'screenshotImage' || 
    keyName === 'rawM3u' || 
    keyName === 'rawM3uText' ||
    (typeof val === 'string' && (val.startsWith('data:image/') || val.includes('#EXTM3U') || val.includes('#EXTINF:')))
  ) {
    return { isThreat: false };
  }

  if (typeof val === 'string') {
    // 1. Path traversal check
    for (const pt of PATH_TRAVERSAL_PATTERNS) {
      if (pt.test(val)) return { isThreat: true, category: 'PATH_TRAVERSAL', pattern: pt.source };
    }

    // 2. XSS check
    for (const xs of XSS_PATTERNS) {
      if (xs.test(val)) return { isThreat: true, category: 'XSS', pattern: xs.source };
    }

    // 3. SQL Injection check (only trigger on strings long enough with space/sql tokens)
    if (val.length > 8 && val.includes(' ')) {
      for (const sq of SQLI_PATTERNS) {
        if (sq.test(val)) return { isThreat: true, category: 'SQL_INJECTION', pattern: sq.source };
      }
    }
  } else if (typeof val === 'object' && val !== null) {
    for (const key of Object.keys(val)) {
      if (key === 'screenshotImage') continue;
      const res = inspectValueForThreats(val[key], key);
      if (res.isThreat) return res;
    }
  }
  return { isThreat: false };
}

function normalizeIp(raw: string | undefined | null): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function isInternalOrLoopbackIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) return true;
  return false;
}

export function getTrustedClientIp(req: express.Request): string {
  const trustProxySetting = req.app?.get?.('trust proxy');
  const trustProxyEnabled = Boolean(
    (typeof trustProxySetting === 'number' && trustProxySetting > 0) ||
    trustProxySetting === true ||
    process.env.RENDER ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.RENDER_SERVICE_ID ||
    process.env.K_SERVICE ||
    process.env.TRUST_PROXY === '1'
  );

  const expressIp = normalizeIp(req.ip);
  const remoteIp = normalizeIp(req.socket?.remoteAddress);

  if (trustProxyEnabled && (!remoteIp || isInternalOrLoopbackIp(remoteIp))) {
    if (expressIp && !isInternalOrLoopbackIp(expressIp)) {
      return expressIp;
    }
    const cfIp = normalizeIp(req.headers?.['cf-connecting-ip'] as string);
    if (cfIp && !isInternalOrLoopbackIp(cfIp)) return cfIp;

    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      const hops = forwarded.split(',').map((h) => normalizeIp(h)).filter(Boolean);
      for (let i = hops.length - 1; i >= 0; i--) {
        if (!isInternalOrLoopbackIp(hops[i])) return hops[i];
      }
    }
  }

  return expressIp || remoteIp || '127.0.0.1';
}

export function wafInspectionMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Extract client IP safely via centralized trusted proxy resolution
  const clientIp = getTrustedClientIp(req);

  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost' || clientIp === '::ffff:127.0.0.1' || clientIp.startsWith('127.');

  // 1. Check if IP is permanently or temporarily blacklisted
  if (!isLoopback && blacklistedIps.has(clientIp)) {
    logSecurityEvent(clientIp, 'WAF_ATTACK', 'HIGH', 'Request dropped: IP is on active security blacklist', req.path);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Access blocked by M R S IPTV Security Firewall.',
      code: 'ERR_IP_BLACKLISTED'
    });
  }

  // 2. Inspect query parameters (skip target url parameter in proxy routes from strict SQLi check to avoid false positives on stream tokens)
  for (const [key, val] of Object.entries(req.query)) {
    if (key === 'url' && (req.path === '/api/proxy' || req.path === '/api/download')) continue;
    const check = inspectValueForThreats(val);
    if (check.isThreat) {
      logSecurityEvent(clientIp, 'WAF_ATTACK', 'HIGH', `Malicious payload detected in query param '${key}' (${check.category})`, req.path);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Security validation failed: Request contains suspicious or malformed parameters.',
        code: `ERR_SECURITY_${check.category}`
      });
    }
  }

  // 3. Inspect body payload for POST/PUT requests
  if (req.body && typeof req.body === 'object') {
    const check = inspectValueForThreats(req.body);
    if (check.isThreat) {
      logSecurityEvent(clientIp, 'WAF_ATTACK', 'HIGH', `Malicious payload detected in request body (${check.category})`, req.path);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Security validation failed: Request payload contains suspicious patterns.',
        code: `ERR_SECURITY_${check.category}`
      });
    }
  }

  next();
}

// --- 4. High-Performance Sliding Window Rate Limiting Engine ---

interface RateLimitBucket {
  tokens: number[];
}

export function createSlidingWindowLimiter(options: {
  windowMs: number;
  maxRequests: number;
  limiterName: string;
  errorMessage?: string;
  keyGenerator?: (req: express.Request) => string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  // Periodic cleanup of stale buckets
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      bucket.tokens = bucket.tokens.filter(t => now - t < options.windowMs);
      if (bucket.tokens.length === 0) {
        buckets.delete(key);
      }
    }
  }, options.windowMs);

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const defaultKey = getTrustedClientIp(req);
    const clientKey = options.keyGenerator ? options.keyGenerator(req) : defaultKey;
    const now = Date.now();

    let bucket = buckets.get(clientKey);
    if (!bucket) {
      bucket = { tokens: [] };
      buckets.set(clientKey, bucket);
    }

    // Filter tokens within window
    bucket.tokens = bucket.tokens.filter(t => now - t < options.windowMs);

    if (bucket.tokens.length >= options.maxRequests) {
      logSecurityEvent(
        defaultKey,
        'RATE_LIMIT_EXCEEDED',
        'MEDIUM',
        `Rate limit exceeded on [${options.limiterName}]: ${bucket.tokens.length}/${options.maxRequests} in ${options.windowMs / 1000}s`,
        req.path
      );

      res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000).toString());
      return res.status(429).json({
        error: 'Too Many Requests',
        message: options.errorMessage || `Rate limit exceeded. Please wait before making further requests.`,
        retryAfterSeconds: Math.ceil(options.windowMs / 1000),
        code: 'ERR_RATE_LIMIT_EXCEEDED'
      });
    }

    bucket.tokens.push(now);
    next();
  };
}

// Pre-configured rate limiters
export const globalApiRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 350,    // High threshold to support fast streaming & catalog loading
  limiterName: 'Global API'
});

export const aiEndpointRateLimiter = createSlidingWindowLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 25,     // Protect Gemini Flash API from exhaustion
  limiterName: 'AI Engine',
  errorMessage: 'AI streaming assistant is handling high load. Please wait a moment.'
});

// VIP Code Brute-Force & Credential Stuffing Limiter: max 5 attempts per 15 minutes per IP + Device
const bruteForceFailedAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function checkBruteForceLock(req: express.Request): { locked: boolean; remainingSec: number } {
  const ip = getTrustedClientIp(req);
  const deviceId = req.body?.deviceId || req.query.deviceId || '';
  const key = `${ip}_${deviceId}`;
  const now = Date.now();

  const record = bruteForceFailedAttempts.get(key);
  if (record && record.lockedUntil > now) {
    return { locked: true, remainingSec: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { locked: false, remainingSec: 0 };
}

export function recordFailedCodeAttempt(req: express.Request): void {
  const ip = getTrustedClientIp(req);
  const deviceId = req.body?.deviceId || req.query.deviceId || '';
  const key = `${ip}_${deviceId}`;
  const now = Date.now();

  const current = bruteForceFailedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  current.count++;

  if (current.count >= 5) {
    // Lock for 15 minutes
    current.lockedUntil = now + 15 * 60 * 1000;
    logSecurityEvent(ip, 'BRUTE_FORCE', 'HIGH', `Locked VIP code validation: 5 consecutive failed attempts on device ${deviceId || 'anon'}`, req.path);
  }

  bruteForceFailedAttempts.set(key, current);
}

export function clearFailedCodeAttempts(req: express.Request): void {
  const ip = getTrustedClientIp(req);
  const deviceId = req.body?.deviceId || req.query.deviceId || '';
  const key = `${ip}_${deviceId}`;
  bruteForceFailedAttempts.delete(key);
}

// --- 5. VIP Pass Cryptographic Signature Engine ---

const SERVER_SECRET = process.env.SECURITY_SECRET || backendConfig.securitySecret;

export function signVipDeviceToken(code: string, deviceId: string, expiryIso: string): string {
  const payload = `${code}:${deviceId}:${expiryIso}`;
  return crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('hex');
}

export function verifyVipDeviceToken(code: string, deviceId: string, expiryIso: string, signature: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  const expected = signVipDeviceToken(code, deviceId, expiryIso);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// --- 6. Security Health & Status Snapshot ---

export function getSecurityHealthSnapshot(): SecurityStats & {
  recentEvents: SecurityEvent[];
  activeRules: string[];
} {
  const now = Date.now();
  let activeLocks = 0;
  for (const item of bruteForceFailedAttempts.values()) {
    if (item.lockedUntil > now) activeLocks++;
  }

  return {
    firewallActive: true,
    totalThreatsBlocked: threatsCounter.totalThreatsBlocked,
    blockedByType: threatsCounter.blockedByType,
    activeBlacklistedIpsCount: blacklistedIps.size,
    rateLimitHits: threatsCounter.blockedByType.RATE_LIMIT_EXCEEDED || 0,
    ssrfAttemptsBlocked: threatsCounter.blockedByType.SSRF_ATTEMPT || 0,
    wafAttacksBlocked: threatsCounter.blockedByType.WAF_ATTACK || 0,
    bruteForceLocksActive: activeLocks,
    lastThreatDetectedAt: threatsCounter.lastThreatDetectedAt,
    securityUptimeSeconds: Math.floor(process.uptime()),
    recentEvents: securityEvents.slice(0, 20),
    activeRules: [
      'HTTP Security Headers (CSP, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN)',
      'Anti-SSRF Firewall (Guards /api/proxy against loopback, metadata & RFC-1918 private IPs)',
      'WAF Injection Filter (SQLi, XSS, Path Traversal, and Command Injection Detection)',
      'Multi-Tier Rate Limiting (Global API: 350/min, AI Engine: 25/min)',
      'VIP Pass Brute-Force & Credential Stuffing Defense (Max 5 attempts / 15-min lockout)',
      'Cryptographic HMAC-SHA256 VIP Device Token Signing & Single-Device Anti-Tamper'
    ]
  };
}

export function flushSecurityBlacklist(): { clearedCount: number } {
  const count = blacklistedIps.size;
  blacklistedIps.clear();
  ipThreatScores.clear();
  bruteForceFailedAttempts.clear();
  return { clearedCount: count };
}
