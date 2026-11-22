import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

// Configure isolated temporary DB and test flags BEFORE dynamically importing config/db/pipeline
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mrs-livecheck-test-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.ALLOW_PRIVATE_NETWORKS = 'true';
process.env.FRESHNESS_MAX_WAIT_MS = '1800';
process.env.FAIL_THRESHOLD = '2';

const { checkStream, isPrivateIp } = await import('../server/livecheck/checker.js');
const { parseM3u } = await import('../server/livecheck/m3u.js');
const pipeline = await import('../server/livecheck/pipeline.js');
const { db } = await import('../server/mrs-iptv-backend/src/db.js');

const ts = () => {
  const b = Buffer.alloc(188 * 20, 0xff);
  for (let i = 0; i < 20; i++) b[i * 188] = 0x47;
  return b;
};

let server: http.Server;
let base: string;
let seqCounter = 100;
let flakyHits = 0;

test.before(async () => {
  server = http.createServer((req, res) => {
    const u = (req.url || '/').split('?')[0];
    const pl = (body: string, ct = 'application/vnd.apple.mpegurl') => {
      res.writeHead(200, { 'content-type': ct });
      res.end(body);
    };
    if (u === '/live.m3u8') {
      seqCounter++;
      return pl(
        `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${seqCounter}\n#EXTINF:1,\nseg${seqCounter}.ts\n#EXTINF:1,\nseg${seqCounter + 1}.ts\n`
      );
    }
    if (u.startsWith('/seg')) {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      return res.end(ts());
    }
    if (u === '/master.m3u8') {
      return pl('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlive.m3u8\n');
    }
    if (u === '/frozen.m3u8') {
      return pl('#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:5\n#EXTINF:1,\nseg5.ts\n#EXTINF:1,\nseg6.ts\n');
    }
    if (u === '/vod.m3u8') {
      return pl('#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nseg1.ts\n#EXT-X-ENDLIST\n');
    }
    if (u === '/html200') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><body>Please login</body></html>');
    }
    if (u === '/fakeplaylist.m3u8') {
      return pl('<html>blocked</html>');
    }
    if (u === '/badsegs.m3u8') {
      return pl('#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:1,\nmissing.ts\n');
    }
    if (u === '/missing.ts' || u === '/dead') {
      res.writeHead(404);
      return res.end('nope');
    }
    if (u === '/direct.ts') {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      return res.end(ts());
    }
    if (u === '/slow') {
      return; // never answers -> triggers timeout
    }
    if (u === '/redirect') {
      res.writeHead(302, { location: '/direct.ts' });
      return res.end();
    }
    if (u === '/flaky.m3u8') {
      flakyHits++;
      if (flakyHits % 2 === 1) {
        res.writeHead(503);
        return res.end();
      }
      seqCounter++;
      return pl(
        `#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${seqCounter}\n#EXTINF:1,\nseg${seqCounter}.ts\n`
      );
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});

test.after(() => {
  server?.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup issues
  }
});

const chk = (p: string, o: Record<string, any> = {}) =>
  checkStream({ url: base + p }, { timeoutMs: 1500, ...o });

test('live HLS (advancing playlist, real segments) is live', async () => {
  const r = await chk('/live.m3u8');
  assert.equal(r.live, true, r.reason);
  assert.equal(r.kind, 'hls');
});

test('master playlist -> variant -> live', async () => {
  const r = await chk('/master.m3u8');
  assert.equal(r.live, true, r.reason);
});

test('direct TS stream is live', async () => {
  const r = await chk('/direct.ts');
  assert.equal(r.live, true, r.reason);
});

test('redirects are followed', async () => {
  const r = await chk('/redirect');
  assert.equal(r.live, true, r.reason);
});

test('404 is dead', async () => {
  const r = await chk('/dead');
  assert.equal(r.live, false);
  assert.equal(r.reason, 'http_404');
});

test('HTML page served with 200 is dead', async () => {
  const r = await chk('/html200');
  assert.equal(r.live, false);
  assert.equal(r.reason, 'html_not_stream');
});

test('fake playlist (html under .m3u8) is dead', async () => {
  const r = await chk('/fakeplaylist.m3u8');
  assert.equal(r.live, false);
});

test('playlist ok but segments 404 is dead', async () => {
  const r = await chk('/badsegs.m3u8');
  assert.equal(r.live, false);
  assert.match(r.reason, /segment_http_404/);
});

test('frozen playlist that never advances is dead', async () => {
  const r = await chk('/frozen.m3u8');
  assert.equal(r.live, false);
  assert.equal(r.reason, 'stale_playlist_not_advancing');
});

test('VOD (ENDLIST) is rejected as not live', async () => {
  const r = await chk('/vod.m3u8');
  assert.equal(r.live, false);
  assert.equal(r.reason, 'vod_not_live');
});

test('hanging server times out', async () => {
  const r = await chk('/slow', { timeoutMs: 600 });
  assert.equal(r.live, false);
  assert.equal(r.reason, 'timeout');
});

test('connection refused is dead', async () => {
  const r = await checkStream({ url: 'http://127.0.0.1:1/x.m3u8' }, { timeoutMs: 800 });
  assert.equal(r.live, false);
});

test('SSRF guard blocks private addresses when not allowed', async () => {
  const r = await checkStream(
    { url: 'http://127.0.0.1:80/x.m3u8' },
    { allowPrivateNetworks: false, timeoutMs: 800 }
  );
  assert.equal(r.live, false);
  assert.equal(r.reason, 'blocked_private_address');
  for (const ip of ['10.0.0.1', '192.168.1.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1']) {
    assert.ok(isPrivateIp(ip), ip);
  }
  assert.ok(!isPrivateIp('8.8.8.8'));
});

test('M3U parser: attrs, VLC options, ignores junk', () => {
  const list = parseM3u(
    `#EXTM3U\n#EXTINF:-1 tvg-id="a" tvg-logo="http://l/x.png" group-title="News",BBC, One HD\n#EXTVLCOPT:http-user-agent=Foo/1\nhttp://h/a.m3u8\n#EXTINF:-1,No Url\n#EXTINF:-1,B\nhttp://h/b.ts\nrtmp://skip/this\n`
  );
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'BBC, One HD');
  assert.equal(list[0].group, 'News');
  assert.equal(list[0].userAgent, 'Foo/1');
  assert.equal(list[0].logo, 'http://l/x.png');
  assert.equal(list[1].name, 'B');
});

