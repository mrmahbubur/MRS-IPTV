import express, { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { checkStream } from './livecheck/checker.js';
import {
  getLiveIndex,
  invalidateLiveIndex,
  liveChannels,
  listDeadSample,
  listLiveSample,
  loadSources,
  runChecks,
  stats as pipelineStats,
  syncSources,
  upsertCheckedChannel,
  isSchedulerActive,
} from './livecheck/pipeline.js';
import { db } from './mrs-iptv-backend/src/db.js';

export interface DoctorSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  entriesCount?: number;
  lastChecked?: string;
  status?: 'ok' | 'error' | 'pending';
  lastError?: string;
  sample?: string[];
  tags?: string[];
  createdAt: string;
}

export interface DoctorState {
  version: number;
  lastFullScanAt?: string;
  lastRetryScanAt?: string;
  totals: {
    scanned: number;
    alive: number;
    removed: number;
    deadRemoved: number;
    pending: number;
    unknown: number;
  };
  running: boolean;
  isScanning: boolean;
  currentMode?: 'full' | 'retry' | 'idle';
}

const safeEqual = (a: any, b: any) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

function getBlockedHostsList(): string[] {
  return String(process.env.BLOCKED_SOURCE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isBlockedSourceHost(targetUrl: string): boolean {
  const blocked = getBlockedHostsList();
  if (blocked.length === 0) return false;
  try {
    const clean = targetUrl.startsWith('/api/proxy?url=')
      ? decodeURIComponent(targetUrl.replace('/api/proxy?url=', '').split('&')[0])
      : targetUrl;
    const host = new URL(clean).hostname.toLowerCase();
    return blocked.some((b) => host === b || host.endsWith(`.${b}`));
  } catch {
    return false;
  }
}

export class M3uDoctorService {
  private dataDir: string;
  private sourcesFile: string;
  private adminToken: string;
  private logsRing: string[] = [];
  private maxLogs = 500;

  private allowVod = process.env.ACCEPT_VOD === 'true' || process.env.HEALTH_ALLOW_VOD === '1';
  private liveCheck = process.env.FRESHNESS_CHECK !== 'false';
  private isScanning = false;
  private lastScanAt: string | undefined;

  constructor(options: { dataDir?: string; adminToken?: string } = {}) {
    this.dataDir = path.resolve(options.dataDir || 'data/m3u-doctor');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.sourcesFile = path.join(this.dataDir, 'sources.json');
    this.adminToken = options.adminToken || process.env.ADMIN_TOKEN || 'mrs-doctor-admin-token-2026';
    this.initStorage();
  }

  public log(msg: string) {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    console.log(`[m3u-doctor] ${msg}`);
    this.logsRing.unshift(entry);
    if (this.logsRing.length > this.maxLogs) this.logsRing.pop();
  }

  public getLogs(lines = 200): string[] {
    return this.logsRing.slice(0, Math.min(lines, this.maxLogs));
  }

  private initStorage() {
    const existingSources: DoctorSource[] = fs.existsSync(this.sourcesFile)
      ? (() => {
          try {
            return JSON.parse(fs.readFileSync(this.sourcesFile, 'utf8'));
          } catch {
            return [];
          }
        })()
      : [];
    const existingUrls = new Set(existingSources.map((s) => s.url));
    const existingIds = new Set(existingSources.map((s) => s.id));
    let sourcesChanged = !fs.existsSync(this.sourcesFile);

    if (fs.existsSync('data')) {
      const dataFiles = fs.readdirSync('data').filter((f) => f.endsWith('.m3u')).sort();
      for (const f of dataFiles) {
        const localUrl = `/data/${f}`;
        const srcId = f.replace('.m3u', '');
        if (!existingUrls.has(localUrl) && !existingIds.has(srcId)) {
          existingSources.push({
            id: srcId,
            name: `Local Playlist (${f})`,
            url: localUrl,
            enabled: true,
            createdAt: new Date().toISOString(),
          });
          sourcesChanged = true;
        }
      }
    }
    if (sourcesChanged) {
      fs.writeFileSync(this.sourcesFile, JSON.stringify(existingSources, null, 2));
    }
  }

  public getHealthSnapshot() {
    const idx = getLiveIndex();
    const st = pipelineStats();
    const lastOkRow = db
      .prepare("SELECT MAX(last_checked) AS ts FROM channels WHERE in_source=1 AND last_checked IS NOT NULL")
      .get() as { ts: number | null } | undefined;
    const verifiedAt = lastOkRow?.ts ? new Date(lastOkRow.ts).toISOString() : this.lastScanAt;

    return {
      okUrls: idx.liveUrls,
      removedUrls: idx.deadUrls,
      pendingUrls: new Set<string>(),
      at: Date.now(),
      totals: {
        scanned: st.byStatus.live + st.byStatus.dead,
        alive: st.byStatus.live,
        removed: st.byStatus.dead,
        deadRemoved: st.byStatus.dead,
        pending: st.byStatus.unknown,
        unknown: st.byStatus.unknown,
        totalInSource: st.totalInSource,
        uniqueLiveChannels: st.uniqueLiveChannels,
      },
      verifiedAt,
    };
  }

  public getUrlHealthStatus(url: string): 'alive' | 'dead' | 'pending' | 'unknown' {
    const idx = getLiveIndex();
    const raw = url.startsWith('/api/proxy?url=')
      ? decodeURIComponent(url.replace('/api/proxy?url=', '').split('&')[0])
      : url;
    const info = idx.byUrl.get(raw) || idx.byUrl.get(url);
    if (!info) return 'unknown';
    if (info.status === 'live') return 'alive';
    if (info.status === 'dead') return 'dead';
    return 'unknown';
  }

  public getSources(): DoctorSource[] {
    try {
      return JSON.parse(fs.readFileSync(this.sourcesFile, 'utf8'));
    } catch {
      return [];
    }
  }

  public saveSources(sources: DoctorSource[]) {
    fs.writeFileSync(this.sourcesFile, JSON.stringify(sources, null, 2));
  }

  public getState(): DoctorState {
    const st = pipelineStats();
    const running = this.isScanning || isSchedulerActive();
    const lastRow = db
      .prepare("SELECT MAX(last_checked) AS ts FROM channels WHERE in_source=1 AND last_checked IS NOT NULL")
      .get() as { ts: number | null } | undefined;
    const lastTs = lastRow?.ts ? new Date(lastRow.ts).toISOString() : this.lastScanAt;

    return {
      version: 2,
      lastFullScanAt: lastTs,
      lastRetryScanAt: lastTs,
      totals: {
        scanned: st.byStatus.live + st.byStatus.dead,
        alive: st.byStatus.live,
        removed: st.byStatus.dead,
        deadRemoved: st.byStatus.dead,
        pending: st.byStatus.unknown,
        unknown: st.byStatus.unknown,
      },
      running,
      isScanning: running,
      currentMode: running ? 'full' : 'idle',
    };
  }

  public getCleanM3u(): string {
    const live = liveChannels({});
    const lines = ['#EXTM3U'];
    for (const c of live) {
      lines.push(
        `#EXTINF:-1 tvg-id="${c.tvgId || ''}" tvg-logo="${c.logo || ''}" group-title="${c.group || 'General'}",${c.name}`,
        c.url
      );
    }
    return lines.join('\n') + '\n';
  }

  public getRemovedM3u(): string {
    const deadRows = db
      .prepare(
        "SELECT name, url, group_title AS groupTitle, last_reason AS reason FROM channels WHERE status='dead' AND in_source=1 ORDER BY last_checked DESC LIMIT 5000"
      )
      .all() as Array<{ name: string; url: string; groupTitle: string | null; reason: string | null }>;
    const lines = ['#EXTM3U'];
    for (const ch of deadRows) {
      lines.push(
        `#EXTINF:-1 x-doctor-reason="${ch.reason || 'offline'}" group-title="${ch.groupTitle || 'Dead'}",${ch.name}`,
        ch.url
      );
    }
    return lines.join('\n') + '\n';
  }

  public getReport(): any {
    const st = pipelineStats();
    const live = listLiveSample(200);
    const dead = listDeadSample(200);
    const lastRow = db
      .prepare("SELECT MAX(last_checked) AS ts FROM channels WHERE in_source=1 AND last_checked IS NOT NULL")
      .get() as { ts: number | null } | undefined;
    const finishedAt = lastRow?.ts ? new Date(lastRow.ts).toISOString() : this.lastScanAt || new Date().toISOString();

    return {
      finishedAt,
      mode: 'livecheck-sqlite',
      totals: {
        scanned: st.byStatus.live + st.byStatus.dead,
        alive: st.byStatus.live,
        removed: st.byStatus.dead,
        deadRemoved: st.byStatus.dead,
        pending: st.byStatus.unknown,
        unknown: st.byStatus.unknown,
        totalInSource: st.totalInSource,
        uniqueLiveChannels: st.uniqueLiveChannels,
      },
      deadReasons: st.deadReasons,
      channels: live,
      removed: dead,
      removedChannels: dead,
      pending: [],
    };
  }

  // Real 5-gate verification delegating directly to livecheck/checker.ts
  public async probeStreamDeep(
    targetUrl: string,
    timeoutMs = 5000,
    options: { shallow?: boolean; checkLiveAdvance?: boolean } = {}
  ): Promise<{
    live: boolean;
    httpStatus?: number;
    latencyMs: number;
    reason: string;
    isHardFailure: boolean;
    segmentBytesChecked?: number;
    segmentKind?: 'mpegts' | 'fmp4' | 'aac' | 'unknown';
    streamKind?: 'live' | 'vod';
    stage: number;
  }> {
    let fetchUrl = targetUrl.trim();
    if (fetchUrl.startsWith('/api/proxy?url=')) {
      fetchUrl = decodeURIComponent(fetchUrl.replace('/api/proxy?url=', '').split('&')[0]);
    }

    if (isBlockedSourceHost(fetchUrl)) {
      return {
        live: false,
        httpStatus: 403,
        latencyMs: 0,
        reason: 'blocked source host — licence rule',
        isHardFailure: true,
        stage: 0,
      };
    }

    const r = await checkStream(
      { url: fetchUrl },
      {
        timeoutMs,
        freshnessCheck: options.shallow ? false : (options.checkLiveAdvance ?? this.liveCheck),
        acceptVod: this.allowVod,
      }
    );

    const statusMatch = r.reason.match(/http_(\d{3})/);
    const httpStatus = statusMatch ? Number(statusMatch[1]) : r.live ? 200 : undefined;
    const segKind: 'mpegts' | 'fmp4' | 'aac' | 'unknown' =
      r.kind === 'mpegts' || r.kind === 'fmp4' ? r.kind : r.kind === 'audio' ? 'aac' : 'unknown';

    return {
      live: r.live,
      httpStatus,
      latencyMs: r.latencyMs,
      reason: r.reason,
      isHardFailure: !r.live && (r.reason !== 'timeout' && r.reason !== 'network_error'),
      segmentKind: segKind,
      streamKind: r.reason === 'vod_not_live' ? 'vod' : 'live',
      stage: r.live ? 5 : 1,
    };
  }

  public async runScan(mode: 'full' | 'retry' = 'full'): Promise<DoctorState> {
    if (this.isScanning) {
      this.log(`Scan pass already in progress. Skipping duplicate request.`);
      return this.getState();
    }
    this.isScanning = true;
    this.log(`Starting livecheck ${mode} verification pass...`);
    try {
      const sync = await syncSources(loadSources());
      const limit = mode === 'retry' ? 400 : 1500;
      const check = await runChecks({ limit });
      this.lastScanAt = new Date().toISOString();
      invalidateLiveIndex();
      this.log(
        `livecheck ${mode} completed: synced ${sync.total} (${sync.added} new), checked ${check.checked} -> ${check.live} live, ${check.dead} dead.`
      );
      return this.getState();
    } catch (e: any) {
      this.log(`Scan error: ${e?.message || String(e)}`);
      return this.getState();
    } finally {
      this.isScanning = false;
    }
  }

  public async reviveUrls(urls: string[]): Promise<any[]> {
    const results: any[] = [];
    for (const url of urls) {
      const cleanUrl = url.startsWith('/api/proxy?url=')
        ? decodeURIComponent(url.replace('/api/proxy?url=', '').split('&')[0])
        : url;
      const existing = db.prepare('SELECT name, logo, group_title, tvg_id, source FROM channels WHERE url=?').get(cleanUrl) as any;
      const r = await checkStream({ url: cleanUrl }, { timeoutMs: 6000 });
      upsertCheckedChannel({
        url: cleanUrl,
        name: existing?.name || 'Revived Channel',
        logo: existing?.logo || undefined,
        group: existing?.group_title || 'Restored',
        tvgId: existing?.tvg_id || undefined,
        source: existing?.source || 'revive',
        result: r,
      });
      if (r.live) {
        results.push({ found: true, live: true, restored: true, reason: r.reason, latencyMs: r.latencyMs });
      } else {
        const statusMatch = r.reason.match(/http_(\d{3})/);
        results.push({
          found: true,
          live: false,
          restored: false,
          reason: r.reason,
          httpStatus: statusMatch ? Number(statusMatch[1]) : undefined,
        });
      }
    }
    invalidateLiveIndex();
    return results;
  }

  public checkAdminAuth(req: Request): boolean {
    const token =
      (req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
      (req.get('x-admin-token') as string) ||
      (req.query.token as string) ||
      '';
    return safeEqual(token, this.adminToken);
  }
}

export function createM3uDoctorRouter(doctor: M3uDoctorService): express.Router {
  const router = express.Router();

  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (doctor.checkAdminAuth(req)) return next();
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Admin token required' } });
  };

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'm3u-doctor', time: new Date().toISOString(), status: doctor.getState() });
  });

  router.get('/clean.m3u', (_req, res) => {
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.send(doctor.getCleanM3u());
  });

  router.get('/report.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(doctor.getReport());
  });

  router.get('/removed.m3u', (_req, res) => {
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.send(doctor.getRemovedM3u());
  });

  router.get('/status', (_req, res) => {
    const state = doctor.getState();
    const sources = doctor.getSources();
    res.json({
      ok: true,
      service: 'm3u-doctor',
      running: state.running,
      isScanning: state.isScanning,
      currentMode: state.currentMode,
      totals: state.totals,
      lastFullScanAt: state.lastFullScanAt,
      lastRetryScanAt: state.lastRetryScanAt,
      sourcesCount: sources.length,
      sources: sources.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled, url: s.url })),
    });
  });

  router.get('/check', async (req: Request, res: Response) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: 'url parameter is required' });
    if (isBlockedSourceHost(url)) {
      return res.status(403).json({
        error: { code: 'blocked_source_host', message: 'Host is in BLOCKED_SOURCE_HOSTS' },
      });
    }
    const result = await doctor.probeStreamDeep(url, 5000, {
      shallow: req.query.shallow === '1',
      checkLiveAdvance: req.query.live === '1',
    });
    res.json({ url, ...result });
  });

  router.get('/sources', requireAdmin, (_req, res) => {
    res.json({ sources: doctor.getSources() });
  });

  router.post('/sources', requireAdmin, async (req: Request, res: Response) => {
    const body = req.body || {};
    const urlsText = body.urls || body.url;
    if (!urlsText) return res.status(400).json({ error: 'url or urls required' });

    const urls = Array.from(
      new Set(
        String(urlsText)
          .split(/\r?\n/)
          .map((u) => u.trim())
          .filter(Boolean)
      )
    );
    const existing = doctor.getSources();
    const results: any[] = [];
    let addedCount = 0;

    for (const u of urls) {
      let bodyContent = '';
      let kind: 'm3u' | 'json' = 'm3u';
      let entries = 0;
      const sample: string[] = [];

      const isLocalPath = u.startsWith('/data/') || u.startsWith('data/');
      if (!isLocalPath) {
        try {
          const parsed = new URL(u);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            results.push({ url: u, added: false, valid: false, reason: 'Only http:// or https:// URLs are supported' });
            continue;
          }
        } catch {
          results.push({ url: u, added: false, valid: false, reason: 'Malformed URL syntax' });
          continue;
        }
        if (isBlockedSourceHost(u)) {
          results.push({ url: u, added: false, valid: false, reason: 'Blocked source host (BLOCKED_SOURCE_HOSTS)' });
          continue;
        }
      }

      try {
        if (isLocalPath) {
          const localRel = u.replace(/^\//, '');
          if (!fs.existsSync(localRel)) {
            results.push({ url: u, added: false, valid: false, reason: 'Local playlist file not found' });
            continue;
          }
          bodyContent = fs.readFileSync(localRel, 'utf8');
        } else {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 9000);
          const upstream = await fetch(u, {
            signal: ctrl.signal,
            headers: {
              'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
              Accept: '*/*',
            },
          });
          clearTimeout(timer);

          if (!upstream.ok) {
            results.push({
              url: u,
              added: false,
              valid: false,
              httpStatus: upstream.status,
              reason: `HTTP ${upstream.status} from upstream source`,
            });
            continue;
          }
          bodyContent = await upstream.text();
        }
      } catch (err: any) {
        const isTimeout = err?.name === 'AbortError' || err?.message?.includes('abort');
        results.push({
          url: u,
          added: false,
          valid: false,
          reason: isTimeout ? 'Upstream request timed out' : `Network/DNS failure: ${err?.message || 'unreachable'}`,
        });
        continue;
      }

      const trimmed = bodyContent.trim();
      if (!trimmed) {
        results.push({ url: u, added: false, valid: false, reason: 'Empty response body from source' });
        continue;
      }
      if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || trimmed.includes('Attention Required! | Cloudflare')) {
        results.push({ url: u, added: false, valid: false, reason: 'Provider returned HTML login/Cloudflare block page instead of playlist' });
        continue;
      }

      const lines = trimmed.split(/\r?\n/);
      const hasExtInf = lines.some((l) => l.trim().startsWith('#EXTINF:'));
      const hasExtM3u = lines.some((l) => l.trim().startsWith('#EXTM3U'));
      if (!hasExtInf && !hasExtM3u) {
        results.push({ url: u, added: false, valid: false, reason: 'Not a valid M3U playlist (#EXTM3U / #EXTINF missing)' });
        continue;
      }
      kind = 'm3u';
      for (const l of lines) {
        const tLine = l.trim();
        if (tLine.startsWith('#EXTINF:')) {
          entries++;
          if (sample.length < 3) {
            const titleMatch = tLine.match(/,(.+)$/);
            if (titleMatch && titleMatch[1]) sample.push(titleMatch[1].trim());
          }
        }
      }
      if (entries === 0) {
        results.push({ url: u, added: false, valid: false, reason: 'M3U playlist contains 0 channel entries' });
        continue;
      }

      const duplicateIdx = existing.findIndex((s) => s.url === u);
      if (duplicateIdx !== -1) {
        existing[duplicateIdx].entriesCount = entries;
        existing[duplicateIdx].lastChecked = new Date().toISOString();
        existing[duplicateIdx].status = 'ok';
        existing[duplicateIdx].sample = sample;
        results.push({
          url: u,
          added: true,
          duplicateUpdated: true,
          valid: true,
          id: existing[duplicateIdx].id,
          entries,
          kind,
          sample,
        });
      } else {
        const id = randomBytes(5).toString('hex');
        const newSource: DoctorSource = {
          id,
          name: body.name || `Source ${id}`,
          url: u,
          enabled: true,
          entriesCount: entries,
          lastChecked: new Date().toISOString(),
          status: 'ok',
          sample,
          createdAt: new Date().toISOString(),
        };
        existing.push(newSource);
        addedCount++;
        results.push({ url: u, added: true, valid: true, id, entries, kind, sample });
      }
    }

    if (results.some((r) => r.added)) {
      doctor.saveSources(existing);
      if (body.scan !== false) {
        doctor.runScan('full').catch(() => {});
      }
    }

    const anyValid = results.some((r) => r.valid);
    res.status(addedCount > 0 ? 201 : anyValid ? 200 : 422).json({ results, totalSources: existing.length });
  });

  router.patch('/sources/:id', requireAdmin, (req: Request, res: Response) => {
    const sources = doctor.getSources();
    const idx = sources.findIndex((s) => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Source not found' });

    const updates = req.body || {};
    if (typeof updates.enabled === 'boolean') sources[idx].enabled = updates.enabled;
    if (updates.name) sources[idx].name = String(updates.name);
    if (Array.isArray(updates.tags)) sources[idx].tags = updates.tags;

    doctor.saveSources(sources);
    res.json({ ok: true, source: sources[idx] });
  });

  router.delete('/sources/:id', requireAdmin, (req: Request, res: Response) => {
    const sources = doctor.getSources();
    const filtered = sources.filter((s) => s.id !== req.params.id);
    if (filtered.length === sources.length) return res.status(404).json({ error: 'Source not found' });
    doctor.saveSources(filtered);
    res.json({ ok: true, deleted: true });
  });

  router.post('/sources/:id/validate', requireAdmin, async (req: Request, res: Response) => {
    const sources = doctor.getSources();
    const src = sources.find((s) => s.id === req.params.id);
    if (!src) return res.status(404).json({ error: 'Source not found' });

    const probe = await doctor.probeStreamDeep(src.url, 4000);
    res.json({ sourceId: src.id, url: src.url, ...probe });
  });

  router.post('/run', requireAdmin, async (req: Request, res: Response) => {
    const mode = req.body?.mode === 'retry' ? 'retry' : 'full';
    doctor.runScan(mode).catch(() => {});
    res.json({ ok: true, message: `${mode} live verification pass started in background`, running: true });
  });

  router.post('/revive', requireAdmin, async (req: Request, res: Response) => {
    const body = req.body || {};
    const urls = body.urls ? (Array.isArray(body.urls) ? body.urls : [body.urls]) : body.url ? [body.url] : [];
    if (!urls.length) return res.status(400).json({ error: 'url or urls required' });

    const results = await doctor.reviveUrls(urls);
    res.json({ success: results.some((r) => r.restored), results });
  });

  router.get('/logs', requireAdmin, (req: Request, res: Response) => {
    const lines = Number(req.query.lines) || 200;
    res.json({ logs: doctor.getLogs(lines) });
  });

  return router;
}
