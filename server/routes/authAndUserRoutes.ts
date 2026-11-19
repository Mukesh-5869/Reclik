import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../db.ts';
import { BoothRequest, createAuthToken, getCookieOptions, requireAuth } from '../middleware/auth.ts';
import { sendTransactionalEmail } from '../services/emailService.ts';
import { deletePrivateFile } from '../services/imageProcessor.ts';

export const authAndUserRouter = Router();

function setAuthCookie(req: BoothRequest, res: any, token: string) {
  res.cookie('boothie_auth', token, getCookieOptions(req, 14 * 24 * 60 * 60 * 1000));
}

authAndUserRouter.post('/auth/signup', async (req: BoothRequest, res) => {
  const { email, password, name, selfieId, generationId } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim() || cleanEmail.split('@')[0] || 'Reclik Guest';

  if (!cleanEmail || !cleanEmail.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password || String(password).length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
    return;
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, email_verified, verification_token, credits, created_at)
    VALUES (?, ?, ?, ?, 'user', 1, NULL, 0, ?)
  `).run(userId, cleanEmail, bcrypt.hashSync(String(password), 10), cleanName, now);

  // Preserve any in-progress selfie or generation across sign-up
  if (selfieId && req.visitorHash) {
    db.prepare('UPDATE selfies SET user_id = ? WHERE id = ? AND visitor_hash = ?').run(userId, selfieId, req.visitorHash);
  }
  if (generationId && req.visitorHash) {
    db.prepare('UPDATE generations SET user_id = ? WHERE id = ? AND visitor_hash = ?').run(
      userId,
      generationId,
      req.visitorHash
    );
  }

  const token = createAuthToken(userId);
  setAuthCookie(req, res, token);

  const user = db
    .prepare(
      'SELECT id, email, name, role, credits, pack_expires_at, email_verified, suspended, save_to_gallery_default FROM users WHERE id = ?'
    )
    .get(userId);

  res.status(201).json({
    user,
    token,
    message: 'Account created. Signed in with your email and password.',
  });
});

authAndUserRouter.post('/auth/login', (req: BoothRequest, res) => {
  const { email, password, selfieId, generationId } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as any;
  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (row.suspended) {
    res.status(403).json({ error: 'This account has been suspended. Contact support@boothie.app.' });
    return;
  }

  // Preserve in-progress selfie & generation across login
  if (selfieId && req.visitorHash) {
    db.prepare('UPDATE selfies SET user_id = ? WHERE id = ? AND visitor_hash = ?').run(row.id, selfieId, req.visitorHash);
  }
  if (generationId && req.visitorHash) {
    db.prepare('UPDATE generations SET user_id = ? WHERE id = ? AND visitor_hash = ?').run(
      row.id,
      generationId,
      req.visitorHash
    );
  }

  const token = createAuthToken(row.id);
  setAuthCookie(req, res, token);

  res.json({
    token,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      credits: row.credits,
      pack_expires_at: row.pack_expires_at,
      email_verified: row.email_verified,
      save_to_gallery_default: row.save_to_gallery_default,
    },
  });
});

authAndUserRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie('boothie_auth');
  res.json({ ok: true });
});

authAndUserRouter.get('/auth/me', (req: BoothRequest, res) => {
  res.json({ user: req.user || null });
});

authAndUserRouter.post('/auth/change-password', (req: BoothRequest, res) => {
  const { email, currentPassword, newPassword } = req.body || {};
  const cleanEmail = String(email || req.user?.email || '').trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const row = db.prepare('SELECT id, password_hash, suspended FROM users WHERE email = ?').get(cleanEmail) as any;
  if (!row || !bcrypt.compareSync(String(currentPassword || ''), row.password_hash)) {
    res.status(401).json({ error: 'Email or current password is incorrect.' });
    return;
  }
  if (row.suspended) {
    res.status(403).json({ error: 'This account has been suspended. Contact support.' });
    return;
  }

  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL WHERE id = ?').run(
    bcrypt.hashSync(String(newPassword), 10),
    row.id
  );
  res.json({ ok: true, message: 'Password updated. You can now sign in with your new password.' });
});

authAndUserRouter.get('/user/dashboard', requireAuth, (req: BoothRequest, res) => {
  const userId = req.user!.id;
  const orders = db
    .prepare(
      `SELECT id, plan_type, amount_usd_cents, currency, razorpay_order_id, razorpay_payment_id, status, credits_granted, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    )
    .all(userId);

  const downloads = db
    .prepare(
      `SELECT id, generation_id, look_name, used_at, selfie_deleted, created_at
       FROM downloads WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    )
    .all(userId);

  const savedGenerations = db
    .prepare(
      `SELECT g.id, l.name as look_name, l.category, g.created_at
       FROM generations g
       JOIN looks l ON l.id = g.look_id
       WHERE g.user_id = ? AND g.saved_to_gallery = 1 AND g.deleted_at IS NULL
       ORDER BY g.created_at DESC`
    )
    .all(userId);

  res.json({
    user: req.user,
    orders,
    downloads,
    savedGenerations,
  });
});

authAndUserRouter.patch('/user/preferences', requireAuth, (req: BoothRequest, res) => {
  const saveDefault = req.body?.saveToGalleryDefault ? 1 : 0;
  db.prepare('UPDATE users SET save_to_gallery_default = ? WHERE id = ?').run(saveDefault, req.user!.id);
  res.json({ ok: true, saveToGalleryDefault: Boolean(saveDefault) });
});

authAndUserRouter.delete('/user/data', requireAuth, (req: BoothRequest, res) => {
  const userId = req.user!.id;
  const selfies = db.prepare('SELECT file_path FROM selfies WHERE user_id = ?').all(userId) as Array<{
    file_path: string;
  }>;
  const gens = db.prepare('SELECT preview_path, hd_path FROM generations WHERE user_id = ?').all(userId) as Array<{
    preview_path: string | null;
    hd_path: string | null;
  }>;

  for (const s of selfies) deletePrivateFile(s.file_path);
  for (const g of gens) {
    deletePrivateFile(g.preview_path);
    deletePrivateFile(g.hd_path);
  }

  db.prepare('DELETE FROM selfies WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM generations WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM downloads WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.clearCookie('boothie_auth');
  res.json({ ok: true, message: 'All your account records, selfies, and generated images have been permanently deleted.' });
});

authAndUserRouter.post('/contact', (req: BoothRequest, res) => {
  const { name, email, topic, message } = req.body || {};
  if (!name || !email || !message) {
    res.status(400).json({ error: 'Name, email, and message are required.' });
    return;
  }
  db.prepare(`
    INSERT INTO contact_messages (id, name, email, topic, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    String(name).slice(0, 120),
    String(email).slice(0, 160),
    String(topic || 'General').slice(0, 80),
    String(message).slice(0, 2000),
    new Date().toISOString()
  );
  res.json({ ok: true, message: 'Thanks for reaching out. Our US support team responds within 1 business day.' });
});
