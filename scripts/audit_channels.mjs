import fs from 'fs';

const API_BASE = 'http://localhost:3000';
const TIMEOUT_MS = 2500;
const CONCURRENCY = 30;

async function probeTarget(target, optName, isDirect = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const headers = {};
    if (isDirect) {
      headers['User-Agent'] = 'VLC/3.0.18 LibVLC/3.0.18';
      headers['Accept'] = '*/*';
    }
    const res = await fetch(target, {
      signal: controller.signal,
      headers
    });
    const elapsed = Date.now() - start;
    clearTimeout(timer);

    if (res.ok) {
      const text = await res.text();
      const isM3u = text.includes('#EXTM3U') || text.includes('#EXTINF') || text.includes('#EXT-X-STREAM-INF') || text.includes('#EXT-X-TARGETDURATION');
      const ct = res.headers.get('content-type') || '';
      if (isM3u || ct.includes('mpegurl') || ct.includes('video/') || ct.includes('octet-stream')) {
        return {
          success: true,
          option: optName,
          status: res.status,
          latencyMs: elapsed,
          contentType: ct,
          hasManifest: isM3u,
          bodySnippet: text.slice(0, 100)
        };
      }
      return { success: false, option: optName, status: res.status, reason: 'Non-HLS response' };
    }
    return { success: false, option: optName, status: res.status, reason: `HTTP ${res.status}` };
  } catch (err) {
    clearTimeout(timer);
    return { success: false, option: optName, reason: err.name === 'AbortError' ? 'Timeout (>2.5s)' : (err.message || 'Error') };
  }
}

async function testChannel(ch) {
  let rawUrl = ch.m3u8Url;
  if (rawUrl.startsWith('/api/proxy?url=')) {
    rawUrl = decodeURIComponent(rawUrl.replace('/api/proxy?url=', ''));
  }

  // 1. Test all 5 playback options in parallel on primary stream
  const optionsToTest = [
    { name: 'vlc', url: `${API_BASE}/api/proxy?url=${encodeURIComponent(rawUrl)}&mode=vlc`, isDirect: false },
    { name: 'smarters', url: `${API_BASE}/api/proxy?url=${encodeURIComponent(rawUrl)}&mode=smarters`, isDirect: false },
    { name: 'chrome', url: `${API_BASE}/api/proxy?url=${encodeURIComponent(rawUrl)}&mode=chrome`, isDirect: false },
    { name: 'smarttv', url: `${API_BASE}/api/proxy?url=${encodeURIComponent(rawUrl)}&mode=smarttv`, isDirect: false },
    { name: 'direct', url: rawUrl, isDirect: true },
  ];

  const primaryProbes = await Promise.all(optionsToTest.map(o => probeTarget(o.url, o.name, o.isDirect)));
  const successfulProbe = primaryProbes.find(p => p.success);

  if (successfulProbe) {
    return {
      isPlaying: true,
      channel: {
        id: ch.id,
        name: ch.name,
        category: ch.category || 'General',
        tvgId: ch.tvgId || 'N/A',
        streamUrl: rawUrl,
        bestOption: successfulProbe.option,
        latencyMs: successfulProbe.latencyMs,
        contentType: successfulProbe.contentType,
        workingOptions: primaryProbes.filter(p => p.success).map(p => p.option),
        mirrorsAvailable: (ch.mirrors || []).length
      }
    };
  }

  // 2. If primary fails and channel has mirrors, test the first mirror with VLC & Smarters
  if (Array.isArray(ch.mirrors) && ch.mirrors.length > 0) {
    let mirrorUrl = ch.mirrors[0];
    if (mirrorUrl.startsWith('/api/proxy?url=')) {
      mirrorUrl = decodeURIComponent(mirrorUrl.replace('/api/proxy?url=', ''));
    }
    if (mirrorUrl !== rawUrl) {
      const mirrorProbes = await Promise.all([
        probeTarget(`${API_BASE}/api/proxy?url=${encodeURIComponent(mirrorUrl)}&mode=vlc`, 'mirror_vlc', false),
        probeTarget(`${API_BASE}/api/proxy?url=${encodeURIComponent(mirrorUrl)}&mode=smarters`, 'mirror_smarters', false),
        probeTarget(mirrorUrl, 'mirror_direct', true)
      ]);
      const mirrorSuccess = mirrorProbes.find(p => p.success);
      if (mirrorSuccess) {
        return {
          isPlaying: true,
          channel: {
            id: ch.id,
            name: ch.name,
            category: ch.category || 'General',
            tvgId: ch.tvgId || 'N/A',
            streamUrl: mirrorUrl,
            bestOption: mirrorSuccess.option,
            latencyMs: mirrorSuccess.latencyMs,
            contentType: mirrorSuccess.contentType,
            workingOptions: mirrorProbes.filter(p => p.success).map(p => p.option),
            mirrorsAvailable: ch.mirrors.length
          }
        };
      }
    }
  }

  // If all options failed
  const mainReason = primaryProbes[0]?.reason || primaryProbes[0]?.status || 'Unreachable';
  return {
    isPlaying: false,
    channel: {
      id: ch.id,
      name: ch.name,
      category: ch.category || 'General',
      tvgId: ch.tvgId || 'N/A',
      streamUrl: rawUrl,
      mirrorsCount: (ch.mirrors || []).length,
      failureReason: typeof mainReason === 'number' ? `HTTP ${mainReason}` : String(mainReason),
      optionsTested: ['vlc', 'smarters', 'chrome', 'smarttv', 'direct']
    }
  };
}

