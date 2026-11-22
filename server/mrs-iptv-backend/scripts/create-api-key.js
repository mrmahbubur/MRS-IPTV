#!/usr/bin/env node
// Usage: node scripts/create-api-key.js "<name>" [scopes]
// Scopes can be comma-separated or space-separated: payments:write,entitlement:read,catalog:write,channels:read
import { createApiKey } from '../src/apiKeys.js';

const args = process.argv.slice(2);
const name = args[0] || 'site-key';
const rawScopes = args[1] || 'payments:write,entitlement:read';
const scopes = rawScopes.split(/[\s,]+/).filter(Boolean);

const record = createApiKey(name, scopes);
console.log(`[API Key Created]`);
console.log(`ID:      ${record.id}`);
console.log(`Name:    ${record.name}`);
console.log(`Prefix:  ${record.keyPrefix}`);
console.log(`Scopes:  ${record.scopes.join(', ')}`);
console.log(`Plaintext key (STORE THIS NOW; it is never shown again):`);
console.log(record.plaintextKey);