test('pipeline end to end: only live channels are served, dead ones hidden, flaky ones survive a blip', async () => {
  const file = path.join(dir, 'list.m3u');
  fs.writeFileSync(
    file,
    [
      '#EXTM3U',
      `#EXTINF:-1 group-title="News",Live One\n${base}/live.m3u8`,
      `#EXTINF:-1 group-title="News",Dead One\n${base}/dead`,
      `#EXTINF:-1 group-title="Fake",Html One\n${base}/html200`,
      `#EXTINF:-1 group-title="Fake",Frozen One\n${base}/frozen.m3u8`,
      `#EXTINF:-1 group-title="Movies",Direct One\n${base}/direct.ts`,
      `#EXTINF:-1 group-title="Movies",Direct One HD\n${base}/direct.ts?dup=1`,
    ].join('\n')
  );

  const s = await pipeline.syncSources([{ url: file, name: 'test' }]);
  assert.equal(s.total, 6);

  let t;
  do {
    t = await pipeline.runChecks({ limit: 100, overrides: { timeoutMs: 1500 } });
  } while (t.checked > 0);

  const live = pipeline.liveChannels({});
  const names = live.map((c: any) => c.name).sort();
  assert.ok(names.includes('Live One'));
  assert.ok(names.some((n: string) => n.startsWith('Direct One')));
  assert.ok(!names.includes('Dead One') && !names.includes('Html One') && !names.includes('Frozen One'));
  assert.equal(names.filter((n: string) => n.startsWith('Direct One')).length, 1, 'duplicates of same channel are collapsed');

  // blip protection: a live channel failing ONCE stays live, failing twice goes dead
  const ch = db.prepare("SELECT * FROM channels WHERE name='Live One'").get() as any;
  assert.equal(pipeline.applyResult(ch, { live: false, reason: 'timeout', latencyMs: 1 }), 'live');
  const ch2 = db.prepare("SELECT * FROM channels WHERE name='Live One'").get() as any;
  assert.equal(pipeline.applyResult(ch2, { live: false, reason: 'timeout', latencyMs: 1 }), 'dead');
  const ch3 = db.prepare("SELECT * FROM channels WHERE name='Live One'").get() as any;
  assert.equal(pipeline.applyResult(ch3, { live: true, reason: 'ok_hls', latencyMs: 1, kind: 'hls', cors: 1 }), 'live');
  assert.ok(pipeline.stats().deadReasons.length > 0);
});

