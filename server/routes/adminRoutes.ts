import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, DEFAULT_SETTINGS, getAllSettings, getSetting } from '../db.ts';
import { BoothRequest, requireAdminRole } from '../middleware/auth.ts';
import { purgeExpiredFiles } from '../services/cleanupService.ts';
import { sendTransactionalEmail } from '../services/emailService.ts';
import { deletePrivateFile } from '../services/imageProcessor.ts';

export const adminRouter = Router();

function recordAudit(req: BoothRequest, action: string, target: string, details: string) {
  db.prepare(`
    INSERT INTO audit_logs (id, admin_user_id, admin_email, action, target, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    req.user!.id,
    req.user!.email,
    action,
    target,
    details,
    new Date().toISOString()
  );
}

adminRouter.use(requireAdminRole(['super_admin', 'support']));

adminRouter.get('/overview', (_req, res) => {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const revToday =
    (
      db
        .prepare("SELECT COALESCE(SUM(amount_usd_cents), 0) as total FROM orders WHERE status = 'paid' AND created_at >= ?")
        .get(dayAgo) as { total: number }
    ).total / 100;

  const rev7d =
    (
      db
        .prepare("SELECT COALESCE(SUM(amount_usd_cents), 0) as total FROM orders WHERE status = 'paid' AND created_at >= ?")
        .get(weekAgo) as { total: number }
    ).total / 100;

  const rev30d =
    (
      db
        .prepare("SELECT COALESCE(SUM(amount_usd_cents), 0) as total FROM orders WHERE status = 'paid' AND created_at >= ?")
        .get(monthAgo) as { total: number }
    ).total / 100;

  const ordersCount = (db.prepare('SELECT COUNT(*) as c FROM orders').get() as { c: number }).c;
  const activePacks = (
    db
      .prepare('SELECT COUNT(*) as c FROM users WHERE credits > 0 AND (pack_expires_at IS NULL OR pack_expires_at > ?)')
      .get(new Date().toISOString()) as { c: number }
  ).c;

  const visits = (db.prepare('SELECT COALESCE(SUM(visits), 0) as c FROM anon_usage').get() as { c: number }).c;
  const previews = (db.prepare('SELECT COUNT(*) as c FROM generations').get() as { c: number }).c;
  const signups = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get() as { c: number }).c;
  const paidOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'paid'").get() as { c: number }).c;

  const costEstimate =
    (db.prepare('SELECT COALESCE(SUM(cost_estimate_usd), 0) as c FROM generations').get() as { c: number }).c;

  // Build 14-day series
  const dailySeries: Array<{ date: string; generations: number; revenueUsd: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dayPrefix = d.toISOString().slice(0, 10);
    const genCount = (
      db.prepare('SELECT COUNT(*) as c FROM generations WHERE created_at LIKE ?').get(`${dayPrefix}%`) as { c: number }
    ).c;
    const revCents = (
      db
        .prepare("SELECT COALESCE(SUM(amount_usd_cents), 0) as s FROM orders WHERE status = 'paid' AND created_at LIKE ?")
        .get(`${dayPrefix}%`) as { s: number }
    ).s;
    dailySeries.push({ date: dayPrefix.slice(5), generations: genCount, revenueUsd: revCents / 100 });
  }

  res.json({
    revenue: { today: revToday, sevenDays: rev7d, thirtyDays: rev30d },
    ordersCount,
    activePacks,
    generationsCount: previews,
    costEstimateUsd: Number(costEstimate.toFixed(2)),
    funnel: { visits, previews, signups, purchases: paidOrders },
    dailySeries,
  });
});

// Looks Management
adminRouter.get('/looks', (_req, res) => {
  const looks = db.prepare('SELECT * FROM looks ORDER BY sort_order ASC, created_at DESC').all();
  res.json({ looks });
});

adminRouter.post('/looks', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const { name, category, description, prompt, thumbnail_url, is_active, is_featured, sort_order } = req.body || {};
  if (!name || !category || !prompt) {
    res.status(400).json({ error: 'Name, category, and prompt are required.' });
    return;
  }
  const id = crypto.randomUUID();
  const slug =
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    id.slice(0, 4);

  db.prepare(`
    INSERT INTO looks (id, slug, name, category, description, prompt, thumbnail_url, is_active, is_featured, sort_order, usage_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    slug,
    name,
    category,
    description || '',
    prompt,
    thumbnail_url || '/src/assets/images/look_exec_studio_1794987768967.jpg',
    is_active === false ? 0 : 1,
    is_featured ? 1 : 0,
    Number(sort_order) || 99,
    new Date().toISOString()
  );

  recordAudit(req, 'CREATE_LOOK', id, `Created look "${name}" in ${category}`);
  res.status(201).json({ id });
});

