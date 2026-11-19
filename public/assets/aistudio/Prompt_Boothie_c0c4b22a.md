# EMERGENT PROMPT: "Boothie" AI Look Booth (paste everything below the line)

---

Build a premium, production-ready web app called **Boothie** (placeholder name, easy to rebrand): an AI photo-booth where a user uploads or captures ONE selfie and gets it transformed into different "looks" (hairstyles, outfits, styles, eras, professional headshots, etc.). Target market: USA consumers. Frontend deploys to Vercel. Payments via Razorpay (USD). Include a full Admin Panel.

## 1. Tech and architecture
- Frontend: React + Tailwind + Framer Motion, mobile-first, deployable to Vercel (SPA with proper routing/rewrites config).
- Backend: FastAPI + MongoDB, all secrets via environment variables (.env.example included). Backend must be deployable separately (CORS configurable via env var for the Vercel domain).
- Image generation: use an image-editing model (identity-preserving, image-to-image) through the Emergent universal key. Abstract it behind a `generate_look(selfie, look_prompt)` service so the model can be swapped.
- Payments: Razorpay Orders + Checkout, USD currency, server-side signature verification and webhook handling (payment.captured, payment.failed). Never trust client-side success.

## 2. The 3-step flow (single clean wizard, progress indicator at top)
**Step 1: Upload selfie**
- Two options: "Upload photo" (drag-drop / file picker, JPG/PNG/HEIC, max 10MB) and "Take selfie" (browser camera via getUserMedia, front camera default, mirrored preview, countdown 3-2-1, retake option).
- Client-side check: one face present, decent size/brightness; friendly error messages. Compress/resize before upload.
- Privacy caution banner shown here (see Section 5) with a required consent checkbox before continuing.

**Step 2: Select a look**
- Beautiful grid of look cards (image thumbnail, name, category chip). Category filter tabs (e.g. Hairstyles, Professional, Streetwear, Vintage Eras, Glam, Casual, Seasonal). Search optional.
- User can select a look and generate. Show an elegant loading state (animated booth-strip / shimmer, estimated time).

**Step 3: Preview and download**
- Show result in a photo-booth-strip style frame. Before/after slider against the original selfie.
- Free users: watermarked preview, not downloadable. Disable right-click/long-press save/drag on the image, and do NOT expose the clean image URL to the client at all (see Section 4).
- Buttons: "Download HD" (triggers paywall/sign-up if needed), "Try another look", "Start over".
- Users can try multiple looks on the same selfie within the free preview limit.

## 3. Free preview rules
- **3 free watermarked previews** per visitor, no sign-up required.
- Enforce server-side (not just localStorage): combine signed anonymous session cookie + device fingerprint + IP rate limiting. Show a "2 of 3 free previews left" counter.
- After 3 previews: friendly modal to sign up and buy credits.
- Previews are low-res (max ~768px) with a tiled diagonal "Boothie" watermark baked into the pixels server-side.

## 4. Pricing, accounts and downloads
- **Single Download: $3** (one HD, clean, no-watermark download of one look).
- **12-Download Pack: $19**, valid **30 days** from purchase date; 12 downloads max; expires unused credits after 30 days. Show "X downloads left, expires on DATE" in the user dashboard and header.
- Sign-up REQUIRED for any purchase or download (email + password, plus Google sign-in; email verification; password reset). No sign-up needed for the 3 free previews. Preserve the user's in-progress selfie/look through the sign-up flow.
- Download logic: only after credit deduction (or $3 payment) does the server generate/serve the clean HD file via a short-lived signed URL (expires in minutes, single use). Clean images are never sent to the browser before payment.
- Pricing page with a clear comparison, FAQ, and USD formatting. Show "Pack best value: $1.58 per look" messaging.
- Handle edge cases: failed payment, duplicate webhook (idempotency), refund via admin, expired pack, zero credits left.
- Receipts by email (transactional email provider configurable via env).