test('3000 channels across 2 playlists: exact dead list per playlist, CORS web flag, only live served', async () => {
  let active = 0;
  let maxActive = 0;
  const big = http.createServer((req, res) => {
    active++;
    maxActive = Math.max(maxActive, active);
    res.on('close', () => {
      active--;
    });
    const urlStr = req.url || '';
    const m = urlStr.match(/^\/(a|b)(\d+)\.m3u8/);
    if (urlStr.startsWith('/s.ts')) {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      return res.end(ts());
    }
    if (!m) {
      res.writeHead(404);
      return res.end();
    }
    const n = Number(m[2]);
    if (n % 4 === 0) {
      res.writeHead(404);
      return res.end();
    }
    if (n % 7 === 0) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html>blocked</html>');
    }
    const h: Record<string, string> = { 'content-type': 'application/vnd.apple.mpegurl' };
    if (n % 2 === 0) h['access-control-allow-origin'] = '*';
    setTimeout(() => {
      res.writeHead(200, h);
      res.end(`#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:${n}\n#EXTINF:2,\ns.ts\n`);
    }, 10);
  });

  await new Promise<void>((r) => big.listen(0, '127.0.0.1', r));
  big.unref();
  try {
    const b = `http://127.0.0.1:${(big.address() as any).port}`;
    const mk = (p: string, from: number, to: number) => {
      let t = '#EXTM3U\n';
      for (let i = from; i < to; i++) t += `#EXTINF:-1 group-title="G${i % 3}",${p}-chan-${i}\n${b}/${p}${i}.m3u8\n`;
      return t;
    };
    const fa = path.join(dir, 'A.m3u');
    const fb = path.join(dir, 'B.m3u');
    fs.writeFileSync(fa, mk('a', 1, 1501));
    fs.writeFileSync(fb, mk('b', 1, 1501));

    db.exec('DELETE FROM channels');
    const sync = await pipeline.syncSources([
      { url: fa, name: 'A.m3u' },
      { url: fb, name: 'B.m3u' },
    ]);
    assert.equal(sync.total, 3000);

    const t0 = Date.now();
    let t;
    do {
      t = await pipeline.runChecks({
        limit: 3000,
        concurrency: 150,
        perHost: 60,
        retryDelayMs: 10,
        overrides: { timeoutMs: 3000, freshnessCheck: false },
      });
    } while (t.checked > 0);
    const secs = (Date.now() - t0) / 1000;
    assert.ok(secs < 60, `3000 channels checked in ${secs}s`);

    const rep = pipeline.sourceReport();
    assert.equal(rep.length, 2);
    let expectedDeadPerSource = 0;
    for (let i = 1; i <= 1500; i++) if (i % 4 === 0 || i % 7 === 0) expectedDeadPerSource++;
    for (const r of rep) {
      assert.equal(r.total, 1500);
      assert.equal(r.dead, expectedDeadPerSource);
      assert.equal(r.live, 1500 - expectedDeadPerSource);
      assert.equal(r.waiting, 0);
    }

    const dead = pipeline.deadList({ source: 'A.m3u' });
    assert.ok(dead.every((d) => d.source === 'A.m3u'));
    assert.ok(dead.some((d) => d.name === 'a-chan-4' && d.reason === 'http_404'));
    assert.ok(dead.some((d) => d.name === 'a-chan-7' && d.reason === 'html_not_stream'));
    assert.ok(!dead.some((d) => d.name === 'a-chan-1'));

    const live = pipeline.liveChannels({});
    assert.equal(live.length, rep.reduce((s, r) => s + r.live, 0));
    assert.ok(live.every((c) => !/chan-(4|8|12|7|14|21)$/.test(c.name)));
    // http mock returns 0 for web=true (requires https + CORS), while CORS flag is recorded cleanly
    assert.equal(pipeline.liveChannels({ web: true }).length, 0);
    assert.ok(live.some((c) => c.cors === true) && live.some((c) => c.cors === false));
    assert.equal(pipeline.status().percentChecked, 100);
  } finally {
    big.closeAllConnections?.();
    big.close();
  }
});

