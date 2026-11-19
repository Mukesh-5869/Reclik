import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { db, getSetting, initDatabase } from './server/db.ts';
import { attachOptionalUser, attachVisitorIdentity } from './server/middleware/auth.ts';
import { authAndUserRouter } from './server/routes/authAndUserRoutes.ts';
import { boothRouter } from './server/routes/boothRoutes.ts';
import { paymentAndDownloadRouter } from './server/routes/paymentAndDownloadRoutes.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';
import { purgeExpiredFiles } from './server/services/cleanupService.ts';

async function startServer() {
  initDatabase();
  purgeExpiredFiles('scheduled');

  // Scheduled 24h auto-delete cleanup sweep every 15 minutes
  setInterval(() => {
    purgeExpiredFiles('scheduled');
  }, 15 * 60 * 1000);

  const app = express();
  app.set('trust proxy', true);
  const PORT = Number(process.env.PORT) || 3000;

  // Security headers & configurable CORS for separate Vercel deployment
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const corsRaw = getSetting('cors_origin', process.env.CORS_ORIGIN || '');
    const allowedOrigins = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-Boothie-Fp,X-Boothie-Vid,X-Razorpay-Signature'
      );
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(cookieParser());
  app.use(attachVisitorIdentity);
  app.use(attachOptionalUser);

  // Public catalog & settings endpoints
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'boothie-api' });
  });

  app.get('/api/settings/public', (_req, res) => {
    const razorpayMode = getSetting('razorpay_mode', 'auto');
    const razorpayKeyId = getSetting('razorpay_key_id', '') || process.env.RAZORPAY_KEY_ID || '';
    res.json({
      brandName: getSetting('brand_name', 'Reclik'),
      supportEmail: getSetting('support_email', 'support@boothie.app'),
      legalEntityName: getSetting('legal_entity_name', 'Reclik Inc.'),
      legalJurisdiction: getSetting('legal_jurisdiction', 'United States'),
      singlePriceUsd: parseFloat(getSetting('single_price_usd', '3')) || 3,
      packPriceUsd: parseFloat(getSetting('pack_price_usd', '19')) || 19,
      packSize: parseInt(getSetting('pack_size', '12'), 10) || 12,
      packValidityDays: parseInt(getSetting('pack_validity_days', '30'), 10) || 30,
      freePreviewLimit: parseInt(getSetting('free_preview_limit', '3'), 10) || 3,
      maxUploadMb: parseInt(getSetting('max_upload_mb', '10'), 10) || 10,
      checkoutCurrency: getSetting('checkout_currency', 'USD') || 'USD',
      razorpayCheckoutName: getSetting('razorpay_checkout_name', 'Reclik') || 'Reclik',
      razorpayThemeColor: getSetting('razorpay_theme_color', '#D4AF37') || '#D4AF37',
      maintenanceMode: getSetting('maintenance_mode', 'false') === 'true',
      razorpayConfigured:
        razorpayMode !== 'sandbox' && Boolean(razorpayKeyId && process.env.RAZORPAY_KEY_SECRET),
    });
  });

  app.get('/api/looks', (_req, res) => {
    const looks = db
      .prepare(
        `SELECT id, slug, name, category, description, thumbnail_url, is_featured, sort_order, usage_count
         FROM looks WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC`
      )
      .all();
    res.json({ looks });
  });

  // Feature API routers
  app.use('/api', authAndUserRouter);
  app.use('/api', boothRouter);
  app.use('/api', paymentAndDownloadRouter);
  app.use('/api/admin', adminRouter);

  // Structured JSON error handler for upload/Multer and API errors
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Uploaded photo exceeds the 10MB size limit.' });
      return;
    }
    res.status(err?.status || 400).json({ error: err?.message || 'Unexpected API error.' });
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Reclik server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
