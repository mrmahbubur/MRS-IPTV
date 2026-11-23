#!/usr/bin/env node
/**
 * M R S IPTV — Cloudinary API Utility Script
 * ---------------------------------------------------------------------------
 * Environment-driven CLI and importable module for Cloudinary media workflows:
 *   - Ping Admin API connectivity
 *   - List uploaded resources via Admin API or public tag JSON lists
 *   - Inspect public Cloudinary shared collections
 *   - Generate SHA-1 signatures for authenticated uploads
 *   - Upload local files or remote image URLs to Cloudinary
 *   - Export normalized channel artwork JSON catalogs
 *
 * Credentials are read strictly from environment variables (never hardcoded):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_COLLECTION_ID
 *   CLOUDINARY_UPLOAD_PRESET
 *   CLOUDINARY_FOLDER
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch {
  // Environment variables only when .env is absent
}

const API_BASE = 'https://api.cloudinary.com/v1_1';
const RES_BASE = 'https://res.cloudinary.com';
const COLLECTION_BASE = 'https://collection.cloudinary.com';

export function getCloudinaryConfig(overrides = {}) {
  return {
    cloudName: String(overrides.cloudName || process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    apiKey: String(overrides.apiKey || process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: String(overrides.apiSecret || process.env.CLOUDINARY_API_SECRET || '').trim(),
    collectionId: String(overrides.collectionId || process.env.CLOUDINARY_COLLECTION_ID || '').trim(),
    uploadPreset: String(overrides.uploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || '').trim(),
    folder: String(overrides.folder || process.env.CLOUDINARY_FOLDER || 'mrs-iptv').trim(),
  };
}

function assertCloudName(cfg) {
  if (!cfg.cloudName) {
    throw new Error('Missing CLOUDINARY_CLOUD_NAME. Set it in .env or pass --cloud <cloudName>.');
  }
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(cfg.cloudName)) {
    throw new Error(`Invalid Cloudinary cloud name format: ${cfg.cloudName}`);
  }
}

function assertAdminCreds(cfg) {
  assertCloudName(cfg);
  if (!cfg.apiKey || !cfg.apiSecret) {
    throw new Error('Missing CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET for authenticated Admin API calls.');
  }
}

function basicAuthHeader(apiKey, apiSecret) {
  const token = Buffer.from(`${apiKey}:${apiSecret}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}

/**
 * Computes a standard Cloudinary SHA-1 parameter signature.
 * Excludes file, cloud_name, resource_type, and api_key per Cloudinary spec.
 */
export function signUploadParams(params, apiSecret) {
  if (!apiSecret) {
    throw new Error('Missing CLOUDINARY_API_SECRET required to sign upload parameters.');
  }
  const timestamp = Number(params.timestamp) || Math.floor(Date.now() / 1000);
  const filtered = Object.entries({ ...params, timestamp })
    .filter(([k, v]) => (
      v !== undefined &&
      v !== null &&
      String(v) !== '' &&
      !['file', 'cloud_name', 'resource_type', 'api_key', 'signature'].includes(k)
    ))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : String(v)}`);

  const toSign = `${filtered.join('&')}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign, 'utf8').digest('hex');
  return { timestamp, signature };
}

export function buildAssetUrl(cloudName, publicId, { resourceType = 'image', format = '', transformation = 'f_auto,q_auto' } = {}) {
  if (!cloudName || !publicId) {
    throw new Error('cloudName and publicId are required to build an asset URL.');
  }
  const safeId = String(publicId).replace(/^\/+/, '');
  const txSegment = transformation ? `${transformation.replace(/^\/+|\/+$/g, '')}/` : '';
  const extSegment = format ? `.${format.replace(/^\./, '')}` : '';
  return `${RES_BASE}/${encodeURIComponent(cloudName)}/${encodeURIComponent(resourceType)}/upload/${txSegment}${safeId}${extSegment}`;
}

