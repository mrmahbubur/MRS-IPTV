import fs from 'fs';
import path from 'path';
import { checkStream } from './livecheck/checker.js';
import { upsertCheckedChannel } from './livecheck/pipeline.js';

export interface InspectedChannel {
  id: string;
  name: string;
  category: string;
  iconUrl: string;
  streamUrl: string;
  tvgId?: string;
  groupTitle?: string;
  status: 'playing' | 'dead';
  bestOption?: string;
  latencyMs?: number;
  workingOptions?: string[];
  failureReason?: string;
  kind?: string;
}

export interface M3uBatchInspectionResult {
  batchId: string;
  sourceName: string;
  sourceUrl?: string;
  createdAt: number;
  totalFound: number;
  playingCount: number;
  notPlayingCount: number;
  playingChannels: InspectedChannel[];
  notPlayingChannels: InspectedChannel[];
  allChannels: InspectedChannel[];
}

// In-memory staging store for pending batches (expires in 30 minutes)
export const pendingM3uBatches = new Map<string, M3uBatchInspectionResult>();

// Periodically clean up expired batches
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [batchId, batch] of pendingM3uBatches.entries()) {
    if (now - batch.createdAt > maxAge) {
      pendingM3uBatches.delete(batchId);
    }
  }
}, 5 * 60 * 1000);

const PROXY_USER_AGENTS: Record<string, string> = {
  vlc: "VLC/3.0.18 LibVLC/3.0.18",
  smarters: "IPTVSmartersPro/3.1.5 (Linux; Android 11; TV)",
  chrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  smarttv: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 76.0.3809.146 TV Safari/537.36"
};

/**
 * Checks a single channel using the real 5-gate verifier:
 * public IP SSRF check, non-HTML 2xx, real segment download + magic bytes, VOD rejection, and live HLS advancement.
 */
export async function auditSingleStream(
  rawStreamUrl: string, 
  timeoutMs = 5000
): Promise<{ isPlaying: boolean; bestOption?: string; latencyMs?: number; workingOptions: string[]; failureReason?: string; kind?: string }> {
  const result = await checkStream(
    { url: rawStreamUrl },
    { timeoutMs, freshnessMaxWaitMs: Math.min(timeoutMs, 3500) }
  );

  if (result.live) {
    const profile = result.bestProfile || 'vlc';
    return {
      isPlaying: true,
      bestOption: profile,
      latencyMs: result.latencyMs,
      workingOptions: [profile],
      kind: result.kind
    };
  }

  return {
    isPlaying: false,
    workingOptions: [],
    latencyMs: result.latencyMs,
    failureReason: result.reason || 'Stream offline'
  };
}

/**
 * Automatically maps group titles and names to clean categories
 */
function normalizeCategory(rawGroup: string, rawName: string): string {
  const g = (rawGroup || '').toLowerCase();
  const n = (rawName || '').toLowerCase();

  if (g.includes('sport') || n.includes('sport') || n.includes('cricket') || n.includes('football') || n.includes('fifa') || n.includes('ipl') || n.includes('t20')) {
    return 'Sports';
  }
  if (g.includes('bangla') || g.includes('bangladesh') || n.includes('bangla') || /\b(somoy|jamuna|gazi|gtv|nagorik|desh|ekattor|deepto|btv|rtv|maasranga|dbc|boishakhi|banglavision|duronto|bijoy|ananda|ntv)\b/i.test(n)) {
    return 'Bangladeshi';
  }
  if (g.includes('movie') || g.includes('cinema') || n.includes('cinema') || n.includes('movies') || n.includes('hbo') || n.includes('star gold')) {
    return 'Movies';
  }
  if (g.includes('news') || n.includes('news') || n.includes('cnn') || n.includes('bbc') || n.includes('al jazeera')) {
    return 'News';
  }
  if (g.includes('kid') || g.includes('cartoon') || n.includes('cartoon') || n.includes('disney') || n.includes('nick') || n.includes('pogo')) {
    return 'Kids';
  }
  if (g.includes('music') || n.includes('music') || n.includes('mtv') || n.includes('9xm')) {
    return 'Music';
  }
  if (g.includes('docu') || n.includes('discovery') || n.includes('nat geo') || n.includes('history')) {
    return 'Documentary';
  }
  if (g.includes('india') || n.includes('hindi') || n.includes('star plus') || n.includes('zee tv') || n.includes('colors')) {
    return 'Indian';
  }
  return rawGroup || 'General';
}

/**
 * Parses raw M3U text into structured raw channel entries
 */