async function runAudit() {
  console.log('Fetching channels from local server...');
  const res = await fetch(`${API_BASE}/api/channels/links?format=json`);
  const data = await res.json();
  const allChannels = data.channels || [];
  console.log(`Loaded ${allChannels.length} total channels from store.`);

  // Deduplicate channels
  const uniqueChannelsMap = new Map();
  for (const ch of allChannels) {
    const key = (ch.canonicalKey || ch.name.toLowerCase().trim());
    if (!uniqueChannelsMap.has(key)) {
      uniqueChannelsMap.set(key, ch);
    }
  }
  const uniqueChannels = Array.from(uniqueChannelsMap.values());
  console.log(`Evaluating ${uniqueChannels.length} distinct canonical channels...`);

  // Target representative sample across all categories (total ~250 channels for quick, thorough completion)
  const categoryLimits = {
    'Sports': 35,
    'News': 35,
    'Bangladeshi': 35,
    'Movies': 25,
    'Entertainment': 25,
    'Documentary': 20,
    'Indian': 20,
    'Kids': 15,
    'Music': 15,
    'Religious': 15,
    'Lifestyle': 10,
    "Recent WC Event's": 10,
    'General': 20
  };

  const targetChannels = [];
  const catCounts = {};
  for (const ch of uniqueChannels) {
    const cat = ch.category || 'General';
    const limit = categoryLimits[cat] || 15;
    catCounts[cat] = (catCounts[cat] || 0);
    if (catCounts[cat] < limit) {
      targetChannels.push(ch);
      catCounts[cat]++;
    }
  }

  console.log(`Testing ${targetChannels.length} distinct channels across 13 categories...`);

  const playingList = [];
  const notPlayingList = [];
  let completed = 0;

  for (let i = 0; i < targetChannels.length; i += CONCURRENCY) {
    const chunk = targetChannels.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(ch => testChannel(ch)));

    for (const r of results) {
      if (r.isPlaying) {
        playingList.push(r.channel);
      } else {
        notPlayingList.push(r.channel);
      }
    }
    completed += chunk.length;
    console.log(`Audited: ${completed}/${targetChannels.length} | Playing: ${playingList.length} | Not Playing: ${notPlayingList.length}`);
  }

  const report = {
    auditedAt: new Date().toISOString(),
    totalAudited: targetChannels.length,
    totalPlaying: playingList.length,
    totalNotPlaying: notPlayingList.length,
    playingPercentage: `${((playingList.length / targetChannels.length) * 100).toFixed(1)}%`,
    testedOptions: ['vlc', 'smarters', 'chrome', 'smarttv', 'direct', 'mirrors'],
    playingChannels: playingList,
    notPlayingChannels: notPlayingList
  };

  fs.writeFileSync('/tmp/channel_audit_results.json', JSON.stringify(report, null, 2));
  console.log('\nAudit complete! Saved to /tmp/channel_audit_results.json');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
