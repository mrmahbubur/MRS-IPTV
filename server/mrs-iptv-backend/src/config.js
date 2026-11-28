// Central configuration. Everything tunable lives here or in .env (see .env.example).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
try { process.loadEnvFile(); } catch { /* no .env file – environment variables only */ }

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const boundedInt = (v, d, min, max) => {
  if (v === undefined || v === '') return d;
  const n = Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
};
const num = (v, d) => (v === undefined || v === '' ? d : Number.parseFloat(v));
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);
const validId = (v, re, fallback, label) => {
  const s = String(v || '').trim();
  if (!s) return fallback;
  if (re.test(s)) return s;
  console.warn(`[Config] Ignoring invalid ${label}; falling back to default.`);
  return fallback;
};

// ---------------------------------------------------------------------------
// Plans. Prices are the ones shown in the VIP Pass modal.
// BDT is used for bKash / Nagad. USD is used for Binance Pay, Skrill, Payoneer.
// ---------------------------------------------------------------------------
export const PLANS = {
  '1m':  { id: '1m',  months: 1,  durationDays: 30,  label: '1 Month',   prices: { BDT: 110,  USD: 1 } },
  '2m':  { id: '2m',  months: 2,  durationDays: 60,  label: '2 Months',  prices: { BDT: 210,  USD: 2 } },
  '6m':  { id: '6m',  months: 6,  durationDays: 180, label: '6 Months',  prices: { BDT: 610,  USD: 6 } },
  '12m': { id: '12m', months: 12, durationDays: 365, label: '12 Months', prices: { BDT: 1220, USD: 12 } },
};
export const PLAN_IDS = Object.keys(PLANS);

// ---------------------------------------------------------------------------
// Payment channels.
//  senderMatch: the payer's number in the receiving SMS must equal the
//               WhatsApp/mobile number typed in the checkout form.
// ---------------------------------------------------------------------------
export const CHANNELS = {
  bkash:    { id: 'bkash',    label: 'bKash Personal',  currency: 'BDT', regions: ['BD'],         senderMatch: true  },
  nagad:    { id: 'nagad',    label: 'Nagad Personal',  currency: 'BDT', regions: ['BD'],         senderMatch: true  },
  binance:  { id: 'binance',  label: 'Binance Pay',     currency: 'USD', regions: ['BD', 'INTL'], senderMatch: false },
  skrill:   { id: 'skrill',   label: 'Skrill',          currency: 'USD', regions: ['INTL'],       senderMatch: false },
  payoneer: { id: 'payoneer', label: 'Payoneer',        currency: 'USD', regions: ['INTL'],       senderMatch: false },
};