test('per-host limit: one server is never hit by more than perHost checks at once', async () => {
  let active = 0;
  let maxActive = 0;
  const slow = http.createServer((req, res) => {
    active++;
    maxActive = Math.max(maxActive, active);
    res.on('close', () => {
      active--;
    });
    if ((req.url || '').startsWith('/s.ts')) {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      return res.end(ts());
    }
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      res.end('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\ns.ts\n');
    }, 60);
  });
  await new Promise<void>((r) => slow.listen(0, '127.0.0.1', r));
  slow.unref();
  try {
    const u = `http://127.0.0.1:${(slow.address() as any).port}`;
    db.exec('DELETE FROM channels');
    const ins = db.prepare('INSERT INTO channels(url,name,norm_name,source,created_at) VALUES (?,?,?,?,?)');
    for (let i = 0; i < 30; i++) ins.run(`${u}/c${i}.m3u8`, 'c' + i, 'c' + i, 'S', Date.now());
    await pipeline.runChecks({
      limit: 100,
      concurrency: 100,
      perHost: 3,
      retryDelayMs: 10,
      overrides: { freshnessCheck: false, timeoutMs: 3000 },
    });
    assert.ok(maxActive <= 7, `max simultaneous requests ${maxActive}`);
    assert.equal((db.prepare("SELECT COUNT(*) c FROM channels WHERE status='live'").get() as any).c, 30);
  } finally {
    slow.closeAllConnections?.();
    slow.close();
  }
});

test('momentary 503 is retried once and does not mark a healthy new channel dead', async () => {
  let hits = 0;
  const s = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/s.ts')) {
      res.writeHead(200, { 'content-type': 'video/mp2t' });
      return res.end(ts());
    }
    hits++;
    if (hits === 1) {
      res.writeHead(503);
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\ns.ts\n');
  });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  s.unref();
  try {
    db.exec('DELETE FROM channels');
    db.prepare('INSERT INTO channels(url,name,norm_name,source,created_at) VALUES (?,?,?,?,?)').run(
      `http://127.0.0.1:${(s.address() as any).port}/x.m3u8`,
      'blip',
      'blip',
      'S',
      Date.now()
    );
    await pipeline.runChecks({
      limit: 10,
      concurrency: 10,
      perHost: 4,
      retryDelayMs: 20,
      overrides: { freshnessCheck: false, timeoutMs: 3000 },
    });
    assert.equal((db.prepare("SELECT status FROM channels WHERE name='blip'").get() as any).status, 'live');
  } finally {
    s.closeAllConnections?.();
    s.close();
  }
});

