import test from 'node:test';
import assert from 'node:assert/strict';
import type express from 'express';
import {
  trustedGeoLookup,
  enrichChannelWithRegionMeta,
  prioritizeRegionalChannels,
  sanitizePlaybackError,
  resolveDisplayRegionOverride,
} from './channelGeo';

test('prioritizeRegionalChannels orders exact region -> country -> global -> rest deterministically', () => {
  const channels = [
    { id: 'c4', number: 1, name: 'Local Other Country', countries: ['US'], regions: ['US'], global: false, regionalOrder: 1 },
    { id: 'c3', number: 2, name: 'Global Sports', countries: [], regions: [], global: true, regionalOrder: 10 },
    { id: 'c2', number: 3, name: 'Chattogram News', countries: ['BD'], regions: ['BD'], global: false, regionalOrder: 2 },
    { id: 'c1', number: 4, name: 'Dhaka Broadcast', countries: ['BD'], regions: ['BD-DHAKA', 'BD'], global: false, regionalOrder: 1 },
    { id: 'c5', number: 5, name: 'Another Global', countries: [], regions: [], global: true, regionalOrder: 20 },
  ];

  const sorted = prioritizeRegionalChannels(channels, { country: 'BD', region: 'BD-DHAKA' });
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['c1', 'c2', 'c3', 'c5', 'c4']
  );

  // Handles null/unavailable location cleanly without crashing or dropping channels
  const fallbackSorted = prioritizeRegionalChannels(channels, null);
  assert.equal(fallbackSorted.length, channels.length);
  assert.deepEqual(
    fallbackSorted.map((c) => c.id),
    ['c3', 'c5', 'c4', 'c1', 'c2']
  );
});

test('trustedGeoLookup rejects spoofable public forwarding headers when not behind trusted proxy and never leaks IP', () => {
  const prevService = process.env.K_SERVICE;
  const prevTrust = process.env.TRUST_PROXY;
  delete process.env.K_SERVICE;
  delete process.env.TRUST_PROXY;

  const spoofedReq = {
    headers: {
      'x-forwarded-for': '103.108.140.10',
      'cf-connecting-ip': '103.108.140.10',
      'cf-ipcountry': 'BD',
      'x-country-code': 'BD',
    },
    query: {
      country: 'US',
      region: 'US-NY',
    },
    socket: {
      remoteAddress: '127.0.0.1',
    },
  } as unknown as express.Request;

  const result = trustedGeoLookup(spoofedReq);
  assert.equal(result, null);

  if (prevService !== undefined) process.env.K_SERVICE = prevService;
  if (prevTrust !== undefined) process.env.TRUST_PROXY = prevTrust;
});

test('trustedGeoLookup resolves public IP via local GeoIP database without returning IP or raw metadata', () => {
  // Public Google DNS IP -> US, or BD/US GeoIP lookup
  const req = {
    headers: {},
    query: {},
    socket: {
      remoteAddress: '::ffff:8.8.8.8',
    },
  } as unknown as express.Request;

  const geo = trustedGeoLookup(req);
  assert.ok(geo !== null);
  assert.equal(geo.country, 'US');
  assert.ok(!('ip' in geo));
  assert.ok(!('ll' in geo));
  assert.ok(!('range' in geo));
});

test('enrichChannelWithRegionMeta normalizes required channel schema fields', () => {
  const rawBd = {
    id: 'bd-tsports',
    name: 'T Sports HD',
    category: 'Bangladeshi',
    m3u8Url: 'https://example.com/tsports.m3u8?token=secret123',
    iconUrl: 'https://example.com/logo.png',
    status: 'live',
  };

  const enriched = enrichChannelWithRegionMeta(rawBd, 0);
  assert.equal(enriched.number, 1);
  assert.equal(enriched.logo, 'https://example.com/logo.png');
  assert.equal(enriched.streamUrl, 'https://example.com/tsports.m3u8?token=secret123');
  assert.equal(enriched.streamType, 'hls');
  assert.equal(enriched.isLive, true);
  assert.ok(enriched.countries.includes('BD'));
  assert.ok(enriched.regions.includes('BD-DHAKA'));
});