## 5. Privacy (core feature, make it visible)
- **Selfie is permanently deleted right after the user downloads their look** (delete original selfie and all intermediate/preview files from storage; keep only the final purchased file until download completes, then delete that too, unless the user explicitly saves to their account gallery, which is OFF by default).
- Auto-delete safety net: any selfie/preview not downloaded is purged after 24 hours (scheduled cleanup job).
- Caution/notice displayed at: upload step (required checkbox), preview step, and download confirmation: *"Your selfie is used only to create your look. It is automatically deleted after you download, and never used to train AI or shared. Download your look before leaving, because once deleted it can't be recovered."*
- Show a "Selfie deleted successfully" confirmation after download.
- Because selfies are biometric data (US state laws like Illinois BIPA, Texas CUBI, Washington), include explicit consent text, a Privacy Policy, Terms of Service, and a "Delete my data" button in the dashboard. Include an age gate (18+).
- Store images in private storage only (no public buckets).

## 6. Premium UI/UX direction
- Luxury photo-booth aesthetic: dark, warm-neutral theme with a soft cream/ivory light option, one bold accent color (e.g. champagne gold or electric coral), generous whitespace, glassmorphism cards, subtle grain, large refined typography (pair a modern serif like Fraunces/Playfair for headings with Inter for body).
- Hero: animated photo-booth strip showing before/after, strong headline, single CTA "Try free", trust badges (privacy-first, auto-delete, 3 free looks).
- Smooth micro-interactions (Framer Motion): card hover tilt, step transitions, confetti on first result, skeleton loaders.
- Fully responsive, thumb-friendly on mobile (primary traffic), accessible (WCAG AA, keyboard nav, alt text), fast (lazy-loaded images, WebP).
- Pages: Landing, Booth (3-step wizard), Pricing, Login/Sign-up, User Dashboard (credits, expiry, purchase history, download history, delete data), Privacy, Terms, FAQ, Contact.
- Include a Looks section on landing showing sample results (use placeholder AI-generated or stock sample images, not real people's photos).

## 7. Admin Panel (/admin, role-protected, separate admin login)
- **Dashboard:** revenue (today/7d/30d), orders, active packs, conversion funnel (visits → previews → sign-ups → purchases), generations count, generation cost estimate, charts.
- **Looks management:** create/edit/delete/reorder looks, upload thumbnail, edit the hidden generation prompt, category, active/inactive toggle, "featured" flag, per-look usage stats. Prompt edits take effect immediately.
- **Users:** searchable list, view credits/expiry/purchases, manually grant or revoke credits, extend pack, suspend, delete user and their data.
- **Orders/Payments:** list with Razorpay payment IDs and statuses, issue refunds (via Razorpay API), resend receipts, export CSV.
- **Pricing and settings:** edit single price, pack price, pack size, validity days, free preview count, watermark text/opacity, generation model settings, maintenance mode toggle. (All app logic reads from these settings, not hardcoded.)
- **Abuse and moderation:** flagged/failed generations, IP/device blocklist, rate-limit settings, NSFW/unsafe-content filter log.
- **Privacy ops:** view cleanup job status, count of files purged, manual purge, audit log of all admin actions.
- Roles: super admin and support (read-only plus refunds).

## 8. Safety and compliance
- Run an unsafe-content check on uploads and outputs; block nudity, minors, and images with no clear face. Looks must not produce sexualized or deceptive impersonation content.
- Add rate limiting, file-type validation, EXIF stripping, secure headers, CSRF/JWT best practices.
- Cookie banner and clear disclosure that results are AI-generated.

## 9. Deliverables
- Working app with seeded data: 12 sample looks across 4 categories, one super admin account (credentials via env), and Razorpay in test mode.
- README covering: env variables, Razorpay test-to-live switch, how to deploy frontend on Vercel and the backend separately, webhook URL setup, and cron/cleanup setup.
- Build in this order and confirm each works before moving on: (1) booth flow with free watermarked previews, (2) auth, (3) Razorpay payments and credits, (4) signed secure downloads plus auto-delete, (5) admin panel, (6) polish and legal pages.

---
