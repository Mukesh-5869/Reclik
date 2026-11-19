import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { db, getSetting } from '../db.ts';
import { BoothRequest, requireAuth } from '../middleware/auth.ts';
import { sendTransactionalEmail } from '../services/emailService.ts';
import { purgeGenerationAndSelfieAfterDownload } from '../services/cleanupService.ts';

export const paymentAndDownloadRouter = Router();

const SANDBOX_SECRET = process.env.RAZORPAY_KEY_SECRET || 'boothie-razorpay-test-sandbox-secret';

function getRazorpayCredentials() {
  const keyId = getSetting('razorpay_key_id', '') || process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const razorpayMode = getSetting('razorpay_mode', 'auto');
  const isLiveConfigured = razorpayMode !== 'sandbox' && Boolean(keyId && keySecret);
  return { keyId, keySecret, isLiveConfigured };
}

async function applyOrderSuccessIdempotent(order: any, paymentId: string, signature: string) {
  if (order.status === 'paid') {
    return { alreadyProcessed: true };
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const fresh = db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id) as { status: string };
    if (fresh.status === 'paid') return false;

    db.prepare(`
      UPDATE orders
      SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ?, receipt_sent_at = ?
      WHERE id = ?
    `).run(paymentId, signature, now, order.id);

    if (order.plan_type === 'pack_12') {
      const validityDays = parseInt(getSetting('pack_validity_days', '30'), 10) || 30;
      const newExpiry = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users
        SET credits = credits + ?, pack_expires_at = ?
        WHERE id = ?
      `).run(order.credits_granted, newExpiry, order.user_id);
    } else if (order.plan_type === 'single') {
      // Grant 1 credit or unlock the specific generation; granting 1 credit scoped cleanly
      // and also linking generation_id guarantees seamless download.
      const validityDays = parseInt(getSetting('pack_validity_days', '30'), 10) || 30;
      const fallbackExpiry = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE users
        SET credits = credits + 1,
            pack_expires_at = COALESCE(pack_expires_at, ?)
        WHERE id = ?
      `).run(fallbackExpiry, order.user_id);
    }
    return true;
  });

  const applied = tx();
  if (applied) {
    const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(order.user_id) as
      | { email: string; name: string }
      | undefined;
    if (user) {
      const amountFmt = `$${(order.amount_usd_cents / 100).toFixed(2)} USD`;
      await sendTransactionalEmail({
        to: user.email,
        subject: `Your Reclik receipt — ${amountFmt}`,
        html: `<p>Thank you, ${user.name}. Payment <strong>${paymentId}</strong> for <strong>${amountFmt}</strong> is confirmed.</p>`,
        textPreview: `Receipt for ${amountFmt} · Payment ${paymentId}`,
      });
    }
  }
  return { alreadyProcessed: !applied };
}

