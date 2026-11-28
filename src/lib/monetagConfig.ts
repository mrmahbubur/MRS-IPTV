export const MONETAG_DEFAULT_VERIFICATION_ID = 'fa9656182dbc7301dcd9a2326441dcf3';
export const MONETAG_DEFAULT_VIGNETTE_ZONE_ID = '11242067';
export const MONETAG_DEFAULT_INTERSTITIAL_ZONE_ID = '11242067';
export const MONETAG_DEFAULT_POPUNDER_ZONE_ID = '11226634';
export const MONETAG_DIRECT_BASE_URL = 'https://uplcm.com/4/';

export interface DynamicMonetagZone {
  id?: string;
  zoneId: string;
  url: string;
  format?: 'banner' | 'interstitial';
  label?: string;
}

export interface CanonicalMonetagZone {
  index: number;
  id: string;
  zoneId: string;
  url: string;
  network: 'Monetag Direct';
  format: 'banner' | 'interstitial';
  estimatedCpmUsd: number;
  name: string;
  label: string;
  headline: string;
  subtitle: string;
  description: string;
  ctaText: string;
  badge: string;
  accentColor: 'amber' | 'cyan' | 'emerald' | 'purple' | 'rose';
  imageUrl?: string;
  isMidnightOnly: boolean;
  showAllTime: boolean;
  category: 'social' | 'adult' | 'sports' | 'vip' | 'cinema';
}

export function buildMonetagZoneUrl(zoneId: string): string {
  const clean = String(zoneId || '').trim();
  return `${MONETAG_DIRECT_BASE_URL}${clean}`;
}

const APPROVED_MONETAG_HOSTS = ['uplcm.com', 'monetag.com'];

export function isSafeMonetagZoneUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 512) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    return APPROVED_MONETAG_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/**
 * Single authoritative registry of all 10 verified owner Monetag zones.
 */
