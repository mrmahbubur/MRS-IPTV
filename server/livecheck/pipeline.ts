import fs from 'node:fs';
import path from 'node:path';
import { config } from '../mrs-iptv-backend/src/config.js';
import { db, audit, isDatabaseMalformedError, verifyAndRepairDatabase } from '../mrs-iptv-backend/src/db.js';
import { parseM3u, normName } from './m3u.js';
import { checkStream, prewarmDnsHosts, CheckStreamOverrides, CheckStreamResult, PROFILE_USER_AGENTS } from './checker.js';

function withDbRepair<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err: any) {
    if (isDatabaseMalformedError(err) && verifyAndRepairDatabase(true)) {
      return fn();
    }
    throw err;
  }
}

export interface PipelineSource {
  url: string;
  name?: string;
  prefix?: string;
}

export interface ChannelRow {
  id: number;
  url: string;
  name: string;
  norm_name: string;
  logo: string | null;
  group_title: string | null;
  tvg_id: string | null;
  user_agent: string | null;
  referrer: string | null;
  source: string | null;
  in_source: number;
  status: 'unknown' | 'live' | 'dead';
  fail_count: number;
  ok_count: number;
  last_reason: string | null;
  latency_ms: number | null;
  kind: string | null;
  best_profile: string | null;
  cors: number | null;
  last_checked: number | null;
  last_ok: number | null;
  created_at: number;
}

const nowMs = () => Date.now();
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
let activeAiCalls = 0;
let aiPriorityUntil = 0;

export function beginAiPriorityWindow(maxHoldMs = 15000) {
  activeAiCalls++;
  aiPriorityUntil = Math.max(aiPriorityUntil, Date.now() + maxHoldMs);
}

export function endAiPriorityWindow() {
  activeAiCalls = Math.max(0, activeAiCalls - 1);
  if (activeAiCalls === 0) aiPriorityUntil = 0;
}

async function waitIfAiActive() {
  while (activeAiCalls > 0 && Date.now() < aiPriorityUntil) {
    await sleepMs(250);
  }
}
const hostOf = (rawUrl: string) => {
  try {
    return new URL(rawUrl).host;
  } catch {
    return '';
  }
};

function unwrapStreamUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (s.startsWith('/api/proxy?url=')) {
    try {
      const u = new URL(s, 'http://localhost');
      return u.searchParams.get('url') || s;
    } catch {
      return decodeURIComponent(s.replace('/api/proxy?url=', '').split('&')[0]);
    }
  }
  return s;
}

/**
 * Concurrency pool with O(1) per-host throttling so testing thousands of streams from
 * one provider server does not trigger rate-limiting false dead flags or O(N) queue scans.
 */
async function pool<T extends { url: string }>(
  items: T[],
  limit: number,
  perHost: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  const byHost = new Map<string, T[]>();
  for (const item of items) {
    const h = hostOf(item.url);
    let bucket = byHost.get(h);
    if (!bucket) {
      bucket = [];
      byHost.set(h, bucket);
    }
    bucket.push(item);
  }
  const hostList = Array.from(byHost.keys());
  let rrIdx = 0;
  let remaining = items.length;
  const inFlight = new Map<string, number>();
  const waiters: Array<() => void> = [];
  const effectivePerHost = Math.max(1, perHost || config.checker.perHostLimit || 1);
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const tryClaimNext = (): { host: string; item: T } | null => {
    if (remaining === 0 || hostList.length === 0) return null;
    const n = hostList.length;
    for (let checked = 0; checked < n; checked++) {
      if (hostList.length === 0) return null;
      const idx = (rrIdx + checked) % hostList.length;
      const h = hostList[idx];
      const bucket = byHost.get(h);
      if (!bucket || bucket.length === 0) {
        hostList.splice(idx, 1);
        byHost.delete(h);
        if (hostList.length === 0) return null;
        rrIdx = idx % hostList.length;
        checked--;
        continue;
      }
      const cur = inFlight.get(h) || 0;
      if (cur < effectivePerHost) {
        const item = bucket.shift()!;
        remaining--;
        inFlight.set(h, cur + 1);
        if (bucket.length === 0) {
          hostList.splice(idx, 1);
          byHost.delete(h);
          rrIdx = hostList.length ? idx % hostList.length : 0;
        } else {
          rrIdx = (idx + 1) % hostList.length;
        }
        return { host: h, item };
      }
    }
    return null;
  };

  const notifyOneWaiter = () => {
    const wake = waiters.shift();
    wake?.();
  };

  const acquireNext = async (): Promise<{ host: string; item: T } | null> => {
    while (remaining > 0) {
      const claimed = tryClaimNext();
      if (claimed) return claimed;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 100);
        waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return null;
  };

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        await waitIfAiActive();
        const claimed = await acquireNext();
        if (!claimed) break;
        const { host: h, item } = claimed;
        try {
          await worker(item);
        } catch (e: any) {
          console.error('[livecheck]', e?.message || e);
        } finally {
          inFlight.set(h, Math.max(0, (inFlight.get(h) || 1) - 1));
          notifyOneWaiter();
        }
      }
      // Wake any sibling waiting when remaining reaches 0
      notifyOneWaiter();
    })
  );
}

