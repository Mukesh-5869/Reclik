import { Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function PricingPage() {
  const { settings, user, openCheckout, navigate } = useApp();
  const perLook = (settings.packPriceUsd / Math.max(1, settings.packSize)).toFixed(2);

  const handleBuy = (planType: 'single' | 'pack_12') => {
    if (!user) {
      navigate('/signup');
      return;
    }
    openCheckout({
      planType,
      onSuccess: () => navigate('/booth'),
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 space-y-16">
      <div className="max-w-2xl space-y-3">
        <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Transparent USD Pricing</p>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tight text-[#171412] dark:text-[#F5F2EC] [text-wrap:balance]">
          Preview free. Pay only for clean HD portraits.
        </h1>
        <p className="text-base text-[#575049] dark:text-[#A9A29A]">
          Every visitor receives {settings.freePreviewLimit} watermarked previews before creating an account. No
          subscriptions or auto-renewals.
        </p>
      </div>

      {/* 3 Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Free Tier */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Try Before You Buy</p>
              <h2 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">Free Previews</h2>
            </div>
            <p className="font-mono text-3xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              $0.00 <span className="text-xs font-normal text-[#7A7168] dark:text-[#A9A29A]">USD</span>
            </p>
            <ul className="space-y-2.5 text-sm text-[#575049] dark:text-[#A9A29A] pt-2">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>{settings.freePreviewLimit} watermarked previews (max 768px)</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>No sign-up or credit card required</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Full before/after comparison slider</span>
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => navigate('/booth')}
            className="w-full py-3 px-4 rounded-xl border border-black/15 dark:border-white/15 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
          >
            Try Free in Booth
          </button>
        </div>

        {/* Single Download */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">One-Time Portrait</p>
              <h2 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">Single Download</h2>
            </div>
            <p className="font-mono text-3xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              ${settings.singlePriceUsd.toFixed(2)}{' '}
              <span className="text-xs font-normal text-[#7A7168] dark:text-[#A9A29A]">USD</span>
            </p>
            <ul className="space-y-2.5 text-sm text-[#575049] dark:text-[#A9A29A] pt-2">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>1 clean HD download, zero watermark</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Up to 2048px studio resolution</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Instant selfie deletion after download</span>
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => handleBuy('single')}
            className="w-full py-3 px-4 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-white/10 dark:text-[#F5F2EC] text-sm font-semibold hover:opacity-90 cursor-pointer"
          >
            {user ? `Buy Single — $${settings.singlePriceUsd.toFixed(2)}` : 'Sign up & Buy Single'}
          </button>
        </div>

        {/* 12-Download Pack */}
        <div className="rounded-2xl border-2 border-[#C59B27] dark:border-[#D4AF37] bg-[#EFE8DA] dark:bg-[#191612] p-7 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#C59B27] dark:text-[#D4AF37]">
                Pack best value: ${perLook} per look
              </p>
              <h2 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">
                {settings.packSize}-Download Pack
              </h2>
            </div>
            <p className="font-mono text-3xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              ${settings.packPriceUsd.toFixed(2)}{' '}
              <span className="text-xs font-normal text-[#7A7168] dark:text-[#A9A29A]">
                USD · {settings.packValidityDays} days
              </span>
            </p>
            <ul className="space-y-2.5 text-sm text-[#575049] dark:text-[#A9A29A] pt-2">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>{settings.packSize} clean HD unwatermarked downloads</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Valid {settings.packValidityDays} days from purchase date</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Mix hairstyles, headshots &amp; vintage looks</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37] shrink-0 mt-0.5" />
                <span>Receipt emailed immediately via Razorpay</span>
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => handleBuy('pack_12')}
            className="w-full py-3 px-4 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold hover:opacity-90 cursor-pointer"
          >
            {user ? `Buy ${settings.packSize}-Pack — $${settings.packPriceUsd.toFixed(2)}` : 'Sign up & Buy Pack'}
          </button>
        </div>
      </div>

      {/* Comparison & Pricing FAQ */}
      <div className="border-t border-black/10 dark:border-white/10 pt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-2">
          <h3 className="font-semibold text-base text-[#171412] dark:text-[#F5F2EC]">
            Do unused pack credits roll over after {settings.packValidityDays} days?
          </h3>
          <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
            No. To keep compute pricing simple without recurring subscriptions, pack credits expire{' '}
            {settings.packValidityDays} days after purchase. Your active credit count and exact expiry date are always
            shown in your account dashboard.
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-base text-[#171412] dark:text-[#F5F2EC]">
            Is my selfie kept if I buy a 12-download pack?
          </h3>
          <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
            Your selfie is automatically deleted as soon as you download an HD portrait (or after 24 hours if
            undownloaded). You can upload a fresh selfie anytime within your {settings.packValidityDays}-day pack window.
          </p>
        </div>
      </div>
    </div>
  );
}
