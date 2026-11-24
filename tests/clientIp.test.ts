import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getTrustedClientIp, normalizeIp, isPrivateIpAddress } from '../server/security';

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

test('normalizeIp handles IPv4-mapped IPv6, ports, bracketed IPv6, arrays, and rejects garbage', () => {
  assert.equal(normalizeIp('::ffff:8.8.8.8'), '8.8.8.8');
  assert.equal(normalizeIp('203.0.113.5:54321'), '203.0.113.5');
  assert.equal(normalizeIp('[2606:4700:4700::1111]:443'), '2606:4700:4700::1111');
  assert.equal(normalizeIp('2606:4700:4700::1111'), '2606:4700:4700::1111');
  assert.equal(normalizeIp(['10.0.0.1', '198.51.100.25']), '198.51.100.25');
  assert.equal(normalizeIp('unknown'), '');
  assert.equal(normalizeIp('not-an-ip; drop table'), '');
});

test('isPrivateIpAddress classifies loopback, RFC1918, link-local, CGNAT, and ULA IPv6 accurately', () => {
  assert.equal(isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('::1'), true);
  assert.equal(isPrivateIpAddress('10.20.30.40'), true);
  assert.equal(isPrivateIpAddress('192.168.1.10'), true);
  assert.equal(isPrivateIpAddress('172.16.0.1'), true);
  assert.equal(isPrivateIpAddress('172.31.255.254'), true);
  assert.equal(isPrivateIpAddress('172.32.0.1'), false);
  assert.equal(isPrivateIpAddress('172.68.10.2'), false);
  assert.equal(isPrivateIpAddress('100.64.10.1'), true);
  assert.equal(isPrivateIpAddress('fd00::1'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);
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

test('getTrustedClientIp supports CDN headers and multi-hop reverse proxies when trust proxy is enabled', () => {
  withEnv({ RENDER: undefined, K_SERVICE: undefined, TRUST_PROXY: undefined, TRUST_CDN_GEO: undefined }, () => {
    const cfReq = makeMockReq({
      trustProxy: 1,
      remoteAddress: '10.0.0.4',
      ip: '172.68.10.2',
      headers: {
        'cf-connecting-ip': '198.51.100.77',
        'x-forwarded-for': '198.51.100.77, 172.68.10.2',
      },
    });
    assert.equal(getTrustedClientIp(cfReq), '198.51.100.77');

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
