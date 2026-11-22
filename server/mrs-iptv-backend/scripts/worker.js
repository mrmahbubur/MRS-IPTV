#!/usr/bin/env node
// Usage: node scripts/worker.js [--job=reconcile|backup|expireOrders|purgeSessions|doctorSync|housekeeping]
// Without --job, runs as a long-lived automation daemon.
import fs from 'node:fs';
import path from 'node:path';
import { db, run, all, nowIso, audit } from '../src/db.js';
import { reconcilePending, expireOld, triggerDelayedActivations } from '../src/verify.js';
import { processOutbox } from '../src/mailer.js';
import { config } from '../src/config.js';

const arg = (name, d = null) => {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : d;
};

const singleJob = arg('job');

async function jobReconcile() {
  console.log(`[worker:reconcile] Running at ${nowIso()}`);
  const result = reconcilePending();
  return result;
}

async function jobExpireOrders() {
  console.log(`[worker:expireOrders] Running at ${nowIso()}`);
  const result = expireOld();
  return result;
}

async function jobPurgeSessions() {
  console.log(`[worker:purgeSessions] Running at ${nowIso()}`);
  const now = nowIso();
  // Purge expired entitlements
  const res = run("UPDATE entitlements SET active=0 WHERE active=1 AND ends_at <= ?", now);
  console.log(`[worker:purgeSessions] Deactivated ${res.changes} expired entitlements`);
}

async function jobBackup() {
  console.log(`[worker:backup] Running database backup at ${nowIso()}`);
  const dataDir = path.dirname(path.resolve(config.dbPath));
  const backupDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `mrs-backup-${timestamp}.db`);

  try {
    db.exec(`VACUUM INTO '${backupFile}'`);
    console.log(`[worker:backup] Backup created: ${backupFile}`);

    // Retain only latest 14 backups
    const files = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith('mrs-backup-') && f.endsWith('.db'))
      .sort()
      .reverse();

    if (files.length > 14) {
      for (const oldFile of files.slice(14)) {
        fs.unlinkSync(path.join(backupDir, oldFile));
        console.log(`[worker:backup] Pruned old backup: ${oldFile}`);
      }
    }
  } catch (err) {
    console.error('[worker:backup] Backup failed:', err.message);
  }
}

async function jobHousekeeping() {
  const dataDir = path.dirname(path.resolve(config.dbPath));
  const heartbeatPath = path.join(dataDir, 'worker-heartbeat.json');
  fs.writeFileSync(
    heartbeatPath,
    JSON.stringify({
      ok: true,
      time: nowIso(),
      pid: process.pid,
      uptime: process.uptime(),
      dbSize: fs.existsSync(config.dbPath) ? fs.statSync(config.dbPath).size : 0,
    }, null, 2)
  );
  console.log(`[worker:housekeeping] Heartbeat written to ${heartbeatPath}`);
}

async function jobDelayedActivations() {
  console.log(`[worker:delayedActivations] Checking for 12h unredeemed pass auto-activations at ${nowIso()}`);
  const activated = triggerDelayedActivations();
  if (activated > 0) {
    console.log(`[worker:delayedActivations] Automatically activated ${activated} pass(es)`);
  }
  return activated;
}

async function runSingle(jobName) {
  switch (jobName) {
    case 'reconcile':
      return jobReconcile();
    case 'expireOrders':
      return jobExpireOrders();
    case 'autoActivate':
      return jobDelayedActivations();
    case 'purgeSessions':
      return jobPurgeSessions();
    case 'backup':
      return jobBackup();
    case 'housekeeping':
      return jobHousekeeping();
    default:
      console.error(`Unknown job: ${jobName}. Valid: reconcile, expireOrders, autoActivate, purgeSessions, backup, housekeeping`);
      process.exit(1);
  }
}

if (singleJob) {
  runSingle(singleJob).then(() => process.exit(0)).catch((err) => {
    console.error(`Job ${singleJob} failed:`, err);
    process.exit(1);
  });
} else {
  console.log(`[worker] MRS Automation Daemon started (PID ${process.pid})`);

  const schedule = (intervalMs, fn, label) => {
    setInterval(async () => {
      try {
        await fn();
      } catch (e) {
        console.error(`[worker:error:${label}]`, e.message);
      }
    }, intervalMs).unref();
  };

  // 1. Reconcile pending payments (every 60s)
  schedule(60_000, jobReconcile, 'reconcile');
  // 2. 12-hour delayed VIP auto-activations (every 60s)
  schedule(60_000, jobDelayedActivations, 'autoActivate');
  // 3. Expire old orders (every 5 min)
  schedule(300_000, jobExpireOrders, 'expireOrders');
  // 4. Purge sessions and expired entitlements (every 1 hour)
  schedule(3600_000, jobPurgeSessions, 'purgeSessions');
  // 5. Daily backup (every 24 hours)
  schedule(86400_000, jobBackup, 'backup');
  // 6. Outbox delivery (every 20s)
  schedule(20_000, processOutbox, 'outbox');
  // 7. Housekeeping & heartbeat (every 15 min)
  schedule(900_000, jobHousekeeping, 'housekeeping');

  // Initial runs
  jobHousekeeping();
  jobReconcile();
  jobDelayedActivations();
}