export const MONETAG_CANONICAL_ZONES: CanonicalMonetagZone[] = [
  {
    index: 1,
    id: 'uplcm-11226634',
    zoneId: '11226634',
    url: 'https://uplcm.com/4/11226634',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.20,
    name: 'VIP Live Match Pass',
    label: 'Ultra-HD Sports & Match Priority Line',
    headline: 'Ultra-HD Sports & Live Match Priority Line',
    subtitle: 'High-speed sports streaming partner · Unlock 1 hour of ad-free HD TV now',
    description: 'Unlock 1 Hour of zero-buffer ad-free live cricket, football & PPV streams instantly.',
    ctaText: 'Unlock 1h Ad-Free VIP Pass',
    badge: '24/7 FEATURED',
    accentColor: 'amber',
    imageUrl: '/midnight_cinema_banner.jpg',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'sports',
  },
  {
    index: 2,
    id: 'uplcm-11683565',
    zoneId: '11683565',
    url: 'https://uplcm.com/4/11683565',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.35,
    name: 'Live Sports Score Alert',
    label: 'Live Sports Score & Goal Alert Feed',
    headline: 'Instant Goal & Wicket Real-Time Feed',
    subtitle: 'Real-time match notifications, cricket updates & high-bitrate streaming line',
    description: 'Follow every live match score & high-bitrate sports mirror with 60m VIP access.',
    ctaText: 'Activate Live Sports Pass',
    badge: 'LIVE SPORTS',
    accentColor: 'cyan',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'sports',
  },
  {
    index: 3,
    id: 'uplcm-11242745',
    zoneId: '11242745',
    url: 'https://uplcm.com/4/11242745',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.10,
    name: 'Sports Highlight Viral Hub',
    label: 'Sports Highlight & Match Replay Hub',
    headline: 'Trending Match Replays & Viral Clips',
    subtitle: 'Trending goals, viral sports clips & global Monetag partner line',
    description: 'Catch top sports highlights and claim a 1-hour ad-free VIP pass for all channels.',
    ctaText: 'Visit Hub · 1h Free VIP',
    badge: 'TRENDING',
    accentColor: 'emerald',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'social',
  },
  {
    index: 4,
    id: 'uplcm-11242069',
    zoneId: '11242069',
    url: 'https://uplcm.com/4/11242069',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.25,
    name: 'VIP Sports Fans Community',
    label: 'VIP Sports Fans Community Lounge',
    headline: 'Exclusive Match Chat & HD Fan Lounge',
    subtitle: 'Live fan chats, trending highlights & match stream discussions · 1h Free VIP',
    description: 'Connect with global sports fans and activate 60 minutes of uninterrupted streaming.',
    ctaText: 'Open Feed & Watch Ad-Free',
    badge: 'FAN CLUB',
    accentColor: 'purple',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'social',
  },
  {
    index: 5,
    id: 'uplcm-11242067',
    zoneId: '11242067',
    url: 'https://uplcm.com/4/11242067',
    network: 'Monetag Direct',
    format: 'interstitial',
    estimatedCpmUsd: 5.50,
    name: '24/7 VIP Cinema & Match Direct',
    label: '24/7 Exclusive HD Cinema & Live Broadcasts',
    headline: '24/7 Exclusive HD Cinema & Live Broadcasts',
    subtitle: 'Always-on spotlight partner · Tap to unlock 60 minutes of zero-ad streaming',
    description: 'Always-on Monetag spotlight · Visit ad to enjoy 1 hour completely ad-free.',
    ctaText: 'Enter Spotlight · 1h VIP',
    badge: '24/7 SPOTLIGHT',
    accentColor: 'rose',
    imageUrl: '/midnight_cinema_banner.jpg',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'cinema',
  },
  {
    index: 6,
    id: 'uplcm-11242742',
    zoneId: '11242742',
    url: 'https://uplcm.com/4/11242742',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.15,
    name: 'Global Sports Discussion Forum',
    label: 'Global Sports Discussion & Fixture Hub',
    headline: 'Pro Match Predictions & Live Odds Hub',
    subtitle: 'Verified Monetag broadcast line unlocking 60 minutes of uninterrupted TV',
    description: 'Verified broadcast partner · One tap unlocks 60 minutes of zero-ad TV.',
    ctaText: 'Claim 1-Hour Free VIP',
    badge: 'VERIFIED',
    accentColor: 'amber',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'social',
  },
  {
    index: 7,
    id: 'uplcm-11230440',
    zoneId: '11230440',
    url: 'https://uplcm.com/4/11230440',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.30,
    name: 'High-Yield Sports Media Feed',
    label: 'High-Speed Global IPTV Mirror Support',
    headline: 'High-Speed Global IPTV Mirror Support',
    subtitle: 'Instant sports updates and Monetag direct line keeping 8,890+ channels free',
    description: 'Keep 8,200+ international TV channels free & fast while unlocking 1h VIP mode.',
    ctaText: 'Support Server & Unlock VIP',
    badge: 'FAST LINE',
    accentColor: 'cyan',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'vip',
  },
  {
    index: 8,
    id: 'uplcm-11683560',
    zoneId: '11683560',
    url: 'https://uplcm.com/4/11683560',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.45,
    name: 'Trending Sports Media Channel',
    label: 'Prime Broadcast CDN & Zero-Lag Relay',
    headline: 'Prime Broadcast CDN & Zero-Lag Relay',
    subtitle: 'Top-tier partner network supporting zero-buffer TV & cinema streams',
    description: 'Top-tier Monetag stream line supporting ultra-low-latency sports & movie playback.',
    ctaText: 'Activate High-Speed Line',
    badge: 'PRIME CDN',
    accentColor: 'emerald',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'sports',
  },
  {
    index: 9,
    id: 'uplcm-9912130',
    zoneId: '9912130',
    url: 'https://uplcm.com/4/9912130',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.50,
    name: 'Viral Video & Sports Social Lounge',
    label: 'All-Day Cinema, Reels & Sports Lounge',
    headline: 'All-Day Cinema, Reels & Sports Lounge',
    subtitle: 'Claim 1 full hour of zero ads across all live TV & sports feeds right now',
    description: 'Claim 1 full hour of zero ads across Live TV & Sports feeds right now.',
    ctaText: 'Unlock 1-Hour VIP Now',
    badge: 'TOP ZONE',
    accentColor: 'purple',
    imageUrl: '/midnight_cinema_banner.jpg',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'cinema',
  },
  {
    index: 10,
    id: 'uplcm-11242744',
    zoneId: '11242744',
    url: 'https://uplcm.com/4/11242744',
    network: 'Monetag Direct',
    format: 'banner',
    estimatedCpmUsd: 4.60,
    name: 'Global Match Stream Network',
    label: 'International Match Stream Partner Network',
    headline: 'International Broadcast Partner Network',
    subtitle: 'Official 24/7 global Monetag line unlocking 60-min VIP streaming',
    description: 'Official 24/7 Monetag ad · Instant 60-minute ad-free VIP pass activation.',
    ctaText: 'Visit Partner & Watch Ad-Free',
    badge: 'GLOBAL VIP',
    accentColor: 'rose',
    isMidnightOnly: false,
    showAllTime: true,
    category: 'vip',
  },
];

