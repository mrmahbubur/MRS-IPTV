import express, { Request, Response, NextFunction } from 'express';
import { config, PLANS } from './mrs-iptv-backend/src/config.js';
import { get, all, run, nowIso, audit } from './mrs-iptv-backend/src/db.js';
import { stock } from './mrs-iptv-backend/src/codes.js';
import { ingestEmail } from './mrs-iptv-backend/src/ledger.js';
import { reconcilePending } from './mrs-iptv-backend/src/verify.js';
import { adminAuth } from '../src/lib/firebase-admin.js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface WorkspaceRouterOptions {
  onImportCustomM3uSource?: (source: { name: string; url: string; prefix: string }) => Promise<void> | void;
}

const safeEqual = (a: unknown, b: unknown) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};

function extractGoogleToken(req: Request): string {
  const customHeader = req.get('x-google-access-token');
  if (customHeader && customHeader.trim()) {
    return customHeader.replace(/^Bearer\s+/i, '').trim();
  }
  const authHeader = req.get('authorization') || '';
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

function extractAdminToken(req: Request): string {
  const xAdmin = req.get('x-admin-token');
  if (xAdmin && xAdmin.trim()) return xAdmin.trim();
  const authHeader = req.get('authorization') || '';
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const tok = extractAdminToken(req);
  if (tok && safeEqual(tok, config.adminToken)) return next();
  if (tok) {
    try {
      const decoded = await adminAuth.verifyIdToken(tok);
      const configuredAdminEmail = process.env.ADMIN_EMAIL || config.mail.adminEmail || 'mr216873@gmail.com';
      const isAdmin =
        Boolean(decoded.admin) ||
        (Boolean(decoded.email) && decoded.email!.toLowerCase() === configuredAdminEmail.toLowerCase());
      if (isAdmin) return next();
    } catch {
      // fall through
    }
  }
  return res.status(401).json({
    ok: false,
    error: { code: 'unauthorized', message: 'Admin token or admin Firebase session required.' },
  });
}

async function verifyGoogleTokenWithGoogle(token: string) {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`
  );
  if (!res.ok) {
    return { valid: false as const, error: 'Google OAuth token is invalid or expired.' };
  }
  const info: any = await res.json();
  return {
    valid: true as const,
    email: String(info.email || ''),
    expiresIn: Number(info.expires_in || 0),
    scopes: String(info.scope || '').split(/\s+/).filter(Boolean),
  };
}

async function googleApiFetch(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    const err = new Error('Your Google Workspace session expired. Please sign in again.') as any;
    err.status = 401;
    err.code = 'NEEDS_AUTH';
    throw err;
  }

  if (!response.ok) {
    let detail = `Google API error (${response.status})`;
    try {
      const errJson: any = await response.json();
      if (errJson?.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // ignore non-JSON body
    }
    const err = new Error(detail) as any;
    err.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    err.code = 'GOOGLE_API_ERROR';
    throw err;
  }

  if (response.status === 204) return null;
  return response;
}

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  headerName: string
): string {
  if (!Array.isArray(headers)) return '';
  const match = headers.find((h) => (h.name || '').toLowerCase() === headerName.toLowerCase());
  return match?.value || '';
}

function decodeBase64UrlUtf8(data?: string): string {
  if (!data) return '';
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function encodeBase64UrlUtf8(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function extractBodyTextFromPayload(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64UrlUtf8(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyTextFromPayload(part);
      if (nested) return nested;
    }
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64UrlUtf8(payload.body.data);
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .trim();
  }
  if (payload.body?.data) {
    return decodeBase64UrlUtf8(payload.body.data);
  }
  return '';
}

function buildRawRfc2822Email({
  to,
  subject,
  body,
  html,
  replyTo,
}: {
  to: string;
  subject: string;
  body: string;
  html?: string;
  replyTo?: string;
}): string {
  const cleanTo = String(to || '').replace(/[\r\n]+/g, '').trim();
  const cleanSubject = String(subject || '').replace(/[\r\n]+/g, ' ').trim();
  const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject, 'utf8').toString('base64')}?=`;

  const commonHeaders = [
    `To: ${cleanTo}`,
    ...(replyTo ? [`Reply-To: ${String(replyTo).replace(/[\r\n]+/g, '').trim()}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
  ];

  if (html) {
    const altBoundary = `mrs_alt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const lines = [
      ...commonHeaders,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      body || '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      html,
      `--${altBoundary}--`,
    ];
    return encodeBase64UrlUtf8(lines.join('\r\n'));
  }

  const lines = [
    ...commonHeaders,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body || '',
  ];
  return encodeBase64UrlUtf8(lines.join('\r\n'));
}

async function uploadFileToDriveServer({
  token,
  name,
  content,
  mimeType = 'text/plain',
  space = 'drive',
  existingFileId,
  parentFolderId,
}: {
  token: string;
  name: string;
  content: string;
  mimeType?: string;
  space?: 'drive' | 'appDataFolder';
  existingFileId?: string;
  parentFolderId?: string;
}) {
  const metadata: Record<string, unknown> = { name, mimeType };
  if (!existingFileId) {
    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    } else if (space === 'appDataFolder') {
      metadata.parents = ['appDataFolder'];
    }
  }

  const boundary = `mrs_server_drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink`;

  const res = await googleApiFetch(url, token, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });

  return await res!.json();
}

async function ensureDriveBackupFolder(token: string, folderName = 'M R S IPTV Backups'): Promise<string> {
  const params = new URLSearchParams({
    q: `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: '5',
  });
  const listRes = await googleApiFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, token);
  const listJson: any = await listRes!.json();
  if (Array.isArray(listJson?.files) && listJson.files[0]?.id) {
    return listJson.files[0].id;
  }

  const createRes = await googleApiFetch('https://www.googleapis.com/drive/v3/files?fields=id,name', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const created: any = await createRes!.json();
  return created.id;
}

export function createGoogleWorkspaceRouter(options: WorkspaceRouterOptions = {}) {
  const router = express.Router();

  const requireGoogleToken = (req: Request, res: Response, next: NextFunction) => {
    const tok = extractGoogleToken(req);
    if (!tok || tok.length < 16) {
      return res.status(401).json({
        ok: false,
        error: { code: 'NEEDS_AUTH', message: 'Google Workspace access token required in Authorization Bearer header.' },
      });
    }
    (req as any).googleAccessToken = tok;
    next();
  };

  const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve(fn(req, res, next)).catch((err: any) => {
        const status = err?.status || 500;
        return res.status(status).json({
          ok: false,
          error: {
            code: err?.code || 'workspace_error',
            message: err?.message || 'Workspace backend operation failed.',
          },
        });
      });

  // -------------------------------------------------------------------------
  // 1. TOKEN VERIFICATION STATUS
  // -------------------------------------------------------------------------
  router.get(
    '/status',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const info = await verifyGoogleTokenWithGoogle(token);
      if (!info.valid) {
        return res.status(401).json({ ok: false, error: { code: 'NEEDS_AUTH', message: info.error } });
      }
      res.json({
        ok: true,
        data: {
          connected: true,
          email: info.email,
          expiresIn: info.expiresIn,
          driveEnabled: info.scopes.some((s) => s.includes('/drive')),
          gmailEnabled: info.scopes.some((s) => s.includes('gmail') || s.includes('mail.google.com')),
          scopeCount: info.scopes.length,
        },
      });
    })
  );

  // -------------------------------------------------------------------------
  // 2. GOOGLE DRIVE BACKEND ROUTES
  // -------------------------------------------------------------------------
  router.get(
    '/drive/files',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const query = String(req.query.query || '').trim();
      const filterMode = String(req.query.filterMode || 'all');
      const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 40, 1), 100);

      const qParts: string[] = ['trashed = false'];
      if (query) {
        const escaped = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        qParts.push(`name contains '${escaped}'`);
      }

      if (filterMode === 'playlists') {
        qParts.push(
          "(name contains '.m3u' or name contains '.m3u8' or mimeType = 'audio/x-mpegurl' or mimeType = 'application/vnd.apple.mpegurl' or name contains 'iptv')"
        );
      } else if (filterMode === 'media') {
        qParts.push(
          "(mimeType contains 'video/' or mimeType contains 'audio/' or name contains '.mp4' or name contains '.mkv' or name contains '.ts')"
        );
      }

      const params = new URLSearchParams({
        pageSize: String(pageSize),
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink, parents, trashed, shared)',
        orderBy: 'modifiedTime desc',
        spaces: filterMode === 'appdata' ? 'appDataFolder' : 'drive',
        q: qParts.join(' and '),
      });

      const apiRes = await googleApiFetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, token);
      const json: any = await apiRes!.json();
      res.json({ ok: true, files: Array.isArray(json?.files) ? json.files : [] });
    })
  );

  router.get(
    '/drive/files/:fileId/content',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const fileId = req.params.fileId;
      const apiRes = await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        token
      );
      const text = await apiRes!.text();
      res.json({ ok: true, content: text });
    })
  );

  router.post(
    '/drive/files',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const { name, content, mimeType, space, existingFileId } = req.body || {};
      if (!name || typeof content !== 'string') {
        return res.status(400).json({ ok: false, error: { code: 'bad_request', message: 'name and content are required.' } });
      }
      const created = await uploadFileToDriveServer({
        token,
        name: String(name),
        content,
        mimeType: mimeType || 'text/plain',
        space: space === 'appDataFolder' ? 'appDataFolder' : 'drive',
        existingFileId: existingFileId ? String(existingFileId) : undefined,
      });
      res.json({ ok: true, file: created });
    })
  );

  router.patch(
    '/drive/files/:fileId',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const fileId = req.params.fileId;
      const body: Record<string, unknown> = {};
      if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        body.name = req.body.name.trim();
      }
      if (typeof req.body?.trashed === 'boolean') {
        body.trashed = req.body.trashed;
      }
      if (Object.keys(body).length === 0) {
        return res.status(400).json({ ok: false, error: { code: 'bad_request', message: 'name or trashed field required.' } });
      }

      const apiRes = await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,trashed`,
        token,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const updated = await apiRes!.json();
      res.json({ ok: true, file: updated });
    })
  );

  router.delete(
    '/drive/files/:fileId',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(req.params.fileId)}`,
        token,
        { method: 'DELETE' }
      );
      res.json({ ok: true });
    })
  );

  // Import M3U directly from Google Drive on the server into data/custom_imported_sources.json
  router.post(
    '/drive/import-m3u',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const { fileId, customName } = req.body || {};
      if (!fileId) {
        return res.status(400).json({ ok: false, error: { code: 'bad_request', message: 'fileId is required.' } });
      }

      const metaRes = await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(fileId))}?fields=id,name,mimeType`,
        token
      );
      const meta: any = await metaRes!.json();
      const contentRes = await googleApiFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(fileId))}?alt=media`,
        token
      );
      const rawM3u = await contentRes!.text();
      if (!rawM3u.includes('#EXTINF')) {
        return res.status(422).json({
          ok: false,
          error: { code: 'invalid_m3u', message: 'Selected Drive file does not contain valid #EXTINF M3U channels.' },
        });
      }

      const prefix = `imp_drv_${createHmac('sha256', 'drive-m3u').update(String(fileId)).digest('hex').slice(0, 8)}`;
      const fileName = `${prefix}.m3u`;
      const dataDir = path.join(process.cwd(), 'data');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, fileName), rawM3u, 'utf8');

      const label = String(customName || meta?.name || 'Google Drive Playlist').replace(/\.m3u8?$/i, '');
      const customSourcesPath = path.join(dataDir, 'custom_imported_sources.json');
      let list: any[] = [];
      try {
        if (fs.existsSync(customSourcesPath)) {
          const parsed = JSON.parse(fs.readFileSync(customSourcesPath, 'utf8'));
          if (Array.isArray(parsed)) list = parsed;
        }
      } catch {
        list = [];
      }

      const sourceEntry = { name: label, url: `local:${fileName}`, prefix, driveFileId: String(fileId), importedAt: nowIso() };
      const idx = list.findIndex((s) => s.prefix === prefix);
      if (idx >= 0) list[idx] = sourceEntry;
      else list.push(sourceEntry);
      fs.writeFileSync(customSourcesPath, JSON.stringify(list, null, 2), 'utf8');

      if (options.onImportCustomM3uSource) {
        await options.onImportCustomM3uSource({ name: label, url: `local:${fileName}`, prefix });
      }

      const channelCount = (rawM3u.match(/#EXTINF/g) || []).length;
      audit('workspace', 'drive_m3u_imported', null, { fileId, label, channelCount });
      res.json({ ok: true, prefix, label, channelCount });
    })
  );

  // Admin: Backup SQLite snapshot (JSON + available VIP codes CSV) to Google Drive
  router.post(
    '/drive/backup',
    requireAdminAuth,
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const dateStamp = new Date().toISOString().slice(0, 10);
      const folderId = await ensureDriveBackupFolder(token, 'M R S IPTV Backups');

      const availableCodes = all("SELECT code, plan, status, batch, created_at FROM codes WHERE status='available' ORDER BY id");
      const csvRows = [
        'code,plan,months,status,batch,created_at',
        ...availableCodes.map((r: any) => `${r.code},${r.plan},${PLANS[r.plan]?.months || ''},${r.status},${r.batch || ''},${r.created_at || ''}`),
      ].join('\n');

      const snapshot = {
        exportedAt: nowIso(),
        brand: config.brand.name,
        stock: stock(),
        ordersSummary: Object.fromEntries(all('SELECT status, COUNT(*) n FROM orders GROUP BY status').map((r: any) => [r.status, r.n])),
        recentOrders: all('SELECT id, public_id, plan, region, channel, expected_minor, currency, email, trx_id, status, verified_by, created_at, verified_at FROM orders ORDER BY id DESC LIMIT 200'),
        recentLedger: all('SELECT id, channel, trx_id, amount_minor, currency, sender, received_at, source, claimed_by_order FROM ledger ORDER BY id DESC LIMIT 200'),
        recentAudit: all('SELECT id, at, actor, action, order_id, detail FROM audit_log ORDER BY id DESC LIMIT 200'),
      };

      const [jsonUpload, csvUpload] = await Promise.all([
        uploadFileToDriveServer({
          token,
          name: `mrs-iptv-db-snapshot-${dateStamp}.json`,
          content: JSON.stringify(snapshot, null, 2),
          mimeType: 'application/json',
          parentFolderId: folderId,
        }),
        uploadFileToDriveServer({
          token,
          name: `mrs-iptv-unused-codes-${dateStamp}.csv`,
          content: csvRows,
          mimeType: 'text/csv',
          parentFolderId: folderId,
        }),
      ]);

      audit('admin', 'drive_backup_uploaded', null, {
        folderId,
        jsonFileId: jsonUpload.id,
        csvFileId: csvUpload.id,
        unusedCodesCount: availableCodes.length,
      });

      res.json({
        ok: true,
        data: {
          folderId,
          snapshotFile: jsonUpload,
          codesCsvFile: csvUpload,
          unusedCodesCount: availableCodes.length,
        },
      });
    })
  );

  // -------------------------------------------------------------------------
  // 3. GMAIL BACKEND ROUTES
  // -------------------------------------------------------------------------
  router.get(
    '/gmail/labels',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const apiRes = await googleApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', token);
      const data: any = await apiRes!.json();
      res.json({ ok: true, labels: Array.isArray(data?.labels) ? data.labels : [] });
    })
  );

  router.get(
    '/gmail/messages',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const query = String(req.query.query || '').trim();
      const labelId = String(req.query.labelId || 'INBOX');
      const maxResults = Math.min(Math.max(Number(req.query.maxResults) || 15, 1), 30);

      const params = new URLSearchParams({ maxResults: String(maxResults) });
      if (query) params.set('q', query);
      if (labelId && labelId !== 'ALL') params.append('labelIds', labelId);

      const listRes = await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        token
      );
      const listData: any = await listRes!.json();
      const refs: Array<{ id: string; threadId: string }> = Array.isArray(listData?.messages) ? listData.messages : [];
      if (refs.length === 0) return res.json({ ok: true, messages: [] });

      const details = await Promise.all(
        refs.slice(0, maxResults).map(async (ref) => {
          const msgRes = await googleApiFetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            token
          );
          const msg: any = await msgRes!.json();
          const headers = msg?.payload?.headers;
          const labels: string[] = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msg.snippet || '',
            labelIds: labels,
            internalDate: msg.internalDate,
            subject: getHeaderValue(headers, 'Subject') || '(No Subject)',
            from: getHeaderValue(headers, 'From') || 'Unknown Sender',
            to: getHeaderValue(headers, 'To') || '',
            date: getHeaderValue(headers, 'Date') || '',
            isUnread: labels.includes('UNREAD'),
            isStarred: labels.includes('STARRED'),
          };
        })
      );

      res.json({ ok: true, messages: details });
    })
  );

  router.get(
    '/gmail/messages/:messageId',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const apiRes = await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(req.params.messageId)}?format=full`,
        token
      );
      const msg: any = await apiRes!.json();
      const headers = msg?.payload?.headers;
      const labels: string[] = Array.isArray(msg?.labelIds) ? msg.labelIds : [];
      const bodyText = extractBodyTextFromPayload(msg?.payload) || msg?.snippet || '';
      const m3uMatches =
        bodyText.match(/https?:\/\/[^\s"'<>]+(?:\.m3u8?|playlist[^\s"'<>]*|m3u[^\s"'<>]*)/gi) || [];

      res.json({
        ok: true,
        message: {
          id: msg.id,
          threadId: msg.threadId,
          snippet: msg.snippet || '',
          labelIds: labels,
          internalDate: msg.internalDate,
          subject: getHeaderValue(headers, 'Subject') || '(No Subject)',
          from: getHeaderValue(headers, 'From') || 'Unknown Sender',
          to: getHeaderValue(headers, 'To') || '',
          date: getHeaderValue(headers, 'Date') || '',
          isUnread: labels.includes('UNREAD'),
          isStarred: labels.includes('STARRED'),
          bodyText,
          detectedM3uUrls: Array.from(new Set(m3uMatches)),
          hasRawExtM3u: bodyText.includes('#EXTM3U'),
        },
      });
    })
  );

  router.post(
    '/gmail/send',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const { to, subject, body, html } = req.body || {};
      if (!to || !subject) {
        return res.status(400).json({ ok: false, error: { code: 'bad_request', message: 'to and subject are required.' } });
      }
      const raw = buildRawRfc2822Email({ to: String(to), subject: String(subject), body: String(body || ''), html });
      const apiRes = await googleApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      const sent = await apiRes!.json();
      res.json({ ok: true, data: sent });
    })
  );

  router.post(
    '/gmail/drafts',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const { to, subject, body } = req.body || {};
      const raw = buildRawRfc2822Email({ to: String(to || ''), subject: String(subject || '(No Subject)'), body: String(body || '') });
      const apiRes = await googleApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { raw } }),
      });
      const draft = await apiRes!.json();
      res.json({ ok: true, data: draft });
    })
  );

  router.post(
    '/gmail/messages/:messageId/modify',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const { addLabelIds = [], removeLabelIds = [] } = req.body || {};
      await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(req.params.messageId)}/modify`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addLabelIds, removeLabelIds }),
        }
      );
      res.json({ ok: true });
    })
  );

  router.post(
    '/gmail/messages/:messageId/trash',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(req.params.messageId)}/trash`,
        token,
        { method: 'POST' }
      );
      res.json({ ok: true });
    })
  );

  router.delete(
    '/gmail/messages/:messageId',
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(req.params.messageId)}`,
        token,
        { method: 'DELETE' }
      );
      res.json({ ok: true });
    })
  );

  // Admin: Scan authenticated Gmail inbox for Skrill & Payoneer receipts, add to payment ledger & reconcile
  router.post(
    '/gmail/sync-payments',
    requireAdminAuth,
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const skrillDomains = config.ingest.emailDomains.skrill.map((d) => `from:${d}`).join(' OR ');
      const payoneerDomains = config.ingest.emailDomains.payoneer.map((d) => `from:${d}`).join(' OR ');
      const searchQ = `(${skrillDomains} OR ${payoneerDomains}) newer_than:30d`;

      const params = new URLSearchParams({ maxResults: '25', q: searchQ });
      const listRes = await googleApiFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        token
      );
      const listJson: any = await listRes!.json();
      const refs: Array<{ id: string }> = Array.isArray(listJson?.messages) ? listJson.messages : [];

      let scanned = 0;
      let added = 0;
      let duplicates = 0;
      let unparsed = 0;

      for (const ref of refs) {
        scanned++;
        const msgRes = await googleApiFetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=full`,
          token
        );
        const msg: any = await msgRes!.json();
        const headers = msg?.payload?.headers;
        const from = getHeaderValue(headers, 'From');
        const subject = getHeaderValue(headers, 'Subject');
        const dateHeader = getHeaderValue(headers, 'Date');
        const authResults = getHeaderValue(headers, 'Authentication-Results');
        const body = extractBodyTextFromPayload(msg?.payload) || msg?.snippet || '';

        const dkimPass = /dkim=pass/i.test(authResults);
        const receivedAt = msg.internalDate
          ? new Date(Number(msg.internalDate)).toISOString()
          : dateHeader
            ? new Date(dateHeader).toISOString()
            : nowIso();

        const ing = ingestEmail({ from, subject, body, receivedAt, dkimPass });
        if (ing.ok) {
          if (ing.duplicate) duplicates++;
          else added++;
        } else {
          unparsed++;
        }
      }

      if (added > 0) reconcilePending();
      audit('admin', 'gmail_payments_synced', null, { scanned, added, duplicates, unparsed });
      res.json({ ok: true, data: { scanned, added, duplicates, unparsed } });
    })
  );

  // Admin: Deliver queued / failed email_outbox items directly via Gmail API
  router.post(
    '/gmail/flush-outbox',
    requireAdminAuth,
    requireGoogleToken,
    wrap(async (req, res) => {
      const token = (req as any).googleAccessToken as string;
      const limit = Math.min(Number(req.body?.limit) || 25, 50);
      const includeFailed = Boolean(req.body?.includeFailed);

      const rows = all(
        `SELECT * FROM email_outbox WHERE status IN (${includeFailed ? "'queued','failed'" : "'queued'"}) ORDER BY id ASC LIMIT ?`,
        limit
      );

      let sent = 0;
      let failed = 0;
      const errors: Array<{ id: number; error: string }> = [];

      for (const m of rows) {
        const isCopyMail = m.mail_kind === 'submission_copy_customer' || m.mail_kind === 'submission_copy_admin';
        try {
          const orderRow = m.mail_kind === 'submission_copy_admin' && m.order_id
            ? get('SELECT email FROM orders WHERE id=?', m.order_id)
            : null;
          const raw = buildRawRfc2822Email({
            to: m.to_email,
            subject: m.subject,
            body: m.text_body || '',
            html: m.html_body || undefined,
            replyTo: orderRow?.email || undefined,
          });
          await googleApiFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw }),
          });

          run(
            "UPDATE email_outbox SET status='sent', sent_at=?, attempts=attempts+1, last_error=NULL WHERE id=?",
            nowIso(),
            m.id
          );
          if (isCopyMail) {
            run("UPDATE orders SET copy_email_status='sent' WHERE id=?", m.order_id);
          } else if (m.order_id) {
            run("UPDATE orders SET email_status='sent' WHERE id=?", m.order_id);
          }
          sent++;
        } catch (err: any) {
          failed++;
          const msg = String(err?.message || 'Gmail API send failed').slice(0, 300);
          errors.push({ id: m.id, error: msg });
          run(
            "UPDATE email_outbox SET attempts=attempts+1, last_error=? WHERE id=?",
            msg,
            m.id
          );
          if (err?.code === 'NEEDS_AUTH') throw err;
        }
      }

      audit('admin', 'gmail_outbox_flushed', null, { queuedFound: rows.length, sent, failed });
      res.json({ ok: true, data: { queuedFound: rows.length, sent, failed, errors } });
    })
  );

  return router;
}
