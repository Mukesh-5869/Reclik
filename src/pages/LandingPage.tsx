import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Camera, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Look } from '../types';

const HERO_STRIP_FRAMES = [
  {
    src: '/src/assets/images/hero_selfie_original_1794987768373.jpg',
    label: '01 · Original Selfie',
  },
  {
    src: '/src/assets/images/look_exec_studio_1794987768967.jpg',
    label: '02 · Executive Charcoal',
  },
  {
    src: '/src/assets/images/look_copper_waves_1794987770331.jpg',
    label: '03 · Copper Blowout',
  },
  {
    src: '/src/assets/images/look_vintage_90s_1794987770168.jpg',
    label: '04 · 1990s Curtain Flash',
  },
];

export function LandingPage() {
  const { navigate, looks, settings } = useApp();
  const [activeFrame, setActiveFrame] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  useEffect(() => {
    const id = setInterval(() => {
      setActiveFrame((prev) => (prev === 3 ? 1 : prev + 1));
    }, 3200);
    return () => clearInterval(id);
  }, []);

  const categories = ['All', ...Array.from(new Set(looks.map((l) => l.category)))];
  const visibleLooks = categoryFilter === 'All' ? looks : looks.filter((l) => l.category === categoryFilter);

  const handleSelectSampleLook = (look: Look) => {
    navigate(`/booth?look=${encodeURIComponent(look.id)}`);
  };

  return (
    <div className="booth-grain">
      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-14 md:pt-20 md:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left Typography Column */}
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div className="space-y-6">
              <p className="text-xs font-medium tracking-wide text-[#7A7168] dark:text-[#A9A29A]">
                Private AI Portrait Studio · United States (18+)
              </p>

              <h1 className="font-display text-[clamp(2.35rem,4.4vw,3.9rem)] leading-[1.08] tracking-tight text-[#171412] dark:text-[#F5F2EC] [text-wrap:balance]">
                One selfie. Twelve studio-grade transformations.
              </h1>

              <p className="text-base sm:text-lg leading-relaxed text-[#575049] dark:text-[#A9A29A] max-w-xl">
                Step inside a modern digital photo booth. Preview hairstyles, tailored executive headshots, and
                analog film eras on your own face—then watch your selfie delete itself the instant your HD print
                downloads.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/booth')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <span>Try Free — {settings.freePreviewLimit} Previews</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/pricing')}
                  className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl border border-black/15 dark:border-white/15 text-sm font-medium text-[#171412] dark:text-[#F5F2EC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  View Pricing
                </button>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#575049] dark:text-[#A9A29A]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#C59B27] dark:text-[#D4AF37]" />
                No account needed for 3 free previews
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-[#C59B27] dark:text-[#D4AF37]" />
                Auto-deleted right after download
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#C59B27] dark:text-[#D4AF37]" />
                Zero AI model training
              </span>
            </div>
          </div>

          {/* Right Animated Photo-Booth Strip */}
          <div className="lg:col-span-6 flex items-stretch">
            <div className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-[#ECE6DA] dark:bg-[#141210] p-4 sm:p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-[#575049] dark:text-[#A9A29A] pb-3 border-b border-black/10 dark:border-white/10">
                <span className="font-mono">RECLIK STRIP · SAMPLE SESSION</span>
                <span>Before / After</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 my-4">
                {/* Original frame */}
                <div className="space-y-2">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/10">
                    <img
                      src={HERO_STRIP_FRAMES[0].src}
                      alt="Sample original daylight selfie"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-xs font-medium text-[#575049] dark:text-[#A9A29A] font-mono">
                    {HERO_STRIP_FRAMES[0].label}
                  </p>
                </div>

                {/* Animated Look Output Frame */}
                <div className="space-y-2">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-[#C59B27]/50 dark:border-[#D4AF37]/50 bg-black/10">
                    {HERO_STRIP_FRAMES.slice(1).map((frame, idx) => {
                      const frameIndex = idx + 1;
                      const isActive = activeFrame === frameIndex;
                      return (
                        <motion.img
                          key={frame.src}
                          src={frame.src}
                          alt={frame.label}
                          referrerPolicy="no-referrer"
                          initial={false}
                          animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 1.03 }}
                          transition={{ duration: 0.45 }}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#171412] dark:text-[#F5F2EC] font-mono truncate">
                      {HERO_STRIP_FRAMES[activeFrame].label}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {[1, 2, 3].map((i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`Preview look ${i}`}
                          onClick={() => setActiveFrame(i)}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            activeFrame === i
                              ? 'w-5 bg-[#C59B27] dark:bg-[#D4AF37]'
                              : 'w-2 bg-black/20 dark:bg-white/20'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between text-xs text-[#575049] dark:text-[#A9A29A]">
                <span>Sample AI-generated portraits</span>
                <button
                  type="button"
                  onClick={() => navigate('/booth')}
                  className="font-semibold text-[#171412] dark:text-[#D4AF37] hover:underline cursor-pointer"
                >
                  Open Booth →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Studio Facts Strip */}
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4 border-y border-black/10 dark:border-white/10 py-6">
          <div>
            <p className="font-mono text-xl sm:text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              {settings.freePreviewLimit} Free
            </p>
            <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-1">Watermarked previews, no sign-up</p>
          </div>
          <div>
            <p className="font-mono text-xl sm:text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              ${settings.singlePriceUsd.toFixed(2)}
            </p>
            <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-1">Single clean HD download</p>
          </div>
          <div>
            <p className="font-mono text-xl sm:text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              ${(settings.packPriceUsd / settings.packSize).toFixed(2)} / look
            </p>
            <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-1">
              {settings.packSize}-pack (${settings.packPriceUsd} · {settings.packValidityDays} days)
            </p>
          </div>
          <div>
            <p className="font-mono text-xl sm:text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              0 sec
            </p>
            <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-1">Selfie retention after HD download</p>
          </div>
        </div>
      </section>

      {/* Looks Catalog Section */}
      <section id="looks-gallery" className="mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="space-y-2">
            <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-[#171412] dark:text-[#F5F2EC]">
              Curated Look Catalog
            </h2>
            <p className="text-sm sm:text-base text-[#575049] dark:text-[#A9A29A] max-w-xl">
              Twelve editorial looks across four signature aesthetics. Select any look to enter the booth.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.06]">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908]'
                    : 'text-[#575049] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleLooks.map((look) => (
            <motion.button
              key={look.id}
              type="button"
              whileHover={{ y: -4 }}
              transition={{ duration: 0.18 }}
              onClick={() => handleSelectSampleLook(look)}
              className="group text-left rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-[#1B1815]">
                <img
                  src={look.thumbnail_url}
                  alt={`${look.name} sample portrait`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-xs text-white/90">
                  <span>{look.category}</span>
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity font-medium text-[#D4AF37]">
                    Try Look →
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-1.5">
                <h3 className="font-semibold text-base text-[#171412] dark:text-[#F5F2EC]">{look.name}</h3>
                <p className="text-xs leading-relaxed text-[#575049] dark:text-[#A9A29A] line-clamp-2">
                  {look.description}
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* Privacy & Biometric Commitment Section */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 border-t border-black/10 dark:border-white/10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5 space-y-3">
            <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Biometric Privacy First</p>
            <h2 className="font-display text-3xl tracking-tight text-[#171412] dark:text-[#F5F2EC] [text-wrap:balance]">
              Built to forget your face the moment you leave.
            </h2>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2 pb-4 border-b border-black/10 dark:border-white/10 sm:border-b-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">
                <Trash2 className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37]" />
                <span>Instant Post-Download Purge</span>
              </div>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
                Your original selfie, EXIF metadata, and intermediate previews are permanently unlinked from private
                storage right after your HD file downloads.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">
                <Camera className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37]" />
                <span>24-Hour Safety Net</span>
              </div>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
                Every unpurchased preview and temporary selfie is automatically swept every 15 minutes and wiped within
                24 hours.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">
                <Lock className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37]" />
                <span>Private Storage & Signed Links</span>
              </div>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
                Clean HD portraits are never exposed to public buckets or sent to the browser before purchase. Downloads
                use single-use signed tokens.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">
                <ShieldCheck className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37]" />
                <span>US Biometric Compliance (18+)</span>
              </div>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] leading-relaxed">
                Explicit consent before capture, zero AI training on customer photos, and one-click full data deletion
                for Illinois BIPA, Texas CUBI, and Washington residents.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
