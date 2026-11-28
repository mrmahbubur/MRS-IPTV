import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import {
  getTrustedClientIp,
  normalizeIp,
  isPrivateIpAddress,
  isCloudflareProxyIp,
  maskClientIp,
  resolveTrustedClientIpDetails,
} from '../server/clientIp';
import {
  isBlockedSsrfTarget,
  validateSsrfTargetAsync,
  safeFetchWithSsrfGuard,
  createSlidingWindowLimiter,
  recordExternalRateLimitBlock,
  getRateLimiterTelemetry,
  getSecurityMetricsSnapshot,
  formatPrometheusSecurityMetrics,
  parseSafeCspHosts,
  buildContentSecurityPolicy,
} from '../server/security';

function makeMockReq(opts: {
  remoteAddress?: string;
  ip?: string;
  headers?: Record<string, string | string[]>;
  trustProxy?: unknown;
}) {
  return {
    ip: opts.ip,
    headers: opts.headers || {},
    socket: {
      remoteAddress: opts.remoteAddress,
    },
    ...(opts.trustProxy !== undefined
      ? {
          app: {
            get: (key: string) => (key === 'trust proxy' ? opts.trustProxy : undefined),
          },
        }
      : {}),
  } as unknown as express.Request;
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  const restore = () => {
    for (const key of Object.keys(vars)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const out = fn();
    if (out && typeof (out as Promise<void>).finally === 'function') {
      return (out as Promise<void>).finally(restore);
    }
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

test('normalizeIp handles IPv4-mapped IPv6 (dotted & hex), zone IDs, ports, bracketed IPv6, arrays, and rejects garbage', () => {
  assert.equal(normalizeIp('::ffff:8.8.8.8'), '8.8.8.8');
  assert.equal(normalizeIp('::ffff:7f00:1'), '127.0.0.1');
  assert.equal(normalizeIp('::ffff:a9fe:a9fe'), '169.254.169.254');
  assert.equal(normalizeIp('[fe80::1%eth0]:8080'), 'fe80::1');
  assert.equal(normalizeIp('203.0.113.5:54321'), '203.0.113.5');
  assert.equal(normalizeIp('[2606:4700:4700::1111]:443'), '2606:4700:4700::1111');
  assert.equal(normalizeIp('2606:4700:4700::1111'), '2606:4700:4700::1111');
  assert.equal(normalizeIp(['10.0.0.1', '198.51.100.25']), '198.51.100.25');
  assert.equal(normalizeIp('unknown'), '');
  assert.equal(normalizeIp('not-an-ip; drop table'), '');
});

test('isPrivateIpAddress classifies loopback, RFC1918, link-local, CGNAT, multicast, and ULA IPv6 accurately', () => {
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('::1'), true);
  assert.equal(isPrivateIpAddress('10.20.30.40'), true);
  assert.equal(isPrivateIpAddress('192.168.1.10'), true);
  assert.equal(isPrivateIpAddress('172.16.0.1'), true);
  assert.equal(isPrivateIpAddress('172.31.255.254'), true);
  assert.equal(isPrivateIpAddress('172.32.0.1'), false);
  assert.equal(isPrivateIpAddress('172.68.10.2'), false);
  assert.equal(isPrivateIpAddress('100.64.10.1'), true);
  assert.equal(isPrivateIpAddress('224.0.0.1'), true);
  assert.equal(isPrivateIpAddress('fd00::1'), true);
  assert.equal(isPrivateIpAddress('::ffff:a9fe:a9fe'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);
});

test('maskClientIp anonymizes IPv4 to /24 and IPv6 to /48 subnets', () => {
  assert.equal(maskClientIp('203.0.113.45'), '203.0.113.0/24');
  assert.equal(maskClientIp('::ffff:198.51.100.99'), '198.51.100.0/24');
  assert.equal(maskClientIp('2001:db8:85a3::8a2e:370:7334'), '2001:db8:85a3::/48');
  assert.equal(maskClientIp('::1'), '::1/128');
  assert.equal(maskClientIp('invalid'), 'unknown');
});

test('getTrustedClientIp rejects spoofed headers when Express trust proxy is disabled (false / 0)', () => {
  withEnv({ RENDER: 'true', TRUST_PROXY: '1' }, () => {
    const reqFalse = makeMockReq({
      trustProxy: false,
      remoteAddress: '127.0.0.1',
      ip: '127.0.0.1',
      headers: {
        'cf-connecting-ip': '198.51.100.9',
        'x-forwarded-for': '198.51.100.9',
        'x-real-ip': '198.51.100.9',
      },
    });
    assert.equal(getTrustedClientIp(reqFalse), '127.0.0.1');

    const reqZero = makeMockReq({
      trustProxy: 0,
      remoteAddress: '::ffff:10.0.0.2',
      headers: {
        'true-client-ip': '198.51.100.12',
        'x-forwarded-for': '198.51.100.12',
      },
    });
    assert.equal(getTrustedClientIp(reqZero), '10.0.0.2');
  });
});

test('getTrustedClientIp ignores forwarded headers from direct public sockets even with proxy env flags', () => {
  withEnv({ RENDER: 'true', K_SERVICE: 'svc' }, () => {
    const req = makeMockReq({
      remoteAddress: '8.8.8.8',
      headers: {
        'cf-connecting-ip': '103.108.140.10',
        'x-forwarded-for': '103.108.140.10',
      },
    });
    assert.equal(getTrustedClientIp(req), '8.8.8.8');
  });
});

test('getTrustedClientIp enforces Cloudflare edge CIDR / origin secret verification against spoofing', () => {
  assert.equal(isCloudflareProxyIp('172.68.10.2'), true);
  assert.equal(isCloudflareProxyIp('104.21.12.5'), true);
  assert.equal(isCloudflareProxyIp('198.51.100.99'), false);

  withEnv({ CF_ORIGIN_SECRET: undefined, CLOUDFLARE_STRICT_ORIGIN: undefined, TRUST_CDN_GEO: undefined }, () => {
    // Direct non-Cloudflare public peer routed via Render LB: spoofed CF-Connecting-IP is ignored
    const spoofedCfReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      ip: '198.51.100.99',
      headers: {
        'cf-connecting-ip': '8.8.8.8',
      },
    });
    const spoofDetails = resolveTrustedClientIpDetails(spoofedCfReq);
    assert.equal(spoofDetails.ip, '198.51.100.99');
    assert.equal(spoofDetails.cloudflareVerified, false);

    // Real Cloudflare edge peer: CF-Connecting-IP is trusted and verified
    const validCfReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      ip: '172.68.10.2',
      headers: {
        'cf-ray': '8f1234567890abcd-DAC',
        'cf-connecting-ip': '198.51.100.77',
      },
    });
    const validDetails = resolveTrustedClientIpDetails(validCfReq);
    assert.equal(validDetails.ip, '198.51.100.77');
    assert.equal(validDetails.cloudflareVerified, true);
  });

  withEnv({ CF_ORIGIN_SECRET: 'cf-secret-value-123' }, () => {
    const missingSecretReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      ip: '172.68.10.2',
      headers: {
        'cf-connecting-ip': '198.51.100.77',
        'x-cf-origin-secret': 'wrong-secret',
      },
    });
    assert.equal(getTrustedClientIp(missingSecretReq), '172.68.10.2');

    const matchingSecretReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      ip: '172.68.10.2',
      headers: {
        'cf-connecting-ip': '198.51.100.77',
        'x-cf-origin-secret': 'cf-secret-value-123',
      },
    });
    assert.equal(getTrustedClientIp(matchingSecretReq), '198.51.100.77');
  });
});

