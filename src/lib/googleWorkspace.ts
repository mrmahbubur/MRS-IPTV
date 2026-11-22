import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth } from './firebase';

export const SCOPES = [
  // Google Drive Scopes
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
  // Gmail Scopes
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.addons.current.action.compose',
  'https://www.googleapis.com/auth/gmail.addons.current.message.action',
  'https://www.googleapis.com/auth/gmail.addons.current.message.metadata',
  'https://www.googleapis.com/auth/gmail.addons.current.message.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.insert',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/gmail.settings.sharing',
] as const;

const createWorkspaceProvider = () => {
  const provider = new GoogleAuthProvider();
  for (const scope of SCOPES) {
    provider.addScope(scope);
  }
  provider.setCustomParameters({
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return provider;
};

// In-memory ONLY OAuth access token cache (never stored in localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initWorkspaceAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure(user);
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure(null);
    }
  });
};

export const googleWorkspaceSignIn = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  try {
    isSigningIn = true;
    const provider = createWorkspaceProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Workspace access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getWorkspaceAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const clearWorkspaceAccessToken = () => {
  cachedAccessToken = null;
};

export const googleWorkspaceSignOut = async () => {
  cachedAccessToken = null;
  await signOut(auth);
};

// ---------------------------------------------------------------------------
// Authenticated Backend Fetch Helper (passes client OAuth token as Bearer header)
// ---------------------------------------------------------------------------
async function workspaceBackendFetch(path: string, init: RequestInit = {}) {
  const token = await getWorkspaceAccessToken();
  if (!token) {
    const err = new Error('Google Workspace sign-in required.');
    (err as any).code = 'NEEDS_AUTH';
    throw err;
  }
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`/api/workspace${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    cachedAccessToken = null;
    const err = new Error('Your Google Workspace session expired. Please sign in again.');
    (err as any).code = 'NEEDS_AUTH';
    throw err;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error?.message || `Workspace API error (${response.status})`;
    const err = new Error(detail);
    if (data?.error?.code === 'NEEDS_AUTH') {
      cachedAccessToken = null;
      (err as any).code = 'NEEDS_AUTH';
    }
    throw err;
  }

  return data;
}

export async function verifyWorkspaceBackendStatus(): Promise<{
  connected: boolean;
  email: string;
  expiresIn: number;
  driveEnabled: boolean;
  gmailEnabled: boolean;
  scopeCount: number;
}> {
  const res = await workspaceBackendFetch('/status');
  return res.data;
}

// ---------------------------------------------------------------------------
// GOOGLE DRIVE API HELPERS (via Backend /api/workspace/drive/*)
// ---------------------------------------------------------------------------
export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  parents?: string[];
  trashed?: boolean;
  shared?: boolean;
}

export type DriveFilterMode = 'all' | 'playlists' | 'media' | 'appdata';

export async function listDriveFiles(options: {
  query?: string;
  filterMode?: DriveFilterMode;
  pageSize?: number;
} = {}): Promise<DriveFileItem[]> {
  const { query = '', filterMode = 'all', pageSize = 40 } = options;
  const params = new URLSearchParams({
    query,
    filterMode,
    pageSize: String(pageSize),
  });
  const data = await workspaceBackendFetch(`/drive/files?${params.toString()}`);
  return Array.isArray(data?.files) ? data.files : [];
}

export async function downloadDriveFileText(fileId: string): Promise<string> {
  const data = await workspaceBackendFetch(`/drive/files/${encodeURIComponent(fileId)}/content`);
  return String(data?.content ?? '');
}

export async function uploadDriveFile(options: {
  name: string;
  content: string;
  mimeType?: string;
  space?: 'drive' | 'appDataFolder';
  existingFileId?: string;
}): Promise<DriveFileItem> {
  const data = await workspaceBackendFetch('/drive/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return data.file;
}

export async function renameDriveFile(
  fileId: string,
  newName: string
): Promise<DriveFileItem> {
  const data = await workspaceBackendFetch(`/drive/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  return data.file;
}

export async function trashDriveFile(fileId: string): Promise<DriveFileItem> {
  const data = await workspaceBackendFetch(`/drive/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  return data.file;
}

export async function deleteDriveFilePermanently(fileId: string): Promise<void> {
  await workspaceBackendFetch(`/drive/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
  });
}

