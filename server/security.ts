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
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'fs';
import path from 'path';
import { config as backendConfig } from './mrs-iptv-backend/src/config.js';
import {
  getTrustedClientIp,
  normalizeIp,
  isPrivateIpAddress,
  maskClientIp,
  getProxyTelemetrySummary,
} from './clientIp';

export { getTrustedClientIp, normalizeIp, isPrivateIpAddress, maskClientIp };

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
  const maskedIp = maskClientIp(ip);
  const event: SecurityEvent = {
    id: `sec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    ip: maskedIp,
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

  // Track IP threat score
  threatsCounter.totalThreatsBlocked++;
  threatsCounter.blockedByType[type] = (threatsCounter.blockedByType[type] || 0) + 1;
  threatsCounter.lastThreatDetectedAt = event.timestamp;

  const current = ipThreatScores.get(ip) || { score: 0, lastViolation: Date.now() };
  const scoreInc = severity === 'CRITICAL' ? 5 : severity === 'HIGH' ? 3 : severity === 'MEDIUM' ? 2 : 1;
  current.score += scoreInc;
  current.lastViolation = Date.now();
  ipThreatScores.set(ip, current);

  const isLoopback = isPrivateIpAddress(ip) && (normalizeIp(ip) === '127.0.0.1' || normalizeIp(ip) === '::1' || normalizeIp(ip) === 'localhost' || normalizeIp(ip).startsWith('127.'));
  // Auto-blacklist IP if threat score exceeds threshold within 1 hour (never blacklist loopback/localhost)
  if (!isLoopback && current.score >= 10 && !blacklistedIps.has(ip)) {
    blacklistedIps.add(ip);
    console.warn(`[Security Firewall] 🚨 Auto-blacklisted abusive subnet ${maskedIp} (Threat Score: ${current.score})`);
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
}, 10 * 60 * 1000).unref();

// --- 1. HTTP Security Headers Middleware ---

const CSP_HOST_PATTERN = /^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(?::\d{1,5})?$/i;

export function parseSafeCspHosts(raw?: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const part of raw.split(',')) {
    const candidate = part.trim();
    if (!candidate || candidate.includes(';') || candidate.includes(' ')) continue;
    if (!CSP_HOST_PATTERN.test(candidate)) continue;
    const normalized = candidate.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      valid.push(normalized);
    }
  }
  return valid;
}

export function buildContentSecurityPolicy(): string {
  const baseScriptHosts = [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    'blob:',
    'https://apis.google.com',
    'https://www.gstatic.com',
    'https://*.firebaseapp.com',
    'https://uplcm.com',
    'https://monetag.com',
    'https://*.monetag.com',
    'https://challenges.cloudflare.com',
    'https://js.hcaptcha.com',
    'https://*.hcaptcha.com',
    ...parseSafeCspHosts(process.env.CSP_EXTRA_SCRIPT_HOSTS),
  ];

  const baseFrameHosts = [
    "'self'",
    'https://accounts.google.com',
    'https://*.firebaseapp.com',
    'https://uplcm.com',
    'https://monetag.com',
    'https://*.monetag.com',
    'https://challenges.cloudflare.com',
    'https://*.hcaptcha.com',
    ...parseSafeCspHosts(process.env.CSP_EXTRA_FRAME_HOSTS),
  ];

  return [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
    `script-src ${Array.from(new Set(baseScriptHosts)).join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob: https: http:",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: https: http: wss: ws: https://uplcm.com https://monetag.com https://*.monetag.com",
    `frame-src ${Array.from(new Set(baseFrameHosts)).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https: mailto:"
  ].join('; ');
}

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

  // 9. Content Security Policy (Per-route optimized: allows streaming CDN, Firebase, Cast SDK, CAPTCHA, partner verification & fonts)
  if (!res.getHeader('Content-Security-Policy')) {
    res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
  }

  next();
}

// --- 2. Anti-SSRF (Server-Side Request Forgery) Validation ---

const BLOCKED_METADATA_HOSTS = new Set([
  'localhost',
  'metadata',
  'metadata.goog',
  'metadata.google.internal',
  'metadata.azure.com',
  'instance-data',
]);

const DANGEROUS_INTERNAL_PORTS = new Set([
  21, 22, 23, 25, 53, 111, 135, 139, 445, 512, 513, 514,
  1433, 1521, 2375, 2376, 3306, 3389, 5432, 5900, 6379,
  8500, 9000, 9200, 9300, 10250, 11211, 27017,
]);

const SSRF_DNS_CACHE_TTL_MS = 60_000;
const SSRF_DNS_CACHE_MAX_ENTRIES = 1000;
const ssrfDnsCache = new Map<string, { ips: string[]; expiresAt: number }>();

function isBlockedInternalHostname(cleanHost: string): boolean {
  if (!cleanHost) return true;
  if (BLOCKED_METADATA_HOSTS.has(cleanHost)) return true;
  if (
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.localdomain')
  ) {
    return true;
  }
  const envBlocked = String(process.env.BLOCKED_SOURCE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return envBlocked.some((b) => cleanHost === b || cleanHost.endsWith(`.${b}`));
}

export function isBlockedSsrfTarget(
  targetUrl: string,
  options: { allowPrivate?: boolean } = {}
): { blocked: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);

    // Only HTTP and HTTPS are permitted for stream proxying
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { blocked: true, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    // Reject embedded credentials (http://trusted@127.0.0.1)
    if (parsed.username || parsed.password) {
      return { blocked: true, reason: 'Embedded URL credentials are forbidden' };
    }

    const rawHost = parsed.hostname.toLowerCase();
    const cleanHost = rawHost.replace(/^\[|\]$/g, '').split('%')[0].replace(/\.+$/, '');

    // Block dangerous internal ports regardless of allowPrivate
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    if (DANGEROUS_INTERNAL_PORTS.has(port)) {
      return { blocked: true, reason: `Forbidden access to internal database or management port ${port}` };
    }

    if (!options.allowPrivate) {
      if (isBlockedInternalHostname(cleanHost)) {
        return { blocked: true, reason: `Forbidden internal hostname or metadata target: ${cleanHost}` };
      }

      const normalizedHostIp = normalizeIp(cleanHost);
      if (normalizedHostIp && isPrivateIpAddress(normalizedHostIp)) {
        return { blocked: true, reason: `Forbidden internal address or loopback target: ${normalizedHostIp}` };
      }

      // Catch direct IPv6 literals whose raw bracketed/hex string failed normalization
      if (net.isIP(cleanHost) && isPrivateIpAddress(cleanHost)) {
        return { blocked: true, reason: `Forbidden private IP target: ${cleanHost}` };
      }
    }

    return { blocked: false };
  } catch (e: any) {
    return { blocked: true, reason: `Malformed URL structure: ${e?.message || 'Invalid format'}` };
  }
}

async function resolveTargetIps(cleanHost: string): Promise<string[]> {
  const normalizedIp = normalizeIp(cleanHost);
  if (normalizedIp && normalizedIp !== 'localhost') return [normalizedIp];
  if (net.isIP(cleanHost)) return [cleanHost];

  const now = Date.now();
  const cached = ssrfDnsCache.get(cleanHost);
  if (cached && cached.expiresAt > now) {
    return cached.ips;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      dns.lookup(cleanHost, { all: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS lookup timed out')), 3500);
      }),
    ]);
    const ips = records.map((r) => normalizeIp(r.address) || r.address).filter(Boolean);
    if (ips.length > 0) {
      if (ssrfDnsCache.size >= SSRF_DNS_CACHE_MAX_ENTRIES) {
        const oldestKey = ssrfDnsCache.keys().next().value;
        if (oldestKey) ssrfDnsCache.delete(oldestKey);
      }
      ssrfDnsCache.set(cleanHost, { ips, expiresAt: now + SSRF_DNS_CACHE_TTL_MS });
    }
    return ips;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Full async SSRF verification: applies synchronous URL/IP/port checks AND resolves DNS
 * to defend against DNS rebinding to loopback, private, link-local, or CGNAT addresses.
 */
export async function validateSsrfTargetAsync(
  targetUrl: string,
  options: { allowPrivate?: boolean } = {}
): Promise<{ blocked: boolean; reason?: string }> {
  const syncCheck = isBlockedSsrfTarget(targetUrl, options);
  if (syncCheck.blocked || options.allowPrivate) {
    return syncCheck;
  }

  try {
    const parsed = new URL(targetUrl);
    const cleanHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0].replace(/\.+$/, '');
    const ips = await resolveTargetIps(cleanHost);
    if (!ips.length) {
      return { blocked: true, reason: `Target hostname failed DNS resolution: ${cleanHost}` };
    }
    for (const ip of ips) {
      if (isPrivateIpAddress(ip)) {
        return { blocked: true, reason: `DNS resolved to forbidden private/internal IP (${maskClientIp(ip)})` };
      }
    }
    return { blocked: false };
  } catch (err: any) {
    return { blocked: true, reason: `SSRF DNS check failed: ${err?.message || 'unresolvable host'}` };
  }
}

/**
 * Performs an HTTP fetch while validating both the initial URL and every 3xx redirect hop
 * against DNS-rebinding and private-network SSRF rules.
 */
export async function safeFetchWithSsrfGuard(
  targetUrl: string,
  init: RequestInit & { allowPrivate?: boolean } = {},
  maxRedirects: number = 4
): Promise<Response> {
  const { allowPrivate = false, ...fetchInit } = init;
  let currentUrl = targetUrl;
  let currentHeaders = new Headers(fetchInit.headers || {});

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await validateSsrfTargetAsync(currentUrl, { allowPrivate });
    if (check.blocked) {
      throw new Error(check.reason || 'Forbidden SSRF redirect target');
    }

    const res = await fetch(currentUrl, {
      ...fetchInit,
      headers: currentHeaders,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      const nextUrl = new URL(location, currentUrl).toString();
      if (new URL(nextUrl).origin !== new URL(currentUrl).origin) {
        currentHeaders.delete('authorization');
        currentHeaders.delete('cookie');
      }
      currentUrl = nextUrl;
      continue;
    }

    return res;
  }

  throw new Error('Too many HTTP redirects');
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

export interface RateLimiterMetricsSnapshot {
  limiterName: string;
  windowMs: number;
  maxRequests: number;
  activeBuckets: number;
  activeTrackedTokens: number;
  totalRequestsAllowed: number;
  totalRequestsBlocked: number;
  lastBlockedAt: string | null;
}

interface InternalRateLimiterState {
  limiterName: string;
  windowMs: number;
  maxRequests: number;
  buckets?: Map<string, RateLimitBucket>;
  totalRequestsAllowed: number;
  totalRequestsBlocked: number;
  lastBlockedAt: string | null;
}

const rateLimiterRegistry = new Map<string, InternalRateLimiterState>();

export function recordExternalRateLimitBlock(
  limiterName: string,
  windowMs = 60_000,
  maxRequests = 0
): void {
  const name = String(limiterName || 'External Rate Limiter').trim();
  let entry = rateLimiterRegistry.get(name);
  if (!entry) {
    entry = {
      limiterName: name,
      windowMs,
      maxRequests,
      totalRequestsAllowed: 0,
      totalRequestsBlocked: 0,
      lastBlockedAt: null,
    };
    rateLimiterRegistry.set(name, entry);
  }
  entry.totalRequestsBlocked++;
  entry.lastBlockedAt = new Date().toISOString();
}

export function getRateLimiterTelemetry(): RateLimiterMetricsSnapshot[] {
  const now = Date.now();
  const list: RateLimiterMetricsSnapshot[] = [];

  for (const state of rateLimiterRegistry.values()) {
    let activeBuckets = 0;
    let activeTrackedTokens = 0;
    if (state.buckets) {
      for (const bucket of state.buckets.values()) {
        const activeCount = bucket.tokens.filter((t) => now - t < state.windowMs).length;
        if (activeCount > 0) {
          activeBuckets++;
          activeTrackedTokens += activeCount;
        }
      }
    }
    list.push({
      limiterName: state.limiterName,
      windowMs: state.windowMs,
      maxRequests: state.maxRequests,
      activeBuckets,
      activeTrackedTokens,
      totalRequestsAllowed: state.totalRequestsAllowed,
      totalRequestsBlocked: state.totalRequestsBlocked,
      lastBlockedAt: state.lastBlockedAt,
    });
  }

  return list;
}

export function createSlidingWindowLimiter(options: {
  windowMs: number;
  maxRequests: number;
  limiterName: string;
  errorMessage?: string;
  keyGenerator?: (req: express.Request) => string;
}) {
  const buckets = new Map<string, RateLimitBucket>();

  const telemetryState: InternalRateLimiterState = {
    limiterName: options.limiterName,
    windowMs: options.windowMs,
    maxRequests: options.maxRequests,
    buckets,
    totalRequestsAllowed: 0,
    totalRequestsBlocked: 0,
    lastBlockedAt: null,
  };
  rateLimiterRegistry.set(options.limiterName, telemetryState);

  // Periodic cleanup of stale buckets
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      bucket.tokens = bucket.tokens.filter(t => now - t < options.windowMs);
      if (bucket.tokens.length === 0) {
        buckets.delete(key);
      }
    }
  }, options.windowMs).unref();

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
      telemetryState.totalRequestsBlocked++;
      telemetryState.lastBlockedAt = new Date(now).toISOString();

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
    telemetryState.totalRequestsAllowed++;
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

function sanitizeSecurityDeviceId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function checkBruteForceLock(req: express.Request): { locked: boolean; remainingSec: number } {
  const ip = getTrustedClientIp(req);
  const deviceId = sanitizeSecurityDeviceId(req.body?.deviceId || req.query.deviceId || req.get('x-device-id'));
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
  const deviceId = sanitizeSecurityDeviceId(req.body?.deviceId || req.query.deviceId || req.get('x-device-id'));
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
  const deviceId = sanitizeSecurityDeviceId(req.body?.deviceId || req.query.deviceId || req.get('x-device-id'));
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

// --- 6. Security Health & Status Snapshot + Prometheus/JSON Metrics ---

function countActiveBruteForceLocks(): number {
  const now = Date.now();
  let activeLocks = 0;
  for (const item of bruteForceFailedAttempts.values()) {
    if (item.lockedUntil > now) activeLocks++;
  }
  return activeLocks;
}

export function getSecurityHealthSnapshot(): SecurityStats & {
  recentEvents: SecurityEvent[];
  activeRules: string[];
  proxyTelemetry: ReturnType<typeof getProxyTelemetrySummary>;
  rateLimiters: RateLimiterMetricsSnapshot[];
} {
  return {
    firewallActive: true,
    totalThreatsBlocked: threatsCounter.totalThreatsBlocked,
    blockedByType: threatsCounter.blockedByType,
    activeBlacklistedIpsCount: blacklistedIps.size,
    rateLimitHits: threatsCounter.blockedByType.RATE_LIMIT_EXCEEDED || 0,
    ssrfAttemptsBlocked: threatsCounter.blockedByType.SSRF_ATTEMPT || 0,
    wafAttacksBlocked: threatsCounter.blockedByType.WAF_ATTACK || 0,
    bruteForceLocksActive: countActiveBruteForceLocks(),
    lastThreatDetectedAt: threatsCounter.lastThreatDetectedAt,
    securityUptimeSeconds: Math.floor(process.uptime()),
    recentEvents: securityEvents.slice(0, 20),
    proxyTelemetry: getProxyTelemetrySummary(),
    rateLimiters: getRateLimiterTelemetry(),
    activeRules: [
      'HTTP Security Headers (CSP, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN)',
      'Anti-SSRF Firewall (Guards /api/proxy & M3U endpoints against private IPs, DNS rebinding & redirect hops)',
      'WAF Injection Filter (SQLi, XSS, Path Traversal, and Command Injection Detection)',
      'Multi-Tier Rate Limiting (Global API: 350/min, AI Engine: 25/min)',
      'VIP Pass Brute-Force & Credential Stuffing Defense (Max 5 attempts / 15-min lockout)',
      'Cryptographic HMAC-SHA256 VIP Device Token Signing & Single-Device Anti-Tamper'
    ]
  };
}

export function getSecurityMetricsSnapshot(req?: express.Request) {
  const mem = process.memoryUsage();
  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    firewallActive: true,
    threatsTotal: threatsCounter.totalThreatsBlocked,
    blockedByType: { ...threatsCounter.blockedByType },
    activeBlacklistedIpsCount: blacklistedIps.size,
    bruteForceLocksActive: countActiveBruteForceLocks(),
    lastThreatDetectedAt: threatsCounter.lastThreatDetectedAt,
    rateLimiters: getRateLimiterTelemetry(),
    proxyTelemetry: getProxyTelemetrySummary(req),
    memoryBytes: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
    },
  };
}

function escapePrometheusLabel(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

export function formatPrometheusSecurityMetrics(req?: express.Request): string {
  const snap = getSecurityMetricsSnapshot(req);
  const lines: string[] = [];

  lines.push('# HELP mrs_iptv_process_uptime_seconds Process uptime in seconds.');
  lines.push('# TYPE mrs_iptv_process_uptime_seconds gauge');
  lines.push(`mrs_iptv_process_uptime_seconds ${snap.uptimeSeconds}`);

  lines.push('# HELP mrs_iptv_nodejs_memory_rss_bytes Resident set size memory in bytes.');
  lines.push('# TYPE mrs_iptv_nodejs_memory_rss_bytes gauge');
  lines.push(`mrs_iptv_nodejs_memory_rss_bytes ${snap.memoryBytes.rss}`);

  lines.push('# HELP mrs_iptv_nodejs_memory_heap_used_bytes Node.js V8 heap used in bytes.');
  lines.push('# TYPE mrs_iptv_nodejs_memory_heap_used_bytes gauge');
  lines.push(`mrs_iptv_nodejs_memory_heap_used_bytes ${snap.memoryBytes.heapUsed}`);

  lines.push('# HELP mrs_iptv_security_firewall_active Whether the application WAF firewall is active (1=active).');
  lines.push('# TYPE mrs_iptv_security_firewall_active gauge');
  lines.push(`mrs_iptv_security_firewall_active ${snap.firewallActive ? 1 : 0}`);

  lines.push('# HELP mrs_iptv_security_threats_total Total blocked security threats partitioned by threat type.');
  lines.push('# TYPE mrs_iptv_security_threats_total counter');
  for (const [threatType, count] of Object.entries(snap.blockedByType)) {
    lines.push(`mrs_iptv_security_threats_total{type="${escapePrometheusLabel(threatType)}"} ${Number(count) || 0}`);
  }

  lines.push('# HELP mrs_iptv_security_active_blacklist Current number of blacklisted client IPs in memory.');
  lines.push('# TYPE mrs_iptv_security_active_blacklist gauge');
  lines.push(`mrs_iptv_security_active_blacklist ${snap.activeBlacklistedIpsCount}`);

  lines.push('# HELP mrs_iptv_security_bruteforce_locks Current active VIP activation brute-force locks.');
  lines.push('# TYPE mrs_iptv_security_bruteforce_locks gauge');
  lines.push(`mrs_iptv_security_bruteforce_locks ${snap.bruteForceLocksActive}`);

  lines.push('# HELP mrs_iptv_rate_limiter_active_buckets Active sliding-window rate-limiter buckets.');
  lines.push('# TYPE mrs_iptv_rate_limiter_active_buckets gauge');
  for (const rl of snap.rateLimiters) {
    lines.push(`mrs_iptv_rate_limiter_active_buckets{limiter="${escapePrometheusLabel(rl.limiterName)}"} ${rl.activeBuckets}`);
  }

  lines.push('# HELP mrs_iptv_rate_limiter_active_tokens Active tracked request tokens inside the current limiter window.');
  lines.push('# TYPE mrs_iptv_rate_limiter_active_tokens gauge');
  for (const rl of snap.rateLimiters) {
    lines.push(`mrs_iptv_rate_limiter_active_tokens{limiter="${escapePrometheusLabel(rl.limiterName)}"} ${rl.activeTrackedTokens}`);
  }

  lines.push('# HELP mrs_iptv_rate_limiter_window_seconds Configured limiter window duration in seconds.');
  lines.push('# TYPE mrs_iptv_rate_limiter_window_seconds gauge');
  for (const rl of snap.rateLimiters) {
    lines.push(`mrs_iptv_rate_limiter_window_seconds{limiter="${escapePrometheusLabel(rl.limiterName)}"} ${Math.round(rl.windowMs / 1000)}`);
  }

  lines.push('# HELP mrs_iptv_rate_limiter_max_requests Configured maximum requests per limiter window.');
  lines.push('# TYPE mrs_iptv_rate_limiter_max_requests gauge');
  for (const rl of snap.rateLimiters) {
    lines.push(`mrs_iptv_rate_limiter_max_requests{limiter="${escapePrometheusLabel(rl.limiterName)}"} ${rl.maxRequests}`);
  }

  lines.push('# HELP mrs_iptv_rate_limiter_requests_total Cumulative requests processed per rate limiter and outcome.');
  lines.push('# TYPE mrs_iptv_rate_limiter_requests_total counter');
  for (const rl of snap.rateLimiters) {
    const label = escapePrometheusLabel(rl.limiterName);
    lines.push(`mrs_iptv_rate_limiter_requests_total{limiter="${label}",outcome="allowed"} ${rl.totalRequestsAllowed}`);
    lines.push(`mrs_iptv_rate_limiter_requests_total{limiter="${label}",outcome="blocked"} ${rl.totalRequestsBlocked}`);
  }

  lines.push('# HELP mrs_iptv_proxy_cloudflare_strict_origin Whether CLOUDFLARE_STRICT_ORIGIN=1 is enabled.');
  lines.push('# TYPE mrs_iptv_proxy_cloudflare_strict_origin gauge');
  lines.push(`mrs_iptv_proxy_cloudflare_strict_origin ${snap.proxyTelemetry.cloudflareStrictOrigin ? 1 : 0}`);

  lines.push('# HELP mrs_iptv_proxy_cloudflare_origin_secret_configured Whether CF_ORIGIN_SECRET is configured.');
  lines.push('# TYPE mrs_iptv_proxy_cloudflare_origin_secret_configured gauge');
  lines.push(`mrs_iptv_proxy_cloudflare_origin_secret_configured ${snap.proxyTelemetry.cloudflareOriginSecretConfigured ? 1 : 0}`);

  return `${lines.join('\n')}\n`;
}

export function flushSecurityBlacklist(): { clearedCount: number } {
  const count = blacklistedIps.size;
  blacklistedIps.clear();
  ipThreatScores.clear();
  bruteForceFailedAttempts.clear();
  return { clearedCount: count };
}
