import { useEffect, useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, setAuthToken } from '../lib/api';

export function DashboardPage() {
  const { user, authLoaded, navigate, refreshUser, openCheckout, settings, clearBoothProgress } = useApp();
  const [orders, setOrders] = useState<any[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [saveGallery, setSaveGallery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (authLoaded && !user) {
      navigate('/login');
      return;
    }
    if (user) {
      setSaveGallery(Boolean(user.save_to_gallery_default));
      apiFetch<{ orders: any[]; downloads: any[] }>('/api/user/dashboard')
        .then((res) => {
          setOrders(res.orders);
          setDownloads(res.downloads);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [authLoaded, user, navigate]);

  const handleToggleGallery = async (next: boolean) => {
    setSaveGallery(next);
    await apiFetch('/api/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ saveToGalleryDefault: next }),
    }).catch(() => {});
    await refreshUser();
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    await refreshUser();
    navigate('/');
  };

  const handleDeleteAllData = async () => {
    await apiFetch('/api/user/data', { method: 'DELETE' });
    setAuthToken(null);
    clearBoothProgress();
    await refreshUser();
    navigate('/');
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-black/10 dark:border-white/10">
        <div>
          <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">{user.email}</p>
          <h1 className="font-display text-3xl sm:text-4xl text-[#171412] dark:text-[#F5F2EC] mt-0.5">
            {user.name}&apos;s Studio
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/booth')}
            className="px-4 py-2 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
          >
            Open Photo Booth
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium text-[#575049] dark:text-[#A9A29A] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Credits & Expiry Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Active HD Credits</p>
            <p className="font-mono text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              {user.credits} downloads left
              {user.pack_expires_at && user.credits > 0
                ? `, expires on ${new Date(user.pack_expires_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}`
                : ''}
            </p>
            <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
              Pack credits apply to any look in the studio catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCheckout({ planType: 'pack_12', onSuccess: () => refreshUser() })}
            className="px-4 py-2.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Add {settings.packSize}-Pack (${settings.packPriceUsd})
          </button>
        </div>

        {/* Privacy Preference (OFF by default) */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-3">
          <p className="text-xs font-semibold text-[#171412] dark:text-[#F5F2EC]">Gallery Retention</p>
          <label className="flex items-start gap-2.5 text-xs text-[#575049] dark:text-[#A9A29A] cursor-pointer">
            <input
              type="checkbox"
              checked={saveGallery}
              onChange={(e) => handleToggleGallery(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#D4AF37]"
            />
            <span>
              Keep my final HD output after download (OFF by default; selfies still delete immediately).
            </span>
          </label>
        </div>
      </div>

      {/* Purchase & Download Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-3">
          <h2 className="font-display text-xl text-[#171412] dark:text-[#F5F2EC]">Purchase History</h2>
          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            {loading ? (
              <p className="p-4 text-xs text-[#7A7168]">Loading…</p>
            ) : orders.length === 0 ? (
              <p className="p-5 text-xs text-[#7A7168] dark:text-[#A9A29A]">No purchases yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] text-[#7A7168] dark:text-[#A9A29A]">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Plan</th>
                    <th className="py-2.5 px-4 font-medium">Amount</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{o.created_at.slice(0, 10)}</td>
                      <td className="py-2.5 px-4">{o.plan_type === 'pack_12' ? '12-Pack' : 'Single'}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums">${(o.amount_usd_cents / 100).toFixed(2)}</td>
                      <td className="py-2.5 px-4 capitalize">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-xl text-[#171412] dark:text-[#F5F2EC]">Download Log</h2>
          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
            {loading ? (
              <p className="p-4 text-xs text-[#7A7168]">Loading…</p>
            ) : downloads.length === 0 ? (
              <p className="p-5 text-xs text-[#7A7168] dark:text-[#A9A29A]">No HD downloads yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] text-[#7A7168] dark:text-[#A9A29A]">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Look</th>
                    <th className="py-2.5 px-4 font-medium">Selfie Purge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/10">
                  {downloads.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2.5 px-4 font-mono tabular-nums">{d.created_at.slice(0, 10)}</td>
                      <td className="py-2.5 px-4">{d.look_name}</td>
                      <td className="py-2.5 px-4">{d.selfie_deleted ? 'Deleted' : 'Pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Delete My Data */}
      <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">Delete my account &amp; data</h3>
          <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
            Permanently erases your user record, download history, and any stored portraits immediately.
          </p>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/40 text-xs font-semibold text-red-600 dark:text-red-400 cursor-pointer shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete My Data</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDeleteAllData}
              className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
            >
              Confirm Permanent Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-2 text-xs text-[#575049] dark:text-[#A9A29A] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
