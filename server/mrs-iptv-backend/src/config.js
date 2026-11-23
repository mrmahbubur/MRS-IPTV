// Central configuration. Everything tunable lives here or in .env (see .env.example).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
try { process.loadEnvFile(); } catch { /* no .env file – environment variables only */ }

const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const num = (v, d) => (v === undefined || v === '' ? d : Number.parseFloat(v));
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);

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
const dbPath = env.DB_PATH || 'data/mrs.sqlite';
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
  port: int(env.PORT, 8787),
  host: env.HOST || '0.0.0.0',
  dbPath,
  uploadDir: env.UPLOAD_DIR || 'data/uploads',
  siteOrigins: list(env.SITE_ORIGINS, ['https://shahin-iptv.ai.studio']),
  trustProxy: int(env.TRUST_PROXY, 0),

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
    siteUrl: env.SITE_URL || 'https://shahin-iptv.ai.studio',
    supportWhatsApp: env.SUPPORT_WHATSAPP || '+8801810853282',
    supportTelegram: env.SUPPORT_TELEGRAM || 'https://t.me/mrsiptv',
    supportFacebook: env.SUPPORT_FACEBOOK || 'https://facebook.com/mrsiptv',
  },

  // Live-channel verification engine (mrs-iptv-backend livecheck)
  checker: {
    sourcesFile: env.SOURCES_FILE || 'data/sources.json',
    concurrency: int(env.CHECK_CONCURRENCY, 6),
    timeoutMs: int(env.CHECK_TIMEOUT_MS, 5000),
    liveRecheckMs: int(env.LIVE_RECHECK_MIN, 10) * 60000,
    deadRecheckMs: int(env.DEAD_RECHECK_MIN, 360) * 60000,
    failThreshold: int(env.FAIL_THRESHOLD, 2),
    freshnessCheck: bool(env.FRESHNESS_CHECK, true),
    freshnessMaxWaitMs: int(env.FRESHNESS_MAX_WAIT_MS, 12000),
    acceptVod: bool(env.ACCEPT_VOD, false),
    allowPrivateNetworks: bool(env.ALLOW_PRIVATE_NETWORKS, false),
    tickMs: int(env.CHECK_TICK_SEC, 30) * 1000,
    batchSize: int(env.CHECK_BATCH, 60),
    perHostLimit: int(env.CHECK_PER_HOST, 2),
    userAgent: env.CHECK_USER_AGENT || 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  },
};

if (production) {
  if (config.mail.transport === 'console') {
    console.warn('[Notice] SMTP_* not configured; activation emails will be logged to console/database outbox.');
  }
}