const production = env.NODE_ENV === 'production';
const isRender = Boolean(env.RENDER || env.RENDER_EXTERNAL_URL || env.RENDER_SERVICE_ID || env.RENDER_INSTANCE_ID);
const dataDir = String(env.DATA_DIR || '').trim();
const dbPath = env.DB_PATH || (dataDir ? path.join(dataDir, 'mrs.sqlite') : 'data/mrs.sqlite');
const renderExternalUrl = String(env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
const appUrl = String(env.APP_URL || '').trim().replace(/\/+$/, '');
const siteUrlEnv = String(env.SITE_URL || '').trim().replace(/\/+$/, '');
const ephemeralSecrets = new Map();
let persistedSecretsCache = null;

const runtimeSecret = (name) => {
  if (ephemeralSecrets.has(name)) return ephemeralSecrets.get(name);
  const useMemoryOnly = env.NODE_ENV === 'test' || dbPath === ':memory:';
  const secretsFile = path.join(path.dirname(path.resolve(dbPath)), '.runtime-secrets.json');

  if (!useMemoryOnly) {
    if (!persistedSecretsCache) {
      try {
        persistedSecretsCache = fs.existsSync(secretsFile)
          ? JSON.parse(fs.readFileSync(secretsFile, 'utf8'))
          : {};
      } catch {
        persistedSecretsCache = {};
      }
    }
    if (typeof persistedSecretsCache[name] === 'string' && persistedSecretsCache[name].length >= 32) {
      ephemeralSecrets.set(name, persistedSecretsCache[name]);
      return persistedSecretsCache[name];
    }
  }

  const generated = randomBytes(32).toString('hex');
  ephemeralSecrets.set(name, generated);

  if (!useMemoryOnly) {
    try {
      persistedSecretsCache[name] = generated;
      fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
      fs.writeFileSync(secretsFile, JSON.stringify(persistedSecretsCache, null, 2), { mode: 0o600 });
    } catch {
      // Fall back to in-memory secret if filesystem is read-only
    }
  }

  return generated;
};

export const config = {
  production,
  isRender,
  port: int(env.PORT, 8787),
  host: env.HOST || '0.0.0.0',
  dbPath,
  uploadDir: env.UPLOAD_DIR || (dataDir ? path.join(dataDir, 'uploads') : 'data/uploads'),
  siteOrigins: Array.from(new Set([
    ...list(env.SITE_ORIGINS, ['https://shahin-iptv.ai.studio']),
    ...(renderExternalUrl ? [renderExternalUrl] : []),
    ...(appUrl ? [appUrl] : []),
    ...(siteUrlEnv ? [siteUrlEnv] : []),
  ])),
  trustProxy: int(env.TRUST_PROXY, (isRender || production) ? 1 : 0),

  adminToken: env.ADMIN_TOKEN || runtimeSecret('admin'),
  ingestKey: env.INGEST_KEY || runtimeSecret('ingest'),
  smsWebhookSecret: env.SMS_WEBHOOK_SECRET || env.INGEST_KEY || runtimeSecret('ingest'),
  tokenSecret: env.TOKEN_SECRET || runtimeSecret('token'),
  securitySecret: env.SECURITY_SECRET || runtimeSecret('security'),
  internalWebhookSecret: env.INTERNAL_WEBHOOK_SECRET || runtimeSecret('internal-webhook'),
  orderTtlMinutes: int(env.ORDER_TTL_MINUTES, 60),

  // Activation codes
  codeLength: int(env.CODE_LENGTH, 10),
  codeFormat: env.CODE_FORMAT || 'mrs', // mrs (MRS-1M-XXXX-XXXX-XXXX) | numeric (10-digit)
  autoRefill: bool(env.AUTO_REFILL_CODES, false),
  refillBatch: int(env.REFILL_BATCH, 200),
  lowStockThreshold: int(env.LOW_STOCK_THRESHOLD, 50),
  defaultDeviceLimit: int(env.DEFAULT_DEVICE_LIMIT, 2),
  expiryFrom: env.EXPIRY_FROM === 'issue' ? 'issue' : 'activation', // when the plan clock starts

  // Verification policy
  pendingTtlHours: int(env.PENDING_TTL_HOURS, 48),          // how long we wait for a payment to show up
  paymentMaxAgeHours: int(env.PAYMENT_MAX_AGE_HOURS, 72),   // a payment older than this (vs. the order) goes to manual review
  amountTolerancePct: num(env.AMOUNT_TOLERANCE_PCT, 0),
  emailMxCheck: bool(env.EMAIL_MX_CHECK, true),
  maxOrdersPerEmailPerDay: int(env.MAX_ORDERS_PER_EMAIL_PER_DAY, 6),
  maxScreenshotBytes: int(env.MAX_SCREENSHOT_BYTES, 3 * 1024 * 1024),

  checkoutShield: {
    requireChallenge: bool(env.CHECKOUT_CHALLENGE_REQUIRED, env.NODE_ENV !== 'test'),
    difficulty: Math.max(8, Math.min(16, int(env.CHECKOUT_POW_DIFFICULTY, 10))),
    turnstileSiteKey: String(env.TURNSTILE_SITE_KEY || '').trim(),
    turnstileSecretKey: String(env.TURNSTILE_SECRET_KEY || '').trim(),
    hcaptchaSiteKey: String(env.HCAPTCHA_SITE_KEY || '').trim(),
    hcaptchaSecretKey: String(env.HCAPTCHA_SECRET_KEY || '').trim(),
  },

  // Receiving accounts served dynamically to front end via GET /api/payment-methods
  receivingAccounts: {
    bkash: {
      account: env.RECEIVING_BKASH || '01810853282',
      accountType: env.RECEIVING_BKASH_TYPE || 'Personal (Send Money)',
    },
    nagad: {
      account: env.RECEIVING_NAGAD || '+8801792322734',
      accountType: env.RECEIVING_NAGAD_TYPE || 'Personal (Send Money)',
    },
    binance: {
      uid: env.RECEIVING_BINANCE_UID || '38927942',
      payId: env.RECEIVING_BINANCE_ID || 'mrxshahin',
      accountType: 'Binance Pay UID / Pay ID',
    },
    skrill: {
      account: env.RECEIVING_SKRILL || '407108385',
      email: env.RECEIVING_SKRILL_EMAIL || '',
      accountType: 'Skrill Customer ID',
    },
    payoneer: {
      account: env.RECEIVING_PAYONEER || '108003450',
      accountType: 'Payoneer Customer ID',
    },
  },

  ingest: {
    smsSenders: {
      bkash: list(env.BKASH_SMS_SENDERS, ['bKash']),
      nagad: list(env.NAGAD_SMS_SENDERS, ['NAGAD', 'Nagad']),
    },
    emailDomains: {
      skrill: list(env.SKRILL_EMAIL_DOMAINS, ['skrill.com']),
      payoneer: list(env.PAYONEER_EMAIL_DOMAINS, ['payoneer.com']),
    },
    requireDkim: bool(env.INGEST_REQUIRE_DKIM, true),
  },

  providers: {
    bkash: {
      enabled: bool(env.BKASH_MERCHANT_ENABLED, false),
      webhookSecret: env.BKASH_WEBHOOK_SECRET || '',
    },
    nagad: {
      enabled: bool(env.NAGAD_MERCHANT_ENABLED, false),
      webhookSecret: env.NAGAD_WEBHOOK_SECRET || '',
    },
    binance: {
      enabled: bool(env.BINANCE_WEBHOOK_ENABLED, false),
      webhookSecret: env.BINANCE_WEBHOOK_SECRET || '',
      webhookPublicKey: env.BINANCE_WEBHOOK_PUBLIC_KEY || '',
    },
    skrill: {
      enabled: bool(env.SKRILL_WEBHOOK_ENABLED, false),
      merchantId: env.SKRILL_MERCHANT_ID || '',
      secretWord: env.SKRILL_SECRET_WORD || '',
      payToEmail: env.SKRILL_PAY_TO_EMAIL || '',
    },
    payoneer: {
      enabled: bool(env.PAYONEER_WEBHOOK_ENABLED, false),
      webhookSecret: env.PAYONEER_WEBHOOK_SECRET || '',
    },
  },

  binance: {
    key: env.BINANCE_API_KEY || '',
    secret: env.BINANCE_API_SECRET || '',
    baseUrl: env.BINANCE_API_BASE || 'https://api.binance.com',
    pollSeconds: int(env.BINANCE_POLL_SECONDS, 60),
    lookbackHours: int(env.BINANCE_LOOKBACK_HOURS, 72),
    orderTypes: list(env.BINANCE_ORDER_TYPES, ['C2C', 'PAY']),
    stableAssets: list(env.BINANCE_ACCEPTED_ASSETS, ['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD']),
    // A Binance nickname is not unique/secret, so nickname-only claims are
    // sent to manual review unless you explicitly turn this on.
    nicknameAuto: bool(env.BINANCE_NICKNAME_AUTO, false),
  },

  mail: (() => {
    const cleanPass = (() => {
      let p = String(env.SMTP_PASS || '').trim();
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        p = p.slice(1, -1).trim();
      }
      const noSpace = p.replace(/\s+/g, '');
      if (noSpace.length === 16 && !noSpace.includes('@')) p = noSpace;
      if (!p || p === 'your-app-password-here' || p.length < 6) return '';
      return p;
    })();
    const smtpUser = String(env.SMTP_USER || '').trim();
    const rawAdmin = String(env.ADMIN_EMAIL || 'mr216873@gmail.com').trim();
    const adminMatch = rawAdmin.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const adminEmail = adminMatch ? adminMatch[0].toLowerCase() : 'mr216873@gmail.com';
    const inferredHost = env.SMTP_HOST || (smtpUser.toLowerCase().includes('@gmail.com') ? 'smtp.gmail.com' : '');
    const inferredPort = int(env.SMTP_PORT, inferredHost.includes('gmail') ? 587 : 587);
    const hasSmtpCreds = Boolean(inferredHost && smtpUser && cleanPass);
    return {
      transport: env.MAIL_TRANSPORT || (hasSmtpCreds ? 'smtp' : 'console'), // smtp | console | json
      host: inferredHost,
      port: inferredPort,
      user: smtpUser,
      pass: cleanPass,
      adminEmail,
      sendSubmissionCopy: bool(env.SEND_SUBMISSION_COPY, true),
      from: env.MAIL_FROM || (smtpUser ? `M R S IPTV <${smtpUser}>` : 'M R S IPTV <no-reply@mrs-iptv.local>'),
      replyTo: env.MAIL_REPLY_TO || smtpUser || '',
      maxAttempts: int(env.MAIL_MAX_ATTEMPTS, 8),
    };
  })(),

  brand: {
    name: 'M R S IPTV',
    tagline: 'TV NETWORK',
    siteUrl: siteUrlEnv || appUrl || renderExternalUrl || 'https://shahin-iptv.ai.studio',
    supportWhatsApp: env.SUPPORT_WHATSAPP || '+8801810853282',
    supportTelegram: env.SUPPORT_TELEGRAM || 'https://t.me/mrsiptv',
    supportFacebook: env.SUPPORT_FACEBOOK || 'https://facebook.com/mrsiptv',
  },

  // Live-channel verification engine (mrs-iptv-backend livecheck)
  checker: {
    sourcesFile: env.SOURCES_FILE || 'data/sources.json',
    concurrency: int(env.CHECK_CONCURRENCY, 4),
    timeoutMs: int(env.CHECK_TIMEOUT_MS, 5000),
    liveRecheckMs: int(env.LIVE_RECHECK_MIN, 10) * 60000,
    deadRecheckMs: int(env.DEAD_RECHECK_MIN, 360) * 60000,
    failThreshold: int(env.FAIL_THRESHOLD, 2),
    freshnessCheck: bool(env.FRESHNESS_CHECK, true),
    freshnessMaxWaitMs: int(env.FRESHNESS_MAX_WAIT_MS, 12000),
    acceptVod: bool(env.ACCEPT_VOD, false),
    allowPrivateNetworks: bool(env.ALLOW_PRIVATE_NETWORKS, false),
    tickMs: int(env.CHECK_TICK_SEC, 30) * 1000,
    batchSize: int(env.CHECK_BATCH, 40),
    perHostLimit: int(env.CHECK_PER_HOST, 1),
    batchSleepMs: int(env.CHECK_BATCH_SLEEP_MS, 2000),
    userAgent: env.CHECK_USER_AGENT || 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  },

  // 1-Hour Rewarded VIP & Ad Gate configuration
  rewards: {
    durationMinutes: boundedInt(env.REWARD_DURATION_MINUTES, 60, 1, 1440),
    minWatchMs: boundedInt(env.REWARD_MIN_WATCH_MS, 15000, 1000, 300000),
    cooldownMinutes: boundedInt(env.REWARD_COOLDOWN_MINUTES, 180, 0, 1440),
    maxPerDevicePerDay: boundedInt(env.REWARD_MAX_PER_DEVICE_PER_DAY, 3, 0, 100),
    maxPerIpPerDay: boundedInt(env.REWARD_MAX_PER_IP_PER_DAY, 6, 0, 500),
    maxStartsPerIpPerHour: boundedInt(env.REWARD_MAX_STARTS_PER_IP_PER_HOUR, 20, 1, 1000),
    requirePostback: bool(env.REWARD_REQUIRE_POSTBACK, false),
    unlocksVipChannels: bool(env.REWARD_UNLOCKS_VIP_CHANNELS, true),
    monetagPostbackSecret: env.MONETAG_POSTBACK_SECRET || '',
    adsTestMode: bool(env.ADS_TEST_MODE, true),
    monetagVerificationId: validId(env.MONETAG_VERIFICATION_ID, /^[A-Za-z0-9_-]{8,64}$/, 'fa9656182dbc7301dcd9a2326441dcf3', 'MONETAG_VERIFICATION_ID'),
    monetagVignetteZoneId: validId(env.MONETAG_VIGNETTE_ZONE_ID, /^[A-Za-z0-9_-]{1,32}$/, '11242067', 'MONETAG_VIGNETTE_ZONE_ID'),
    monetagInterstitialZoneId: validId(env.MONETAG_INTERSTITIAL_ZONE_ID || env.MONETAG_VIGNETTE_ZONE_ID, /^[A-Za-z0-9_-]{1,32}$/, '11242067', 'MONETAG_INTERSTITIAL_ZONE_ID'),
    monetagPopunderZoneId: validId(env.MONETAG_POPUNDER_ZONE_ID, /^[A-Za-z0-9_-]{1,32}$/, '11226634', 'MONETAG_POPUNDER_ZONE_ID'),
    monetagShowRegularAds: bool(env.MONETAG_SHOW_REGULAR_ADS, false),
    monetagBannerEnabled: bool(env.MONETAG_BANNER_ENABLED, true),
    monetagStickyEnabled: bool(env.MONETAG_STICKY_ENABLED, true),
    monetagPopunderEnabled: bool(env.MONETAG_POPUNDER_ENABLED, false),
    monetagInterstitialEnabled: bool(env.MONETAG_INTERSTITIAL_ENABLED, false),
    monetagPushEnabled: bool(env.MONETAG_PUSH_ENABLED, false),
    monetagPopunderCooldownMinutes: boundedInt(env.MONETAG_POPUNDER_COOLDOWN_MINUTES, 30, 1, 1440),
    monetagPopunderMaxPerDay: boundedInt(env.MONETAG_POPUNDER_MAX_PER_DAY, 3, 0, 20),
    monetagInterstitialCooldownSeconds: boundedInt(env.MONETAG_INTERSTITIAL_COOLDOWN_SECONDS, 180, 15, 3600),
    monetagInterstitialMaxPerDay: boundedInt(env.MONETAG_INTERSTITIAL_MAX_PER_DAY, 12, 0, 50),
    monetagPushDelaySeconds: boundedInt(env.MONETAG_PUSH_DELAY_SECONDS, 60, 5, 600),
    monetagPushMinVisits: boundedInt(env.MONETAG_PUSH_MIN_VISITS, 2, 1, 20),
    monetagPushDeclineDays: boundedInt(env.MONETAG_PUSH_DECLINE_DAYS, 30, 1, 365),
    monetagEmptySlotCollapseMs: boundedInt(env.MONETAG_EMPTY_SLOT_COLLAPSE_MS, 4000, 500, 15000),
    monetagRewardedEnabled: bool(env.MONETAG_REWARDED_ENABLED, false),
    monetagRewardedSnippet: String(env.MONETAG_REWARDED_SNIPPET || '').trim(),
    monetagRewardedShowFn: validId(env.MONETAG_REWARDED_SHOW_FN, /^[A-Za-z_$][A-Za-z0-9_$]{0,31}(\.[A-Za-z_$][A-Za-z0-9_$]{0,31}){0,3}$/, '', 'MONETAG_REWARDED_SHOW_FN'),
    monetagRewardedZoneId: validId(env.MONETAG_REWARDED_ZONE_ID, /^[A-Za-z0-9_-]{1,32}$/, '', 'MONETAG_REWARDED_ZONE_ID'),
  },
};

if (production) {
  if (config.mail.transport === 'console') {
    console.warn('[Notice] SMTP_* not configured; activation emails will be logged to console/database outbox.');
  }
}