export const MONETAG_DIRECT_URLS: string[] = MONETAG_CANONICAL_ZONES.map((z) => z.url);

export interface MonetagAdCapsPolicy {
  popunderCooldownMinutes: number;
  popunderMaxPerDay: number;
  interstitialCooldownSeconds: number;
  interstitialMaxPerDay: number;
  pushDelaySeconds: number;
  pushMinVisits: number;
  pushDeclineDays: number;
  emptySlotCollapseMs: number;
}

export interface MonetagRuntimeCaps {
  popunderCooldownMs: number;
  popunderMaxPerDay: number;
  interstitialCooldownMs: number;
  interstitialMaxPerDay: number;
  pushDelayMs: number;
  pushMinVisits: number;
  pushDeclineDays: number;
  emptySlotCollapseMs: number;
}

export const MONETAG_CAP_BOUNDS = {
  popunderCooldownMinutes: { min: 1, max: 1440, defaultVal: 30 },
  popunderMaxPerDay: { min: 0, max: 20, defaultVal: 3 },
  interstitialCooldownSeconds: { min: 15, max: 3600, defaultVal: 180 },
  interstitialMaxPerDay: { min: 0, max: 50, defaultVal: 12 },
  pushDelaySeconds: { min: 5, max: 600, defaultVal: 60 },
  pushMinVisits: { min: 1, max: 20, defaultVal: 2 },
  pushDeclineDays: { min: 1, max: 365, defaultVal: 30 },
  emptySlotCollapseMs: { min: 500, max: 15000, defaultVal: 4000 },
} as const;

export const MONETAG_DEFAULT_CAPS: MonetagRuntimeCaps = {
  popunderCooldownMs: MONETAG_CAP_BOUNDS.popunderCooldownMinutes.defaultVal * 60_000,
  popunderMaxPerDay: MONETAG_CAP_BOUNDS.popunderMaxPerDay.defaultVal,
  interstitialCooldownMs: MONETAG_CAP_BOUNDS.interstitialCooldownSeconds.defaultVal * 1000,
  interstitialMaxPerDay: MONETAG_CAP_BOUNDS.interstitialMaxPerDay.defaultVal,
  pushDelayMs: MONETAG_CAP_BOUNDS.pushDelaySeconds.defaultVal * 1000,
  pushMinVisits: MONETAG_CAP_BOUNDS.pushMinVisits.defaultVal,
  pushDeclineDays: MONETAG_CAP_BOUNDS.pushDeclineDays.defaultVal,
  emptySlotCollapseMs: MONETAG_CAP_BOUNDS.emptySlotCollapseMs.defaultVal,
};

export function clampMonetagCap(key: keyof typeof MONETAG_CAP_BOUNDS, raw: unknown): number {
  const bounds = MONETAG_CAP_BOUNDS[key];
  const n = Number(raw);
  if (!Number.isFinite(n)) return bounds.defaultVal;
  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(n)));
}