test('sanitizePlaybackError redacts signed URLs and query tokens', () => {
  const err = new Error('Failed GET https://cdn.example.com/live/playlist.m3u8?token=topsecret&sig=abc');
  const clean = sanitizePlaybackError(err);
  assert.ok(!clean.includes('topsecret'));
  assert.ok(!clean.includes('abc'));
  assert.ok(clean.includes('[stream-redacted]'));
});

test('resolveDisplayRegionOverride maps valid region choices safely', () => {
  const dhaka = resolveDisplayRegionOverride('BD-DHAKA');
  assert.deepEqual(dhaka, { country: 'BD', region: 'BD-DHAKA', regionLabel: 'Dhaka, Bangladesh' });
  assert.equal(resolveDisplayRegionOverride('AUTO'), null);
});

test('trustedGeoLookup honors rightmost non-private X-Forwarded-For hop only behind a local/internal proxy peer', () => {
  const prevService = process.env.K_SERVICE;
  process.env.K_SERVICE = 'test-service';

  try {
    // Behind internal proxy loopback -> honors rightmost non-private IP (8.8.8.8 -> US), ignoring spoofed prefix
    const proxiedReq = {
      headers: {
        'x-forwarded-for': '103.108.140.10, 8.8.8.8, 10.0.0.5',
      },
      query: {},
      socket: {
        remoteAddress: '127.0.0.1',
      },
    } as unknown as express.Request;

    const proxiedGeo = trustedGeoLookup(proxiedReq);
    assert.ok(proxiedGeo !== null);
    assert.equal(proxiedGeo.country, 'US');

    // Direct public peer -> ignores spoofed X-Forwarded-For header even with K_SERVICE set
    const directPublicReq = {
      headers: {
        'x-forwarded-for': '103.108.140.10',
      },
      query: {},
      socket: {
        remoteAddress: '8.8.8.8',
      },
    } as unknown as express.Request;

    const directGeo = trustedGeoLookup(directPublicReq);
    assert.ok(directGeo !== null);
    assert.equal(directGeo.country, 'US');
  } finally {
    if (prevService === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = prevService;
  }
});

test('inferChannelGeoMeta avoids substring false positives (iptv->ptv, khushboo->hbo, islands->channel i)', () => {
  const tsports = enrichChannelWithRegionMeta(
    { id: '1', name: 'T Sports HD', category: 'Sports', provider: 'M R S IPTV Official HD' },
    0
  );
  assert.ok(tsports.countries.includes('BD'));
  assert.ok(!tsports.countries.includes('PK'), 'provider M R S IPTV must not match ptv -> PK');

  const khushboo = enrichChannelWithRegionMeta(
    { id: '2', name: 'Khushboo Bangla HD', category: 'Entertainment', provider: 'M R S IPTV Official HD' },
    1
  );
  assert.ok(khushboo.countries.includes('BD'));
  assert.ok(!khushboo.countries.includes('US'), 'Khushboo must not match hbo -> US');

  const bbcIslands = enrichChannelWithRegionMeta(
    { id: '3', name: 'BBC One Channel Islands HD', category: 'Bangladeshi', provider: 'M R S IPTV Official HD' },
    2
  );
  assert.ok(bbcIslands.countries.includes('GB'));
  assert.ok(!bbcIslands.countries.includes('BD'), 'BBC One Channel Islands must stay GB and not match channel i -> BD');

  const ptv = enrichChannelWithRegionMeta(
    { id: '4', name: 'PTV Sports', category: 'Sports', provider: 'M R S IPTV Official HD' },
    3
  );
  assert.ok(ptv.countries.includes('PK'));
});