/**
 * Loads configured sources from SOURCES_FILE, runtime sources, local data/*.m3u files,
 * M3U Doctor ledger, and custom_imported_sources.json. Ignores placeholder example.com URLs.
 */
export function loadSources(runtimeSources: PipelineSource[] = []): PipelineSource[] {
  const byUrl = new Map<string, PipelineSource>();
  const seenPrefixes = new Set<string>();
  const add = (src: PipelineSource) => {
    const rawUrl = String(src?.url || '').trim();
    if (!rawUrl || rawUrl.includes('example.com/') || rawUrl.includes('test-provider.com')) return;
    const prefix = src.prefix ? String(src.prefix).trim() : '';
    if (prefix && seenPrefixes.has(prefix)) return;
    if (byUrl.has(rawUrl)) return;
    if (prefix) seenPrefixes.add(prefix);
    byUrl.set(rawUrl, { url: rawUrl, name: src.name || rawUrl, prefix: prefix || undefined });
  };

  // 1. Optional SOURCES_FILE (data/sources.json)
  if (config.checker.sourcesFile && fs.existsSync(config.checker.sourcesFile)) {
    try {
      const arr = JSON.parse(fs.readFileSync(config.checker.sourcesFile, 'utf8'));
      if (Array.isArray(arr)) {
        for (const s of arr) {
          add(typeof s === 'string' ? { url: s, name: s } : s);
        }
      }
    } catch {
      // ignore malformed sources.json
    }
  }

  // 2. Runtime M3U sources passed from server.ts
  for (const s of runtimeSources) add(s);

  // 3. M3U Doctor configured sources ledger (enabled sources only)
  const dataDir = path.join(process.cwd(), 'data');
  const doctorSourcesFile = path.join(dataDir, 'm3u-doctor', 'sources.json');
  if (fs.existsSync(doctorSourcesFile)) {
    try {
      const arr = JSON.parse(fs.readFileSync(doctorSourcesFile, 'utf8'));
      if (Array.isArray(arr)) {
        for (const ds of arr) {
          if (ds?.enabled === false) continue;
          const rawUrl = String(ds?.url || '').trim();
          const prefix = ds?.id ? String(ds.id).trim() : undefined;
          if (!rawUrl) continue;
          add({
            url: rawUrl.startsWith('/data/') ? path.join(process.cwd(), rawUrl.slice(1)) : rawUrl,
            name: ds?.name || prefix || rawUrl,
            prefix,
          });
        }
      }
    } catch {
      // ignore malformed m3u-doctor sources.json
    }
  }

  // 4. All local .m3u files in data/ directory not already covered by prefix
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.m3u')).sort();
    for (const f of files) {
      const fullPath = path.join(dataDir, f);
      const base = f.replace(/\.m3u$/i, '');
      add({ url: fullPath, name: `Playlist (${f})`, prefix: base });
    }
  }

  // 5. Custom imported ledger
  const customFile = path.join(dataDir, 'custom_imported_sources.json');
  if (fs.existsSync(customFile)) {
    try {
      const arr = JSON.parse(fs.readFileSync(customFile, 'utf8'));
      if (Array.isArray(arr)) {
        for (const cs of arr) {
          if (cs?.prefix) {
            const localFile = path.join(dataDir, `${cs.prefix}.m3u`);
            if (fs.existsSync(localFile)) {
              add({ url: localFile, name: cs.name || cs.prefix, prefix: cs.prefix });
              continue;
            }
          }
          if (cs?.url) add({ url: cs.url, name: cs.name || cs.prefix, prefix: cs.prefix });
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(byUrl.values());
}

const SKYM3U_CACHE_TTL_MS = 45 * 60 * 1000;
const IPTV_ORG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchRemoteM3uWithSkyFallback(rawUrl: string, prefix?: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  const skyDomain = rawUrl.includes('go.skym3u.dev')
    ? 'go.skym3u.dev'
    : rawUrl.includes('go.skym3u.top')
      ? 'go.skym3u.top'
      : '';
  const skyRef = skyDomain ? `https://${skyDomain.replace('go.', 'www.')}/` : undefined;
  try {
    const headers: Record<string, string> = { 'User-Agent': PROFILE_USER_AGENTS.vlc };
    if (skyRef) headers['Referer'] = skyRef;
    const r = await fetch(rawUrl, { signal: ctl.signal, headers });
    if (r.ok) {
      const txt = await r.text();
      if (txt && txt.includes('#EXTINF')) return txt;
    }
  } catch {
    // fallback below for SkyM3U
  } finally {
    clearTimeout(t);
  }

  if (skyDomain) {
    const idMatch = rawUrl.match(/\/([a-zA-Z0-9_-]+)\.m3u/i);
    const skyId = idMatch ? idMatch[1].toLowerCase() : (prefix || '');
    if (skyId) {
      const token = Buffer.from(`${Date.now()}_skym3u_pass_${skyId}`).toString('base64');
      const vRes = await fetch(`https://${skyDomain}/verify?id=${skyId}&token=${encodeURIComponent(token)}`, {
        headers: {
          'User-Agent': PROFILE_USER_AGENTS.chrome,
          'Referer': `https://${skyDomain.replace('go.', 'www.')}/p/dedicated.html`,
        },
      });
      if (vRes.ok) {
        const vJson: any = await vRes.json();
        const freshUrl = vJson?.data || vJson;
        if (typeof freshUrl === 'string' && freshUrl.startsWith('http')) {
          const mRes = await fetch(freshUrl, {
            headers: {
              'User-Agent': PROFILE_USER_AGENTS.chrome,
              'Referer': `https://${skyDomain.replace('go.', 'www.')}/p/dedicated.html`,
            },
          });
          if (mRes.ok) {
            const txt = await mRes.text();
            if (txt && txt.includes('#EXTINF')) return txt;
          }
        }
      }
    }
  }
  throw new Error('upstream_unavailable');
}

async function readSource(src: PipelineSource): Promise<string> {
  const rawUrl = String(src.url || '').trim();
  const isHttp = /^https?:\/\//i.test(rawUrl);

  // Check local /data or local: prefix with TTL validation for remote feeds
  if (src.prefix && (rawUrl.startsWith('local:') || rawUrl.includes('skym3u') || rawUrl.includes('iptv-org'))) {
    const fileName =
      src.prefix === 'iptv_sports'
        ? 'iptv_sports.m3u'
        : src.prefix === 'iptv_bd'
        ? 'iptv_bd.m3u'
        : src.prefix === 'iptv_org'
        ? 'iptv_org.m3u'
        : `${src.prefix}.m3u`;
    const localCandidate = path.join(process.cwd(), 'data', fileName);
    let cachedContent = '';
    let isFresh = !isHttp;

    if (fs.existsSync(localCandidate)) {
      try {
        const stat = fs.statSync(localCandidate);
        const ttl = rawUrl.includes('skym3u') ? SKYM3U_CACHE_TTL_MS : IPTV_ORG_CACHE_TTL_MS;
        cachedContent = fs.readFileSync(localCandidate, 'utf8');
        if (isHttp && cachedContent.includes('#EXTINF')) {
          isFresh = Date.now() - stat.mtimeMs < ttl;
        }
      } catch {
        cachedContent = '';
      }
    }

    if (isFresh && cachedContent.includes('#EXTINF')) {
      return cachedContent;
    }

    if (isHttp) {
      try {
        const fresh = await fetchRemoteM3uWithSkyFallback(rawUrl, src.prefix);
        if (fresh && fresh.includes('#EXTINF')) {
          try {
            fs.mkdirSync(path.dirname(localCandidate), { recursive: true });
            fs.writeFileSync(localCandidate, fresh, 'utf8');
          } catch {
            // ignore disk write failure
          }
          return fresh;
        }
      } catch {
        if (cachedContent.includes('#EXTINF')) return cachedContent;
      }
    }
    if (cachedContent.includes('#EXTINF')) return cachedContent;
  }

  if (rawUrl.startsWith('/data/') || rawUrl.startsWith('data/')) {
    const resolved = path.join(process.cwd(), rawUrl.replace(/^\//, ''));
    return fs.readFileSync(resolved, 'utf8');
  }

  if (!isHttp) {
    return fs.readFileSync(rawUrl, 'utf8');
  }

  return fetchRemoteM3uWithSkyFallback(rawUrl, src.prefix);
}

let cachedIndexAt = 0;
let cachedLiveIndex: {
  liveUrls: Set<string>;
  deadUrls: Set<string>;
  byUrl: Map<string, { status: string; latencyMs: number | null; kind: string | null; bestProfile: string | null; https: boolean; cors: boolean; lastReason: string | null; lastOk: number | null }>;
} | null = null;

export function invalidateLiveIndex() {
  cachedIndexAt = 0;
  cachedLiveIndex = null;
}

export function getLiveIndex() {
  if (cachedLiveIndex && Date.now() - cachedIndexAt < 5000) {
    return cachedLiveIndex;
  }
  const rows = withDbRepair(() =>
    db
      .prepare('SELECT url, status, latency_ms, kind, best_profile, cors, last_reason, last_ok FROM channels WHERE in_source=1')
      .all() as Array<{
        url: string;
        status: string;
        latency_ms: number | null;
        kind: string | null;
        best_profile: string | null;
        cors: number | null;
        last_reason: string | null;
        last_ok: number | null;
      }>
  );

  const liveUrls = new Set<string>();
  const deadUrls = new Set<string>();
  const byUrl = new Map<string, { status: string; latencyMs: number | null; kind: string | null; bestProfile: string | null; https: boolean; cors: boolean; lastReason: string | null; lastOk: number | null }>();

  for (const r of rows) {
    if (r.status === 'live') liveUrls.add(r.url);
    else if (r.status === 'dead') deadUrls.add(r.url);
    byUrl.set(r.url, {
      status: r.status,
      latencyMs: r.latency_ms,
      kind: r.kind,
      bestProfile: r.best_profile,
      https: /^https:/i.test(r.url),
      cors: r.cors === 1,
      lastReason: r.last_reason,
      lastOk: r.last_ok,
    });
  }

  cachedLiveIndex = { liveUrls, deadUrls, byUrl };
  cachedIndexAt = Date.now();
  return cachedLiveIndex;
}

/**
 * Pulls playlists and upserts channels into SQLite (deduped by canonical URL).
 * Channels missing from active sources are flagged with in_source=0 rather than deleted.
 */
export async function syncSources(
  sources: PipelineSource[] = loadSources(),
  extraEntries: Array<{ name: string; url: string; logo?: string; group?: string; tvgId?: string; source?: string }> = []
): Promise<{ sources: number; total: number; added: number }> {
  const seen = new Set<string>();
  let added = 0;
  let total = 0;

  const up = db.prepare(`
    INSERT INTO channels(url,name,norm_name,logo,group_title,tvg_id,user_agent,referrer,source,in_source,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?)
    ON CONFLICT(url) DO UPDATE SET
      name=excluded.name,
      norm_name=excluded.norm_name,
      logo=COALESCE(NULLIF(excluded.logo,''), channels.logo),
      group_title=COALESCE(NULLIF(excluded.group_title,''), channels.group_title),
      tvg_id=COALESCE(NULLIF(excluded.tvg_id,''), channels.tvg_id),
      user_agent=COALESCE(NULLIF(excluded.user_agent,''), channels.user_agent),
      referrer=COALESCE(NULLIF(excluded.referrer,''), channels.referrer),
      source=excluded.source,
      in_source=1
  `);
  const existsStmt = db.prepare('SELECT 1 FROM channels WHERE url=?');

  for (const src of sources) {
    let text: string;
    try {
      text = await readSource(src);
    } catch (e: any) {
      audit('system', 'source_failed', null, { src: src.url, error: e?.message || String(e) });
      continue;
    }

    const list = parseM3u(text);
    const ts = nowMs();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of list) {
        const cleanUrl = unwrapStreamUrl(c.url);
        if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) continue;
        // Skip promotional spam entries
        const nameL = c.name.toLowerCase();
        const grpL = (c.group || '').toLowerCase();
        if (
          grpL.includes('promo') ||
          nameL.includes('visit skym3u') ||
          nameL.includes('telegram - t.me/')
        ) {
          continue;
        }
        total++;
        const before = existsStmt.get(cleanUrl);
        up.run(
          cleanUrl,
          c.name,
          normName(c.name) || c.name.toLowerCase(),
          c.logo || null,
          c.group || null,
          c.tvgId || null,
          c.userAgent || null,
          c.referrer || null,
          src.name || src.url,
          ts
        );
        if (!before) added++;
        seen.add(cleanUrl);
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  if (extraEntries.length > 0) {
    const ts = nowMs();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const e of extraEntries) {
        const cleanUrl = unwrapStreamUrl(e.url);
        if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) continue;
        total++;
        const before = existsStmt.get(cleanUrl);
        up.run(
          cleanUrl,
          e.name || 'Channel',
          normName(e.name || 'Channel') || 'channel',
          e.logo || null,
          e.group || null,
          e.tvgId || null,
          null,
          null,
          e.source || 'curated',
          ts
        );
        if (!before) added++;
        seen.add(cleanUrl);
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  if ((sources.length || extraEntries.length) && seen.size) {
    const allRows = db.prepare('SELECT id, url FROM channels WHERE in_source=1').all() as Array<{ id: number; url: string }>;
    const gone = db.prepare('UPDATE channels SET in_source=0 WHERE id=?');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const r of allRows) {
        if (!seen.has(r.url)) gone.run(r.id);
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    }
  }

  invalidateLiveIndex();
  const summary = { sources: sources.length, total, added };
  const syncedAt = nowMs();
  lastSchedulerSync = syncedAt;
  progress.lastSync = syncedAt;
  progress.lastSyncResult = summary;
  return summary;
}

/**
 * Applies a stream check result with blip hysteresis:
 * - Never-seen-live (`status !== 'live'`) -> immediately 'dead' on failure.
 * - Previously `'live'` -> requires `failThreshold` consecutive failures before going 'dead'.
 */
export function applyResult(ch: Pick<ChannelRow, 'id' | 'status' | 'fail_count'>, r: CheckStreamResult): 'live' | 'dead' {
  const t = nowMs();
  if (r.live) {
    db.prepare(
      `UPDATE channels SET status='live', fail_count=0, ok_count=ok_count+1, last_reason=?, latency_ms=?, kind=?, best_profile=?, cors=?, last_checked=?, last_ok=? WHERE id=?`
    ).run(r.reason, r.latencyMs, r.kind || null, r.bestProfile || 'default', r.cors ?? null, t, t, ch.id);
    return 'live';
  }
  const fails = (ch.fail_count || 0) + 1;
  const threshold = Number(process.env.FAIL_THRESHOLD || config.checker.failThreshold || 2);
  const dead = ch.status !== 'live' || fails >= threshold;
  db.prepare(
    `UPDATE channels SET status=?, fail_count=?, last_reason=?, latency_ms=?, last_checked=? WHERE id=?`
  ).run(dead ? 'dead' : 'live', fails, r.reason, r.latencyMs, t, ch.id);
  return dead ? 'dead' : 'live';
}

export function upsertCheckedChannel(entry: {
  url: string;
  name: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  source?: string;
  result: CheckStreamResult;
}) {
  const cleanUrl = unwrapStreamUrl(entry.url);
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) return;
  const t = nowMs();
  const status = entry.result.live ? 'live' : 'dead';
  db.prepare(`
    INSERT INTO channels(url,name,norm_name,logo,group_title,tvg_id,source,in_source,status,fail_count,ok_count,last_reason,latency_ms,kind,best_profile,cors,last_checked,last_ok,created_at)
    VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(url) DO UPDATE SET
      in_source=1,
      status=excluded.status,
      fail_count=CASE WHEN excluded.status='live' THEN 0 ELSE channels.fail_count+1 END,
      ok_count=CASE WHEN excluded.status='live' THEN channels.ok_count+1 ELSE channels.ok_count END,
      last_reason=excluded.last_reason,
      latency_ms=excluded.latency_ms,
      kind=COALESCE(excluded.kind, channels.kind),
      best_profile=COALESCE(excluded.best_profile, channels.best_profile),
      cors=COALESCE(excluded.cors, channels.cors),
      last_checked=excluded.last_checked,
      last_ok=CASE WHEN excluded.status='live' THEN excluded.last_checked ELSE channels.last_ok END
  `).run(
    cleanUrl,
    entry.name || 'Channel',
    normName(entry.name || 'Channel') || 'channel',
    entry.logo || null,
    entry.group || null,
    entry.tvgId || null,
    entry.source || 'manual-import',
    status,
    entry.result.live ? 0 : 1,
    entry.result.live ? 1 : 0,
    entry.result.reason,
    entry.result.latencyMs,
    entry.result.kind || null,
    entry.result.bestProfile || 'default',
    entry.result.cors ?? null,
    t,
    entry.result.live ? t : null,
    t
  );
  invalidateLiveIndex();
}

export function dueChannels(limit = config.checker.batchSize): ChannelRow[] {
  const t = nowMs();
  return withDbRepair(() =>
    db
      .prepare(
        `SELECT * FROM channels WHERE in_source=1 AND (
          last_checked IS NULL
          OR status='unknown'
          OR (status='live' AND fail_count>0 AND last_checked < ?)
          OR (status='live' AND last_checked < ?)
          OR (status='dead' AND last_checked < ?)
        )
        ORDER BY
          CASE
            WHEN (last_checked IS NULL OR status='unknown') AND (
              source IN ('curated-wc-events', 'manual-import', 'Playlist (iptv_bd.m3u)', 'Playlist (iptv_sports.m3u)')
              OR source LIKE '%Bangladesh%'
              OR source LIKE '%Bangla%'
              OR source LIKE '%Sports%'
              OR source LIKE '%Cricket%'
              OR url LIKE '%skym3u%'
              OR LOWER(COALESCE(group_title, '')) IN ('bangladeshi', 'sports', 'news', 'cricket', 'recent wc event''s', 'live events')
            ) THEN 0
            WHEN last_checked IS NULL OR status='unknown' THEN 1
            WHEN status='live' AND fail_count > 0 THEN 2
            WHEN status='live' THEN 3
            ELSE 4
          END,
          CASE WHEN last_checked IS NULL OR status='unknown' THEN ABS(RANDOM()) ELSE last_checked END ASC
        LIMIT ?`
      )
      .all(t - 60000, t - config.checker.liveRecheckMs, t - config.checker.deadRecheckMs, limit) as ChannelRow[]
  );
}

const TRANSIENT_ERROR_RE = /^(timeout|http_5\d\d|http_429|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR.*|fetch failed|terminated|variant_http_5\d\d|segment_http_5\d\d)$/i;

async function checkWithRetry(
  ch: ChannelRow,
  overrides?: CheckStreamOverrides,
  retryDelayMs = 1500
): Promise<CheckStreamResult> {
  const input = {
    url: ch.url,
    userAgent: ch.user_agent,
    referrer: ch.referrer,
  };
  let r = await checkStream(input, overrides);
  if (!r.live && TRANSIENT_ERROR_RE.test(r.reason)) {
    await sleepMs(retryDelayMs);
    r = await checkStream(input, overrides);
  }
  return r;
}

const progress: {
  running: boolean;
  lastRunStart: number | null;
  lastRunEnd: number | null;
  lastBatch: { checked: number; live: number; dead: number } | null;
  lastSync: number | null;
  lastSyncResult: { sources: number; total: number; added: number } | null;
} = {
  running: false,
  lastRunStart: null,
  lastRunEnd: null,
  lastBatch: null,
  lastSync: null,
  lastSyncResult: null,
};

export async function runChecks({
  limit = config.checker.batchSize,
  concurrency = config.checker.concurrency,
  perHost = config.checker.perHostLimit,
  retryDelayMs = 1500,
  overrides,
}: {
  limit?: number;
  concurrency?: number;
  perHost?: number;
  retryDelayMs?: number;
  overrides?: CheckStreamOverrides;
} = {}): Promise<{ checked: number; live: number; dead: number }> {
  const batch = dueChannels(limit);
  const tally = { checked: batch.length, live: 0, dead: 0 };
  if (!batch.length) {
    progress.lastBatch = tally;
    return tally;
  }

  if (!overrides?.allowPrivateNetworks) {
    await prewarmDnsHosts(batch.map((b) => unwrapStreamUrl(b.url)));
  }

  const threshold = Number(process.env.FAIL_THRESHOLD || config.checker.failThreshold || 2);
  const stmtOk = db.prepare(
    `UPDATE channels SET status='live', fail_count=0, ok_count=ok_count+1, last_reason=?, latency_ms=?, kind=?, best_profile=?, cors=?, last_checked=?, last_ok=? WHERE id=?`
  );
  const stmtFail = db.prepare(
    `UPDATE channels SET status=?, fail_count=?, last_reason=?, latency_ms=?, last_checked=? WHERE id=?`
  );

  const pendingWrites: Array<{ ch: ChannelRow; r: CheckStreamResult; at: number }> = [];
  const flushWrites = () => {
    if (!pendingWrites.length) return;
    const chunk = pendingWrites.splice(0, pendingWrites.length);
    withDbRepair(() => {
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const { ch, r, at } of chunk) {
          if (r.live) {
            stmtOk.run(r.reason, r.latencyMs, r.kind || null, r.bestProfile || 'default', r.cors ?? null, at, at, ch.id);
          } else {
            const fails = (ch.fail_count || 0) + 1;
            const dead = ch.status !== 'live' || fails >= threshold;
            stmtFail.run(dead ? 'dead' : 'live', fails, r.reason, r.latencyMs, at, ch.id);
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
    });
  };

  await pool(batch, concurrency, perHost, async (ch) => {
    const r = await checkWithRetry(ch, overrides, retryDelayMs);
    if (r.live) {
      tally.live++;
    } else {
      const fails = (ch.fail_count || 0) + 1;
      const dead = ch.status !== 'live' || fails >= threshold;
      if (dead) tally.dead++;
      else tally.live++;
    }
    pendingWrites.push({ ch, r, at: nowMs() });
    if (pendingWrites.length >= 50) flushWrites();
  });

  flushWrites();
  progress.lastBatch = tally;
  invalidateLiveIndex();
  return tally;
}

export interface LiveChannelView {
  id: number;
  name: string;
  logo: string | null;
  group: string | null;
  tvgId: string | null;
  url: string;
  kind: string | null;
  bestProfile: string | null;
  https: boolean;
  cors: boolean;
  latency_ms: number | null;
  last_ok: number | null;
}

/**
 * Returns ONLY verified live channels (`status='live' AND in_source=1`),
 * collapsing duplicates by normalized channel name + group to the lowest-latency live stream.
 * When `web: true`, keeps only streams directly playable by a browser without relay (`https && cors`).
 */
export function liveChannels({ group, q, web }: { group?: string; q?: string; web?: boolean } = {}): LiveChannelView[] {
  let sql =
    'SELECT id, name, logo, group_title AS "group", tvg_id AS tvgId, url, kind, best_profile AS bestProfile, cors AS rawCors, latency_ms, last_ok FROM channels WHERE status=\'live\' AND in_source=1';
  const args: any[] = [];
  if (group) {
    sql += ' AND group_title=?';
    args.push(group);
  }
  if (q) {
    sql += ' AND norm_name LIKE ?';
    args.push(`%${normName(q)}%`);
  }
  const rawRows = withDbRepair(() =>
    db.prepare(`${sql} ORDER BY group_title, name`).all(...args) as Array<Omit<LiveChannelView, 'https' | 'cors'> & { rawCors: number | null }>
  );

  let rows: LiveChannelView[] = rawRows.map(({ rawCors, ...r }) => ({
    ...r,
    https: /^https:/i.test(r.url),
    cors: rawCors === 1,
  }));

  if (web) {
    rows = rows.filter((r) => r.https && r.cors);
  }

  const best = new Map<string, LiveChannelView>();
  for (const r of rows) {
    const k = `${normName(r.name) || r.name.toLowerCase()}|${r.group || ''}`;
    const b = best.get(k);
    if (!b || (r.latency_ms ?? 1e9) < (b.latency_ms ?? 1e9)) {
      best.set(k, r);
    }
  }
  return Array.from(best.values());
}

/** Per-playlist breakdown: total / live / dead / still waiting. */
export function sourceReport() {
  return withDbRepair(() =>
    db
      .prepare(
        `SELECT COALESCE(source, 'Unknown') AS source,
          COUNT(*) AS total,
          SUM(CASE WHEN status='live' THEN 1 ELSE 0 END) AS live,
          SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) AS dead,
          SUM(CASE WHEN status='unknown' THEN 1 ELSE 0 END) AS waiting
        FROM channels WHERE in_source=1 GROUP BY source ORDER BY total DESC`
      )
      .all() as Array<{ source: string; total: number; live: number; dead: number; waiting: number }>
  );
}

/** Exact dead channels (name, group, url, source, failure reason) for one playlist or all. */
export function deadList({ source, limit = 5000 }: { source?: string; limit?: number } = {}) {
  return withDbRepair(() => {
    const sql =
      "SELECT id, name, group_title AS \"group\", url, COALESCE(source, 'Unknown') AS source, last_reason AS reason, fail_count, last_checked FROM channels WHERE in_source=1 AND status='dead'" +
      (source ? ' AND source=?' : '') +
      ' ORDER BY source, name LIMIT ?';
    return (source ? db.prepare(sql).all(source, limit) : db.prepare(sql).all(limit)) as Array<{
      id: number;
      name: string;
      group: string | null;
      url: string;
      source: string;
      reason: string | null;
      fail_count: number;
      last_checked: number | null;
    }>;
  });
}

export function listDeadSample(limit = 30) {
  return withDbRepair(() =>
    db
      .prepare(
        "SELECT id, name, url, group_title AS groupTitle, last_reason AS reason, latency_ms AS latencyMs, last_checked AS lastChecked FROM channels WHERE status='dead' AND in_source=1 ORDER BY last_checked DESC LIMIT ?"
      )
      .all(limit)
  );
}

export function listLiveSample(limit = 100) {
  return withDbRepair(() =>
    db
      .prepare(
        "SELECT id, name, url, group_title AS groupTitle, last_reason AS reason, kind, best_profile AS bestProfile, cors, latency_ms AS latencyMs, last_ok AS lastOk FROM channels WHERE status='live' AND in_source=1 ORDER BY latency_ms ASC LIMIT ?"
      )
      .all(limit)
  );
}

export function status() {
  return withDbRepair(() => {
    const c = db
      .prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status='live' THEN 1 ELSE 0 END) AS live,
          SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) AS dead,
          SUM(CASE WHEN status='unknown' THEN 1 ELSE 0 END) AS waiting
        FROM channels WHERE in_source=1`
      )
      .get() as { total: number; live: number | null; dead: number | null; waiting: number | null };
    const total = c?.total || 0;
    const live = c?.live || 0;
    const dead = c?.dead || 0;
    const waiting = c?.waiting || 0;
    const checked = live + dead;
    return {
      total,
      live,
      dead,
      waiting,
      percentChecked: total ? Math.round((checked / total) * 1000) / 10 : 100,
      ...progress,
    };
  });
}

export function stats() {
  return withDbRepair(() => {
    const rows = db.prepare('SELECT status, COUNT(*) c FROM channels WHERE in_source=1 GROUP BY status').all() as Array<{ status: string; c: number }>;
    const reasons = db
      .prepare("SELECT last_reason r, COUNT(*) c FROM channels WHERE status='dead' AND in_source=1 GROUP BY last_reason ORDER BY c DESC LIMIT 15")
      .all() as Array<{ r: string; c: number }>;
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.c]));
    const totalInSource = (byStatus.live || 0) + (byStatus.dead || 0) + (byStatus.unknown || 0);
    const checked = (byStatus.live || 0) + (byStatus.dead || 0);
    return {
      byStatus: {
        live: byStatus.live || 0,
        dead: byStatus.dead || 0,
        unknown: byStatus.unknown || 0,
      },
      totalInSource,
      percentChecked: totalInSource ? Math.round((checked / totalInSource) * 1000) / 10 : 100,
      uniqueLiveChannels: liveChannels({}).length,
      deadReasons: reasons,
    };
  });
}

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let schedulerStopped = false;
let lastSchedulerSync = 0;

export function isSchedulerActive() {
  return schedulerRunning;
}

export function startScheduler(
  runtimeSourcesProvider?: () => PipelineSource[],
  extraEntriesProvider?: () => Array<{ name: string; url: string; logo?: string; group?: string; tvgId?: string; source?: string }>,
  onBatchComplete?: () => void
) {
  if (schedulerTimer) return;
  schedulerStopped = false;

  const tick = async () => {
    if (schedulerRunning || schedulerStopped) return;
    schedulerRunning = true;
    progress.running = true;
    progress.lastRunStart = nowMs();
    try {
      const t = nowMs();
      if (t - lastSchedulerSync > 30 * 60000) {
        lastSchedulerSync = t;
        progress.lastSync = t;
        try {
          const runtime = runtimeSourcesProvider ? runtimeSourcesProvider() : [];
          const extras = extraEntriesProvider ? extraEntriesProvider() : [];
          progress.lastSyncResult = await syncSources(loadSources(runtime), extras);
        } catch (syncErr: any) {
          console.warn('[livecheck scheduler] source sync warning:', syncErr?.message || syncErr);
        }
      }
      // Drain due backlog across small bounded batches per tick with mandatory sleep so sockets, DNS, and AI calls stay responsive
      const batchSleepMs = Math.max(1000, config.checker.batchSleepMs || 2000);
      for (let i = 0; i < 2 && !schedulerStopped; i++) {
        await waitIfAiActive();
        const res = await runChecks({
          limit: config.checker.batchSize,
          concurrency: config.checker.concurrency,
          perHost: config.checker.perHostLimit,
        });
        if (res.checked > 0 && onBatchComplete) {
          onBatchComplete();
        }
        if (res.checked === 0) break;
        await sleepMs(batchSleepMs);
        const st = stats();
        if (st.byStatus.unknown === 0) break;
      }
    } catch (e: any) {
      console.error('[livecheck scheduler]', e?.message || e);
    } finally {
      schedulerRunning = false;
      progress.running = false;
      progress.lastRunEnd = nowMs();
    }
  };

  schedulerTimer = setInterval(() => {
    tick().catch(() => {});
  }, config.checker.tickMs);
  schedulerTimer.unref();

  setTimeout(() => {
    tick().catch(() => {});
  }, 1500).unref();
}

export function stopScheduler() {
  schedulerStopped = true;
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