test('getTrustedClientIp supports CDN headers and multi-hop reverse proxies when trust proxy is enabled', () => {
  withEnv({ RENDER: undefined, K_SERVICE: undefined, TRUST_PROXY: undefined, TRUST_CDN_GEO: undefined, CF_ORIGIN_SECRET: undefined, CLOUDFLARE_STRICT_ORIGIN: undefined }, () => {
    const trueClientReq = makeMockReq({
      trustProxy: true,
      remoteAddress: '10.0.0.4',
      headers: { 'true-client-ip': '198.51.100.55' },
    });
    assert.equal(getTrustedClientIp(trueClientReq), '198.51.100.55');

    const gaeReq = makeMockReq({
      trustProxy: 'loopback',
      remoteAddress: '127.0.0.1',
      headers: { 'x-appengine-user-ip': '198.51.100.68' },
    });
    assert.equal(getTrustedClientIp(gaeReq), '198.51.100.68');

    const fastlyReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      headers: { 'fastly-client-ip': '198.51.100.66' },
    });
    assert.equal(getTrustedClientIp(fastlyReq), '198.51.100.66');

    const xClientReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      headers: { 'x-client-ip': '198.51.100.67:49210' },
    });
    assert.equal(getTrustedClientIp(xClientReq), '198.51.100.67');

    const xffMultiHopReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.1, 198.51.100.90, 10.0.0.8' },
    });
    assert.equal(getTrustedClientIp(xffMultiHopReq), '198.51.100.90');

    const forwardedRfcReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '127.0.0.1',
      headers: { forwarded: 'for=203.0.113.1;proto=http, for="[2606:4700:4700::1111]:4711";proto=https' },
    });
    assert.equal(getTrustedClientIp(forwardedRfcReq), '2606:4700:4700::1111');

    const xRealIpReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '127.0.0.1',
      headers: { 'x-real-ip': '198.51.100.88' },
    });
    assert.equal(getTrustedClientIp(xRealIpReq), '198.51.100.88');
  });
});

