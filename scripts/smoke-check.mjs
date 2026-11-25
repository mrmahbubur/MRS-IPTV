#!/usr/bin/env node
/**
 * Automated deployment / staging smoke check for M R S IPTV.
 * Usage:
 *   BASE_URL=https://your-app.onrender.com npm run smoke
 *   npm run smoke   # defaults to http://127.0.0.1:3000
 */
import assert from 'node:assert/strict';

const baseUrl = String(process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');

async function fetchJson(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json', ...(init.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON response
  }
  return { res, text, json };
}

async function run() {
  console.log(`[Smoke Check] Target: ${baseUrl}`);

  // 1. /api/health
  const health = await fetchJson('/api/health');
  assert.equal(health.res.status, 200, `/api/health expected 200, got ${health.res.status}`);
  assert.equal(health.json?.ok, true, '/api/health missing ok: true');
  assert.ok(health.json?.nodeVersion, '/api/health missing nodeVersion telemetry');
  assert.ok(health.json?.proxyTelemetry !== undefined, '/api/health missing proxyTelemetry');
  console.log(`  [PASS] /api/health (${health.json.platform}, node ${health.json.nodeVersion}, trustProxy=${health.json.trustProxy})`);

  // 2. /api/geo/my-country (coarse region only, never leaks raw IP)
  const geo = await fetchJson('/api/geo/my-country');
  assert.equal(geo.res.status, 200, `/api/geo/my-country expected 200, got ${geo.res.status}`);
  assert.ok(geo.json?.code, '/api/geo/my-country missing country code');
  assert.equal('ip' in (geo.json || {}), false, '/api/geo/my-country must never expose raw client IP');
  console.log(`  [PASS] /api/geo/my-country (code=${geo.json.code}, method=${geo.json.detectionMethod})`);

  // 3. /api/security/status (firewall & proxy telemetry)
  const sec = await fetchJson('/api/security/status');
  assert.equal(sec.res.status, 200, `/api/security/status expected 200, got ${sec.res.status}`);
  assert.equal(sec.json?.security?.firewallActive, true, '/api/security/status firewall not active');
  assert.ok(sec.json?.security?.proxyTelemetry, '/api/security/status missing proxyTelemetry');
  console.log(`  [PASS] /api/security/status (cloudflareMode=${sec.json.security.proxyTelemetry.cloudflareMode}, source=${sec.json.security.proxyTelemetry.resolvedSource})`);

  // 4. SSRF firewall enforcement on /api/proxy
  const ssrfTargets = [
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:127.0.0.1]/admin',
    'http://[::1]:3000/api/health',
  ];
  for (const target of ssrfTargets) {
    const res = await fetch(`${baseUrl}/api/proxy?url=${encodeURIComponent(target)}`);
    assert.equal(res.status, 403, `Expected HTTP 403 for SSRF target ${target}, got ${res.status}`);
  }
  console.log(`  [PASS] SSRF guards blocked ${ssrfTargets.length}/${ssrfTargets.length} internal targets`);

  // 5. Public payment plans, receiving methods & PoW checkout challenge
  const plans = await fetchJson('/api/plans');
  assert.equal(plans.res.status, 200, '/api/plans expected 200');
  assert.ok(Array.isArray(plans.json?.plans) && plans.json.plans.length >= 4, '/api/plans missing plan list');

  const methods = await fetchJson('/api/payment-methods');
  assert.equal(methods.res.status, 200, '/api/payment-methods expected 200');
  assert.equal(methods.json?.ok, true, '/api/payment-methods missing ok: true');

  const challenge = await fetchJson('/api/payments/challenge');
  assert.equal(challenge.res.status, 200, '/api/payments/challenge expected 200');
  assert.ok(challenge.json?.challengeToken && challenge.json?.nonce, '/api/payments/challenge missing challengeToken/nonce');
  console.log(`  [PASS] Payment catalog & anti-spam challenge endpoints ready`);

  // 6. /api/metrics auth boundary & optional Prometheus/JSON verification
  const unauthMetrics = await fetchJson('/api/metrics');
  assert.ok(
    unauthMetrics.res.status === 401 || unauthMetrics.res.status === 403,
    `Unauthenticated /api/metrics must reject caller, got ${unauthMetrics.res.status}`
  );
  const metricsToken = String(process.env.METRICS_TOKEN || process.env.ADMIN_TOKEN || '').trim();
  if (metricsToken) {
    const jsonMetrics = await fetchJson('/api/metrics', {
      headers: { Authorization: `Bearer ${metricsToken}` },
    });
    assert.equal(jsonMetrics.res.status, 200, `/api/metrics JSON expected 200, got ${jsonMetrics.res.status}`);
    assert.equal(jsonMetrics.json?.ok, true, '/api/metrics missing ok: true');
    assert.ok(Array.isArray(jsonMetrics.json?.metrics?.rateLimiters), '/api/metrics missing rateLimiters array');

    const promRes = await fetch(`${baseUrl}/api/metrics?format=prometheus`, {
      headers: { Authorization: `Bearer ${metricsToken}` },
    });
    assert.equal(promRes.status, 200, `/api/metrics?format=prometheus expected 200, got ${promRes.status}`);
    const promText = await promRes.text();
    assert.ok(promText.includes('mrs_iptv_rate_limiter_active_buckets'), 'Prometheus output missing rate limiter bucket metric');
    assert.ok(promText.includes('mrs_iptv_security_threats_total'), 'Prometheus output missing threats counter');
    console.log(`  [PASS] /api/metrics (auth enforced; JSON & Prometheus scrape verified)`);
  } else {
    console.log(`  [PASS] /api/metrics auth boundary verified (HTTP ${unauthMetrics.res.status})`);
  }

  // 7. Home page HTML verification meta tags & Content-Security-Policy header
  const homeRes = await fetch(`${baseUrl}/`, { headers: { Accept: 'text/html' } });
  assert.equal(homeRes.status, 200, `GET / expected 200, got ${homeRes.status}`);
  const cspHeader = homeRes.headers.get('content-security-policy') || '';
  assert.ok(cspHeader.includes('script-src'), 'GET / missing Content-Security-Policy script-src');
  assert.ok(cspHeader.includes('https://*.mitgo.com'), 'CSP missing Mitgo partner host allowlist');
  const homeHtml = await homeRes.text();
  const headMatch = homeHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  assert.ok(headMatch, 'GET / missing <head>...</head> block');
  const headHtml = headMatch[1];
  assert.ok(
    headHtml.includes('<meta name="mitgo-verification" content="9cc5bab4-f968-4c91-9b46-b150cae3355f"'),
    'Home page <head> missing mitgo-verification meta tag'
  );
  assert.ok(
    headHtml.includes('<meta name="monetag" content="fa9656182dbc7301dcd9a2326441dcf3"'),
    'Home page <head> missing monetag verification meta tag'
  );
  console.log(`  [PASS] Home page <head> verification tags (Mitgo + Monetag) & CSP header verified`);

  console.log('[Smoke Check] All deployment checks passed.');
}

run().catch((err) => {
  console.error('[Smoke Check] FAILED:', err?.message || err);
  process.exit(1);
});
