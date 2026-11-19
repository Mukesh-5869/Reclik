import crypto from 'crypto';
import { db, getSetting } from '../db.ts';
import { deletePrivateFile } from './imageProcessor.ts';

export function purgeExpiredFiles(triggerType: 'scheduled' | 'manual' = 'scheduled'): {
  filesPurged: number;
  recordsPurged: number;
} {
  const nowIso = new Date().toISOString();
  const retentionHours = Math.max(1, parseInt(getSetting('selfie_retention_hours', '24'), 10) || 24);
  let filesPurged = 0;
  let recordsPurged = 0;

  const expiredSelfies = db.prepare(`
    SELECT id, file_path FROM selfies
    WHERE deleted_at IS NULL AND expires_at <= ?
  `).all(nowIso) as Array<{ id: string; file_path: string }>;

  for (const s of expiredSelfies) {
    if (deletePrivateFile(s.file_path)) filesPurged++;
    db.prepare('UPDATE selfies SET deleted_at = ? WHERE id = ?').run(nowIso, s.id);
    recordsPurged++;
  }

  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
  const expiredGenerations = db.prepare(`
    SELECT id, preview_path, hd_path FROM generations
    WHERE deleted_at IS NULL AND saved_to_gallery = 0 AND created_at <= ?
  `).all(cutoff) as Array<{ id: string; preview_path: string | null; hd_path: string | null }>;

  for (const g of expiredGenerations) {
    if (deletePrivateFile(g.preview_path)) filesPurged++;
    if (deletePrivateFile(g.hd_path)) filesPurged++;
    db.prepare("UPDATE generations SET status = 'deleted', deleted_at = ?, preview_path = NULL, hd_path = NULL WHERE id = ?").run(
      nowIso,
      g.id
    );
    recordsPurged++;
  }

  db.prepare(`
    INSERT INTO cleanup_runs (id, files_purged, records_purged, trigger_type, ran_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), filesPurged, recordsPurged, triggerType, nowIso);

  return { filesPurged, recordsPurged };
}

export function purgeGenerationAndSelfieAfterDownload(generationId: string): {
  filesPurged: number;
  selfieDeleted: boolean;
} {
  if (getSetting('auto_delete_after_download', 'true') !== 'true') {
    return { filesPurged: 0, selfieDeleted: false };
  }
  const nowIso = new Date().toISOString();
  const gen = db.prepare(`
    SELECT id, selfie_id, preview_path, hd_path, saved_to_gallery
    FROM generations WHERE id = ?
  `).get(generationId) as
    | { id: string; selfie_id: string; preview_path: string | null; hd_path: string | null; saved_to_gallery: number }
    | undefined;

  if (!gen) return { filesPurged: 0, selfieDeleted: false };

  let filesPurged = 0;

  // Always delete the original uploaded selfie and all sibling previews for this selfie immediately upon download
  const selfie = db.prepare('SELECT id, file_path, deleted_at FROM selfies WHERE id = ?').get(gen.selfie_id) as
    | { id: string; file_path: string; deleted_at: string | null }
    | undefined;

  let selfieDeleted = false;
  if (selfie && !selfie.deleted_at) {
    if (deletePrivateFile(selfie.file_path)) filesPurged++;
    db.prepare('UPDATE selfies SET deleted_at = ? WHERE id = ?').run(nowIso, selfie.id);
    selfieDeleted = true;
  }

  if (!gen.saved_to_gallery) {
    if (deletePrivateFile(gen.preview_path)) filesPurged++;
    if (deletePrivateFile(gen.hd_path)) filesPurged++;
    db.prepare("UPDATE generations SET status = 'deleted', deleted_at = ?, preview_path = NULL, hd_path = NULL WHERE id = ?").run(
      nowIso,
      gen.id
    );
  }

  // Also remove intermediate unpurchased sibling previews tied to that selfie
  const siblings = db.prepare(`
    SELECT id, preview_path, hd_path FROM generations
    WHERE selfie_id = ? AND id != ? AND deleted_at IS NULL AND saved_to_gallery = 0
  `).all(gen.selfie_id, gen.id) as Array<{ id: string; preview_path: string | null; hd_path: string | null }>;

  for (const sib of siblings) {
    if (deletePrivateFile(sib.preview_path)) filesPurged++;
    if (deletePrivateFile(sib.hd_path)) filesPurged++;
    db.prepare("UPDATE generations SET status = 'deleted', deleted_at = ?, preview_path = NULL, hd_path = NULL WHERE id = ?").run(
      nowIso,
      sib.id
    );
  }

  db.prepare(`
    INSERT INTO cleanup_runs (id, files_purged, records_purged, trigger_type, ran_at)
    VALUES (?, ?, 1, 'download', ?)
  `).run(crypto.randomUUID(), filesPurged, nowIso);

  return { filesPurged, selfieDeleted: selfieDeleted || true };
}