test('getTrustedClientIp integrates cleanly with real Express app trust proxy settings over HTTP', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/ip', (req, res) => {
    res.json({ ip: getTrustedClientIp(req), expressIp: req.ip });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address() as { port: number };
    const r1 = await fetch(`http://127.0.0.1:${addr.port}/ip`, {
      headers: { 'X-Forwarded-For': '203.0.113.1, 198.51.100.44' },
    });
    const j1 = (await r1.json()) as { ip: string };
    assert.equal(j1.ip, '198.51.100.44');

    app.set('trust proxy', false);
    const r2 = await fetch(`http://127.0.0.1:${addr.port}/ip`, {
      headers: { 'X-Forwarded-For': '198.51.100.44', 'CF-Connecting-IP': '198.51.100.44' },
    });
    const j2 = (await r2.json()) as { ip: string };
    assert.equal(j2.ip, '127.0.0.1');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('SSRF detection blocks bracketed IPv6, hex-mapped IPv4, CGNAT, metadata hosts, credentials, and dangerous ports', async () => {
  const blockedUrls = [
    'http://[::1]:3000/admin',
    'http://[::ffff:127.0.0.1]/latest',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://[fd00:ec2::254]/latest/meta-data/',
    'http://100.64.0.10/status',
    'http://user:pass@1.1.1.1/stream.m3u8',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://internal-db.internal/status',
    'https://stream.example.com:6379/',
    'ftp://1.1.1.1/file',
  ];

  for (const url of blockedUrls) {
    assert.equal(isBlockedSsrfTarget(url).blocked, true, `Expected blocked SSRF target: ${url}`);
    assert.equal((await validateSsrfTargetAsync(url)).blocked, true, `Expected async blocked SSRF target: ${url}`);
  }

  assert.equal(isBlockedSsrfTarget('https://1.1.1.1/live/stream.m3u8').blocked, false);
});

test('safeFetchWithSsrfGuard blocks HTTP redirect hops targeting loopback or private addresses', async () => {
  const app = express();
  app.get('/redirect-to-internal', (_req, res) => {
    res.redirect(302, 'http://169.254.169.254/latest/meta-data/');
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address() as { port: number };
    await assert.rejects(
      () =>
        safeFetchWithSsrfGuard(
          `http://127.0.0.1:${addr.port}/redirect-to-internal`,
        ),
      /Forbidden|loopback|blocked/i
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Rate limiter telemetry & Prometheus exporter aggregate bucket metrics without exposing raw IPs', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    '/limited',
    createSlidingWindowLimiter({
      windowMs: 60_000,
      maxRequests: 2,
      limiterName: 'Unit Test "Quoted" Limiter',
    })
  );
  app.get('/limited', (_req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const addr = server.address() as { port: number };
    const headers = { 'X-Forwarded-For': '198.51.100.210' };

    const r1 = await fetch(`http://127.0.0.1:${addr.port}/limited`, { headers });
    const r2 = await fetch(`http://127.0.0.1:${addr.port}/limited`, { headers });
    const r3 = await fetch(`http://127.0.0.1:${addr.port}/limited`, { headers });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);

    recordExternalRateLimitBlock('Payment Test Limiter', 60_000, 10);

    const telemetry = getRateLimiterTelemetry();
    const unitStat = telemetry.find((t) => t.limiterName === 'Unit Test "Quoted" Limiter');
    assert.ok(unitStat);
    assert.equal(unitStat.activeBuckets, 1);
    assert.equal(unitStat.activeTrackedTokens, 2);
    assert.equal(unitStat.totalRequestsAllowed, 2);
    assert.equal(unitStat.totalRequestsBlocked, 1);
    assert.ok(unitStat.lastBlockedAt);

    const snapshot = getSecurityMetricsSnapshot();
    assert.ok(snapshot.rateLimiters.some((r) => r.limiterName === 'Payment Test Limiter' && r.totalRequestsBlocked >= 1));

    const promText = formatPrometheusSecurityMetrics();
    assert.ok(promText.includes('# TYPE mrs_iptv_rate_limiter_active_buckets gauge'));
    assert.ok(promText.includes('limiter="Unit Test \\"Quoted\\" Limiter"'));
    assert.ok(promText.includes('mrs_iptv_rate_limiter_requests_total{limiter="Unit Test \\"Quoted\\" Limiter",outcome="allowed"} 2'));
    assert.ok(promText.includes('mrs_iptv_rate_limiter_requests_total{limiter="Unit Test \\"Quoted\\" Limiter",outcome="blocked"} 1'));
    assert.equal(promText.includes('198.51.100.210'), false, 'Prometheus metrics must never leak raw client IPs');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('buildContentSecurityPolicy includes partner/CAPTCHA hosts and rejects unsafe CSP_EXTRA_*_HOSTS entries', () => {
  assert.deepEqual(
    parseSafeCspHosts('https://cdn.example.com, https://*.partner.org, *, http://insecure.test, https://bad.com;evil, javascript:alert(1)'),
    ['https://cdn.example.com', 'https://*.partner.org']
  );

  withEnv(
    {
      CSP_EXTRA_SCRIPT_HOSTS: 'https://tag.example.net, *, https://bad.com;script-src *',
      CSP_EXTRA_FRAME_HOSTS: 'https://widget.example.org, http://plain.example.org',
    },
    () => {
      const csp = buildContentSecurityPolicy();
      assert.ok(csp.includes('https://uplcm.com'));
      assert.equal(csp.includes('mitgo.com'), false);
      assert.equal(csp.includes('admitad.com'), false);
      assert.equal(csp.includes('rzekl.com'), false);
      assert.ok(csp.includes('https://challenges.cloudflare.com'));
      assert.ok(csp.includes('https://tag.example.net'));
      assert.ok(csp.includes('https://widget.example.org'));
      assert.equal(csp.includes('insecure.test'), false);
      assert.equal(csp.includes('plain.example.org'), false);
      assert.equal(csp.includes('bad.com'), false);
    }
  );
});