adminRouter.patch('/looks/:id', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const existing = db.prepare('SELECT * FROM looks WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Look not found.' });
    return;
  }
  const b = req.body || {};
  db.prepare(`
    UPDATE looks
    SET name = ?, category = ?, description = ?, prompt = ?, thumbnail_url = ?, is_active = ?, is_featured = ?, sort_order = ?
    WHERE id = ?
  `).run(
    b.name ?? existing.name,
    b.category ?? existing.category,
    b.description ?? existing.description,
    b.prompt ?? existing.prompt,
    b.thumbnail_url ?? existing.thumbnail_url,
    b.is_active === undefined ? existing.is_active : b.is_active ? 1 : 0,
    b.is_featured === undefined ? existing.is_featured : b.is_featured ? 1 : 0,
    b.sort_order ?? existing.sort_order,
    existing.id
  );
  recordAudit(req, 'UPDATE_LOOK', existing.id, `Updated look "${b.name ?? existing.name}"`);
  res.json({ ok: true });
});

adminRouter.delete('/looks/:id', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  db.prepare('DELETE FROM looks WHERE id = ?').run(req.params.id);
  recordAudit(req, 'DELETE_LOOK', req.params.id, 'Deleted look');
  res.json({ ok: true });
});

// Users Management
adminRouter.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const users = q
    ? db
        .prepare(
          `SELECT id, email, name, role, email_verified, suspended, credits, pack_expires_at, created_at
           FROM users WHERE LOWER(email) LIKE ? OR LOWER(name) LIKE ? ORDER BY created_at DESC LIMIT 100`
        )
        .all(`%${q}%`, `%${q}%`)
    : db
        .prepare(
          `SELECT id, email, name, role, email_verified, suspended, credits, pack_expires_at, created_at
           FROM users ORDER BY created_at DESC LIMIT 100`
        )
        .all();

  res.json({ users });
});

adminRouter.patch('/users/:id', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const { creditsDelta, extendDays, suspended } = req.body || {};
  let nextCredits = user.credits;
  if (typeof creditsDelta === 'number') {
    nextCredits = Math.max(0, user.credits + creditsDelta);
  }

  let nextExpiry = user.pack_expires_at;
  if (typeof extendDays === 'number' && extendDays > 0) {
    const baseMs = nextExpiry && new Date(nextExpiry).getTime() > Date.now() ? new Date(nextExpiry).getTime() : Date.now();
    nextExpiry = new Date(baseMs + extendDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const nextSuspended = typeof suspended === 'boolean' ? (suspended ? 1 : 0) : user.suspended;

  db.prepare('UPDATE users SET credits = ?, pack_expires_at = ?, suspended = ? WHERE id = ?').run(
    nextCredits,
    nextExpiry,
    nextSuspended,
    user.id
  );

  recordAudit(
    req,
    'UPDATE_USER',
    user.email,
    `credits=${nextCredits}, suspended=${nextSuspended}, extendDays=${extendDays || 0}`
  );
  res.json({ ok: true });
});

adminRouter.delete('/users/:id', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (user.id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete your own active admin account.' });
    return;
  }

  const selfies = db.prepare('SELECT file_path FROM selfies WHERE user_id = ?').all(user.id) as Array<{
    file_path: string;
  }>;
  const gens = db.prepare('SELECT preview_path, hd_path FROM generations WHERE user_id = ?').all(user.id) as Array<{
    preview_path: string | null;
    hd_path: string | null;
  }>;
  for (const s of selfies) deletePrivateFile(s.file_path);
  for (const g of gens) {
    deletePrivateFile(g.preview_path);
    deletePrivateFile(g.hd_path);
  }

  db.prepare('DELETE FROM selfies WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM generations WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  recordAudit(req, 'DELETE_USER', user.email, 'Deleted user and purged associated image files');
  res.json({ ok: true });
});

// Orders & Refunds (support + super_admin)
adminRouter.get('/orders', (_req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.email as user_email, u.name as user_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ orders });
});

