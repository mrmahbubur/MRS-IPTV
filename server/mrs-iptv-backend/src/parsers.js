// Turn raw provider messages (SMS / email / API JSON) into ledger entries.
// Every parser returns null when the message is not an *incoming payment*.
//
//  bKash  – format confirmed from public examples:
//    "You have received Tk 800.00 from 01XXXXXXXXX.Ref XYZ. Fee Tk 0.00. Balance Tk 0.00. TrxID ABC123XYZ9 at 15/07/2021 11:00"
//  Nagad / Skrill / Payoneer – best-effort, tolerant patterns. Run `npm run sms:test`
//  with a REAL message from your phone/inbox to confirm; unparsed messages are kept in
//  ingest_log and can be added by hand through the admin API.
import { config } from './config.js';

const clean = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const toMinor = (s) => Math.round(Number.parseFloat(String(s).replace(/,/g, '')) * 100);

/** dd/mm/yyyy hh:mm in Bangladesh time (UTC+6) → ISO UTC */
function dhakaToIso(d, m, y, H, M, S = 0) {
  return new Date(Date.UTC(+y, +m - 1, +d, +H - 6, +M, +S)).toISOString();
}
function findBdDate(t) {
  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return dhakaToIso(m[1], m[2], m[3], m[4], m[5], m[6] || 0);
  m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return dhakaToIso(m[3], m[2], m[1], m[4], m[5], m[6] || 0);
  return null;
}

export function parseBkashSms(body) {
  const t = clean(body);
  const m = t.match(/You have received\s+Tk\.?\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(\+?\d{10,14})/i);
  if (!m) return null;
  const trx = t.match(/TrxID\s*[:\-]?\s*([A-Z0-9]{6,12})\b/i);
  if (!trx) return null;
  return {
    channel: 'bkash', trxId: trx[1].toUpperCase(), amountMinor: toMinor(m[1]), currency: 'BDT',
    sender: m[2].replace(/\D/g, ''), senderAlt: null, receivedAt: findBdDate(t),
  };
}

export function parseNagadSms(body) {
  const t = clean(body);
  if (!/received/i.test(t)) return null;
  const amt = t.match(/Amount\s*[:\-]?\s*(?:Tk\.?|BDT)?\s*([\d,]+(?:\.\d{1,2})?)/i) || t.match(/(?:Tk\.?|BDT)\s*([\d,]+(?:\.\d{1,2})?)/i);
  const sender = t.match(/(?:Sender|from)\s*[:\-]?\s*(\+?\d{10,14})/i);
  const trx = t.match(/(?:Txn\s*ID|TrxID|Trx\s*ID|Transaction\s*ID|TxnId)\s*[:\-]?\s*([A-Z0-9]{6,14})\b/i);
  if (!amt || !sender || !trx) return null;
  return {
    channel: 'nagad', trxId: trx[1].toUpperCase(), amountMinor: toMinor(amt[1]), currency: 'BDT',
    sender: sender[1].replace(/\D/g, ''), senderAlt: null, receivedAt: findBdDate(t),
  };
}

function findMoney(t) {
  let m = t.match(/(\d[\d,]*\.\d{2})\s*(USD|EUR|GBP)\b/i);
  if (m) return { minor: toMinor(m[1]), currency: m[2].toUpperCase() };
  m = t.match(/\b(USD|EUR|GBP)\s*(\d[\d,]*\.\d{2})/i);
  if (m) return { minor: toMinor(m[2]), currency: m[1].toUpperCase() };
  m = t.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (m) return { minor: toMinor(m[1]), currency: 'USD' };
  return null;
}
function findPayer(t) {
  const email = t.match(/from[^@]{0,70}?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (email) return email[1].toLowerCase();
  const name = t.match(/from\s+([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s*[(<]|\s+(?:to|for|via|on)\b|[.,])/i);
  return name ? name[1].trim().toLowerCase() : null;
}

export function parseSkrillEmail({ subject = '', body = '', receivedAt = null }) {
  const t = clean(`${subject} ${body}`);
  if (!/(received|payment|money)/i.test(t)) return null;
  if (/(you sent|you have sent|you paid|withdraw)/i.test(t) && !/you (?:have )?received/i.test(t)) return null;
  const trx = t.match(/Transaction\s*(?:ID|No\.?|number)\s*[:#]?\s*(\d{6,14})/i);
  const money = findMoney(t);
  if (!trx || !money) return null;
  return { channel: 'skrill', trxId: trx[1], amountMinor: money.minor, currency: money.currency, sender: findPayer(t), senderAlt: null, receivedAt };
}

export function parsePayoneerEmail({ subject = '', body = '', receivedAt = null }) {
  const t = clean(`${subject} ${body}`);
  if (!/(received|payment|paid you|sent you)/i.test(t)) return null;
  const trx = t.match(/(?:Payment\s*ID|Transaction\s*ID|Payment\s*Reference|Reference(?:\s*(?:ID|No\.?|number))?)\s*[:#]?\s*([A-Za-z0-9-]{6,40})/i);
  const money = findMoney(t);
  if (!trx || !money) return null;
  return { channel: 'payoneer', trxId: trx[1].toUpperCase(), amountMinor: money.minor, currency: money.currency, sender: findPayer(t), senderAlt: null, receivedAt };
}

/** One element of GET /sapi/v1/pay/transactions → ledger entry (incoming payments only). */
export function parseBinanceTx(tx) {
  const amount = Number.parseFloat(tx?.amount);
  if (!(amount > 0)) return null; // negative = money you sent
  if (!config.binance.orderTypes.includes(tx.orderType)) return null;
  if (!tx.transactionId) return null;
  return {
    channel: 'binance',
    trxId: String(tx.transactionId).toUpperCase(),
    amountMinor: Math.round(amount * 100),
    currency: String(tx.currency || '').toUpperCase(),
    sender: tx.payerInfo?.name ? String(tx.payerInfo.name).toLowerCase() : null,
    senderAlt: tx.payerInfo?.binanceId ? String(tx.payerInfo.binanceId) : (tx.payerInfo?.accountId ? String(tx.payerInfo.accountId) : null),
    receivedAt: tx.transactionTime ? new Date(Number(tx.transactionTime)).toISOString() : null,
  };
}