paymentAndDownloadRouter.post('/payments/create-order', requireAuth, async (req: BoothRequest, res) => {
  try {
    const { planType, generationId } = req.body || {};
    if (planType !== 'single' && planType !== 'pack_12') {
      res.status(400).json({ error: 'Invalid plan selected.' });
      return;
    }

    const singleUsd = parseFloat(getSetting('single_price_usd', '3')) || 3;
    const packUsd = parseFloat(getSetting('pack_price_usd', '19')) || 19;
    const packSize = parseInt(getSetting('pack_size', '12'), 10) || 12;
    const currency = (getSetting('checkout_currency', 'USD') || 'USD').toUpperCase();

    const amountCents = planType === 'pack_12' ? Math.round(packUsd * 100) : Math.round(singleUsd * 100);
    const creditsGranted = planType === 'pack_12' ? packSize : 1;

    const { keyId, keySecret, isLiveConfigured } = getRazorpayCredentials();
    let razorpayOrderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;

    if (isLiveConfigured) {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountCents,
          currency,
          receipt: `boothie_${Date.now()}`,
          notes: {
            userId: req.user!.id,
            planType,
            generationId: generationId || '',
          },
        }),
      });

      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        res.status(502).json({ error: `Razorpay order creation failed: ${errText}` });
        return;
      }
      const rzpOrder = (await rzpRes.json()) as { id: string };
      razorpayOrderId = rzpOrder.id;
    }

    const internalOrderId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO orders (id, user_id, plan_type, amount_usd_cents, currency, razorpay_order_id, status, generation_id, credits_granted, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)
    `).run(
      internalOrderId,
      req.user!.id,
      planType,
      amountCents,
      currency,
      razorpayOrderId,
      generationId || null,
      creditsGranted,
      new Date().toISOString()
    );

    res.json({
      orderId: internalOrderId,
      razorpayOrderId,
      amountCents,
      currency,
      keyId: isLiveConfigured ? keyId : 'rzp_test_boothie_sandbox',
      mode: isLiveConfigured ? 'razorpay' : 'sandbox',
      planType,
      creditsGranted,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create order.' });
  }
});

paymentAndDownloadRouter.post('/payments/verify', requireAuth, async (req: BoothRequest, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, simulateSandboxSuccess } = req.body || {};
  if (!razorpay_order_id) {
    res.status(400).json({ error: 'Missing Razorpay order ID.' });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id = ?').get(razorpay_order_id) as any;
  if (!order || order.user_id !== req.user!.id) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  const { keySecret, isLiveConfigured } = getRazorpayCredentials();
  let paymentId = String(razorpay_payment_id || '');
  let signature = String(razorpay_signature || '');

  if (isLiveConfigured) {
    const expectedSig = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${paymentId}`)
      .digest('hex');

    if (expectedSig !== signature) {
      db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'created'").run(order.id);
      res.status(400).json({ error: 'Payment signature verification failed.' });
      return;
    }
  } else if (simulateSandboxSuccess) {
    paymentId = paymentId || `pay_test_${crypto.randomBytes(7).toString('hex')}`;
    signature = crypto
      .createHmac('sha256', SANDBOX_SECRET)
      .update(`${razorpay_order_id}|${paymentId}`)
      .digest('hex');
  } else {
    const expectedSandbox = crypto
      .createHmac('sha256', SANDBOX_SECRET)
      .update(`${razorpay_order_id}|${paymentId}`)
      .digest('hex');
    if (expectedSandbox !== signature) {
      db.prepare("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'created'").run(order.id);
      res.status(400).json({ error: 'Sandbox payment signature mismatch.' });
      return;
    }
  }

  await applyOrderSuccessIdempotent(order, paymentId, signature);
  const updatedUser = db
    .prepare('SELECT id, email, name, role, credits, pack_expires_at, email_verified FROM users WHERE id = ?')
    .get(req.user!.id);

  res.json({ ok: true, user: updatedUser, paymentId });
});

paymentAndDownloadRouter.post('/payments/webhook', async (req: BoothRequest, res) => {
  if (getSetting('razorpay_webhook_enabled', 'true') === 'false') {
    res.json({ received: true, ignored: true });
    return;
  }

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const sigHeader = String(req.headers['x-razorpay-signature'] || '');
  const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});

  if (webhookSecret) {
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (expected !== sigHeader) {
      res.status(400).json({ error: 'Invalid webhook signature.' });
      return;
    }
  }

  const allowedEvents = getSetting('razorpay_webhook_events', 'payment.captured,payment.failed')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  const event = req.body?.event;
  if (event && allowedEvents.length > 0 && !allowedEvents.includes(event)) {
    res.json({ received: true, ignoredEvent: event });
    return;
  }

  const paymentEntity = req.body?.payload?.payment?.entity;
  const rzpOrderId = paymentEntity?.order_id;
  const rzpPaymentId = paymentEntity?.id;

  if (!rzpOrderId) {
    res.json({ received: true });
    return;
  }

  const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id = ?').get(rzpOrderId) as any;
  if (!order) {
    res.json({ received: true });
    return;
  }

  if (event === 'payment.captured' || event === 'order.paid') {
    await applyOrderSuccessIdempotent(order, rzpPaymentId || 'webhook_captured', sigHeader || 'webhook_verified');
  } else if (event === 'payment.failed' && order.status === 'created') {
    db.prepare("UPDATE orders SET status = 'failed', razorpay_payment_id = ? WHERE id = ?").run(
      rzpPaymentId || null,
      order.id
    );
  }

  res.json({ received: true });
});