export async function pingCloudinary(overrides = {}) {
  const cfg = getCloudinaryConfig(overrides);
  assertAdminCreds(cfg);

  const res = await fetch(`${API_BASE}/${encodeURIComponent(cfg.cloudName)}/ping`, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(cfg.apiKey, cfg.apiSecret),
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary ping failed (HTTP ${res.status})`);
  }
  return { ok: true, cloudName: cfg.cloudName, status: data.status || 'ok' };
}

export async function listResources({
  cloudName,
  apiKey,
  apiSecret,
  resourceType = 'image',
  prefix = '',
  tag = '',
  maxResults = 100,
  nextCursor = '',
} = {}) {
  const cfg = getCloudinaryConfig({ cloudName, apiKey, apiSecret });

  // Public JSON list mode by tag when no Admin API credentials are configured
  if (tag && (!cfg.apiKey || !cfg.apiSecret)) {
    assertCloudName(cfg);
    const listUrl = `${RES_BASE}/${encodeURIComponent(cfg.cloudName)}/${encodeURIComponent(resourceType)}/list/${encodeURIComponent(tag)}.json`;
    const res = await fetch(listUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Public tag list failed (HTTP ${res.status}). Ensure Client-side Resource Lists are enabled or set API credentials.`);
    }
    const payload = await res.json();
    const resources = Array.isArray(payload?.resources) ? payload.resources : [];
    return {
      ok: true,
      mode: 'public-tag-list',
      cloudName: cfg.cloudName,
      total: resources.length,
      resources: resources.map((r) => ({
        publicId: r.public_id,
        format: r.format || '',
        version: r.version,
        width: r.width || null,
        height: r.height || null,
        url: buildAssetUrl(cfg.cloudName, r.public_id, { resourceType, format: r.format || '' }),
      })),
    };
  }

  assertAdminCreds(cfg);
  const endpointPath = tag
    ? `resources/${encodeURIComponent(resourceType)}/tags/${encodeURIComponent(tag)}`
    : `resources/${encodeURIComponent(resourceType)}`;

  const url = new URL(`${API_BASE}/${encodeURIComponent(cfg.cloudName)}/${endpointPath}`);
  url.searchParams.set('max_results', String(Math.min(500, Math.max(1, Number(maxResults) || 100))));
  if (!tag && prefix) url.searchParams.set('prefix', prefix);
  if (nextCursor) url.searchParams.set('next_cursor', nextCursor);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(cfg.apiKey, cfg.apiSecret),
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary list failed (HTTP ${res.status})`);
  }

  const resources = Array.isArray(data?.resources) ? data.resources : [];
  return {
    ok: true,
    mode: 'admin-api',
    cloudName: cfg.cloudName,
    total: resources.length,
    nextCursor: data.next_cursor || null,
    resources: resources.map((r) => ({
      publicId: r.public_id,
      assetId: r.asset_id,
      format: r.format,
      bytes: r.bytes,
      width: r.width,
      height: r.height,
      createdAt: r.created_at,
      url: r.secure_url || buildAssetUrl(cfg.cloudName, r.public_id, { resourceType, format: r.format }),
    })),
  };
}

export async function fetchCollectionAssets({ cloudName, collectionId } = {}) {
  const cfg = getCloudinaryConfig({ cloudName, collectionId });
  assertCloudName(cfg);
  if (!cfg.collectionId || !/^[a-zA-Z0-9_-]{6,64}$/.test(cfg.collectionId)) {
    throw new Error('Missing or invalid CLOUDINARY_COLLECTION_ID.');
  }

  const sharePageUrl = `${COLLECTION_BASE}/${encodeURIComponent(cfg.cloudName)}/${encodeURIComponent(cfg.collectionId)}`;
  const candidates = [
    `${COLLECTION_BASE}/api/v1/collections/public/${encodeURIComponent(cfg.cloudName)}/${encodeURIComponent(cfg.collectionId)}`,
    `${RES_BASE}/${encodeURIComponent(cfg.cloudName)}/image/list/${encodeURIComponent(cfg.collectionId)}.json`,
  ];

  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (!ctype.includes('json')) continue;
      const data = await res.json();
      const items = Array.isArray(data?.assets)
        ? data.assets
        : Array.isArray(data?.resources)
        ? data.resources
        : [];
      return {
        ok: true,
        source: endpoint,
        sharePageUrl,
        cloudName: cfg.cloudName,
        collectionId: cfg.collectionId,
        total: items.length,
        assets: items,
      };
    } catch {
      // try next candidate
    }
  }

  return {
    ok: false,
    cloudName: cfg.cloudName,
    collectionId: cfg.collectionId,
    sharePageUrl,
    assets: [],
    note: 'Collection JSON endpoint is unavailable or private. Configure CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET or a public tag list.',
  };
}

export async function uploadAsset({
  fileOrUrl,
  cloudName,
  apiKey,
  apiSecret,
  uploadPreset,
  folder,
  publicId,
  tags,
  resourceType = 'image',
} = {}) {
  if (!fileOrUrl) {
    throw new Error('Provide a local file path or http(s) media URL to upload.');
  }
  const cfg = getCloudinaryConfig({ cloudName, apiKey, apiSecret, uploadPreset, folder });
  assertCloudName(cfg);

  const form = new FormData();
  const isRemote = /^https?:\/\//i.test(String(fileOrUrl).trim());
  if (isRemote) {
    form.append('file', String(fileOrUrl).trim());
  } else {
    const resolved = path.resolve(String(fileOrUrl));
    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`);
    }
    const buf = fs.readFileSync(resolved);
    const filename = path.basename(resolved);
    form.append('file', new Blob([buf]), filename);
  }

  const uploadParams = {};
  if (cfg.folder) uploadParams.folder = cfg.folder;
  if (publicId) uploadParams.public_id = String(publicId).trim();
  if (tags) uploadParams.tags = Array.isArray(tags) ? tags.join(',') : String(tags);

  if (cfg.apiKey && cfg.apiSecret) {
    const { timestamp, signature } = signUploadParams(uploadParams, cfg.apiSecret);
    form.append('api_key', cfg.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    for (const [k, v] of Object.entries(uploadParams)) {
      form.append(k, String(v));
    }
  } else if (cfg.uploadPreset) {
    form.append('upload_preset', cfg.uploadPreset);
    for (const [k, v] of Object.entries(uploadParams)) {
      form.append(k, String(v));
    }
  } else {
    throw new Error('Provide CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (signed upload) or CLOUDINARY_UPLOAD_PRESET (unsigned upload).');
  }

  const endpoint = `${API_BASE}/${encodeURIComponent(cfg.cloudName)}/${encodeURIComponent(resourceType)}/upload`;
  const res = await fetch(endpoint, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);
  }

  return {
    ok: true,
    publicId: data.public_id,
    format: data.format,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    secureUrl: data.secure_url,
    url: data.secure_url || buildAssetUrl(cfg.cloudName, data.public_id, { resourceType, format: data.format }),
  };
}

function parseCliArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      args.push(token);
    }
  }
  return { command: args[0] || 'help', positionals: args.slice(1), flags };
}

function printHelp() {
  console.log(`
M R S IPTV — Cloudinary API Utility
Usage:
  node scripts/cloudinary.mjs <command> [options]

Commands:
  ping                       Verify Cloudinary Admin API connectivity
  list                       List resources (--prefix <p> --tag <t> --limit <n> --type image)
  collection                 Inspect a Cloudinary collection (--cloud <c> --collection <id>)
  sign                       Generate SHA-1 signed upload parameters (--folder <f> --public-id <id> --tags <t>)
  upload <file|url>          Upload a local file or remote image URL (--folder <f> --public-id <id> --tags <t>)
  sync-logos [outFile]       Export resources JSON catalog (default: data/cloudinary-assets.json)
  help                       Show this help message

Environment Variables (.env):
  CLOUDINARY_CLOUD_NAME      Cloudinary cloud name
  CLOUDINARY_API_KEY         Cloudinary API key (for Admin API / signed uploads)
  CLOUDINARY_API_SECRET      Cloudinary API secret (kept server-side only)
  CLOUDINARY_COLLECTION_ID   Optional shared collection ID
  CLOUDINARY_UPLOAD_PRESET   Optional unsigned upload preset
  CLOUDINARY_FOLDER          Default upload folder (default: mrs-iptv)
`);
}

async function runCli() {
  const { command, positionals, flags } = parseCliArgs(process.argv.slice(2));
  if (command === 'help' || command === '--help' || flags.help === 'true') {
    printHelp();
    return;
  }

  if (command === 'ping') {
    const res = await pingCloudinary({ cloudName: flags.cloud });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (command === 'list') {
    const res = await listResources({
      cloudName: flags.cloud,
      resourceType: flags.type || 'image',
      prefix: flags.prefix || '',
      tag: flags.tag || '',
      maxResults: Number(flags.limit) || 100,
    });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (command === 'collection') {
    const res = await fetchCollectionAssets({
      cloudName: flags.cloud,
      collectionId: flags.collection || positionals[0],
    });
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok) process.exitCode = 1;
    return;
  }

  if (command === 'sign') {
    const cfg = getCloudinaryConfig({ cloudName: flags.cloud, folder: flags.folder });
    assertAdminCreds(cfg);
    const params = {
      folder: cfg.folder,
      ...(flags['public-id'] ? { public_id: flags['public-id'] } : {}),
      ...(flags.tags ? { tags: flags.tags } : {}),
    };
    const signed = signUploadParams(params, cfg.apiSecret);
    console.log(JSON.stringify({ ok: true, cloudName: cfg.cloudName, apiKey: cfg.apiKey, ...params, ...signed }, null, 2));
    return;
  }

  if (command === 'upload') {
    const target = positionals[0] || flags.file;
    const res = await uploadAsset({
      fileOrUrl: target,
      cloudName: flags.cloud,
      uploadPreset: flags.preset,
      folder: flags.folder,
      publicId: flags['public-id'],
      tags: flags.tags,
      resourceType: flags.type || 'image',
    });
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  if (command === 'sync-logos') {
    const outPath = path.resolve(positionals[0] || flags.out || 'data/cloudinary-assets.json');
    const res = await listResources({
      cloudName: flags.cloud,
      resourceType: flags.type || 'image',
      prefix: flags.prefix || '',
      tag: flags.tag || '',
      maxResults: Number(flags.limit) || 500,
    });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), cloudName: res.cloudName, total: res.total, resources: res.resources }, null, 2),
      'utf8'
    );
    console.log(JSON.stringify({ ok: true, outPath, total: res.total }, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

const isEntrypoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  runCli().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exitCode = 1;
  });
}
