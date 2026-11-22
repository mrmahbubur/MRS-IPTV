// Usage: node scripts/import-codes.js codes/codes_ALL.csv [more.csv ...]
// Loads a code pool into the database (existing codes are skipped, never overwritten).
import fs from 'node:fs';
import { config, PLAN_IDS } from '../src/config.js';
import { db, nowIso, tx } from '../src/db.js';
import { stock } from '../src/codes.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('Give at least one CSV file'); process.exit(1); }
const re = new RegExp(`^\\d{${config.codeLength}}$`);
const ins = db.prepare("INSERT OR IGNORE INTO codes(code, plan, status, batch, created_at) VALUES (?,?, 'available', ?, ?)");
let added = 0; let skipped = 0; let bad = 0;
tx(() => {
  for (const f of files) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const [code, plan] = line.split(',').map((s) => s?.trim());
      if (!code || code === 'code') continue;
      if (!re.test(code) || !PLAN_IDS.includes(plan)) { bad++; continue; }
      if (ins.run(code, plan, `import-${f.split('/').pop()}`, nowIso()).changes) added++; else skipped++;
    }
  }
});
console.log(`Imported ${added} codes (${skipped} already present, ${bad} invalid lines).`);
console.log('Stock now:', JSON.stringify(stock()));