export function sanitizeMonetagCapsPolicy(raw: Partial<Record<keyof typeof MONETAG_CAP_BOUNDS, unknown>> | null | undefined): MonetagAdCapsPolicy {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    popunderCooldownMinutes: clampMonetagCap('popunderCooldownMinutes', input.popunderCooldownMinutes),
    popunderMaxPerDay: clampMonetagCap('popunderMaxPerDay', input.popunderMaxPerDay),
    interstitialCooldownSeconds: clampMonetagCap('interstitialCooldownSeconds', input.interstitialCooldownSeconds),
    interstitialMaxPerDay: clampMonetagCap('interstitialMaxPerDay', input.interstitialMaxPerDay),
    pushDelaySeconds: clampMonetagCap('pushDelaySeconds', input.pushDelaySeconds),
    pushMinVisits: clampMonetagCap('pushMinVisits', input.pushMinVisits),
    pushDeclineDays: clampMonetagCap('pushDeclineDays', input.pushDeclineDays),
    emptySlotCollapseMs: clampMonetagCap('emptySlotCollapseMs', input.emptySlotCollapseMs),
  };
}

export function toRuntimeCaps(caps: MonetagAdCapsPolicy): MonetagRuntimeCaps {
  return {
    popunderCooldownMs: caps.popunderCooldownMinutes * 60_000,
    popunderMaxPerDay: caps.popunderMaxPerDay,
    interstitialCooldownMs: caps.interstitialCooldownSeconds * 1000,
    interstitialMaxPerDay: caps.interstitialMaxPerDay,
    pushDelayMs: caps.pushDelaySeconds * 1000,
    pushMinVisits: caps.pushMinVisits,
    pushDeclineDays: caps.pushDeclineDays,
    emptySlotCollapseMs: caps.emptySlotCollapseMs,
  };
}

export function sanitizeMonetagZoneIdStrict(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[A-Za-z0-9_-]{1,32}$/.test(trimmed) ? trimmed : null;
}

export function sanitizeMonetagVerificationIdStrict(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

export const SHOW_FN_SEGMENT_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]{0,31}$/;

/**
 * Case-sensitive & case-insensitive blocklists for dynamic rewarded callback resolution.
 * Prevents prototype pollution, browser global/BOM/DOM sink resolution, code execution,
 * network/storage exfiltration, and reflection APIs.
 */
export const FORBIDDEN_SHOW_FN_SEGMENTS = new Set([
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__dirname',
  '__filename',
  'prototype',
  'constructor',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'eval',
  'Function',
  'AsyncFunction',
  'GeneratorFunction',
  'AsyncGeneratorFunction',
  'Object',
  'Array',
  'Proxy',
  'Reflect',
  'Symbol',
  'BigInt',
  'String',
  'Number',
  'Boolean',
  'Promise',
  'RegExp',
  'Error',
  'JSON',
  'WeakRef',
  'FinalizationRegistry',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'queueMicrotask',
  'execScript',
  'alert',
  'confirm',
  'prompt',
  'print',
  'focus',
  'blur',
  'find',
  'stop',
  'fetch',
  'XMLHttpRequest',
  'sendBeacon',
  'EventSource',
  'RTCPeerConnection',
  'WebTransport',
  'Request',
  'Response',
  'Headers',
  'URL',
  'URLSearchParams',
  'Blob',
  'File',
  'FileReader',
  'FormData',
  'atob',
  'btoa',
  'open',
  'close',
  'opener',
  'frameElement',
  'location',
  'assign',
  'replace',
  'reload',
  'href',
  'origin',
  'document',
  'documentElement',
  'body',
  'head',
  'scripts',
  'styleSheets',
  'domain',
  'referrer',
  'cookie',
  'cookieStore',
  'caches',
  'createElement',
  'createRange',
  'createContextualFragment',
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'write',
  'writeln',
  'append',
  'appendChild',
  'src',
  'srcdoc',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'window',
  'self',
  'top',
  'parent',
  'frames',
  'globalThis',
  'global',
  'navigator',
  'serviceWorker',
  'ServiceWorker',
  'Notification',
  'Permissions',
  'clipboard',
  'Clipboard',
  'geolocation',
  'credentials',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'history',
  'pushState',
  'replaceState',
  'crypto',
  'postMessage',
  'importScripts',
  'WebSocket',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  'defineProperty',
  'defineProperties',
  'getOwnPropertyDescriptor',
  'getPrototypeOf',
  'setPrototypeOf',
  'freeze',
  'seal',
  'parse',
  'stringify',
  'Buffer',
  'process',
  'require',
  'module',
  'exports',
  'caller',
  'callee',
  'arguments',
  'apply',
  'call',
  'bind',
  'name',
  'length',
  'escape',
  'unescape',
  'encodeURI',
  'encodeURIComponent',
  'decodeURI',
  'decodeURIComponent',
  'isFinite',
  'isNaN',
  'parseFloat',
  'parseInt',
  'structuredClone',
  'reportError',
  'fetchLater',
  'openDatabase',
  'getComputedStyle',
  'matchMedia',
  'getSelection',
  'scrollTo',
  'scrollBy',
  'moveTo',
  'resizeTo',
  'trustedTypes',
  'customElements',
  'performance',
  'Intl',
  'WebAssembly',
  'Atomics',
  'SharedArrayBuffer',
  'ArrayBuffer',
  'DataView',
  'WeakMap',
  'WeakSet',
  'Map',
  'Set',
  'Date',
  'Math',
  'ShadowRoot',
  'MutationObserver',
  'ResizeObserver',
  'IntersectionObserver',
  'PerformanceObserver',
  'DOMParser',
  'XMLSerializer',
  'Range',
  'Selection',
  'subtle',
  'inspect',
]);

