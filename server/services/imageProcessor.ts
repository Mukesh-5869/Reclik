import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { storageRoot } from '../db.ts';

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return ch;
    }
  });
}

export async function stripExifAndNormalizeSelfie(inputBuffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  // .rotate() applies EXIF orientation then strips all EXIF/GPS/device metadata by default
  const pipeline = sharp(inputBuffer).rotate().resize({
    width: 2048,
    height: 2048,
    fit: 'inside',
    withoutEnlargement: true,
  });

  const { data, info } = await pipeline.jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  if (info.width < 180 || info.height < 180) {
    throw new Error('Portrait resolution is too low. Please upload a clearer photo at least 200px wide.');
  }

  return {
    buffer: data,
    width: info.width,
    height: info.height,
  };
}

export async function createWatermarkedPreview(
  hdBuffer: Buffer,
  watermarkText: string,
  opacity: number,
  maxPx = 768
): Promise<Buffer> {
  const safeOpacity = Math.max(0.08, Math.min(0.65, Number.isFinite(opacity) ? opacity : 0.28));
  const safeMaxPx = Math.max(320, Math.min(1024, Number.isFinite(maxPx) ? maxPx : 768));
  const label = escapeXml((watermarkText || 'Reclik').slice(0, 24));

  const resized = await sharp(hdBuffer)
    .rotate()
    .resize({ width: safeMaxPx, height: safeMaxPx, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer({ resolveWithObject: true });

  const width = resized.info.width || safeMaxPx;
  const height = resized.info.height || safeMaxPx;

  // Bake diagonal repeating watermark SVG directly into the preview pixel buffer
  const svgOverlay = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <pattern id="wm" width="210" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <text x="16" y="64" font-family="Georgia, serif" font-size="22" font-weight="600" letter-spacing="2" fill="rgba(255,255,255,${safeOpacity})">${label}</text>
          <text x="110" y="136" font-family="sans-serif" font-size="13" font-weight="600" letter-spacing="1.5" fill="rgba(212,175,55,${safeOpacity})">PREVIEW</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
    </svg>
  `;

  return sharp(resized.data)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 84 })
    .toBuffer();
}

export async function normalizeHdOutput(hdBuffer: Buffer, maxPx = 2048): Promise<Buffer> {
  const safeMaxPx = Math.max(1024, Math.min(4096, Number.isFinite(maxPx) ? maxPx : 2048));
  return sharp(hdBuffer)
    .rotate()
    .resize({ width: safeMaxPx, height: safeMaxPx, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export function savePrivateFile(subdir: 'selfies' | 'previews' | 'hd', filename: string, buffer: Buffer): string {
  const fullPath = path.join(storageRoot, subdir, filename);
  fs.writeFileSync(fullPath, buffer);
  return fullPath;
}

export function deletePrivateFile(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Ignore already deleted
  }
  return false;
}
