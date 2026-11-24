// Payment-proof (screenshot) checks.
//
// Be realistic about what a screenshot can prove: nothing on its own – anyone
// can edit pixels. So a screenshot is only ever *supporting evidence*. It is
// checked for file integrity, re-use and editing traces, and (if tesseract.js
// is installed) the Transaction ID printed on it is read and looked up in the
// ledger – the ledger, not the picture, decides.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { all } from './db.js';

const MIN_SIDE = 300; // real phone screenshots are far larger than this

function detectType(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buf.length > 100 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}

function dimensions(buf, ext) {
  try {
    if (ext === 'png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (ext === 'jpg') {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (ext === 'webp') {
      const kind = buf.toString('latin1', 12, 16);
      if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch { /* fall through */ }
  return null;
}

const EDITOR_RE = /(Adobe Photoshop|Photoshop|GIMP|Pixlr|Canva|PicsArt|Facetune|Meitu|FaceApp|Photopea|Paint\.NET|Fotor)/i;

/** Validate the upload. Returns { ok, error } or { ok, ext, mime, sha256, flags, width, height }. */
export function inspectUpload(buf, declaredMime) {
  if (!buf?.length) return { ok: false, error: 'The screenshot file is empty' };
  if (buf.length > config.maxScreenshotBytes) return { ok: false, error: 'Screenshot is too large (max 3 MB)' };
  const type = detectType(buf);
  if (!type) return { ok: false, error: 'Upload a real JPG, PNG or WebP (or PDF) payment document' };
  if (declaredMime && !['application/octet-stream', type.mime].includes(declaredMime) && !(declaredMime === 'image/jpg' && type.ext === 'jpg')) {
    return { ok: false, error: 'The file type does not match its content' };
  }

  let dim = { w: null, h: null };
  if (type.ext !== 'pdf') {
    dim = dimensions(buf, type.ext);
    if (!dim || dim.w < MIN_SIDE || dim.h < MIN_SIDE) return { ok: false, error: 'This image is too small to be a payment screenshot' };
    if (dim.w * dim.h > 60_000_000) return { ok: false, error: 'Image dimensions are too large' };
  }

  const flags = [];
  const head = buf.toString('latin1', 0, Math.min(buf.length, 131072));
  const editor = head.match(EDITOR_RE);
  if (editor) flags.push(`edited_by:${editor[1].toLowerCase()}`);
  return { ok: true, ext: type.ext, mime: type.mime, sha256: createHash('sha256').update(buf).digest('hex'), flags, width: dim.w, height: dim.h };
}

/** Store under a random name (never the user-supplied one). */
export function saveUpload(buf, ext) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const file = path.join(config.uploadDir, `${randomBytes(12).toString('hex')}.${ext}`);
  fs.writeFileSync(file, buf, { mode: 0o600 });
  return file;
}

// ------------------------------- OCR (optional) -----------------------------
let ocrWorker; let ocrTried = false;
async function loadOcr() {
  if (ocrTried) return ocrWorker;
  ocrTried = true;
  try {
    const mod = await import('tesseract.js');
    ocrWorker = await (mod.createWorker ? mod.createWorker('eng') : null);
  } catch { ocrWorker = null; /* tesseract.js not installed → screenshots go to manual review */ }
  return ocrWorker;
}

export async function readText(buf) {
  const w = await loadOcr();
  if (!w) return null;
  try { return (await w.recognize(buf)).data.text || null; } catch { return null; }
}

/**
 * Find ledger transaction ids that literally appear in the OCR text.
 * We look tokens up in the ledger rather than guessing a format, so a
 * mis-read token can never match a real payment by accident.
 */
export function ledgerIdsInText(channel, text) {
  if (!text) return [];
  const haystack = text.toUpperCase().replace(/[^A-Z0-9_]+/g, ' ');
  const tokens = new Set(haystack.split(' ').filter((t) => t.length >= 6 && t.length <= 40));
  if (!tokens.size) return [];
  const rows = all('SELECT trx_id FROM ledger WHERE channel=? ORDER BY id DESC LIMIT 5000', channel);
  return rows.map((r) => r.trx_id).filter((t) => tokens.has(t));
}