export const FORBIDDEN_SHOW_FN_LOWER = new Set(
  [
    ...Array.from(FORBIDDEN_SHOW_FN_SEGMENTS).map((s) => s.toLowerCase()),
    'this',
    'super',
    'class',
    'import',
    'export',
    'await',
    'async',
    'delete',
    'typeof',
    'void',
    'new',
    'in',
    'instanceof',
    'return',
    'throw',
    'try',
    'catch',
    'finally',
    'with',
    'yield',
    'let',
    'const',
    'var',
    'if',
    'else',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'break',
    'continue',
    'default',
    'debugger',
    'enum',
    'extends',
    'implements',
    'interface',
    'package',
    'private',
    'protected',
    'public',
    'static',
    'null',
    'undefined',
    'true',
    'false',
  ]
);

export function isForbiddenShowFnSegment(seg: string): boolean {
  if (!SHOW_FN_SEGMENT_REGEX.test(seg)) return true;
  if (/^[_$]+$/.test(seg)) return true;
  if (/^__.*__$/.test(seg)) return true;
  if (FORBIDDEN_SHOW_FN_SEGMENTS.has(seg)) return true;
  if (FORBIDDEN_SHOW_FN_LOWER.has(seg.toLowerCase())) return true;
  return false;
}

export function validateShowFnSegment(seg: string): boolean {
  return !isForbiddenShowFnSegment(seg);
}

export function isValidShowFnIdentifier(fnName: string): boolean {
  if (typeof fnName !== 'string') return false;
  const trimmed = fnName.trim();
  if (!trimmed || trimmed.length > 64) return false;
  const parts = trimmed.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => validateShowFnSegment(part));
}

const ALLOWED_SCRIPT_ATTRS = new Set([
  'src',
  'async',
  'defer',
  'type',
  'data-zone',
  'data-cfasync',
  'crossorigin',
  'referrerpolicy',
  'charset',
  'nomodule',
]);

const ALLOWED_SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript']);
const ALLOWED_CROSSORIGIN = new Set(['', 'anonymous', 'use-credentials']);
const ALLOWED_REFERRER_POLICY = new Set([
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'strict-origin',
  'strict-origin-when-downgrade',
  'same-origin',
]);

const SNIPPET_OBFUSCATION_PATTERNS: RegExp[] = [
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/, // Control chars / null byte
  /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/, // Zero-width / bidi chars
  /&#(?:x[0-9a-f]+|\d+);/i, // Numeric HTML entities
  /&(?:colon|tab|newline);/i, // Named control HTML entities
  /\\(?:x[0-9a-f]{2}|u[0-9a-f]{4}|u\{[0-9a-f]+\}|[0-7]{1,3})/i, // JS hex/unicode/octal escapes
  /<!--|-->/, // HTML comments
];

