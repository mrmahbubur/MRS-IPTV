import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.js'; // Note .js extension for ESM
import { DecodedIdToken } from 'firebase-admin/auth';
import { timingSafeEqual } from 'node:crypto';
import { config as backendConfig } from '../../server/mrs-iptv-backend/src/config.js';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const timingSafeMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function extractAdminToken(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  return String(req.headers['x-admin-token'] || '').trim();
}

export async function verifyAdminCredentials(
  req: Request
): Promise<{ ok: true; user: DecodedIdToken } | { ok: false; status: 401 | 403; error: string }> {
  const headerToken = extractAdminToken(req);
  if (!headerToken) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing or invalid Authorization header' };
  }

  // 1. Check timing-safe shared admin secret or optional configured Camellia token
  const adminSecret = process.env.ADMIN_TOKEN || backendConfig.adminToken;
  const camelliaSecret = process.env.CAMELLIA_TOKEN || '';

  if (
    timingSafeMatch(headerToken, adminSecret) ||
    (camelliaSecret && timingSafeMatch(headerToken, camelliaSecret))
  ) {
    return {
      ok: true,
      user: {
        uid: 'camellia-site-manager',
        email: process.env.ADMIN_EMAIL || 'mr216873@gmail.com',
        admin: true,
      } as any,
    };
  }

  // 2. Firebase Admin ID Token verification (only real signed tokens matching ADMIN_EMAIL or admin claim)
  try {
    const decodedToken = await adminAuth.verifyIdToken(headerToken);
    const configuredAdminEmail = process.env.ADMIN_EMAIL || 'mr216873@gmail.com';
    const isAdmin =
      Boolean(decodedToken.admin) ||
      (Boolean(decodedToken.email) && decodedToken.email!.toLowerCase() === configuredAdminEmail.toLowerCase());

    if (!isAdmin) {
      return { ok: false, status: 403, error: 'Forbidden: Admin privilege required' };
    }

    return { ok: true, user: decodedToken };
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid admin credentials' };
  }
}

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<any> => {
  const result = await verifyAdminCredentials(req);
  if (result.ok === false) {
    return res.status(result.status).json({ error: result.error });
  }
  req.user = result.user;
  return next();
};