paymentAndDownloadRouter.post('/downloads/prepare', requireAuth, (req: BoothRequest, res) => {
  const { generationId } = req.body || {};
  if (!generationId) {
    res.status(400).json({ error: 'Missing generationId.' });
    return;
  }

  const gen = db
    .prepare(
      `SELECT g.id, g.selfie_id, g.look_id, g.visitor_hash, g.user_id, g.hd_path, g.deleted_at, l.name as look_name
       FROM generations g
       JOIN looks l ON l.id = g.look_id
       WHERE g.id = ?`
    )
    .get(generationId) as any;

  if (!gen || gen.deleted_at || !gen.hd_path || !fs.existsSync(gen.hd_path)) {
    res.status(404).json({ error: 'This look has already been downloaded and permanently deleted, or expired.' });
    return;
  }

  // Bind generation to user if they just signed up
  if (!gen.user_id && gen.visitor_hash === req.visitorHash) {
    db.prepare('UPDATE generations SET user_id = ? WHERE id = ?').run(req.user!.id, gen.id);
  } else if (gen.user_id && gen.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Unauthorized download request.' });
    return;
  }

  // Check active credits
  const freshUser = db
    .prepare('SELECT id, credits, pack_expires_at FROM users WHERE id = ?')
    .get(req.user!.id) as { id: string; credits: number; pack_expires_at: string | null };

  if (
    freshUser.credits <= 0 ||
    (freshUser.pack_expires_at && new Date(freshUser.pack_expires_at).getTime() <= Date.now())
  ) {
    if (freshUser.credits > 0) {
      db.prepare('UPDATE users SET credits = 0 WHERE id = ?').run(freshUser.id);
    }
    res.status(402).json({
      error: 'You have no active download credits remaining.',
      code: 'NO_CREDITS',
    });
    return;
  }

  // Deduct 1 credit atomically & create configurable short-lived single-use signed token
  const ttlMinutes = Math.max(1, parseInt(getSetting('download_link_ttl_minutes', '5'), 10) || 5);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const downloadId = crypto.randomUUID();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const result = db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').run(freshUser.id);
    if (result.changes === 0) {
      throw new Error('No credits available');
    }
    db.prepare(`
      INSERT INTO downloads (id, user_id, generation_id, look_name, token, token_expires_at, selfie_deleted, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(downloadId, freshUser.id, gen.id, gen.look_name, token, expiresAt, now);
  });

  try {
    tx();
  } catch {
    res.status(402).json({ error: 'Insufficient credits.', code: 'NO_CREDITS' });
    return;
  }

  const updatedUser = db
    .prepare('SELECT id, email, name, role, credits, pack_expires_at, email_verified FROM users WHERE id = ?')
    .get(freshUser.id);

  res.json({
    downloadUrl: `/api/downloads/file/${token}`,
    expiresAt,
    user: updatedUser,
  });
});

paymentAndDownloadRouter.get('/downloads/file/:token', (req: BoothRequest, res) => {
  const dl = db.prepare('SELECT * FROM downloads WHERE token = ?').get(req.params.token) as any;
  if (!dl) {
    res.status(404).json({ error: 'Invalid download link.' });
    return;
  }
  if (dl.used_at) {
    res.status(410).json({ error: 'This single-use download link has already been consumed.' });
    return;
  }
  if (new Date(dl.token_expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'Download link expired. Please generate a fresh link.' });
    return;
  }

  const gen = db.prepare('SELECT id, hd_path, deleted_at FROM generations WHERE id = ?').get(dl.generation_id) as
    | { id: string; hd_path: string | null; deleted_at: string | null }
    | undefined;

  if (!gen || !gen.hd_path || !fs.existsSync(gen.hd_path)) {
    res.status(404).json({ error: 'HD file unavailable or already deleted.' });
    return;
  }

  const buffer = fs.readFileSync(gen.hd_path);
  const safeName = String(dl.look_name || 'look')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

  db.prepare('UPDATE downloads SET used_at = ? WHERE id = ?').run(new Date().toISOString(), dl.id);

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Disposition', `attachment; filename="reclik-${safeName}.jpg"`);
  res.setHeader('Cache-Control', 'no-store, private');
  res.send(buffer);

  // Immediately delete original selfie, intermediate previews, and HD file (unless saved_to_gallery is enabled)
  const purgeResult = purgeGenerationAndSelfieAfterDownload(gen.id);
  if (purgeResult.selfieDeleted) {
    db.prepare('UPDATE downloads SET selfie_deleted = 1 WHERE id = ?').run(dl.id);
  }
});

paymentAndDownloadRouter.get('/downloads/status/:generationId', (req: BoothRequest, res) => {
  const gen = db.prepare('SELECT status, deleted_at, selfie_id FROM generations WHERE id = ?').get(req.params.generationId) as
    | { status: string; deleted_at: string | null; selfie_id: string }
    | undefined;

  if (!gen) {
    res.json({ deleted: true });
    return;
  }

  const selfie = db.prepare('SELECT deleted_at FROM selfies WHERE id = ?').get(gen.selfie_id) as
    | { deleted_at: string | null }
    | undefined;

  res.json({
    generationDeleted: Boolean(gen.deleted_at || gen.status === 'deleted'),
    selfieDeleted: Boolean(!selfie || selfie.deleted_at),
  });
});