const SNIPPET_DISALLOWED_INLINE_PATTERNS: RegExp[] = [
  /\b(?:javascript|vbscript)\s*:/i,
  /\bdata\s*:\s*(?:text\/html|application\/|image\/svg)/i,
  /\bblob\s*:/i,
  /<(?!\/?script\b)[a-z!?/]/i, // Any non-<script> HTML tag
  /\bon[a-z]{2,}\s*=/i, // Event handler attributes
  /\$\{/, // Template literal interpolation
  /\[\s*['"`]/, // Computed bracket string property access (e.g. win['eval'], ('')['sub']['constructor'])
  /\b(?:eval|Function|AsyncFunction|GeneratorFunction|AsyncGeneratorFunction|execScript|setTimeout|setInterval|setImmediate|importScripts)\s*(?:\(|`)/,
  /\bnew\s+(?:Function|Proxy|WebSocket|Worker|SharedWorker|BroadcastChannel|EventSource|XMLHttpRequest|ActiveXObject|DOMParser|XMLSerializer)\b/i,
  /\b(?:Reflect|Proxy|DOMParser|XMLSerializer|ShadowRoot|MutationObserver|WebAssembly|trustedTypes|customElements)\b/,
  /\bimport\s*(?:\(|['"`])/i,
  /(?:^|[^\w$])(?:__proto__|prototype|constructor|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__)\b/,
  /\bString\s*\.\s*(?:fromCharCode|fromCodePoint)\b/,
  /\b(?:atob|unescape|decodeURI|decodeURIComponent)\s*\(/,
  /\b(?:fetch|fetchLater|XMLHttpRequest|sendBeacon|EventSource|WebSocket)\b/,
  /\b(?:window|self|top|parent|frames|globalThis|document|localStorage|sessionStorage|indexedDB|caches|cookieStore|navigator|history)\s*(?:\[|\.)/,
  /\blocation\s*(?:\[|\.\s*(?:assign|replace|reload|href))/,
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|srcdoc|cookie)\s*(?:=|\+=)/,
  /\blocation\s*(?:=|\+=)/,
  /\b(?:localStorage|sessionStorage|indexedDB|cookieStore)\b/i,
  /\bwith\s*\(/,
];

function validateScriptAttributes(attrText: string): { hasSrc: boolean } {
  const seenAttrs = new Set<string>();
  let hasSrc = false;
  let cursor = 0;
  const attrRegex = /\s*([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?\s*/y;

  while (cursor < attrText.length) {
    attrRegex.lastIndex = cursor;
    const match = attrRegex.exec(attrText);
    if (!match || match[0].length === 0) {
      throw new Error('Rewarded snippet contains disallowed inline attributes.');
    }
    cursor = attrRegex.lastIndex;

    const attrName = match[1].toLowerCase();
    const attrVal = match[2] ?? match[3] ?? match[4] ?? '';

    if (attrName.startsWith('on') || !ALLOWED_SCRIPT_ATTRS.has(attrName) || seenAttrs.has(attrName)) {
      throw new Error('Rewarded snippet contains disallowed inline attributes.');
    }
    seenAttrs.add(attrName);

    if (/<|>|`|\r|\n/.test(attrVal)) {
      throw new Error('Rewarded snippet contains disallowed inline patterns.');
    }

    if (attrName === 'src') {
      if (!isSafeMonetagZoneUrl(attrVal)) {
        throw new Error('Rewarded snippet script src must use an approved HTTPS Monetag domain.');
      }
      hasSrc = true;
    } else if (attrName === 'type') {
      if (!ALLOWED_SCRIPT_TYPES.has(attrVal.trim().toLowerCase())) {
        throw new Error('Rewarded snippet contains disallowed inline script type.');
      }
    } else if (attrName === 'data-zone') {
      if (!sanitizeMonetagZoneIdStrict(attrVal)) {
        throw new Error('Rewarded snippet data-zone attribute is invalid.');
      }
    } else if (attrName === 'data-cfasync') {
      const norm = attrVal.trim().toLowerCase();
      if (norm !== 'true' && norm !== 'false') {
        throw new Error('Rewarded snippet data-cfasync attribute is invalid.');
      }
    } else if (attrName === 'crossorigin') {
      if (!ALLOWED_CROSSORIGIN.has(attrVal.trim().toLowerCase())) {
        throw new Error('Rewarded snippet crossorigin attribute is invalid.');
      }
    } else if (attrName === 'referrerpolicy') {
      if (!ALLOWED_REFERRER_POLICY.has(attrVal.trim().toLowerCase())) {
        throw new Error('Rewarded snippet referrerpolicy attribute is invalid.');
      }
    } else if (attrName === 'async' || attrName === 'defer' || attrName === 'nomodule') {
      const norm = attrVal.trim().toLowerCase();
      if (norm !== '' && norm !== 'true' && norm !== attrName) {
        throw new Error('Rewarded snippet boolean attribute is invalid.');
      }
    } else if (attrName === 'charset') {
      if (!/^[a-z0-9_-]{2,20}$/i.test(attrVal.trim())) {
        throw new Error('Rewarded snippet charset attribute is invalid.');
      }
    }
  }

  return { hasSrc };
}

function assertSafeInlineScriptContent(code: string): void {
  if (/<\/?script\b/i.test(code)) {
    throw new Error('Rewarded snippet inline code must not contain nested <script> tags.');
  }
  for (const pat of SNIPPET_OBFUSCATION_PATTERNS) {
    if (pat.test(code)) {
      throw new Error('Rewarded snippet contains disallowed inline encoding or control patterns.');
    }
  }
  for (const pat of SNIPPET_DISALLOWED_INLINE_PATTERNS) {
    if (pat.test(code)) {
      throw new Error('Rewarded snippet contains disallowed inline patterns.');
    }
  }
}

export function isSafeInlineAdSnippet(code: unknown): boolean {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  try {
    assertSafeInlineScriptContent(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function validateRewardedSnippetStrict(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') {
    throw new Error('Rewarded snippet must be a string.');
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4096) {
    throw new Error('Rewarded snippet must be 4096 characters or fewer.');
  }

  for (const pat of SNIPPET_OBFUSCATION_PATTERNS) {
    if (pat.test(trimmed)) {
      throw new Error('Rewarded snippet contains disallowed inline encoding or control patterns.');
    }
  }

  const hasAnyTagSyntax = /<\/?[a-z!?/]/i.test(trimmed);
  if (hasAnyTagSyntax) {
    const scriptTagRegex = /<script\b([^<>]*)>([\s\S]*?)<\/script>/gi;
    let lastIndex = 0;
    let tagCount = 0;
    let match: RegExpExecArray | null;

    while ((match = scriptTagRegex.exec(trimmed)) !== null) {
      const between = trimmed.slice(lastIndex, match.index);
      if (between.trim().length > 0) {
        throw new Error('Rewarded snippet contains disallowed inline markup outside <script> tags.');
      }
      lastIndex = scriptTagRegex.lastIndex;
      tagCount += 1;
      if (tagCount > 3) {
        throw new Error('Rewarded snippet may contain at most 3 <script> tags.');
      }

      const attrs = match[1] || '';
      const body = match[2] || '';
      const { hasSrc } = validateScriptAttributes(attrs);

      if (hasSrc && body.trim().length > 0) {
        throw new Error('Rewarded snippet external <script src> tag must not contain inline code.');
      }
      if (!hasSrc && body.trim().length > 0) {
        assertSafeInlineScriptContent(body);
      }
    }

    const trailing = trimmed.slice(lastIndex);
    if (tagCount === 0 || trailing.trim().length > 0) {
      throw new Error('Rewarded snippet contains disallowed inline HTML tags.');
    }
    return trimmed;
  }

  assertSafeInlineScriptContent(trimmed);
  return trimmed;
}

