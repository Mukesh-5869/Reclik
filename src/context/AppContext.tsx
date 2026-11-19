import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { CheckoutRequest, Look, PublicSettings, QuotaInfo, User } from '../types';

interface BoothProgress {
  selfieId: string | null;
  selfieUrl: string | null;
  generationId: string | null;
  previewUrl: string | null;
  selectedLook: Look | null;
  isDemo: boolean;
}

interface AppContextValue {
  route: string;
  navigate: (path: string) => void;
  user: User | null;
  authLoaded: boolean;
  refreshUser: () => Promise<void>;
  settings: PublicSettings;
  refreshSettings: () => Promise<void>;
  quota: QuotaInfo;
  refreshQuota: () => Promise<void>;
  looks: Look[];
  refreshLooks: () => Promise<void>;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  boothProgress: BoothProgress;
  setBoothProgress: React.Dispatch<React.SetStateAction<BoothProgress>>;
  clearBoothProgress: () => void;
  checkoutRequest: CheckoutRequest | null;
  openCheckout: (req: CheckoutRequest) => void;
  closeCheckout: () => void;
}

const defaultSettings: PublicSettings = {
  brandName: 'Reclik',
  supportEmail: '',
  legalEntityName: 'Reclik Inc.',
  legalJurisdiction: 'United States',
  singlePriceUsd: 3,
  packPriceUsd: 19,
  packSize: 12,
  packValidityDays: 30,
  freePreviewLimit: 3,
  maxUploadMb: 10,
  checkoutCurrency: 'USD',
  razorpayCheckoutName: 'Reclik',
  razorpayThemeColor: '#D4AF37',
  maintenanceMode: false,
  razorpayConfigured: false,
};

const defaultProgress: BoothProgress = {
  selfieId: null,
  selfieUrl: null,
  generationId: null,
  previewUrl: null,
  selectedLook: null,
  isDemo: false,
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<string>(() => window.location.pathname || '/');
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [settings, setSettings] = useState<PublicSettings>(defaultSettings);
  const [quota, setQuota] = useState<QuotaInfo>({ limit: 3, used: 0, remaining: 3 });
  const [looks, setLooks] = useState<Look[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('boothie_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const [boothProgress, setBoothProgress] = useState<BoothProgress>(defaultProgress);
  const [checkoutRequest, setCheckoutRequest] = useState<CheckoutRequest | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      document.body.className = 'bg-[#0A0908] text-[#F5F2EC] antialiased selection:bg-[#D4AF37]/30';
    } else {
      root.classList.remove('dark');
      document.body.className = 'bg-[#F8F5EF] text-[#171412] antialiased selection:bg-[#C59B27]/25';
    }
    try {
      localStorage.setItem('boothie_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    const clean = path.startsWith('/') ? path : `/${path}`;
    if (clean !== window.location.pathname) {
      window.history.pushState({}, '', clean);
      setRoute(clean);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: User | null }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setAuthLoaded(true);
    }
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const q = await apiFetch<QuotaInfo>('/api/booth/quota');
      setQuota(q);
    } catch {
      // ignore
    }
  }, []);

  const refreshLooks = useCallback(async () => {
    try {
      const res = await apiFetch<{ looks: Look[] }>('/api/looks');
      setLooks(res.looks);
    } catch {
      // ignore
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await apiFetch<PublicSettings>('/api/settings/public');
      setSettings(s);
      if (s.brandName) {
        document.title = `${s.brandName} — Privacy-First AI Look Booth`;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshUser();
    refreshQuota();
    refreshLooks();
    refreshSettings();
  }, [refreshUser, refreshQuota, refreshLooks, refreshSettings]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const clearBoothProgress = useCallback(() => {
    setBoothProgress(defaultProgress);
  }, []);

  return (
    <AppContext.Provider
      value={{
        route,
        navigate,
        user,
        authLoaded,
        refreshUser,
        settings,
        refreshSettings,
        quota,
        refreshQuota,
        looks,
        refreshLooks,
        theme,
        toggleTheme,
        boothProgress,
        setBoothProgress,
        clearBoothProgress,
        checkoutRequest,
        openCheckout: setCheckoutRequest,
        closeCheckout: () => setCheckoutRequest(null),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
