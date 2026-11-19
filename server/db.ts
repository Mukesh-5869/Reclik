import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const storageRoot = path.resolve(process.cwd(), 'storage', 'private');
for (const sub of ['selfies', 'previews', 'hd']) {
  const dir = path.join(storageRoot, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const db = new Database(path.join(dataDir, 'boothie.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const DEFAULT_SETTINGS: Record<string, string> = {
  brand_name: 'Reclik',
  support_email: 'support@boothie.app',
  email_from_name: 'Reclik',
  email_from_address: 'receipts@boothie.app',
  app_url: process.env.APP_URL || '',
  cors_origin: process.env.CORS_ORIGIN || '',
  legal_entity_name: 'Reclik Inc.',
  legal_jurisdiction: 'United States',
  single_price_usd: '3',
  pack_price_usd: '19',
  pack_size: '12',
  pack_validity_days: '30',
  free_preview_limit: '3',
  checkout_currency: 'USD',
  razorpay_mode: 'auto',
  razorpay_key_id: process.env.RAZORPAY_KEY_ID || '',
  razorpay_checkout_name: 'Reclik',
  razorpay_theme_color: '#D4AF37',
  razorpay_webhook_enabled: 'true',
  razorpay_webhook_events: 'payment.captured,payment.failed',
  watermark_text: 'Reclik',
  watermark_opacity: '0.28',
  preview_max_px: '768',
  hd_max_px: '2048',
  max_upload_mb: '10',
  generation_model: 'gemini-3.1-flash-lite-image',
  safety_moderation_enabled: 'true',
  selfie_retention_hours: '24',
  auto_delete_after_download: 'true',
  download_link_ttl_minutes: '5',
  maintenance_mode: 'false',
  rate_limit_per_hour: '30',
};

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_expires_at TEXT,
      suspended INTEGER NOT NULL DEFAULT 0,
      credits INTEGER NOT NULL DEFAULT 0,
      pack_expires_at TEXT,
      save_to_gallery_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS anon_usage (
      visitor_hash TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      visits INTEGER NOT NULL DEFAULT 1,
      previews_used INTEGER NOT NULL DEFAULT 0,
      hourly_count INTEGER NOT NULL DEFAULT 0,
      hourly_window_start TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS looks (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS selfies (
      id TEXT PRIMARY KEY,
      visitor_hash TEXT NOT NULL,
      user_id TEXT,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 0,
      consent_accepted INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT NOT NULL,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      selfie_id TEXT NOT NULL,
      look_id TEXT NOT NULL,
      visitor_hash TEXT NOT NULL,
      user_id TEXT,
      preview_path TEXT,
      hd_path TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      is_demo INTEGER NOT NULL DEFAULT 0,
      saved_to_gallery INTEGER NOT NULL DEFAULT 0,
      cost_estimate_usd REAL NOT NULL DEFAULT 0.04,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_type TEXT NOT NULL,
      amount_usd_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      razorpay_order_id TEXT UNIQUE NOT NULL,
      razorpay_payment_id TEXT,
      razorpay_signature TEXT,
      status TEXT NOT NULL DEFAULT 'created',
      generation_id TEXT,
      credits_granted INTEGER NOT NULL DEFAULT 0,
      receipt_sent_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      look_name TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      token_expires_at TEXT NOT NULL,
      used_at TEXT,
      selfie_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moderation_logs (
      id TEXT PRIMARY KEY,
      visitor_hash TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      reason TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'blocked',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocklist (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      value TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cleanup_runs (
      id TEXT PRIMARY KEY,
      files_purged INTEGER NOT NULL DEFAULT 0,
      records_purged INTEGER NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL,
      ran_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_preview TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    insertSetting.run(k, v);
  }

  // Seed Super Admin and Support accounts
  const primaryOwnerEmail = 'ntrs8899@gmail.com';
  const primaryOwnerPass = process.env.OWNER_ADMIN_PASSWORD || 'Ntrs@2341';
  const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(primaryOwnerEmail) as
    | { id: string }
    | undefined;
  if (!existingOwner) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, email_verified, credits, created_at)
      VALUES (?, ?, ?, ?, 'super_admin', 1, 50, ?)
    `).run(crypto.randomUUID(), primaryOwnerEmail, bcrypt.hashSync(primaryOwnerPass, 10), 'Studio Director', new Date().toISOString());
  } else {
    db.prepare(`
      UPDATE users SET role = 'super_admin', email_verified = 1, suspended = 0 WHERE id = ?
    `).run(existingOwner.id);
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@boothie.app').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'BoothieAdmin2026!';
  const supportEmail = (process.env.SUPPORT_EMAIL || 'support@boothie.app').toLowerCase();
  const supportPass = process.env.SUPPORT_PASSWORD || 'BoothieSupport2026!';

  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, email_verified, credits, created_at)
      VALUES (?, ?, ?, ?, 'super_admin', 1, 50, ?)
    `).run(crypto.randomUUID(), adminEmail, bcrypt.hashSync(adminPass, 10), 'Studio Director', new Date().toISOString());
  }

  const existingSupport = db.prepare('SELECT id FROM users WHERE email = ?').get(supportEmail);
  if (!existingSupport) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, email_verified, credits, created_at)
      VALUES (?, ?, ?, ?, 'support', 1, 10, ?)
    `).run(crypto.randomUUID(), supportEmail, bcrypt.hashSync(supportPass, 10), 'Support Lead', new Date().toISOString());
  }

  // Seed 12 curated looks across 4 categories
  const lookCount = (db.prepare('SELECT COUNT(*) as count FROM looks').get() as { count: number }).count;
  if (lookCount === 0) {
    const seededLooks = [
      // 1. Professional
      {
        slug: 'executive-charcoal',
        name: 'Executive Charcoal',
        category: 'Professional',
        description: 'Tailored charcoal wool blazer, warm travertine backdrop, soft studio key light.',
        prompt: 'Transform the portrait into a high-end corporate editorial headshot. Preserve exact facial identity, skin tone, and proportions. Dress the subject in a tailored charcoal wool blazer over an ivory silk top against a warm travertine architectural studio wall, soft diffused 85mm key lighting.',
        thumbnail_url: '/src/assets/images/look_exec_studio_1794987768967.jpg',
        is_featured: 1,
        sort_order: 1,
      },
      {
        slug: 'architectural-founder',
        name: 'Architectural Founder',
        category: 'Professional',
        description: 'Minimalist dark slate knitwear in a sunlit concrete and oak design studio.',
        prompt: 'Place the subject in a sunlit modern architectural studio with concrete walls and warm oak cabinetry. Preserve exact facial features and expression. Style in minimalist slate knitwear with natural window side-lighting, Leica 50mm depth of field.',
        thumbnail_url: '/src/assets/images/look_creative_founder_1794987769987.jpg',
        is_featured: 1,
        sort_order: 2,
      },
      {
        slug: 'editorial-press-headshot',
        name: 'Editorial Press Portrait',
        category: 'Professional',
        description: 'Crisp black blazer against sunlit Parisian limestone for author & press bios.',
        prompt: 'Create a natural-light editorial press portrait against soft warm limestone architecture. Preserve exact facial identity. Style in a sharp black wool blazer over a cream tee, gentle daylight bokeh, authentic magazine finish.',
        thumbnail_url: '/src/assets/images/look_french_bob_1794987770376.jpg',
        is_featured: 0,
        sort_order: 3,
      },
      // 2. Hairstyles
      {
        slug: 'copper-curtain-blowout',
        name: 'Copper Curtain Blowout',
        category: 'Hairstyles',
        description: 'Glossy copper-auburn layered waves with soft curtain bangs and champagne rim light.',
        prompt: 'Keep the subject’s exact face, eyes, and identity unchanged while transforming their hairstyle into rich glossy copper-auburn layered blowout waves with soft curtain bangs. Espresso dark studio backdrop with warm champagne rim lighting.',
        thumbnail_url: '/src/assets/images/look_copper_waves_1794987770331.jpg',
        is_featured: 1,
        sort_order: 4,
      },
      {
        slug: 'parisian-textured-bob',
        name: 'Parisian Textured Bob',
        category: 'Hairstyles',
        description: 'Effortless chin-length French bob with wispy fringe in soft natural daylight.',
        prompt: 'Keep the subject’s exact facial identity unchanged and style their hair into a chic Parisian chin-length textured bob with wispy bangs. Soft natural window light, subtle 35mm film tone, understated elegance.',
        thumbnail_url: '/src/assets/images/look_french_bob_1794987770376.jpg',
        is_featured: 0,
        sort_order: 5,
      },
      {
        slug: 'sleek-glass-part',
        name: 'Sleek Glass Side-Part',
        category: 'Hairstyles',
        description: 'Razor-sharp straight gloss finish with a deep side sweep under crisp flash.',
        prompt: 'Preserve the subject’s exact face and skin tone, styling the hair into a razor-sleek glassy straight shoulder-length cut with a clean side sweep. Crisp studio lighting, minimal gold hoop earrings.',
        thumbnail_url: '/src/assets/images/look_vintage_90s_1794987770168.jpg',
        is_featured: 0,
        sort_order: 6,
      },
      // 3. Vintage Eras
      {
        slug: 'kodachrome-70s-lounge',
        name: '1970s Kodachrome Lounge',
        category: 'Vintage Eras',
        description: 'Sunlit wood-paneled lounge, retro mustard knit, warm amber analog grain.',
        prompt: 'Transform the scene into an authentic 1970s sunlit Kodachrome 35mm portrait inside a wood-paneled retro lounge. Preserve exact facial likeness. Style in a mustard vintage collared knit shirt with warm amber color grading and natural film grain.',
        thumbnail_url: '/src/assets/images/look_vintage_70s_1794987771701.jpg',
        is_featured: 1,
        sort_order: 7,
      },
      {
        slug: 'nineties-curtain-flash',
        name: '1990s Curtain Flash',
        category: 'Vintage Eras',
        description: 'Direct analog flash against deep burgundy velvet curtains with 90s leather.',
        prompt: 'Recreate a genuine 1990s analog photo-booth portrait with direct on-camera flash against a deep burgundy velvet curtain. Preserve exact facial likeness. Style in a black leather blazer over a black turtleneck.',
        thumbnail_url: '/src/assets/images/look_vintage_90s_1794987770168.jpg',
        is_featured: 1,
        sort_order: 8,
      },
      {
        slug: 'silver-gelatin-noir',
        name: '1960s Silver Gelatin',
        category: 'Vintage Eras',
        description: 'Classic high-contrast monochrome portrait inspired by mid-century darkroom prints.',
        prompt: 'Transform into a timeless 1960s silver-gelatin monochrome studio portrait. Preserve exact facial features. Classic dramatic key light, subtle darkroom silver grain, tailored dark turtleneck.',
        thumbnail_url: '/src/assets/images/look_exec_studio_1794987768967.jpg',
        is_featured: 0,
        sort_order: 9,
      },
      // 4. Editorial & Street
      {
        slug: 'champagne-gallery-gala',
        name: 'Gallery Evening Gala',
        category: 'Editorial & Street',
        description: 'Obsidian velvet evening silhouette with brushed gold sculptural accents.',
        prompt: 'Create a luxury black-tie art gallery opening portrait. Preserve exact facial features and natural skin texture. Style in obsidian velvet evening wear with subtle brushed gold jewelry, warm gallery ambient light.',
        thumbnail_url: '/src/assets/images/look_glam_evening_1794987771123.jpg',
        is_featured: 1,
        sort_order: 10,
      },
      {
        slug: 'soho-camel-trench',
        name: 'SoHo Golden Hour',
        category: 'Editorial & Street',
        description: 'Oversized camel wool trench coat on cast-iron cobblestone streets in late light.',
        prompt: 'Place the subject walking on a sunlit New York SoHo cobblestone street during golden hour. Preserve exact facial likeness. Style in an oversized camel wool trench coat over a monochrome crewneck, crisp 35mm documentary fashion feel.',
        thumbnail_url: '/src/assets/images/look_streetwear_trench_1794987772489.jpg',
        is_featured: 1,
        sort_order: 11,
      },
      {
        slug: 'studio-warm-espresso',
        name: 'Warm Espresso Beauty',
        category: 'Editorial & Street',
        description: 'Rich espresso studio backdrop, soft rim highlight, satin collar minimalism.',
        prompt: 'Create an intimate high-fashion beauty portrait against a deep espresso backdrop with warm champagne rim light. Preserve exact facial identity and natural pores. Style in a sleek black silk collar.',
        thumbnail_url: '/src/assets/images/look_copper_waves_1794987770331.jpg',
        is_featured: 0,
        sort_order: 12,
      },
    ];

    const insertLook = db.prepare(`
      INSERT INTO looks (id, slug, name, category, description, prompt, thumbnail_url, is_active, is_featured, sort_order, usage_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?)
    `);

    const now = new Date().toISOString();
    for (const look of seededLooks) {
      insertLook.run(
        crypto.randomUUID(),
        look.slug,
        look.name,
        look.category,
        look.description,
        look.prompt,
        look.thumbnail_url,
        look.is_featured,
        look.sort_order,
        now
      );
    }
  }
}

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : fallback;
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
