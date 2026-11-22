// Check that your REAL receipt messages parse.   Usage:
//   npm run sms:test -- bKash "You have received Tk 110.00 from 01712345678. Fee Tk 0.00. Balance Tk 500.00. TrxID 9G7H2K4L1M at 07/11/2026 13:45"
//   npm run sms:test -- NAGAD "<paste the full Nagad SMS>"
import { parseBkashSms, parseNagadSms } from '../src/parsers.js';
const [from, ...rest] = process.argv.slice(2);
const body = rest.join(' ');
if (!from || !body) { console.error('Usage: npm run sms:test -- <senderId: bKash|NAGAD> "<full SMS text>"'); process.exit(1); }
const parser = /nagad/i.test(from) ? parseNagadSms : parseBkashSms;
const r = parser(body);
if (!r) { console.log('✗ NOT parsed. Send me this exact text and I will adjust the pattern in src/parsers.js.'); process.exit(2); }
console.log('✓ parsed:', JSON.stringify({ ...r, amount: r.amountMinor / 100 }, null, 2));