adminRouter.post('/orders/:id/refund', async (req: BoothRequest, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) as any;
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (order.status !== 'paid') {
    res.status(400).json({ error: 'Only paid orders can be refunded.' });
    return;
  }

  const keyId = getSetting('razorpay_key_id', '') || process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keyId && keySecret && order.razorpay_payment_id && !order.razorpay_payment_id.startsWith('pay_test_')) {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpay_payment_id}/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: order.amount_usd_cents }),
    });
    if (!rzpRes.ok) {
      res.status(502).json({ error: `Razorpay refund error: ${await rzpRes.text()}` });
      return;
    }
  }

  db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(order.id);
  db.prepare('UPDATE users SET credits = MAX(0, credits - ?) WHERE id = ?').run(order.credits_granted, order.user_id);

  recordAudit(req, 'REFUND_ORDER', order.razorpay_order_id, `Refunded $${(order.amount_usd_cents / 100).toFixed(2)} USD`);
  res.json({ ok: true });
});

adminRouter.post('/orders/:id/resend-receipt', async (req: BoothRequest, res) => {
  const order = db
    .prepare(
      `SELECT o.*, u.email, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?`
    )
    .get(req.params.id) as any;

  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  const amountFmt = `$${(order.amount_usd_cents / 100).toFixed(2)} USD`;
  await sendTransactionalEmail({
    to: order.email,
    subject: `Copy of your Reclik receipt — ${amountFmt}`,
    html: `<p>Hi ${order.name}, here is your receipt copy for payment ${order.razorpay_payment_id || order.razorpay_order_id} (${amountFmt}).</p>`,
    textPreview: `Receipt resend for ${amountFmt}`,
  });

  recordAudit(req, 'RESEND_RECEIPT', order.email, `Order ${order.razorpay_order_id}`);
  res.json({ ok: true });
});

