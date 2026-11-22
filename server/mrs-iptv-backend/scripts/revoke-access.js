#!/usr/bin/env node
// Usage: node scripts/revoke-access.js --email viewer@example.com --reason "refund REF-1042" [--dry-run]
// or:    node scripts/revoke-access.js --user usr_123 --reason "abuse" [--dry-run]
import { get, all, run, nowIso, audit } from '../src/db.js';

const arg = (name, d = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const email = arg('email');
const userId = arg('user');
const reason = arg('reason', 'manual revocation');
const dryRun = hasFlag('dry-run');

if (!email && !userId) {
  console.error('Error: specify --email <email> or --user <userId>');
  process.exit(1);
}

const user = userId ? get('SELECT * FROM users WHERE id=?', userId) : get('SELECT * FROM users WHERE email=?', String(email).trim().toLowerCase());
if (!user) {
  console.error(`User not found: ${userId || email}`);
  process.exit(1);
}

const entitlements = all('SELECT * FROM entitlements WHERE user_id=? AND active=1', user.id);
const issuedCodes = all(
  `SELECT c.* FROM codes c
   JOIN orders o ON o.code_id = c.id
   WHERE o.email=? AND c.status IN ('issued', 'redeemed')`,
  user.email
);

console.log(`[Revoke Access: ${user.email} (${user.id})]`);
console.log(`Active entitlements found: ${entitlements.length}`);
console.log(`Associated codes found:    ${issuedCodes.length}`);
console.log(`Reason:                    ${reason}`);

if (dryRun) {
  console.log('[Dry run mode] No changes made.');
  process.exit(0);
}

const now = nowIso();

// 1. Revoke entitlements
for (const ent of entitlements) {
  run(
    'UPDATE entitlements SET active=0, revoked_at=?, revoke_reason=? WHERE id=?',
    now,
    reason,
    ent.id
  );
}

// 2. Revoke associated codes
for (const code of issuedCodes) {
  run("UPDATE codes SET status='revoked' WHERE id=?", code.id);
}

// 3. Audit action
audit('admin', 'access_revoked', null, {
  userId: user.id,
  email: user.email,
  reason,
  entitlementsRevoked: entitlements.length,
  codesRevoked: issuedCodes.length,
});

console.log('Successfully revoked access and disabled all active entitlements and codes.');
