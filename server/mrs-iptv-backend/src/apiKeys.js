import { randomBytes, createHash } from 'node:crypto';
import { get, run, all, nowIso } from './db.js';

export function hashKey(rawKey) {
  return createHash('sha256').update(String(rawKey).trim()).digest('hex');
}

export function createApiKey(name, scopes = ['payments:write', 'entitlement:read']) {
  const scopeStr = Array.isArray(scopes) ? scopes.join(',') : String(scopes || '');
  const secretPart = randomBytes(24).toString('hex');
  const plaintext = `mrs_${secretPart}`;
  const keyHash = hashKey(plaintext);
  const prefix = plaintext.slice(0, 8);
  const now = nowIso();

  const res = run(
    `INSERT INTO api_keys(name, key_hash, key_prefix, scopes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    name,
    keyHash,
    prefix,
    scopeStr,
    now
  );

  return {
    id: res.lastInsertRowid,
    name,
    plaintextKey: plaintext,
    keyPrefix: prefix,
    scopes: scopeStr.split(',').map((s) => s.trim()).filter(Boolean),
    createdAt: now,
  };
}

export function verifyApiKey(rawKey, requiredScope = null) {
  if (!rawKey || typeof rawKey !== 'string') {
    return { ok: false, status: 401, code: 'api_key_invalid', message: 'Missing Authorization header' };
  }

  const cleanKey = rawKey.replace(/^Bearer\s+/i, '').trim();
  if (!cleanKey) {
    return { ok: false, status: 401, code: 'api_key_invalid', message: 'Missing API key' };
  }

  const keyHash = hashKey(cleanKey);
  const row = get('SELECT * FROM api_keys WHERE key_hash=?', keyHash);
  if (!row) {
    return { ok: false, status: 401, code: 'api_key_invalid', message: 'Invalid API key' };
  }

  if (row.revoked_at) {
    return { ok: false, status: 401, code: 'api_key_invalid', message: 'API key has been revoked' };
  }

  const keyScopes = (row.scopes || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (requiredScope && !keyScopes.includes(requiredScope) && !keyScopes.includes('admin:*')) {
    return {
      ok: false,
      status: 403,
      code: 'insufficient_scope',
      message: `API key lacks required scope: ${requiredScope}`,
      details: { requiredScope, actualScopes: keyScopes },
    };
  }

  // Update last_used_at safely
  run('UPDATE api_keys SET last_used_at=? WHERE id=?', nowIso(), row.id);

  return {
    ok: true,
    key: {
      id: row.id,
      name: row.name,
      prefix: row.key_prefix,
      scopes: keyScopes,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    },
  };
}

export function revokeApiKey(idOrPrefix) {
  const isNum = Number.isInteger(Number(idOrPrefix));
  const query = isNum ? 'SELECT * FROM api_keys WHERE id=?' : 'SELECT * FROM api_keys WHERE key_prefix=?';
  const row = get(query, idOrPrefix);
  if (!row) return null;

  run('UPDATE api_keys SET revoked_at=? WHERE id=?', nowIso(), row.id);
  return { ...row, revoked_at: nowIso() };
}

export function listApiKeys() {
  return all('SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at FROM api_keys ORDER BY id DESC');
}