export async function importDriveM3uToBackend(options: {
  fileId: string;
  customName?: string;
}): Promise<{ ok: boolean; prefix: string; label: string; channelCount: number }> {
  return await workspaceBackendFetch('/drive/import-m3u', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
}

// ---------------------------------------------------------------------------
// GMAIL API HELPERS (via Backend /api/workspace/gmail/*)
// ---------------------------------------------------------------------------
export interface GmailLabelItem {
  id: string;
  name: string;
  type?: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  internalDate?: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  isUnread: boolean;
  isStarred: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
  bodyText: string;
  detectedM3uUrls: string[];
  hasRawExtM3u: boolean;
}

export async function listGmailLabels(): Promise<GmailLabelItem[]> {
  const data = await workspaceBackendFetch('/gmail/labels');
  return Array.isArray(data?.labels) ? data.labels : [];
}

export async function listGmailMessages(options: {
  query?: string;
  labelId?: string;
  maxResults?: number;
} = {}): Promise<GmailMessageSummary[]> {
  const { query = '', labelId = 'INBOX', maxResults = 15 } = options;
  const params = new URLSearchParams({
    query,
    labelId,
    maxResults: String(maxResults),
  });
  const data = await workspaceBackendFetch(`/gmail/messages?${params.toString()}`);
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function getGmailMessageDetail(
  messageId: string
): Promise<GmailMessageDetail> {
  const data = await workspaceBackendFetch(`/gmail/messages/${encodeURIComponent(messageId)}`);
  return data.message;
}

export async function sendGmailMessage(options: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<{ id: string; threadId?: string }> {
  const res = await workspaceBackendFetch('/gmail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return res.data;
}

export async function createGmailDraft(options: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const res = await workspaceBackendFetch('/gmail/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return res.data;
}

export async function modifyGmailMessageLabels(options: {
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}): Promise<void> {
  await workspaceBackendFetch(
    `/gmail/messages/${encodeURIComponent(options.messageId)}/modify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addLabelIds: options.addLabelIds || [],
        removeLabelIds: options.removeLabelIds || [],
      }),
    }
  );
}

export async function trashGmailMessage(messageId: string): Promise<void> {
  await workspaceBackendFetch(`/gmail/messages/${encodeURIComponent(messageId)}/trash`, {
    method: 'POST',
  });
}

export async function deleteGmailMessagePermanently(
  messageId: string
): Promise<void> {
  await workspaceBackendFetch(`/gmail/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// ADMIN BACKEND GOOGLE WORKSPACE AUTOMATIONS (Admin Bearer + Google Token)
// ---------------------------------------------------------------------------
async function adminWorkspaceFetch(path: string, adminBearer: string, body?: Record<string, unknown>) {
  const googleToken = await getWorkspaceAccessToken();
  if (!googleToken) {
    const err = new Error('Please connect Google Workspace (Drive & Gmail) first.');
    (err as any).code = 'NEEDS_AUTH';
    throw err;
  }
  const res = await fetch(`/api/workspace${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminBearer}`,
      'x-google-access-token': googleToken,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && data?.error?.code === 'NEEDS_AUTH') {
    cachedAccessToken = null;
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `Backend Workspace request failed (${res.status})`);
  }
  return data.data;
}

export async function backupDatabaseToDriveBackend(adminBearer: string) {
  return await adminWorkspaceFetch('/drive/backup', adminBearer);
}

export async function syncPaymentsFromGmailBackend(adminBearer: string) {
  return await adminWorkspaceFetch('/gmail/sync-payments', adminBearer);
}

export async function flushOutboxViaGmailBackend(
  adminBearer: string,
  options: { includeFailed?: boolean; limit?: number } = {}
) {
  return await adminWorkspaceFetch('/gmail/flush-outbox', adminBearer, options);
}
