// The ledger = payments that really arrived. Fed by:
//   • bKash / Nagad  → SMS forwarded from the phone that receives the money
//   • Binance Pay    → official signed API poll (GET /sapi/v1/pay/transactions)
//   • Skrill / Payoneer → notification e-mails pushed by the Gmail Apps Script
//   • anything else  → admin API (manual entry)
import { createHmac } from 'node:crypto';
import { config } from './config.js';
import { get, run, all, nowIso, audit } from './db.js';
import { parseBkashSms, parseNagadSms, parseSkrillEmail, parsePayoneerEmail, parseBinanceTx } from './parsers.js';
import { reconcilePending } from './verify.js';

function logIngest(source, sender, raw, outcome, detail) {
  run('INSERT INTO ingest_log(source, sender, raw, outcome, detail, created_at) VALUES (?,?,?,?,?,?)',
    source, sender ?? null, String(raw ?? '').slice(0, 8000), outcome, detail ?? null, nowIso());
}

/** Insert a ledger row (idempotent on channel+trx_id). */
export function addLedger(entry, source, raw) {
  const received = entry.receivedAt || nowIso();
  const r = run(
    `INSERT OR IGNORE INTO ledger(channel, trx_id, amount_minor, currency, sender, sender_alt, received_at, source, raw, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    entry.channel, String(entry.trxId).toUpperCase(), entry.amountMinor, entry.currency,
    entry.sender ?? null, entry.senderAlt ?? null, received, source, raw ? String(raw).slice(0, 8000) : null, nowIso());
  if (r.changes === 0) return { duplicate: true, row: get('SELECT * FROM ledger WHERE channel=? AND trx_id=?', entry.channel, String(entry.trxId).toUpperCase()) };
  return { duplicate: false, row: get('SELECT * FROM ledger WHERE id=?', r.lastInsertRowid) };
}

const sameSender = (list, from) => list.some((s) => s.toLowerCase() === String(from || '').trim().toLowerCase());

/** SMS forwarded from the receiving phone. `from` must be the official sender ID (bKash / NAGAD). */
export function ingestSms({ from, body, receivedAt }) {
  let parser = null;
  if (sameSender(config.ingest.smsSenders.bkash, from)) parser = parseBkashSms;
  else if (sameSender(config.ingest.smsSenders.nagad, from)) parser = parseNagadSms;
  if (!parser) {
    // A normal phone number can send a text that LOOKS like a bKash receipt. Never trust those.
    logIngest('sms', from, body, 'rejected_sender', 'sender id is not an official wallet sender');
    return { ok: false, code: 'untrusted_sender' };
  }
  const entry = parser(body);
  if (!entry) { logIngest('sms', from, body, 'unparsed'); return { ok: false, code: 'unparsed' }; }
  const t = receivedAt ? new Date(receivedAt) : null;
  entry.receivedAt = t && !Number.isNaN(t.getTime()) ? t.toISOString() : (entry.receivedAt || nowIso());
  const res = addLedger(entry, 'sms', body);
  logIngest('sms', from, body, res.duplicate ? 'duplicate' : 'ledger_added', `${entry.channel}:${entry.trxId}`);
  if (!res.duplicate) reconcilePending();
  return { ok: true, duplicate: res.duplicate, channel: entry.channel, trxId: entry.trxId };
}

/** E-mail receipt pushed by the Gmail script. Requires official sender domain + DKIM pass. */
export function ingestEmail({ from, subject, body, receivedAt, dkimPass }) {
  const addr = String(from || '').toLowerCase().match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/);
  const domain = addr ? addr[1] : '';
  const domainMatches = (list) => list.some((d) => domain === d || domain.endsWith(`.${d}`));
  let provider = null;
  if (domainMatches(config.ingest.emailDomains.skrill)) provider = 'skrill';
  else if (domainMatches(config.ingest.emailDomains.payoneer)) provider = 'payoneer';
  if (!provider) { logIngest('email', from, body, 'rejected_sender', 'sender domain not allow-listed'); return { ok: false, code: 'untrusted_sender' }; }
  if (config.ingest.requireDkim && dkimPass !== true) { logIngest('email', from, body, 'rejected_dkim', 'DKIM did not pass'); return { ok: false, code: 'dkim_failed' }; }

  const t = receivedAt ? new Date(receivedAt) : null;
  const iso = t && !Number.isNaN(t.getTime()) ? t.toISOString() : nowIso();
  const entry = (provider === 'skrill' ? parseSkrillEmail : parsePayoneerEmail)({ subject, body, receivedAt: iso });
  if (!entry) { logIngest('email', from, `${subject}\n${body}`, 'unparsed', provider); return { ok: false, code: 'unparsed' }; }
  const res = addLedger(entry, 'email', `${subject}\n${body}`);
  logIngest('email', from, `${subject}\n${body}`, res.duplicate ? 'duplicate' : 'ledger_added', `${entry.channel}:${entry.trxId}`);
  if (!res.duplicate) reconcilePending();
  return { ok: true, duplicate: res.duplicate, channel: entry.channel, trxId: entry.trxId };
}

/** Import already-fetched Binance Pay history rows. Exported separately so it can be tested without the network. */
export function ingestBinanceTransactions(list) {
  let added = 0;
  for (const tx of list || []) {
    const entry = parseBinanceTx(tx);
    if (!entry) continue;
    const res = addLedger(entry, 'binance_api', JSON.stringify(tx));
    if (!res.duplicate) added++;
  }
  if (added) reconcilePending();
  return added;
}

/** Poll Binance Pay history with a READ-ONLY API key (see docs). */
export async function pollBinance(fetchImpl = fetch) {
  const { key, secret, baseUrl, lookbackHours } = config.binance;
  if (!key || !secret) return { skipped: true };
  const end = Date.now();
  const start = end - lookbackHours * 3600_000;
  const query = `startTime=${start}&endTime=${end}&limit=100&recvWindow=10000&timestamp=${Date.now()}`;
  const signature = createHmac('sha256', secret).update(query).digest('hex');
  const res = await fetchImpl(`${baseUrl}/sapi/v1/pay/transactions?${query}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': key } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false || (json.code && json.code !== '000000' && json.code !== 200)) {
    throw new Error(`Binance Pay API error: HTTP ${res.status} ${json ? JSON.stringify(json).slice(0, 200) : ''}`);
  }
  return { added: ingestBinanceTransactions(json.data) };
}

/** Manual entry (e.g. you checked your Skrill dashboard yourself). */
export function addManualLedger(entry, actor = 'admin') {
  const res = addLedger({ ...entry, trxId: String(entry.trxId).toUpperCase() }, 'admin', `manual entry by ${actor}`);
  audit(actor, 'ledger_manual_add', null, { channel: entry.channel, trxId: entry.trxId, duplicate: res.duplicate });
  if (!res.duplicate) reconcilePending();
  return res;
}

export const listLedger = ({ claimed, limit = 100 } = {}) =>
  all(`SELECT id, channel, trx_id, amount_minor, currency, sender, received_at, source, claimed_by_order FROM ledger
        ${claimed === undefined ? '' : claimed ? 'WHERE claimed_by_order IS NOT NULL' : 'WHERE claimed_by_order IS NULL'}
        ORDER BY id DESC LIMIT ?`, limit);