export function parseRawM3u(m3uText: string, _defaultPrefix = 'm3u_chk'): Array<{
  name: string;
  category: string;
  iconUrl: string;
  streamUrl: string;
  tvgId?: string;
  groupTitle?: string;
}> {
  const lines = m3uText.split(/\r?\n/);
  const channels: any[] = [];
  let current: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      current = {};
      const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
      const groupTitleMatch = line.match(/group-title="([^"]*)"/i);
      const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);

      let channelName = tvgNameMatch ? tvgNameMatch[1] : '';
      if (!channelName) {
        const commaIndex = line.lastIndexOf(',');
        if (commaIndex !== -1) {
          channelName = line.slice(commaIndex + 1).trim();
        }
      }
      current.name = channelName || 'Channel';
      current.tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : '';
      current.groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : '';
      current.category = normalizeCategory(current.groupTitle, current.name);
      
      let logo = tvgLogoMatch ? tvgLogoMatch[1].trim() : '';
      if (logo.startsWith('http://')) {
        logo = 'https://' + logo.slice(7);
      }
      current.iconUrl = logo || '';
    } else if (!line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://')) && current) {
      current.streamUrl = line;
      channels.push(current);
      current = null;
    }
  }

  return channels;
}

/**
 * Fetches M3U content from a URL (with fallback for SkyM3U tokens)
 */
export async function fetchM3uContent(url: string): Promise<string> {
  const cleanUrl = url.trim();

  // SkyM3U tokenized URLs support
  if (cleanUrl.includes('go.skym3u.dev') || cleanUrl.includes('go.skym3u.top')) {
    const idMatch = cleanUrl.match(/\/([a-zA-Z0-9_-]+)\.m3u/i);
    const skyId = idMatch ? idMatch[1].toLowerCase() : '88tv';
    const skyDomain = cleanUrl.includes('go.skym3u.dev') ? 'go.skym3u.dev' : 'go.skym3u.top';
    const skyRefDomain = skyDomain.replace('go.', 'www.');
    const localM3uPath = path.join(process.cwd(), 'data', `${skyId}.m3u`);

    if (fs.existsSync(localM3uPath)) {
      try {
        const text = fs.readFileSync(localM3uPath, 'utf-8');
        if (text && text.includes('#EXTINF:')) return text;
      } catch {}
    }

    try {
      const token = Buffer.from(`${Date.now()}_skym3u_pass_${skyId}`).toString('base64');
      const vRes = await fetch(`https://${skyDomain}/verify?id=${skyId}&token=${encodeURIComponent(token)}`, {
        headers: { 'User-Agent': PROXY_USER_AGENTS.chrome, 'Referer': `https://${skyRefDomain}/p/dedicated.html` }
      });
      if (vRes.ok) {
        const vJson: any = await vRes.json();
        const freshUrl = vJson?.data || vJson;
        if (freshUrl && typeof freshUrl === 'string' && freshUrl.startsWith('http')) {
          const mRes = await fetch(freshUrl, {
            headers: { 'User-Agent': PROXY_USER_AGENTS.vlc, 'Referer': `https://${skyRefDomain}/p/dedicated.html` }
          });
          if (mRes.ok) {
            const mText = await mRes.text();
            if (mText.includes('#EXTINF:')) return mText;
          }
        }
      }
    } catch {}
  }

  // Standard fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': PROXY_USER_AGENTS.vlc,
        'Accept': '*/*'
      }
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`Failed to fetch M3U: HTTP ${res.status} (${res.statusText})`);
    }
    const text = await res.text();
    if (!text || (!text.includes('#EXTM3U') && !text.includes('#EXTINF'))) {
      throw new Error("Target URL is not a valid M3U playlist file.");
    }
    return text;
  } catch (err: any) {
    clearTimeout(timer);
    throw new Error(err.message || "Failed to download M3U playlist");
  }
}

/**
 * Master real-stream inspection engine:
 * Parses M3U, deeply probes streams with checkStream, separates genuinely live vs dead channels,
 * and stages results so ONLY live channels are ever committed to the live site catalog.
 */
