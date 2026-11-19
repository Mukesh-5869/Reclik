# Boothie — Privacy-First AI Look Booth

Boothie is a full-stack AI portrait photo-booth application. Visitors upload or capture one selfie, preview up to 3 watermarked looks without creating an account, and purchase clean HD unwatermarked downloads in USD via Razorpay with instant post-download selfie deletion.

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `GEMINI_API_KEY`: Server-side Gemini API key (`gemini-4-hydrogen` for safety/face checks and `gemini-3.1-flash-lite-image` for `generateLook`).
- `APP_URL`: Public URL of the running application.
- `CORS_ORIGIN`: Comma-separated allowed frontend origins (e.g., `https://your-app.vercel.app`) when hosting frontend and backend separately.
- `JWT_SECRET` & `COOKIE_SECRET`: Random 32+ byte secrets for signing auth JWTs and anonymous visitor cookies.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Seeded `super_admin` account credentials.
- `SUPPORT_EMAIL` / `SUPPORT_PASSWORD`: Seeded `support` role credentials (orders, refunds, receipts).
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`: Razorpay USD credentials. Leave blank to run in the built-in Razorpay USD Test Sandbox.
- `RESEND_API_KEY` & `EMAIL_FROM`: Optional transactional email delivery for receipts, verification, and password resets.

## Seeded Data

On initial boot, `server/db.ts` seeds:
- **12 sample looks** across 4 categories (`Professional`, `Hairstyles`, `Vintage Eras`, `Editorial & Street`).
- **1 Super Admin** (`admin@boothie.app`) and **1 Support** (`support@boothie.app`) account.
- **Dynamic pricing & quota settings** (`$3` single download, `$19` 12-look pack valid 30 days, `3` free previews).

## Switching Razorpay from Test Mode to Live

1. In your Razorpay Dashboard, switch from **Test Mode** to **Live Mode** and enable **International / USD** payments.
2. Generate live API keys and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in your backend environment.
3. Add a Razorpay Webhook pointing to `https://your-backend-domain/api/payments/webhook` subscribed to `payment.captured` and `payment.failed`.
4. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.

## Deploying Frontend (Vercel) & Backend Separately

1. **Frontend on Vercel**:
   - Connect the repository to Vercel (`npm run build`, output directory `dist`).
   - `vercel.json` is preconfigured to rewrite all SPA routes to `/index.html`.
   - Set `VITE_API_BASE_URL` (or configure Vercel rewrites `/api/*` -> `https://your-backend-domain/api/*`) so API calls and `HttpOnly` cookies work cleanly.
2. **Backend (Render / Railway / Cloud Run / Fly.io)**:
   - Run `npm start` (`tsx server.ts`) on port `3000` (or `PORT`).
   - Set `CORS_ORIGIN=https://your-vercel-domain.vercel.app` and mount persistent storage for `data/` (SQLite) and `storage/private/` (private temporary image storage).

## Scheduled Privacy Cleanup

`server/services/cleanupService.ts` runs automatically on startup and every 15 minutes to purge any unpurchased selfies and previews older than 24 hours. Purchased downloads immediately purge the original selfie, intermediate previews, and HD file right after download completes unless the user explicitly enables gallery saving in their dashboard.
