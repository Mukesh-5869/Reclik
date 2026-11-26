import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { db, getSetting } from '../db.ts';
import { BoothRequest, checkBlocklistAndRateLimit } from '../middleware/auth.ts';
import {
  createWatermarkedPreview,
  normalizeHdOutput,
  savePrivateFile,
  stripExifAndNormalizeSelfie,
} from '../services/imageProcessor.ts';
import { generateLook, LookGenerationError, validateSelfieWithGemini } from '../services/geminiService.ts';

export const boothRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format. Please upload JPG, PNG, WebP, or HEIC.'));
    }
  },
});

function getVisitorQuota(visitorHash: string) {
  const limit = parseInt(getSetting('free_preview_limit', '3'), 10) || 3;
  const row = db.prepare('SELECT previews_used FROM anon_usage WHERE visitor_hash = ?').get(visitorHash) as
    | { previews_used: number }
    | undefined;
  const used = row?.previews_used ?? 0;
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

boothRouter.get('/booth/quota', (req: BoothRequest, res) => {
  const quota = getVisitorQuota(req.visitorHash || '');
  res.json({ ...quota, visitorToken: req.visitorToken });
});

boothRouter.post(
  '/booth/upload-selfie',
  checkBlocklistAndRateLimit,
  upload.single('selfie'),
  async (req: BoothRequest, res) => {
    try {
      if (getSetting('maintenance_mode', 'false') === 'true' && req.user?.role !== 'super_admin') {
        res.status(503).json({ error: 'Reclik is undergoing brief scheduled maintenance. Please check back shortly.' });
        return;
      }

      const consentAccepted = req.body?.consentAccepted === 'true' || req.body?.consentAccepted === true;
      const ageConfirmed = req.body?.ageConfirmed === 'true' || req.body?.ageConfirmed === true;

      if (!consentAccepted || !ageConfirmed) {
        res.status(400).json({ error: 'Please confirm you are 18+ and accept the biometric privacy notice before continuing.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Please select or capture a portrait photo.' });
        return;
      }

      const maxUploadMb = Math.max(1, parseInt(getSetting('max_upload_mb', '10'), 10) || 10);
      if (req.file.size > maxUploadMb * 1024 * 1024) {
        res.status(400).json({ error: `Uploaded photo exceeds the ${maxUploadMb}MB limit.` });
        return;
      }

      const normalized = await stripExifAndNormalizeSelfie(req.file.buffer);
      const safetyEnabled = getSetting('safety_moderation_enabled', 'true') !== 'false';
      const safety = safetyEnabled
        ? await validateSelfieWithGemini(normalized.buffer.toString('base64'), 'image/jpeg')
        : { isSafeContent: true, isAdultAppearing: true, hasSingleClearFace: true, reason: '' };

      if (!safety.isSafeContent || !safety.isAdultAppearing || !safety.hasSingleClearFace) {
        db.prepare(`
          INSERT INTO moderation_logs (id, visitor_hash, ip_address, reason, severity, created_at)
          VALUES (?, ?, ?, ?, 'blocked', ?)
        `).run(
          crypto.randomUUID(),
          req.visitorHash || 'unknown',
          req.clientIp || '0.0.0.0',
          safety.reason || 'Safety or face-count check failed',
          new Date().toISOString()
        );

        let message = safety.reason || 'Please upload a well-lit photo with one clear adult face.';
        if (!safety.isSafeContent) {
          message = 'This photo could not be processed by our safety filter. Please choose a standard portrait.';
        } else if (!safety.isAdultAppearing) {
          message = 'Reclik is strictly for users 18 and older. Please upload an adult portrait.';
        } else if (!safety.hasSingleClearFace) {
          message = 'We need one clearly visible face looking toward the camera. Group photos or obscured faces cannot be used.';
        }

        res.status(422).json({ error: message });
        return;
      }

      const selfieId = crypto.randomUUID();
      const filePath = savePrivateFile('selfies', `${selfieId}.jpg`, normalized.buffer);
      const now = new Date().toISOString();
      const retentionHours = Math.max(1, parseInt(getSetting('selfie_retention_hours', '24'), 10) || 24);
      const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO selfies (id, visitor_hash, user_id, file_path, mime_type, is_demo, consent_accepted, expires_at, created_at)
        VALUES (?, ?, ?, ?, 'image/jpeg', 0, 1, ?, ?)
      `).run(selfieId, req.visitorHash || '', req.user?.id || null, filePath, expiresAt, now);

      res.json({
        selfieId,
        width: normalized.width,
        height: normalized.height,
        isDemo: false,
        visitorToken: req.visitorToken,
        selfieUrl: `/api/booth/selfie/${selfieId}?vt=${encodeURIComponent(req.visitorToken || '')}&fp=${encodeURIComponent(req.fingerprint || '')}`,
        quota: getVisitorQuota(req.visitorHash || ''),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to process selfie.';
      res.status(400).json({ error: msg });
    }
  }
);

boothRouter.post('/booth/demo-selfie', (req: BoothRequest, res) => {
  const samplePath = path.resolve(process.cwd(), 'src', 'assets', 'images', 'hero_selfie_original_1794987768373.jpg');
  if (!fs.existsSync(samplePath)) {
    res.status(404).json({ error: 'Sample portrait asset not available.' });
    return;
  }

  const selfieId = crypto.randomUUID();
  const buffer = fs.readFileSync(samplePath);
  const filePath = savePrivateFile('selfies', `${selfieId}.jpg`, buffer);
  const now = new Date().toISOString();
  const retentionHours = Math.max(1, parseInt(getSetting('selfie_retention_hours', '24'), 10) || 24);
  const expiresAt = new Date(Date.now() + retentionHours * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO selfies (id, visitor_hash, user_id, file_path, mime_type, is_demo, consent_accepted, expires_at, created_at)
    VALUES (?, ?, ?, ?, 'image/jpeg', 1, 1, ?, ?)
  `).run(selfieId, req.visitorHash || '', req.user?.id || null, filePath, expiresAt, now);

  res.json({
    selfieId,
    isDemo: true,
    visitorToken: req.visitorToken,
    selfieUrl: `/api/booth/selfie/${selfieId}?vt=${encodeURIComponent(req.visitorToken || '')}&fp=${encodeURIComponent(req.fingerprint || '')}`,
    quota: getVisitorQuota(req.visitorHash || ''),
  });
});

boothRouter.get('/booth/selfie/:selfieId', (req: BoothRequest, res) => {
  const selfie = db
    .prepare('SELECT id, visitor_hash, user_id, file_path, deleted_at FROM selfies WHERE id = ?')
    .get(req.params.selfieId) as
    | { id: string; visitor_hash: string; user_id: string | null; file_path: string; deleted_at: string | null }
    | undefined;

  if (!selfie || selfie.deleted_at) {
    res.status(404).json({ error: 'Selfie has been deleted or expired.' });
    return;
  }

  const ownsByVisitor = selfie.visitor_hash === req.visitorHash;
  const ownsByUser = Boolean(req.user && selfie.user_id === req.user.id);
  if (!ownsByVisitor && !ownsByUser) {
    res.status(403).json({ error: 'Unauthorized selfie access.' });
    return;
  }

  if (!fs.existsSync(selfie.file_path)) {
    res.status(404).json({ error: 'Selfie file already purged.' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('image/jpeg').send(fs.readFileSync(selfie.file_path));
});

boothRouter.post('/booth/generate', checkBlocklistAndRateLimit, async (req: BoothRequest, res) => {
  try {
    if (getSetting('maintenance_mode', 'false') === 'true' && req.user?.role !== 'super_admin') {
      res.status(503).json({ error: 'Reclik is temporarily paused for maintenance.' });
      return;
    }

    const { selfieId, lookId } = req.body || {};
    if (!selfieId || !lookId) {
      res.status(400).json({ error: 'Both a selfie and a look selection are required.' });
      return;
    }

    const selfie = db
      .prepare('SELECT id, visitor_hash, user_id, file_path, is_demo, deleted_at FROM selfies WHERE id = ?')
      .get(selfieId) as
      | {
          id: string;
          visitor_hash: string;
          user_id: string | null;
          file_path: string;
          is_demo: number;
          deleted_at: string | null;
        }
      | undefined;

    if (!selfie || selfie.deleted_at || !fs.existsSync(selfie.file_path)) {
      res.status(404).json({ error: 'Your uploaded selfie expired or was already deleted. Please upload again.' });
      return;
    }

    const ownsSelfie = selfie.visitor_hash === req.visitorHash || (req.user && selfie.user_id === req.user.id);
    if (!ownsSelfie) {
      res.status(403).json({ error: 'Selfie session mismatch.' });
      return;
    }

    const look = db
      .prepare('SELECT id, name, category, prompt, thumbnail_url, is_active FROM looks WHERE id = ?')
      .get(lookId) as
      | { id: string; name: string; category: string; prompt: string; thumbnail_url: string; is_active: number }
      | undefined;

    if (!look || !look.is_active) {
      res.status(404).json({ error: 'Selected look is unavailable.' });
      return;
    }

    // Server-side free preview limit enforcement (paid users with active credits bypass free preview cap)
    const quota = getVisitorQuota(req.visitorHash || '');
    const hasActiveCredits = Boolean(req.user && req.user.credits > 0);
    if (quota.remaining <= 0 && !hasActiveCredits) {
      res.status(402).json({
        error: 'You have used all free watermarked previews. Sign up and choose a pack or single look to continue.',
        code: 'FREE_LIMIT_REACHED',
        quota,
      });
      return;
    }

    let rawOutputBuffer: Buffer;
    if (selfie.is_demo) {
      // Sample Demo Mode uses the curated look portrait asset so users can test watermarking,
      // before/after slider, checkout, signed HD download, and auto-delete end-to-end.
      const relativeThumb = look.thumbnail_url.replace(/^\/+/, '');
      const demoFile = path.resolve(process.cwd(), relativeThumb);
      if (!fs.existsSync(demoFile)) {
        res.status(500).json({ error: 'Sample look asset missing on disk.' });
        return;
      }
      rawOutputBuffer = fs.readFileSync(demoFile);
    } else {
      const selfieBuffer = fs.readFileSync(selfie.file_path);
      const modelName = process.env.IMAGE_MODEL || getSetting('generation_model', 'gemini-2.5-flash-image');
      const generated = await generateLook(selfieBuffer, 'image/jpeg', look.prompt, modelName);
      rawOutputBuffer = generated.imageBuffer;
    }

    const watermarkText = getSetting('watermark_text', 'Reclik');
    const watermarkOpacity = parseFloat(getSetting('watermark_opacity', '0.28')) || 0.28;
    const previewMaxPx = parseInt(getSetting('preview_max_px', '768'), 10) || 768;
    const hdMaxPx = parseInt(getSetting('hd_max_px', '2048'), 10) || 2048;

    const hdNormalized = await normalizeHdOutput(rawOutputBuffer, hdMaxPx);
    const previewBuffer = await createWatermarkedPreview(hdNormalized, watermarkText, watermarkOpacity, previewMaxPx);

    const generationId = crypto.randomUUID();
    const previewPath = savePrivateFile('previews', `${generationId}.jpg`, previewBuffer);
    const hdPath = savePrivateFile('hd', `${generationId}.jpg`, hdNormalized);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO generations (id, selfie_id, look_id, visitor_hash, user_id, preview_path, hd_path, status, is_demo, saved_to_gallery, cost_estimate_usd, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
    `).run(
      generationId,
      selfie.id,
      look.id,
      req.visitorHash || '',
      req.user?.id || null,
      previewPath,
      hdPath,
      selfie.is_demo,
      req.user?.save_to_gallery_default ? 1 : 0,
      selfie.is_demo ? 0 : 0.04,
      now
    );

    db.prepare('UPDATE looks SET usage_count = usage_count + 1 WHERE id = ?').run(look.id);
    if (!hasActiveCredits) {
      db.prepare('UPDATE anon_usage SET previews_used = previews_used + 1, updated_at = ? WHERE visitor_hash = ?').run(
        now,
        req.visitorHash || ''
      );
    }

    const updatedQuota = getVisitorQuota(req.visitorHash || '');
    const vtParam = encodeURIComponent(req.visitorToken || '');
    const fpParam = encodeURIComponent(req.fingerprint || '');
    res.json({
      generationId,
      look: { id: look.id, name: look.name, category: look.category },
      isDemo: Boolean(selfie.is_demo),
      previewUrl: `/api/booth/preview/${generationId}?t=${Date.now()}&vt=${vtParam}&fp=${fpParam}`,
      selfieUrl: `/api/booth/selfie/${selfie.id}?vt=${vtParam}&fp=${fpParam}`,
      quota: updatedQuota,
    });
  } catch (err: unknown) {
    if (err instanceof LookGenerationError) {
      const status = err.code === 'PAID_KEY_REQUIRED' || err.code === 'MISSING_API_KEY' ? 402 : 500;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Generation failed.';
    res.status(500).json({ error: msg });
  }
});

boothRouter.get('/booth/preview/:generationId', (req: BoothRequest, res) => {
  const gen = db
    .prepare('SELECT id, visitor_hash, user_id, preview_path, deleted_at FROM generations WHERE id = ?')
    .get(req.params.generationId) as
    | { id: string; visitor_hash: string; user_id: string | null; preview_path: string | null; deleted_at: string | null }
    | undefined;

  if (!gen || gen.deleted_at || !gen.preview_path || !fs.existsSync(gen.preview_path)) {
    res.status(404).json({ error: 'Preview unavailable or already deleted.' });
    return;
  }

  const owns = gen.visitor_hash === req.visitorHash || (req.user && gen.user_id === req.user.id);
  if (!owns) {
    res.status(403).json({ error: 'Unauthorized preview access.' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('image/jpeg').send(fs.readFileSync(gen.preview_path));
});
