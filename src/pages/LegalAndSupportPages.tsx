import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-8">
      <div className="space-y-2 border-b border-black/10 dark:border-white/10 pb-6">
        <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Effective November 2026 · United States</p>
        <h1 className="font-display text-4xl text-[#171412] dark:text-[#F5F2EC]">Biometric &amp; Data Privacy Policy</h1>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-[#575049] dark:text-[#A9A29A]">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[#171412] dark:text-[#F5F2EC]">1. Purpose &amp; Instant Deletion</h2>
          <p>
            Reclik collects your reference selfie solely to render your selected AI-generated look previews and HD
            portrait download. Original selfies, EXIF device metadata, and intermediate previews are stored in
            non-public private storage and are permanently deleted immediately upon HD download completion—or
            automatically within 24 hours if not downloaded.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[#171412] dark:text-[#F5F2EC]">
            2. Illinois BIPA, Texas CUBI &amp; Washington Biometric Notice
          </h2>
          <p>
            Under state biometric privacy laws (including Illinois 740 ILCS 14, Texas Bus. &amp; Com. Code § 503.001,
            and Washington RCW 19.375), facial geometry processed from a portrait may be considered biometric data.
            Reclik obtains your explicit written release before upload, never sells, leases, or profits from biometric
            identifiers, never uses customer photos to train AI models, and permanently purges source images within 0
            seconds after download (max 24 hours retention ceiling).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[#171412] dark:text-[#F5F2EC]">3. Age Eligibility (18+)</h2>
          <p>
            Reclik is restricted strictly to adults aged 18 and older. Automated safety screening rejects uploads
            depicting minors, nudity, or non-consensual imagery.
          </p>
        </section>
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-8">
      <div className="space-y-2 border-b border-black/10 dark:border-white/10 pb-6">
        <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Reclik Inc.</p>
        <h1 className="font-display text-4xl text-[#171412] dark:text-[#F5F2EC]">Terms of Service</h1>
      </div>

      <div className="space-y-6 text-sm leading-relaxed text-[#575049] dark:text-[#A9A29A]">
        <p>
          By using Reclik, you represent that you are at least 18 years old and possess full rights to any portrait you
          upload. Generated results are AI-synthesized portraits intended for personal, editorial, and professional
          profile use.
        </p>
        <p>
          Free previews are limited to 3 per visitor and include a baked watermark. Single HD purchases ($3.00 USD) and
          12-Download Packs ($19.00 USD, valid 30 days) are processed via Razorpay. Unused pack credits expire 30 days
          from the purchase timestamp. Refunds are handled upon request through Support.
        </p>
      </div>
    </div>
  );
}

export function FaqPage() {
  const items = [
    {
      q: 'How long are my selfies stored?',
      a: 'Selfies are deleted immediately after your HD download finishes. If you only view previews and leave, an automated cleanup job purges everything within 24 hours.',
    },
    {
      q: 'Can I preview looks before creating an account?',
      a: 'Yes. Every visitor gets 3 free watermarked previews with no account or payment card required.',
    },
    {
      q: 'What happens if I sign up after generating a preview?',
      a: 'Your active selfie and preview are carried seamlessly into your new account so you can purchase and download without regenerating.',
    },
    {
      q: 'Are the portraits AI-generated?',
      a: 'Yes. All transformed looks are AI-generated from your reference selfie while preserving your natural facial identity.',
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14 space-y-8">
      <h1 className="font-display text-4xl text-[#171412] dark:text-[#F5F2EC]">Frequently Asked Questions</h1>
      <div className="divide-y divide-black/10 dark:divide-white/10">
        {items.map((it) => (
          <div key={it.q} className="py-5 space-y-2">
            <h2 className="text-base font-semibold text-[#171412] dark:text-[#F5F2EC]">{it.q}</h2>
            <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">{it.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('Billing & Refunds');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, topic, message }),
      });
      setSent(res.message);
      setName('');
      setEmail('');
      setMessage('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-14 space-y-6">
      <div>
        <h1 className="font-display text-4xl text-[#171412] dark:text-[#F5F2EC]">Contact Support</h1>
        <p className="text-sm text-[#575049] dark:text-[#A9A29A] mt-1">
          Questions about a receipt, refund, or data deletion request? Reach our team below.
        </p>
      </div>

      {sent ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-700 dark:text-emerald-300">
          {sent}
        </div>
      ) : (
        <form onSubmit={submit} className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Topic</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
            >
              <option>Billing &amp; Refunds</option>
              <option>Privacy &amp; Data Deletion</option>
              <option>Image Generation Quality</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Message</label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold cursor-pointer"
          >
            Send Message
          </button>
        </form>
      )}
    </div>
  );
}
