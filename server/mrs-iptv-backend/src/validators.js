// Format validation + normalisation of everything the customer types.
// NOTE: a well-formed Transaction ID proves nothing by itself. It is only the
// first gate; the real proof is a matching, unclaimed row in the ledger.
import dns from 'node:dns/promises';

const bad = (error) => ({ ok: false, error });

// ------------------------------ Email --------------------------------------
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc', 'throwawaymail.com', 'dispostable.com',
  'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'moakt.com', 'tempail.com', 'mohmal.com', 'burnermail.io',
]);
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeEmail(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return bad('Email address is required');
  if (value.length > 254 || !EMAIL_RE.test(value)) return bad('Enter a valid email address, e.g. you@gmail.com');
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return bad('Enter a valid email address, e.g. you@gmail.com');
  if (!/[a-z]{2,}$/.test(domain)) return bad('Enter a valid email address, e.g. you@gmail.com');
  if (DISPOSABLE.has(domain)) return bad('Disposable email addresses are not accepted. Use a real inbox so you receive your code.');
  return { ok: true, value, domain };
}

const KNOWN_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'yandex.com', 'zoho.com', 'gmx.com', 'mail.com',
]);
const NEGATIVE = new Set(['ENODATA', 'ENOTFOUND']);

async function lookupMail(resolver, domain) {
  const t = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 3000))]);
  try { if ((await t(resolver.resolveMx(domain))).length) return 'yes'; }
  catch (e) { if (!NEGATIVE.has(e.code)) return 'unknown'; }
  try { return (await t(resolver.resolve4(domain))).length ? 'yes' : 'no'; } // implicit-MX fallback
  catch (e) { return NEGATIVE.has(e.code) ? 'no' : 'unknown'; }
}

/**
 * True if the domain can receive mail. Fails OPEN: a customer is only blocked when DNS clearly says the
 * domain has no mail AND a canary lookup proves our own resolver works (a broken resolver must never block sales).
 */
export async function emailDomainCanReceive(domain, resolver = dns) {
  if (KNOWN_MAIL_DOMAINS.has(domain)) return true;
  if ((await lookupMail(resolver, domain)) !== 'no') return true;
  return (await lookupMail(resolver, 'gmail.com')) !== 'yes';
}

// ------------------------------ Phone --------------------------------------
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
  if (!s) return bad('WhatsApp / mobile number is required');
  let m;
  if ((m = s.match(/^(?:\+?88)?0(1[3-9]\d{8})$/)) || (m = s.match(/^\+?880(1[3-9]\d{8})$/))) {
    return { ok: true, e164: `+880${m[1]}`, last10: m[1], country: 'BD' };
  }
  if (!s.startsWith('+')) return bad('Enter a Bangladesh number (01XXXXXXXXX) or an international number starting with + and the country code');
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return bad('Enter a valid international number, e.g. +8801810853282');
  return { ok: true, e164: s, last10: s.slice(-10), country: 'INTL' };
}

// ------------------------- Transaction identifiers -------------------------
// Patterns match the hints in the checkout form. Tighten them if you see that
// your real receipts are always, say, exactly 10 characters.
const TRX_RULES = {
  bkash:    { re: /^[A-Z0-9]{8,10}$/, hint: 'bKash TrxID is 8–10 letters/digits, e.g. 9G7H2K4L1M' },
  nagad:    { re: /^[A-Z0-9]{8,10}$/, hint: 'Nagad TrxID is 8–10 letters/digits' },
  skrill:   { re: /^\d{8,12}$/,       hint: 'Skrill Transaction ID is 8–12 digits' },
  payoneer: { re: /^[A-Z0-9-]{6,40}$/, hint: 'Payoneer Payment ID is 6–40 letters/digits' },
};
// Binance Pay order ids are long numbers (or M_P_… style ids); anything else is treated as a nickname.
const BINANCE_ID_RES = [/^\d{12,24}$/, /^[A-Z]_[A-Z]_\d{8,30}$/];

export function normalizeTrxInput(channel, raw) {
  let v = String(raw ?? '').trim();
  if (!v) return { ok: true, empty: true };
  v = v.replace(/^(?:trx|txn|transaction|order|payment)\s*(?:id|no\.?|number|ref)?\s*[:#\-]?\s*/i, '').trim();
  if (v.length > 64) return bad('That reference is too long');

  if (channel === 'binance') {
    const up = v.replace(/\s+/g, '').toUpperCase();
    if (BINANCE_ID_RES.some((re) => re.test(up))) return finishTrx({ ok: true, kind: 'id', value: up });
    if (!/^[\p{L}\p{N}_.\- ]{2,40}$/u.test(v)) return bad('Enter your Binance Pay Order ID (digits) or your Binance nickname');
    return { ok: true, kind: 'nickname', value: v.toLowerCase() };
  }

  const rule = TRX_RULES[channel];
  if (!rule) return bad('Unknown payment channel');
  const up = v.replace(/\s+/g, '').toUpperCase();
  if (!rule.re.test(up)) return bad(`Invalid Transaction ID. ${rule.hint}`);
  return finishTrx({ ok: true, kind: 'id', value: up });
}

function finishTrx(r) {
  const v = r.value;
  if (/^(.)\1+$/.test(v) || /^(0123456789|1234567890|123456789|12345678|ABCDEFGH|TESTTEST)/.test(v) || /TEST|XXXX|FAKE/.test(v)) {
    return bad('That Transaction ID does not look real. Copy it exactly from your payment receipt.');
  }
  return r;
}

// ------------------------------- Misc -------------------------------------
export const last10 = (s) => String(s ?? '').replace(/\D/g, '').slice(-10);
export function maskEmail(e) {
  const [l, d] = String(e).split('@');
  return `${l.slice(0, 2)}${'*'.repeat(Math.max(1, l.length - 2))}@${d}`;
}
