import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

export function CookieBanner() {
  const { navigate } = useApp();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem('boothie_cookie_ack')) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem('boothie_cookie_ack', '1');
    } catch {
      // ignore
    }
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-30 max-w-sm rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF]/95 dark:bg-[#141210]/95 backdrop-blur-md p-4 shadow-xl">
      <p className="text-xs leading-relaxed text-[#575049] dark:text-[#A9A29A]">
        Reclik uses strictly necessary session cookies for your 3 free previews and authentication. All portrait
        transformations are AI-generated and selfies auto-delete after download.{' '}
        <button
          type="button"
          onClick={() => navigate('/privacy')}
          className="underline text-[#171412] dark:text-[#F5F2EC] cursor-pointer"
        >
          Privacy Policy
        </button>
        .
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="px-3.5 py-1.5 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
