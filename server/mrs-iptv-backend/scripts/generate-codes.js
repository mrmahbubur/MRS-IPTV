// Usage: node scripts/generate-codes.js [--per-plan 1200] [--out codes]
// Tops every plan up to N *available* codes and writes the NEW codes to CSV files.
import fs from 'node:fs';
import path from 'node:path';
import { PLANS, PLAN_IDS } from '../src/config.js';
import { ensureStock, stock } from '../src/codes.js';

const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : d; };
const perPlan = Number.parseInt(arg('per-plan', '1200'), 10);
const out = arg('out', 'codes');
if (!(perPlan >= 1)) throw new Error('--per-plan must be a positive number');

fs.mkdirSync(out, { recursive: true });
const created = ensureStock(perPlan, `gen-${new Date().toISOString().slice(0, 10)}`);
const header = 'code,plan,months,status';
const all = [header];
for (const id of PLAN_IDS) {
  const rows = created[id].map((c) => `${c},${id},${PLANS[id].months},available`);
  all.push(...rows);
  const file = path.join(out, `codes_${id}_${PLANS[id].label.toLowerCase().replace(/\s+/g, '-')}.csv`);
  fs.writeFileSync(file, [header, ...rows].join('\n') + '\n');
  console.log(`${PLANS[id].label.padEnd(10)} +${String(rows.length).padStart(5)} new codes → ${file}`);
}
fs.writeFileSync(path.join(out, 'codes_ALL.csv'), all.join('\n') + '\n');
console.log(`Total new: ${all.length - 1} → ${path.join(out, 'codes_ALL.csv')}`);
console.log('Stock now:', JSON.stringify(stock()));
