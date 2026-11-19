import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db, getSetting } from '../db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'boothie-dev-jwt-secret-change-in-prod';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'boothie-dev-cookie-secret-change-in-prod';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'super_admin' | 'support';
  credits: number;
  pack_expires_at: string | null;
  email_verified: number;
  suspended: number;
  save_to_gallery_default: number;
}

export interface BoothRequest extends Request {
  user?: AuthUser;
  visitorHash?: string;
  visitorToken?: string;
  clientIp?: string;
  fingerprint?: string;
}

export function getCookieOptions(req: Request, maxAge: number) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    maxAge,
  };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function signVisitorId(rawId: string): string {
  const sig = crypto.createHmac('sha256', COOKIE_SECRET).update(rawId).digest('hex').slice(0, 16);
  return `${rawId}.${sig}`;
}

export function verifyVisitorId(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [rawId, sig] = token.split('.');
  if (!rawId || !sig) return null;
  const expected = crypto.createHmac('sha256', COOKIE_SECRET).update(rawId).digest('hex').slice(0, 16);
  if (sig !== expected) return null;
  return rawId;
}

export function attachVisitorIdentity(req: BoothRequest, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const fpHeader = String(req.headers['x-boothie-fp'] || req.query?.fp || 'browser-default').slice(0, 128);
  req.clientIp = ip;
  req.fingerprint = fpHeader;

  const incomingToken =
    req.cookies?.boothie_vid ||
    (typeof req.headers['x-boothie-vid'] === 'string' ? req.headers['x-boothie-vid'] : undefined) ||
    (typeof req.query?.vt === 'string' ? req.query.vt : undefined);

  let rawVisitor = verifyVisitorId(incomingToken);
  if (!rawVisitor) {
    rawVisitor = crypto.randomUUID();
  }
  const signedToken = signVisitorId(rawVisitor);
  req.visitorToken = signedToken;

  if (!req.cookies?.boothie_vid) {
    res.cookie('boothie_vid', signedToken, getCookieOptions(req, 30 * 24 * 60 * 60 * 1000));
  }

  // Combine signed cookie/token + fingerprint into a stable server-side visitor hash
  const visitorHash = crypto
    .createHash('sha256')
    .update(`${rawVisitor}:${fpHeader}`)
    .digest('hex')
    .slice(0, 32);

  req.visitorHash = visitorHash;

  // Ensure row exists in anon_usage
  const existing = db.prepare('SELECT visitor_hash FROM anon_usage WHERE visitor_hash = ?').get(visitorHash);
  const now = new Date().toISOString();
  if (!existing) {
    db.prepare(`
      INSERT INTO anon_usage (visitor_hash, ip_address, fingerprint, visits, previews_used, hourly_count, hourly_window_start, updated_at)
      VALUES (?, ?, ?, 1, 0, 0, ?, ?)
    `).run(visitorHash, ip, fpHeader, now, now);
  } else {
    db.prepare('UPDATE anon_usage SET ip_address = ?, updated_at = ? WHERE visitor_hash = ?').run(ip, now, visitorHash);
  }

  next();
}

export function createAuthToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '14d' });
}

export function attachOptionalUser(req: BoothRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = req.cookies?.boothie_auth || bearer;

  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = db
      .prepare(
        'SELECT id, email, name, role, credits, pack_expires_at, email_verified, suspended, save_to_gallery_default FROM users WHERE id = ?'
      )
      .get(payload.sub) as AuthUser | undefined;

    if (user && !user.suspended) {
      // Automatically zero out expired credits
      if (user.credits > 0 && user.pack_expires_at && new Date(user.pack_expires_at).getTime() <= Date.now()) {
        db.prepare('UPDATE users SET credits = 0 WHERE id = ?').run(user.id);
        user.credits = 0;
      }
      req.user = user;
    }
  } catch {
    // Ignore invalid/expired token
  }
  next();
}

export function requireAuth(req: BoothRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return;
  }
  next();
}

export function requireAdminRole(roles: Array<'super_admin' | 'support'>) {
  return (req: BoothRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as 'super_admin' | 'support')) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    next();
  };
}

export function checkBlocklistAndRateLimit(req: BoothRequest, res: Response, next: NextFunction) {
  const ip = req.clientIp || '127.0.0.1';
  const fp = req.fingerprint || '';
  const visitorHash = req.visitorHash || '';

  const blocked = db
    .prepare('SELECT reason FROM blocklist WHERE (type = ? AND value = ?) OR (type = ? AND value = ?)')
    .get('ip', ip, 'fingerprint', fp) as { reason: string } | undefined;

  if (blocked) {
    res.status(403).json({ error: `Access restricted: ${blocked.reason}` });
    return;
  }

  const limitPerHour = parseInt(getSetting('rate_limit_per_hour', '30'), 10) || 30;
  const usage = db
    .prepare('SELECT hourly_count, hourly_window_start FROM anon_usage WHERE visitor_hash = ?')
    .get(visitorHash) as { hourly_count: number; hourly_window_start: string } | undefined;

  if (usage) {
    const windowAgeMs = Date.now() - new Date(usage.hourly_window_start).getTime();
    if (windowAgeMs > 60 * 60 * 1000) {
      db.prepare('UPDATE anon_usage SET hourly_count = 1, hourly_window_start = ? WHERE visitor_hash = ?').run(
        new Date().toISOString(),
        visitorHash
      );
    } else if (usage.hourly_count >= limitPerHour) {
      res.status(429).json({ error: 'Hourly request limit reached. Please wait a bit before generating more looks.' });
      return;
    } else {
      db.prepare('UPDATE anon_usage SET hourly_count = hourly_count + 1 WHERE visitor_hash = ?').run(visitorHash);
    }
  }

  next();
}
