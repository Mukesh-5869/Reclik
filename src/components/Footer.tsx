import { Moon, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Footer() {
  const { navigate, theme, toggleTheme, settings } = useApp();
  const brand = settings.brandName || 'Reclik';

  return (
    <footer className="border-t border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#0D0C0A] text-[#575049] dark:text-[#A9A29A]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-black/10 dark:border-white/10">
          <div className="md:col-span-2 space-y-3">
            <span className="font-display text-xl font-semibold text-[#171412] dark:text-[#F5F2EC]">{brand}</span>
            <p className="text-sm leading-relaxed max-w-md">
              Privacy-first AI portrait studio. Portraits are AI-generated from your single reference selfie, never
              used to train models, and automatically deleted after download or within 24 hours.
            </p>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="font-semibold text-[#171412] dark:text-[#F5F2EC]">Studio</p>
            <div className="flex flex-col items-start gap-2">
              <button type="button" onClick={() => navigate('/booth')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Launch Booth
              </button>
              <button type="button" onClick={() => navigate('/pricing')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Pricing (USD)
              </button>
              <button type="button" onClick={() => navigate('/login')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Sign In / Account
              </button>
              <button type="button" onClick={() => navigate('/admin/login')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Admin Access
              </button>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <p className="font-semibold text-[#171412] dark:text-[#F5F2EC]">Trust & Legal</p>
            <div className="flex flex-col items-start gap-2">
              <button type="button" onClick={() => navigate('/privacy')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Biometric Privacy Policy
              </button>
              <button type="button" onClick={() => navigate('/terms')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Terms of Service
              </button>
              <button type="button" onClick={() => navigate('/faq')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                FAQ
              </button>
              <button type="button" onClick={() => navigate('/contact')} className="hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer">
                Contact Support
              </button>
            </div>
          </div>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span>© {new Date().getFullYear()} {settings.legalEntityName || `${brand} Inc.`}</span>
            <span aria-hidden="true">·</span>
            <span>{settings.legalJurisdiction || 'United States'} (18+)</span>
            <span aria-hidden="true">·</span>
            <span>Results are AI-generated</span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-black/15 dark:border-white/15 text-[#171412] dark:text-[#F5F2EC] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{theme === 'dark' ? 'Warm Ivory Mode' : 'Dark Studio Mode'}</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
