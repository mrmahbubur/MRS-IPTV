#!/usr/bin/env node
/**
 * Export unused (available) activation codes to CSV for offline backup
 * and print a full stock summary across all plans and statuses.
 *
 * Usage:
 *   node scripts/export-codes.js [outputPath] [planId] [status]
 * Defaults:
 *   outputPath = data/codes-backup-<date>.csv
 *   status     = available
 */
import fs from 'node:fs';
import path from 'node:path';
import { all } from '../server/mrs-iptv-backend/src/db.js';
import { PLANS, PLAN_IDS } from '../server/mrs-iptv-backend/src/config.js';
import { stock } from '../server/mrs-iptv-backend/src/codes.js';

const stamp = new Date().toISOString().slice(0, 10);
const outArg = process.argv[2] && !PLAN_IDS.includes(process.argv[2]) ? process.argv[2] : '';
const planArg = PLAN_IDS.includes(process.argv[2]) ? process.argv[2] : (PLAN_IDS.includes(process.argv[3]) ? process.argv[3] : '');
const statusArg = process.argv[4] || 'available';

const outPath = path.resolve(outArg || `data/codes-backup-${stamp}.csv`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const rows = all(
  `SELECT code, plan, status, batch, created_at FROM codes WHERE status=? ${planArg ? 'AND plan=?' : ''} ORDER BY plan, id`,
  statusArg,
  ...(planArg ? [planArg] : [])
);

const lines = ['code,plan,months,status,batch,created_at'];
for (const r of rows) {
  lines.push(`${r.code},${r.plan},${PLANS[r.plan]?.months || ''},${r.status},${r.batch || ''},${r.created_at}`);
}

fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

console.log(`\nExported ${rows.length} '${statusArg}' codes → ${outPath}\n`);
console.log('Current Inventory Summary (Count per Plan & Status)');
console.log('--------------------------------------------------------------------');
const s = stock();
for (const id of PLAN_IDS) {
  const row = s[id];
  const flag = row.lowStock ? '  [LOW STOCK]' : '';
  console.log(
    `  ${id.padEnd(4)} | available=${String(row.available).padStart(5)} | issued=${String(row.issued).padStart(4)} | redeemed=${String(row.redeemed).padStart(4)} | revoked=${String(row.revoked).padStart(4)}${flag}`
  );
}
console.log('');