adminRouter.get('/orders/export.csv', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT o.id, o.created_at, u.email, o.plan_type, o.amount_usd_cents, o.currency, o.status, o.razorpay_order_id, o.razorpay_payment_id
       FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC`
    )
    .all() as any[];

  const header = 'order_id,created_at,email,plan,amount_usd,currency,status,razorpay_order_id,razorpay_payment_id';
  const lines = rows.map((r) =>
    [
      r.id,
      r.created_at,
      `"${r.email || ''}"`,
      r.plan_type,
      (r.amount_usd_cents / 100).toFixed(2),
      r.currency,
      r.status,
      r.razorpay_order_id,
      r.razorpay_payment_id || '',
    ].join(',')
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="reclik-orders.csv"');
  res.send([header, ...lines].join('\n'));
});

// Pricing & System Settings
adminRouter.get('/settings', (_req, res) => {
  const teamAccounts = db
    .prepare("SELECT id, email, name, role FROM users WHERE role IN ('super_admin', 'support') ORDER BY role ASC")
    .all();
  res.json({ settings: getAllSettings(), teamAccounts });
});

adminRouter.patch('/settings', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const updates = req.body || {};
  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      stmt.run(key, String(updates[key]));
    }
  }
  recordAudit(req, 'UPDATE_SETTINGS', 'system_settings', JSON.stringify(updates));
  res.json({ ok: true, settings: getAllSettings() });
});

adminRouter.patch('/team-credentials', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const { id, role, email, password } = req.body || {};
  if (role !== 'super_admin' && role !== 'support') {
    res.status(400).json({ error: 'Role must be super_admin or support.' });
    return;
  }

  const target = (
    id
      ? db.prepare('SELECT id, email, role FROM users WHERE id = ? AND role = ?').get(id, role)
      : role === 'super_admin'
      ? db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(req.user!.id)
      : db.prepare('SELECT id, email, role FROM users WHERE role = ? LIMIT 1').get(role)
  ) as { id: string; email: string; role: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'Account for this role not found.' });
    return;
  }

  const cleanEmail = email ? String(email).trim().toLowerCase() : target.email;
  if (!cleanEmail.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (cleanEmail !== target.email) {
    const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, target.id);
    if (conflict) {
      res.status(409).json({ error: 'That email address is already in use by another account.' });
      return;
    }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(cleanEmail, target.id);
  }

  if (password && String(password).length > 0) {
    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(password), 10), target.id);
  }

  const teamAccounts = db
    .prepare("SELECT id, email, name, role FROM users WHERE role IN ('super_admin', 'support') ORDER BY role ASC")
    .all();

  recordAudit(req, 'UPDATE_TEAM_CREDENTIALS', role, `Updated credentials for ${cleanEmail}`);
  res.json({ ok: true, teamAccounts });
});

adminRouter.post('/settings/reset', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    stmt.run(k, v);
  }
  recordAudit(req, 'RESET_SETTINGS', 'system_settings', 'Restored default configuration values');
  res.json({ ok: true, settings: getAllSettings() });
});

// Moderation & Blocklist
adminRouter.get('/moderation', (_req, res) => {
  const logs = db.prepare('SELECT * FROM moderation_logs ORDER BY created_at DESC LIMIT 100').all();
  const blocklist = db.prepare('SELECT * FROM blocklist ORDER BY created_at DESC').all();
  res.json({ logs, blocklist });
});

adminRouter.post('/blocklist', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const { type, value, reason } = req.body || {};
  if (!value || (type !== 'ip' && type !== 'fingerprint')) {
    res.status(400).json({ error: 'Valid type (ip or fingerprint) and value required.' });
    return;
  }
  db.prepare(`
    INSERT OR IGNORE INTO blocklist (id, type, value, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), type, String(value).trim(), reason || 'Manual admin block', new Date().toISOString());

  recordAudit(req, 'ADD_BLOCKLIST', `${type}:${value}`, reason || 'Manual block');
  res.status(201).json({ ok: true });
});

adminRouter.delete('/blocklist/:id', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  db.prepare('DELETE FROM blocklist WHERE id = ?').run(req.params.id);
  recordAudit(req, 'REMOVE_BLOCKLIST', req.params.id, 'Removed blocklist entry');
  res.json({ ok: true });
});

// Privacy Ops & Audit Log
adminRouter.get('/privacy', (_req, res) => {
  const cleanupRuns = db.prepare('SELECT * FROM cleanup_runs ORDER BY ran_at DESC LIMIT 30').all();
  const auditLogs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80').all();
  const activeSelfies = (
    db.prepare('SELECT COUNT(*) as c FROM selfies WHERE deleted_at IS NULL').get() as { c: number }
  ).c;
  const totalPurged = (
    db.prepare('SELECT COALESCE(SUM(files_purged), 0) as c FROM cleanup_runs').get() as { c: number }
  ).c;

  res.json({ cleanupRuns, auditLogs, activeSelfies, totalPurged });
});

adminRouter.post('/privacy/purge', requireAdminRole(['super_admin']), (req: BoothRequest, res) => {
  const result = purgeExpiredFiles('manual');
  recordAudit(req, 'MANUAL_PURGE', 'storage', `Purged ${result.filesPurged} files`);
  res.json(result);
});
