import crypto from 'crypto';
import { db, getSetting } from '../db.ts';

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  html: string;
  textPreview: string;
}): Promise<{ delivered: boolean; provider: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const fromName = getSetting('email_from_name', 'Reclik');
  const fromAddr = getSetting('email_from_address', 'receipts@boothie.app');
  const from = process.env.EMAIL_FROM || `${fromName} <${fromAddr}>`;

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
        }),
      });
      if (res.ok) {
        db.prepare(`
          INSERT INTO email_outbox (id, recipient, subject, body_preview, provider, created_at)
          VALUES (?, ?, ?, ?, 'resend', ?)
        `).run(crypto.randomUUID(), params.to, params.subject, params.textPreview, new Date().toISOString());
        return { delivered: true, provider: 'resend' };
      }
    } catch (err) {
      console.warn('Resend delivery failed, recording locally:', err instanceof Error ? err.message : err);
    }
  }

  db.prepare(`
    INSERT INTO email_outbox (id, recipient, subject, body_preview, provider, created_at)
    VALUES (?, ?, ?, ?, 'local_outbox', ?)
  `).run(crypto.randomUUID(), params.to, params.subject, params.textPreview, new Date().toISOString());

  return { delivered: true, provider: 'local_outbox' };
}
