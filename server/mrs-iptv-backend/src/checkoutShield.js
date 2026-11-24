import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const usedChallengeIds = new Map();

function pruneUsedChallenges(now = Date.now()) {
  if (usedChallengeIds.size < 50) return;
  for (const [jti, exp] of usedChallengeIds.entries()) {
    if (exp <= now) usedChallengeIds.delete(jti);
  }
}

function signPayload(b64Payload) {
  return createHmac('sha256', config.securitySecret).update(b64Payload).digest('base64url');
}

function safeEqualStr(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

function hasLeadingZeroBits(buf, bits) {
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (buf[i] !== 0) return false;
  }
  if (remBits > 0) {
    const mask = 0xff << (8 - remBits);
    if ((buf[fullBytes] & mask) !== 0) return false;
  }
  return true;
}

export function issueCheckoutChallenge() {
  const now = Date.now();
  const exp = now + CHALLENGE_TTL_MS;
  const payload = {
    jti: randomBytes(12).toString('hex'),
    nonce: randomBytes(16).toString('hex'),
    difficulty: config.checkoutShield.difficulty,
    iat: now,
    exp,
  };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(b64);

  const turnstileSiteKey = config.checkoutShield.turnstileSecretKey
    ? config.checkoutShield.turnstileSiteKey || null
    : null;
  const hcaptchaSiteKey = config.checkoutShield.hcaptchaSecretKey
    ? config.checkoutShield.hcaptchaSiteKey || null
    : null;

  return {
    ok: true,
    challengeToken: `${b64}.${sig}`,
    nonce: payload.nonce,
    difficulty: payload.difficulty,
    expiresAt: new Date(exp).toISOString(),
    turnstileSiteKey,
    hcaptchaSiteKey,
    captchaProvider: turnstileSiteKey ? 'turnstile' : hcaptchaSiteKey ? 'hcaptcha' : 'pow',
  };
}

async function verifyExternalCaptcha(provider, token, remoteip) {
  const url =
    provider === 'turnstile'
      ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      : 'https://api.hcaptcha.com/siteverify';
  const secret =
    provider === 'turnstile'
      ? config.checkoutShield.turnstileSecretKey
      : config.checkoutShield.hcaptchaSecretKey;

  const form = new URLSearchParams({ secret, response: String(token || '') });
  if (remoteip) form.set('remoteip', String(remoteip));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.success);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyCheckoutSubmission(body = {}, ip = '') {
  // 1. Always enforce honeypot trap
  const trap = body.website_url ?? body.company_website ?? body.honeypot;
  if (typeof trap === 'string' && trap.trim().length > 0) {
    return {
      ok: false,
      status: 400,
      code: 'spam_detected',
      message: 'Submission blocked by anti-spam protection.',
    };
  }

  // 2. If Turnstile or hCaptcha secret is configured, verify external token
  if (config.checkoutShield.turnstileSecretKey) {
    const tok = body.captchaToken || body['cf-turnstile-response'];
    if (!tok) {
      return {
        ok: false,
        status: 400,
        code: 'captcha_required',
        message: 'Please complete the security verification check before submitting.',
      };
    }
    const valid = await verifyExternalCaptcha('turnstile', tok, ip);
    if (!valid) {
      return {
        ok: false,
        status: 400,
        code: 'captcha_failed',
        message: 'Security verification check failed. Please retry.',
      };
    }
  } else if (config.checkoutShield.hcaptchaSecretKey) {
    const tok = body.captchaToken || body['h-captcha-response'];
    if (!tok) {
      return {
        ok: false,
        status: 400,
        code: 'captcha_required',
        message: 'Please complete the captcha verification before submitting.',
      };
    }
    const valid = await verifyExternalCaptcha('hcaptcha', tok, ip);
    if (!valid) {
      return {
        ok: false,
        status: 400,
        code: 'captcha_failed',
        message: 'Captcha verification failed. Please retry.',
      };
    }
  }

  // 3. Built-in HMAC-signed Proof-of-Work challenge (single-use)
  const challengeToken = String(body.challengeToken || '').trim();
  const challengeSolution = String(body.challengeSolution || '').trim();
  const mustCheckChallenge = config.checkoutShield.requireChallenge || Boolean(challengeToken || challengeSolution);

  if (mustCheckChallenge) {
    if (!challengeToken || !challengeSolution) {
      return {
        ok: false,
        status: 400,
        code: 'challenge_required',
        message: 'Security challenge missing. Please refresh and submit again.',
      };
    }
    const parts = challengeToken.split('.');
    if (parts.length !== 2) {
      return { ok: false, status: 400, code: 'challenge_failed', message: 'Invalid security challenge token.' };
    }
    const [b64, sig] = parts;
    const expectedSig = signPayload(b64);
    if (!safeEqualStr(sig, expectedSig)) {
      return { ok: false, status: 400, code: 'challenge_failed', message: 'Security challenge signature mismatch.' };
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    } catch {
      return { ok: false, status: 400, code: 'challenge_failed', message: 'Malformed security challenge payload.' };
    }

    const now = Date.now();
    if (!payload?.jti || !payload?.nonce || !payload?.exp || now > Number(payload.exp)) {
      return { ok: false, status: 400, code: 'challenge_expired', message: 'Security challenge expired. Please try submitting again.' };
    }

    pruneUsedChallenges(now);
    if (usedChallengeIds.has(payload.jti)) {
      return { ok: false, status: 400, code: 'challenge_reused', message: 'Security challenge already used. Please submit again.' };
    }

    const digest = createHash('sha256').update(`${payload.nonce}:${challengeSolution}`).digest();
    const diff = Number(payload.difficulty) || config.checkoutShield.difficulty;
    if (!hasLeadingZeroBits(digest, diff)) {
      return { ok: false, status: 400, code: 'challenge_failed', message: 'Security challenge verification failed.' };
    }

    usedChallengeIds.set(payload.jti, Number(payload.exp));
  }

  return { ok: true };
}
