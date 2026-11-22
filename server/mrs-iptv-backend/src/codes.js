import { randomBytes, randomInt } from 'node:crypto';
import { config, PLAN_IDS } from './config.js';
import { db, run, all, get, tx, nowIso } from './db.js';
import { queueLowStockAlert } from './mailer.js';

// Unambiguous uppercase alphanumeric characters (excludes 0, O, 1, I)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Cryptographically random activation code using node:crypto randomBytes.
 * Default format: MRS-<PLAN>-XXXX-XXXX-XXXX (e.g. MRS-1M-K8F4-2W9P-X7QT)
 * Legacy numeric format also supported when CODE_FORMAT=numeric.
 */
export function randomCode(plan = '1m', format = config.codeFormat) {
  if (format === 'numeric') {
    for (;;) {
      let s = String(randomInt(1, 10));
      while (s.length < config.codeLength) s += randomInt(0, 10);
      if (new Set(s).size >= 4) return s;
    }
  }

  const planTag = String(plan || '1m').toUpperCase();
  const group = () => {
    const bytes = randomBytes(4);
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
  };
  return `MRS-${planTag}-${group()}-${group()}-${group()}`;
}

export function isValidCodeFormat(raw) {
  const s = String(raw || '').trim().toUpperCase();
  const mrsRe = /^MRS-(1M|2M|6M|12M)-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  const numRe = new RegExp(`^\\d{${config.codeLength}}$`);
  return mrsRe.test(s) || numRe.test(s.replace(/[\s-]/g, ''));
}

/**
 * Insert `count` brand-new unique codes for `plan` as 'available'. Caller supplies the transaction if needed.
 * Uniqueness is enforced globally across ALL plans via the UNIQUE index; collisions are retried.
 */
export function generateCodes(plan, count, batch = `b${Date.now()}`) {
  if (!PLAN_IDS.includes(plan)) throw new Error(`Unknown plan ${plan}`);
  const made = [];
  const ins = db.prepare('INSERT OR IGNORE INTO codes(code, plan, status, batch, created_at) VALUES (?,?,?,?,?)');
  let guard = count * 20 + 200;
  while (made.length < count && guard-- > 0) {
    const code = randomCode(plan);
    if (ins.run(code, plan, 'available', batch, nowIso()).changes === 1) made.push(code);
  }
  if (made.length < count) throw new Error('Could not generate enough unique codes');
  return made;
}

/** Make sure at least `perPlan` codes are AVAILABLE for each plan. Returns what was created. */
export function ensureStock(perPlan, batch = `b${Date.now()}`) {
  return tx(() => {
    const created = {};
    for (const plan of PLAN_IDS) {
      const have = get("SELECT COUNT(*) n FROM codes WHERE plan=? AND status='available'", plan).n;
      const need = Math.max(0, perPlan - have);
      created[plan] = need ? generateCodes(plan, need, batch) : [];
    }
    return created;
  });
}

export function stock() {
  const rows = all('SELECT plan, status, COUNT(*) n FROM codes GROUP BY plan, status');
  const out = {};
  for (const p of PLAN_IDS) out[p] = { available: 0, issued: 0, redeemed: 0, revoked: 0, lowStock: false };
  for (const r of rows) if (out[r.plan]) out[r.plan][r.status] = r.n;
  for (const p of PLAN_IDS) {
    out[p].lowStock = out[p].available < config.lowStockThreshold;
  }
  return out;
}

/** Take one unused code for the plan and bind it to the order. Must run inside tx(). */
export function allocateCode(plan, orderId) {
  const take = () => get(
    `UPDATE codes SET status='issued', order_id=?, issued_at=?
       WHERE id = (SELECT id FROM codes WHERE plan=? AND status='available' ORDER BY RANDOM() LIMIT 1)
     RETURNING id, code`, orderId, nowIso(), plan);
  let row = take();
  if (!row && config.autoRefill) {
    generateCodes(plan, config.refillBatch, `auto-${Date.now()}`);
    row = take();
  }
  if (row) {
    const remaining = get("SELECT COUNT(*) n FROM codes WHERE plan=? AND status='available'", plan)?.n ?? 0;
    if (remaining < config.lowStockThreshold) {
      try { queueLowStockAlert(plan, remaining); } catch {}
    }
  }
  return row || null;
}

/** Calendar-aware month addition (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
