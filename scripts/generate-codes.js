#!/usr/bin/env node
/**
 * Idempotent activation code generator for M R S IPTV.
 * Creates unique codes per plan in the format MRS-<PLAN>-XXXX-XXXX-XXXX
 * using crypto.randomBytes (no ambiguous 0/O/1/I characters).
 *
 * Usage:
 *   node scripts/generate-codes.js [perPlanCount]
 * Default: 1200 available codes per plan.
 */
import { ensureStock, stock } from '../server/mrs-iptv-backend/src/codes.js';
import { PLANS, PLAN_IDS } from '../server/mrs-iptv-backend/src/config.js';
import { tx, all } from '../server/mrs-iptv-backend/src/db.js';

const arg = Number.parseInt(process.argv[2] || '1200', 10);
const targetPerPlan = Number.isFinite(arg) && arg > 0 ? arg : 1200;
const batch = `gen-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;

const created = tx(() => ensureStock(targetPerPlan, batch));

// Verify global uniqueness across all plans
const totalRows = all('SELECT code FROM codes');
const uniqueCount = new Set(totalRows.map((r) => r.code)).size;
if (uniqueCount !== totalRows.length) {
  throw new Error(`Global code uniqueness violation detected (${uniqueCount} unique vs ${totalRows.length} rows)`);
}

console.log(`\nM R S IPTV Activation Code Pool (target >= ${targetPerPlan} unused per plan)`);
console.log('====================================================================');
const current = stock();
for (const planId of PLAN_IDS) {
  const s = current[planId];
  const added = created[planId]?.length || 0;
  console.log(
    `  ${planId.padEnd(4)} (${PLANS[planId].label.padEnd(9)}): +${String(added).padStart(4)} added | available=${s.available}, issued=${s.issued}, redeemed=${s.redeemed}, revoked=${s.revoked}`
  );
}
console.log(`\nVerified globally unique codes in SQLite: ${uniqueCount}\n`);