export async function inspectAndCheckM3u(params: {
  url?: string;
  rawM3u?: string;
  sourceName?: string;
  maxChannelsToCheck?: number;
}): Promise<M3uBatchInspectionResult> {
  const { url, rawM3u, sourceName = 'Imported M3U Playlist', maxChannelsToCheck = 60 } = params;

  let m3uContent = rawM3u || '';
  if (!m3uContent && url) {
    m3uContent = await fetchM3uContent(url);
  }

  if (!m3uContent) {
    throw new Error("No M3U content or URL provided to check.");
  }

  const rawParsed = parseRawM3u(m3uContent);
  if (rawParsed.length === 0) {
    throw new Error("No channel entries (#EXTINF) found in M3U data.");
  }

  const channelsToCheck = rawParsed.slice(0, maxChannelsToCheck);

  // Bounded parallel live verification pool (4 concurrent workers to prevent socket/DNS saturation)
  const CONCURRENCY = 4;
  const inspectedChannels: InspectedChannel[] = [];

  for (let i = 0; i < channelsToCheck.length; i += CONCURRENCY) {
    const slice = channelsToCheck.slice(i, i + CONCURRENCY);
    const sliceResults = await Promise.all(
      slice.map(async (ch, idx) => {
        const id = `chk_${Date.now().toString(36)}_${i + idx}`;
        const audit = await auditSingleStream(ch.streamUrl, 4500);

        const channelObj: InspectedChannel = {
          id,
          name: ch.name,
          category: ch.category,
          iconUrl: ch.iconUrl,
          streamUrl: ch.streamUrl,
          tvgId: ch.tvgId,
          groupTitle: ch.groupTitle,
          status: audit.isPlaying ? 'playing' : 'dead',
          bestOption: audit.bestOption,
          latencyMs: audit.latencyMs,
          workingOptions: audit.workingOptions,
          failureReason: audit.failureReason,
          kind: audit.kind
        };
        return channelObj;
      })
    );
    inspectedChannels.push(...sliceResults);
    if (i + CONCURRENCY < channelsToCheck.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // Strictly NEVER label unprobed tail channels as 'playing'
  if (rawParsed.length > maxChannelsToCheck) {
    for (let i = maxChannelsToCheck; i < rawParsed.length; i++) {
      const ch = rawParsed[i];
      inspectedChannels.push({
        id: `chk_${Date.now().toString(36)}_${i}`,
        name: ch.name,
        category: ch.category,
        iconUrl: ch.iconUrl,
        streamUrl: ch.streamUrl,
        tvgId: ch.tvgId,
        groupTitle: ch.groupTitle,
        status: 'dead',
        failureReason: `Skipped: exceeded max batch inspect limit (${maxChannelsToCheck})`
      });
    }
  }

  const playingChannels = inspectedChannels.filter(c => c.status === 'playing');
  const notPlayingChannels = inspectedChannels.filter(c => c.status === 'dead');

  const batchId = `m3u_batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const batchResult: M3uBatchInspectionResult = {
    batchId,
    sourceName,
    sourceUrl: url,
    createdAt: Date.now(),
    totalFound: inspectedChannels.length,
    playingCount: playingChannels.length,
    notPlayingCount: notPlayingChannels.length,
    playingChannels,
    notPlayingChannels,
    allChannels: inspectedChannels
  };

  pendingM3uBatches.set(batchId, batchResult);
  return batchResult;
}

/**
 * Commits ONLY verified live channels from a staged batch to the live catalog and SQLite DB.
 */
export async function commitPendingBatch(params: {
  batchId: string;
  mode: 'working_only' | 'all' | 'selected';
  selectedIds?: string[];
  customName?: string;
}): Promise<{
  success: boolean;
  channelsAdded: number;
  sourcePrefix: string;
  sourceName: string;
  persistedM3uPath: string;
}> {
  const { batchId, mode, selectedIds = [], customName } = params;
  const batch = pendingM3uBatches.get(batchId);

  if (!batch) {
    throw new Error("Inspection batch has expired or does not exist. Please paste and test the M3U link again.");
  }

  // Strictly only allow verified live channels to enter the live site playlist
  let channelsToCommit: InspectedChannel[] = [];
  if (mode === 'selected' && selectedIds.length > 0) {
    const set = new Set(selectedIds);
    channelsToCommit = batch.playingChannels.filter(c => set.has(c.id));
  } else {
    channelsToCommit = batch.playingChannels;
  }

  if (channelsToCommit.length === 0) {
    throw new Error("No verified live channels found to import. Dead/offline channels are excluded.");
  }

  const cleanPrefix = `imp_${Date.now().toString(36)}`;
  const finalName = customName || batch.sourceName || `Imported Live M3U (${channelsToCommit.length} Channels)`;

  for (const ch of channelsToCommit) {
    upsertCheckedChannel({
      url: ch.streamUrl,
      name: ch.name,
      logo: ch.iconUrl,
      group: ch.category,
      tvgId: ch.tvgId,
      source: finalName,
      result: {
        live: true,
        reason: 'ok_imported_live',
        latencyMs: ch.latencyMs || 150,
        kind: ch.kind || 'hls',
        bestProfile: ch.bestOption || 'vlc'
      }
    });
  }

  // Generate standardized M3U playlist file content
  let m3uOutput = `#EXTM3U name="${finalName}"\n`;
  channelsToCommit.forEach(ch => {
    m3uOutput += `#EXTINF:-1 tvg-id="${ch.tvgId || ''}" tvg-name="${ch.name}" tvg-logo="${ch.iconUrl}" group-title="${ch.category}",${ch.name}\n`;
    m3uOutput += `${ch.streamUrl}\n`;
  });

  // Save to /data directory
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const fileName = `${cleanPrefix}.m3u`;
  const m3uFilePath = path.join(dataDir, fileName);
  fs.writeFileSync(m3uFilePath, m3uOutput, 'utf-8');

  // Also maintain persistent sources ledger in data/custom_imported_sources.json
  const ledgerPath = path.join(dataDir, 'custom_imported_sources.json');
  let currentLedger: any[] = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      currentLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    } catch {}
  }

  currentLedger.push({
    prefix: cleanPrefix,
    name: finalName,
    url: batch.sourceUrl || `local:${fileName}`,
    channelCount: channelsToCommit.length,
    importedAt: new Date().toISOString(),
    mode
  });

  fs.writeFileSync(ledgerPath, JSON.stringify(currentLedger, null, 2), 'utf-8');

  // Purge committed batch from staging
  pendingM3uBatches.delete(batchId);

  return {
    success: true,
    channelsAdded: channelsToCommit.length,
    sourcePrefix: cleanPrefix,
    sourceName: finalName,
    persistedM3uPath: m3uFilePath
  };
}
