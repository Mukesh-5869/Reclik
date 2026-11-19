import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function Navbar() {
  const { route, navigate, user, settings } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const go = (path: string) => {
    setMobileOpen(false);
    navigate(path);
  };

  const navItems = [
    { label: 'Studio', path: '/booth' },
    { label: 'Looks', path: '/#looks-gallery' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Privacy', path: '/privacy' },
  ];

  const handleNavClick = (path: string) => {
    setMobileOpen(false);
    if (path.startsWith('/#')) {
      const id = path.slice(2);
      if (route !== '/') {
        navigate('/');
        setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    navigate(path);
  };

  const isAdmin = user && (user.role === 'super_admin' || user.role === 'support');

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-[#F8F5EF]/90 dark:bg-[#0A0908]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 py-4">
        {/* Zone 1: Brand wordmark (single text element) */}
        <button
          type="button"
          onClick={() => go('/')}
          className="font-display text-2xl font-semibold tracking-tight text-[#171412] dark:text-[#F5F2EC] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
        >
          {settings.brandName || 'Reclik'}
        </button>

        {/* Zone 2: Clean single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#575049] dark:text-[#A9A29A]">
          {navItems.map((item) => {
            const active = route === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNavClick(item.path)}
                className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#171412] dark:hover:text-[#F5F2EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  active ? 'text-[#171412] dark:text-[#F5F2EC] underline underline-offset-8 decoration-[#C59B27] dark:decoration-[#D4AF37]' : ''
                }`}
              >
                {item.label}
              </button>
            );
          })}
          {isAdmin && (
            <button
              type="button"
              onClick={() => go('/admin')}
              className={`whitespace-nowrap shrink-0 cursor-pointer transition-colors hover:text-[#171412] dark:hover:text-[#F5F2EC] ${
                route === '/admin' ? 'text-[#C59B27] dark:text-[#D4AF37]' : ''
              }`}
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => go(isAdmin ? '/admin' : '/dashboard')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              {isAdmin ? 'Admin Console' : `Account · ${user.credits} left`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go('/booth')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              Try Free
            </button>
          )}

          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-black/15 dark:border-white/15 text-[#171412] dark:text-[#F5F2EC] cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-black/10 dark:border-white/10 bg-[#F8F5EF] dark:bg-[#0A0908] px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavClick(item.path)}
              className="block w-full text-left py-2.5 px-2 text-sm font-medium text-[#171412] dark:text-[#F5F2EC] cursor-pointer"
            >
              {item.label}
            </button>
          ))}
          {user ? (
            <button
              type="button"
              onClick={() => go('/dashboard')}
              className="block w-full text-left py-2.5 px-2 text-sm font-semibold text-[#C59B27] dark:text-[#D4AF37] cursor-pointer"
            >
              Dashboard ({user.credits} credits left)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go('/login')}
              className="block w-full text-left py-2.5 px-2 text-sm font-medium text-[#575049] dark:text-[#A9A29A] cursor-pointer"
            >
              Sign In
            </button>
          )}
          <button
            type="button"
            onClick={() => go('/booth')}
            className="w-full mt-2 py-2.5 px-4 text-sm font-semibold rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] cursor-pointer"
          >
            Open Photo Booth
          </button>
        </div>
      )}
    </header>
  );
}
