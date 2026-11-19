import React, { useEffect, useState } from 'react';
import { Download, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, getAuthHeaders } from '../lib/api';

type AdminTab = 'overview' | 'looks' | 'users' | 'orders' | 'settings' | 'moderation' | 'privacy';

const THUMBNAIL_PRESETS = [
  { label: 'Executive Charcoal Studio', value: '/src/assets/images/look_exec_studio_1794987768967.jpg' },
  { label: 'Creative Founder Daylight', value: '/src/assets/images/look_creative_founder_1794987769987.jpg' },
  { label: 'Copper Blowout Waves', value: '/src/assets/images/look_copper_waves_1794987770331.jpg' },
  { label: 'Parisian Espresso Bob', value: '/src/assets/images/look_french_bob_1794987770376.jpg' },
  { label: '1970s Kodachrome Lounge', value: '/src/assets/images/look_vintage_70s_1794987771701.jpg' },
  { label: '1990s Studio Curtain Flash', value: '/src/assets/images/look_vintage_90s_1794987770168.jpg' },
  { label: 'Black-Tie Silk Evening', value: '/src/assets/images/look_glam_evening_1794987771123.jpg' },
  { label: 'SoHo Rain Trench Street', value: '/src/assets/images/look_streetwear_trench_1794987772489.jpg' },
];

export function AdminPage() {
  const { user, authLoaded, navigate, refreshLooks, refreshSettings, refreshQuota } = useApp();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Overview state
  const [overview, setOverview] = useState<any>(null);

  // Looks state
  const [adminLooks, setAdminLooks] = useState<any[]>([]);
  const [editingLook, setEditingLook] = useState<any | null>(null);
  const [newLookOpen, setNewLookOpen] = useState(false);
  const [lookForm, setLookForm] = useState({
    name: '',
    category: 'Professional',
    description: '',
    prompt: '',
    thumbnail_url: '/src/assets/images/look_exec_studio_1794987768967.jpg',
    sort_order: 13,
    is_featured: false,
  });

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Orders state
  const [orders, setOrders] = useState<any[]>([]);

  // Settings state
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});
  const [adminCreds, setAdminCreds] = useState({ id: '', email: '', password: '' });
  const [supportCreds, setSupportCreds] = useState({ id: '', email: '', password: '' });

  // Moderation state
  const [modLogs, setModLogs] = useState<any[]>([]);
  const [blocklist, setBlocklist] = useState<any[]>([]);
  const [blockForm, setBlockForm] = useState({ type: 'ip', value: '', reason: '' });

  // Privacy ops state
  const [privacyData, setPrivacyData] = useState<any>(null);

  const isSuper = user?.role === 'super_admin';

  useEffect(() => {
    if (authLoaded) {
      if (!user || (user.role !== 'super_admin' && user.role !== 'support')) {
        navigate('/admin/login');
      }
    }
  }, [authLoaded, user, navigate]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const loadTabData = async (targetTab: AdminTab) => {
    setError(null);
    try {
      if (targetTab === 'overview') {
        setOverview(await apiFetch('/api/admin/overview'));
      } else if (targetTab === 'looks') {
        const res = await apiFetch<{ looks: any[] }>('/api/admin/looks');
        setAdminLooks(res.looks);
      } else if (targetTab === 'users') {
        const res = await apiFetch<{ users: any[] }>(`/api/admin/users?q=${encodeURIComponent(userSearch)}`);
        setUsers(res.users);
      } else if (targetTab === 'orders') {
        const res = await apiFetch<{ orders: any[] }>('/api/admin/orders');
        setOrders(res.orders);
      } else if (targetTab === 'settings') {
        const res = await apiFetch<{
          settings: Record<string, string>;
          teamAccounts?: Array<{ id: string; role: string; email: string }>;
        }>('/api/admin/settings');
        setSysSettings(res.settings);
        const sa =
          res.teamAccounts?.find((a) => a.id === user?.id && a.role === 'super_admin') ||
          res.teamAccounts?.find((a) => a.role === 'super_admin');
        const sup = res.teamAccounts?.find((a) => a.role === 'support');
        if (sa) setAdminCreds({ id: sa.id, email: sa.email, password: '' });
        if (sup) setSupportCreds({ id: sup.id, email: sup.email, password: '' });
      } else if (targetTab === 'moderation') {
        const res = await apiFetch<{ logs: any[]; blocklist: any[] }>('/api/admin/moderation');
        setModLogs(res.logs);
        setBlocklist(res.blocklist);
      } else if (targetTab === 'privacy') {
        setPrivacyData(await apiFetch('/api/admin/privacy'));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data.');
    }
  };

  useEffect(() => {
    if (user && (user.role === 'super_admin' || user.role === 'support')) {
      loadTabData(tab);
    }
  }, [tab, user]);

  if (!user || (user.role !== 'super_admin' && user.role !== 'support')) return null;

  const tabs: Array<{ id: AdminTab; label: string }> = [
    { id: 'overview', label: 'Dashboard' },
    { id: 'looks', label: 'Looks' },
    { id: 'users', label: 'Users' },
    { id: 'orders', label: 'Orders' },
    { id: 'settings', label: 'Settings' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'privacy', label: 'Privacy Ops' },
  ];

  const handleSaveLookEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLook) return;
    try {
      await apiFetch(`/api/admin/looks/${editingLook.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editingLook),
      });
      setEditingLook(null);
      await loadTabData('looks');
      await refreshLooks();
      notify('Look updated immediately.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateLook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/looks', {
        method: 'POST',
        body: JSON.stringify(lookForm),
      });
      setNewLookOpen(false);
      setLookForm({
        name: '',
        category: 'Professional',
        description: '',
        prompt: '',
        thumbnail_url: '/src/assets/images/look_exec_studio_1794987768967.jpg',
        sort_order: 13,
        is_featured: false,
      });
      await loadTabData('looks');
      await refreshLooks();
      notify('New look added to catalog.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUserAction = async (userId: string, body: Record<string, any>, msg: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await loadTabData('users');
      notify(msg);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(sysSettings),
      });
      setSysSettings(res.settings);
      await Promise.all([refreshSettings(), refreshQuota()]);
      notify('All system settings saved and applied live.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetSettings = async () => {
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>('/api/admin/settings/reset', {
        method: 'POST',
      });
      setSysSettings(res.settings);
      await Promise.all([refreshSettings(), refreshQuota()]);
      notify('All settings restored to factory defaults.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch('/api/admin/orders/export.csv', {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Failed to export CSV.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reclik-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err: any) {
      setError(err.message || 'CSV export failed.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/10 dark:border-white/10">
        <div>
          <p className="text-xs font-mono text-[#C59B27] dark:text-[#D4AF37]">
            ROLE: {user.role.toUpperCase()} · {user.email}
          </p>
          <h1 className="font-display text-3xl text-[#171412] dark:text-[#F5F2EC] mt-0.5">Reclik Admin Console</h1>
        </div>
        <button
          type="button"
          onClick={() => loadTabData(tab)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium cursor-pointer self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.06]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              tab === t.id
                ? 'bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908]'
                : 'text-[#575049] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 1. OVERVIEW TAB */}
      {tab === 'overview' && overview && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-5">
              <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Revenue (Today / 7d / 30d)</p>
              <p className="font-mono text-xl font-semibold tabular-nums mt-1.5 text-[#171412] dark:text-[#F5F2EC]">
                ${overview.revenue.today.toFixed(0)} / ${overview.revenue.sevenDays.toFixed(0)} / $
                {overview.revenue.thirtyDays.toFixed(0)}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-5">
              <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Orders · Active Packs</p>
              <p className="font-mono text-xl font-semibold tabular-nums mt-1.5 text-[#171412] dark:text-[#F5F2EC]">
                {overview.ordersCount} · {overview.activePacks}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-5">
              <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Generations</p>
              <p className="font-mono text-xl font-semibold tabular-nums mt-1.5 text-[#171412] dark:text-[#F5F2EC]">
                {overview.generationsCount}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-5">
              <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Est. Model Cost</p>
              <p className="font-mono text-xl font-semibold tabular-nums mt-1.5 text-[#171412] dark:text-[#F5F2EC]">
                ${overview.costEstimateUsd.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Conversion Funnel */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
            <h2 className="font-display text-xl text-[#171412] dark:text-[#F5F2EC]">Conversion Funnel</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Visits', val: overview.funnel.visits },
                { label: 'Previews', val: overview.funnel.previews },
                { label: 'Sign-ups', val: overview.funnel.signups },
                { label: 'Purchases', val: overview.funnel.purchases },
              ].map((stepItem) => (
                <div key={stepItem.label} className="rounded-xl border border-black/10 dark:border-white/10 p-4">
                  <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">{stepItem.label}</p>
                  <p className="font-mono text-2xl font-semibold tabular-nums mt-1 text-[#171412] dark:text-[#F5F2EC]">
                    {stepItem.val}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 14-Day Bar Chart */}
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
            <h2 className="font-display text-xl text-[#171412] dark:text-[#F5F2EC]">14-Day Activity</h2>
            <div className="flex items-end gap-2 h-36 pt-4">
              {overview.dailySeries.map((d: any) => {
                const maxGen = Math.max(1, ...overview.dailySeries.map((x: any) => x.generations));
                const hPct = Math.max(6, Math.round((d.generations / maxGen) * 100));
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div
                      title={`${d.date}: ${d.generations} previews, $${d.revenueUsd.toFixed(2)}`}
                      className="w-full rounded-t bg-[#C59B27] dark:bg-[#D4AF37] transition-all"
                      style={{ height: `${hPct}%` }}
                    />
                    <span className="font-mono text-[10px] text-[#7A7168] dark:text-[#A9A29A]">{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. LOOKS TAB */}
      {tab === 'looks' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
              Prompt changes take effect immediately on the next booth generation.
            </p>
            {isSuper && (
              <button
                type="button"
                onClick={() => setNewLookOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Look</span>
              </button>
            )}
          </div>

          {newLookOpen && isSuper && (
            <form
              onSubmit={handleCreateLook}
              className="rounded-2xl border border-black/15 dark:border-white/15 bg-[#F2EDE3] dark:bg-[#141210] p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <input
                required
                placeholder="Look Name"
                value={lookForm.name}
                onChange={(e) => setLookForm({ ...lookForm, name: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <input
                required
                placeholder="Category (e.g. Professional)"
                value={lookForm.category}
                onChange={(e) => setLookForm({ ...lookForm, category: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <input
                placeholder="Short Description"
                value={lookForm.description}
                onChange={(e) => setLookForm({ ...lookForm, description: e.target.value })}
                className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <select
                value={lookForm.thumbnail_url}
                onChange={(e) => setLookForm({ ...lookForm, thumbnail_url: e.target.value })}
                className="px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
              >
                {THUMBNAIL_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    Preset: {p.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  placeholder="Sort Order"
                  value={lookForm.sort_order}
                  onChange={(e) => setLookForm({ ...lookForm, sort_order: Number(e.target.value) })}
                  className="w-24 px-3 py-2 text-xs font-mono rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lookForm.is_featured}
                    onChange={(e) => setLookForm({ ...lookForm, is_featured: e.target.checked })}
                    className="h-4 w-4 accent-[#D4AF37]"
                  />
                  <span>Featured Look</span>
                </label>
              </div>
              <textarea
                required
                rows={3}
                placeholder="Hidden AI generation prompt..."
                value={lookForm.prompt}
                onChange={(e) => setLookForm({ ...lookForm, prompt: e.target.value })}
                className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <div className="md:col-span-2 flex justify-end gap-2">
                <button type="button" onClick={() => setNewLookOpen(false)} className="px-3 py-1.5 text-xs cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
                >
                  Save Look
                </button>
              </div>
            </form>
          )}

          {editingLook && isSuper && (
            <form
              onSubmit={handleSaveLookEdit}
              className="rounded-2xl border border-[#D4AF37] bg-[#F2EDE3] dark:bg-[#141210] p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Editing: {editingLook.name}</h3>
                <button type="button" onClick={() => setEditingLook(null)} className="text-xs underline cursor-pointer">
                  Close
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  value={editingLook.name}
                  onChange={(e) => setEditingLook({ ...editingLook, name: e.target.value })}
                  placeholder="Name"
                  className="px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <input
                  value={editingLook.category}
                  onChange={(e) => setEditingLook({ ...editingLook, category: e.target.value })}
                  placeholder="Category"
                  className="px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <input
                  type="number"
                  value={editingLook.sort_order}
                  onChange={(e) => setEditingLook({ ...editingLook, sort_order: Number(e.target.value) })}
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
              </div>
              <input
                value={editingLook.description || ''}
                onChange={(e) => setEditingLook({ ...editingLook, description: e.target.value })}
                placeholder="Description"
                className="w-full px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <input
                  value={editingLook.thumbnail_url || ''}
                  onChange={(e) => setEditingLook({ ...editingLook, thumbnail_url: e.target.value })}
                  placeholder="Thumbnail URL"
                  className="px-3 py-2 text-xs font-mono rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingLook.is_featured)}
                    onChange={(e) => setEditingLook({ ...editingLook, is_featured: e.target.checked })}
                    className="h-4 w-4 accent-[#D4AF37]"
                  />
                  <span>Featured on catalog</span>
                </label>
              </div>
              <textarea
                rows={3}
                value={editingLook.prompt}
                onChange={(e) => setEditingLook({ ...editingLook, prompt: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
              >
                Update Prompt &amp; Metadata
              </button>
            </form>
          )}

          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]">
                <tr>
                  <th className="py-3 px-4 font-medium">Order</th>
                  <th className="py-3 px-4 font-medium">Look</th>
                  <th className="py-3 px-4 font-medium">Category</th>
                  <th className="py-3 px-4 font-medium">Uses</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {adminLooks.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{l.sort_order}</td>
                    <td className="py-2.5 px-4 font-medium text-[#171412] dark:text-[#F5F2EC]">{l.name}</td>
                    <td className="py-2.5 px-4">{l.category}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{l.usage_count}</td>
                    <td className="py-2.5 px-4">
                      {l.is_active ? 'Active' : 'Hidden'} {l.is_featured ? '· Featured' : ''}
                    </td>
                    <td className="py-2.5 px-4">
                      {isSuper ? (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setEditingLook(l)}
                            className="underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/looks/${l.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ is_active: !l.is_active }),
                              });
                              await loadTabData('looks');
                              await refreshLooks();
                            }}
                            className="underline cursor-pointer"
                          >
                            {l.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/looks/${l.id}`, { method: 'DELETE' });
                              await loadTabData('looks');
                              await refreshLooks();
                            }}
                            className="text-red-500 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#7A7168]">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. USERS TAB */}
      {tab === 'users' && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadTabData('users');
            }}
            className="flex gap-2 max-w-md"
          >
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search email or name…"
              className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
            >
              Search
            </button>
          </form>

          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]">
                <tr>
                  <th className="py-3 px-4 font-medium">User</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Credits</th>
                  <th className="py-3 px-4 font-medium">Pack Expiry</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4">
                      <p className="font-medium text-[#171412] dark:text-[#F5F2EC]">{u.name}</p>
                      <p className="text-[11px] text-[#7A7168]">{u.email}</p>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{u.role}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{u.credits}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      {u.pack_expires_at ? u.pack_expires_at.slice(0, 10) : '—'}
                    </td>
                    <td className="py-2.5 px-4">{u.suspended ? 'Suspended' : 'Active'}</td>
                    <td className="py-2.5 px-4">
                      {isSuper ? (
                        <div className="flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, { creditsDelta: 5, extendDays: 30 }, 'Granted 5 credits')}
                            className="underline cursor-pointer"
                          >
                            +5 Credits
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUserAction(u.id, { creditsDelta: -5 }, 'Revoked 5 credits')}
                            className="underline cursor-pointer"
                          >
                            -5 Credits
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUserAction(u.id, { suspended: !u.suspended }, u.suspended ? 'Unsuspended' : 'Suspended')
                            }
                            className="underline cursor-pointer"
                          >
                            {u.suspended ? 'Activate' : 'Suspend'}
                          </button>
                          {u.id !== user.id && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
                                await loadTabData('users');
                                notify('User deleted.');
                              }}
                              className="text-red-500 cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#7A7168]">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. ORDERS TAB */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03]">
                <tr>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Razorpay ID</th>
                  <th className="py-3 px-4 font-medium">Amount</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{o.created_at.slice(0, 10)}</td>
                    <td className="py-2.5 px-4">{o.user_email}</td>
                    <td className="py-2.5 px-4 font-mono">{o.razorpay_payment_id || o.razorpay_order_id}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">${(o.amount_usd_cents / 100).toFixed(2)} USD</td>
                    <td className="py-2.5 px-4 capitalize">{o.status}</td>
                    <td className="py-2.5 px-4 flex gap-3">
                      {o.status === 'paid' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/orders/${o.id}/refund`, { method: 'POST' });
                            await loadTabData('orders');
                            notify('Order refunded.');
                          }}
                          className="text-red-500 underline cursor-pointer"
                        >
                          Refund
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/orders/${o.id}/resend-receipt`, { method: 'POST' });
                          notify('Receipt re-sent.');
                        }}
                        className="underline cursor-pointer"
                      >
                        Resend Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. SETTINGS TAB */}
      {tab === 'settings' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            {/* Group 1: Brand, Domain & Storefront */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
              <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">
                Brand, Domain, CORS &amp; Email Sender
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'brand_name', label: 'Brand Name (Wordmark & Title)' },
                  { key: 'support_email', label: 'Support Email' },
                  { key: 'email_from_name', label: 'Transactional Email Sender Name' },
                  { key: 'email_from_address', label: 'Transactional Email From Address' },
                  { key: 'app_url', label: 'App Public URL (APP_URL)' },
                  { key: 'cors_origin', label: 'Allowed CORS Origins (comma-separated)' },
                  { key: 'legal_entity_name', label: 'Legal Entity Name (Footer)' },
                  { key: 'legal_jurisdiction', label: 'Legal Jurisdiction Label' },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">{f.label}</label>
                    <input
                      disabled={!isSuper}
                      value={sysSettings[f.key] ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Maintenance Mode</label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.maintenance_mode ?? 'false'}
                    onChange={(e) => setSysSettings({ ...sysSettings, maintenance_mode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="false">Disabled (Live)</option>
                    <option value="true">Enabled (Paused)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Group 2: Pricing, Packs & Quota */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
              <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">Pricing, Packs &amp; Free Quota</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { key: 'single_price_usd', label: 'Single Download Price' },
                  { key: 'pack_price_usd', label: 'Pack Price' },
                  { key: 'pack_size', label: 'Pack Size (Downloads)' },
                  { key: 'pack_validity_days', label: 'Pack Validity (Days)' },
                  { key: 'free_preview_limit', label: 'Free Previews Per Visitor' },
                  { key: 'checkout_currency', label: 'Checkout Currency (e.g. USD)' },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">{f.label}</label>
                    <input
                      disabled={!isSuper}
                      value={sysSettings[f.key] ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Group 2B: Razorpay Key ID & Webhooks */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">
                  Razorpay Key ID &amp; Webhooks
                </h2>
                <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
                  Configure your public Razorpay Key ID, checkout styling, and webhook event handling. Secret signing keys
                  remain strictly in server environment secrets.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Razorpay Public Key ID (rzp_test_… / rzp_live_…)
                  </label>
                  <input
                    disabled={!isSuper}
                    placeholder="rzp_test_..."
                    value={sysSettings.razorpay_key_id ?? ''}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_key_id: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Razorpay Checkout Mode</label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.razorpay_mode ?? 'auto'}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_mode: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="auto">Auto (Live when Key ID + Secret set, else Sandbox)</option>
                    <option value="sandbox">Force Test Sandbox</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Checkout Merchant Display Name
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.razorpay_checkout_name ?? 'Reclik'}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_checkout_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Checkout Theme Color
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.razorpay_theme_color ?? '#D4AF37'}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_theme_color: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Webhook Listener
                  </label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.razorpay_webhook_enabled ?? 'true'}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_webhook_enabled: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="true">Enabled (/api/payments/webhook)</option>
                    <option value="false">Disabled (Ignore Incoming Webhooks)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Handled Webhook Events (comma-separated)
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.razorpay_webhook_events ?? 'payment.captured,payment.failed'}
                    onChange={(e) => setSysSettings({ ...sysSettings, razorpay_webhook_events: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Webhook Endpoint URL (Register in Razorpay Dashboard)
                  </label>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${(sysSettings.app_url || window.location.origin).replace(/\/$/, '')}/api/payments/webhook`}
                      className="flex-1 px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.03] text-[#575049] dark:text-[#A9A29A]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${(sysSettings.app_url || window.location.origin).replace(/\/$/, '')}/api/payments/webhook`;
                        navigator.clipboard?.writeText(url);
                        notify('Webhook URL copied to clipboard.');
                      }}
                      className="px-3.5 py-2 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium cursor-pointer shrink-0"
                    >
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Group 3: Watermark, Upload & AI Output */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
              <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">Watermark, Upload &amp; AI Output</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Gemini Image Model</label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.generation_model ?? 'gemini-3.1-flash-lite-image'}
                    onChange={(e) => setSysSettings({ ...sysSettings, generation_model: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="gemini-3.1-flash-lite-image">gemini-3.1-flash-lite-image</option>
                    <option value="gemini-nano-banana-2.1">gemini-nano-banana-2.1</option>
                    <option value="gemini-3-pro-image">gemini-3-pro-image</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Selfie Safety &amp; 18+ Moderation
                  </label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.safety_moderation_enabled ?? 'true'}
                    onChange={(e) => setSysSettings({ ...sysSettings, safety_moderation_enabled: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="true">Enabled (Recommended)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                {[
                  { key: 'watermark_text', label: 'Watermark Text (Baked into Preview)' },
                  { key: 'watermark_opacity', label: 'Watermark Opacity (0.08 - 0.65)' },
                  { key: 'preview_max_px', label: 'Preview Max Dimension (px)' },
                  { key: 'hd_max_px', label: 'HD Clean Max Dimension (px)' },
                  { key: 'max_upload_mb', label: 'Max Selfie Upload Size (MB)' },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">{f.label}</label>
                    <input
                      disabled={!isSuper}
                      value={sysSettings[f.key] ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, [f.key]: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Group 4: Privacy, Retention & Rate Limits */}
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-4">
              <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">
                Privacy, Retention &amp; Rate Limits
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Auto-Purge Ceiling (Hours)
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.selfie_retention_hours ?? '24'}
                    onChange={(e) => setSysSettings({ ...sysSettings, selfie_retention_hours: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Download Link TTL (Minutes)
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.download_link_ttl_minutes ?? '5'}
                    onChange={(e) => setSysSettings({ ...sysSettings, download_link_ttl_minutes: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Hourly Generation Limit
                  </label>
                  <input
                    disabled={!isSuper}
                    value={sysSettings.rate_limit_per_hour ?? '30'}
                    onChange={(e) => setSysSettings({ ...sysSettings, rate_limit_per_hour: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-black/15 dark:border-white/15 bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
                    Delete Selfie Right After Download
                  </label>
                  <select
                    disabled={!isSuper}
                    value={sysSettings.auto_delete_after_download ?? 'true'}
                    onChange={(e) => setSysSettings({ ...sysSettings, auto_delete_after_download: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210]"
                  >
                    <option value="true">Enabled (Recommended)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
              </div>
            </div>

            {isSuper && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="px-4 py-2.5 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium text-[#575049] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer"
                >
                  Reset All Fields to Defaults
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
                >
                  Save All Settings
                </button>
              </div>
            )}
          </form>

          {/* Group 5: Admin & Support Team Login Credentials */}
          {isSuper && (
            <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-5">
              <div>
                <h2 className="font-display text-lg text-[#171412] dark:text-[#F5F2EC]">
                  Admin &amp; Support Account Credentials
                </h2>
                <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-0.5">
                  Update the Super Admin or Support sign-in email and password directly (leave password blank to keep current).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#171412] dark:text-[#F5F2EC]">Super Admin Account</p>
                  <input
                    type="email"
                    placeholder="Admin Email"
                    value={adminCreds.email}
                    onChange={(e) => setAdminCreds({ ...adminCreds, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
                  />
                  <input
                    type="password"
                    placeholder="New Password (min 8 chars, optional)"
                    value={adminCreds.password}
                    onChange={(e) => setAdminCreds({ ...adminCreds, password: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setError(null);
                        await apiFetch('/api/admin/team-credentials', {
                          method: 'PATCH',
                          body: JSON.stringify({ role: 'super_admin', ...adminCreds }),
                        });
                        setAdminCreds((c) => ({ ...c, password: '' }));
                        notify('Super Admin credentials updated.');
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
                  >
                    Update Super Admin
                  </button>
                </div>

                <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3">
                  <p className="text-xs font-semibold text-[#171412] dark:text-[#F5F2EC]">Support Role Account</p>
                  <input
                    type="email"
                    placeholder="Support Email"
                    value={supportCreds.email}
                    onChange={(e) => setSupportCreds({ ...supportCreds, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
                  />
                  <input
                    type="password"
                    placeholder="New Password (min 8 chars, optional)"
                    value={supportCreds.password}
                    onChange={(e) => setSupportCreds({ ...supportCreds, password: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setError(null);
                        await apiFetch('/api/admin/team-credentials', {
                          method: 'PATCH',
                          body: JSON.stringify({ role: 'support', ...supportCreds }),
                        });
                        setSupportCreds((c) => ({ ...c, password: '' }));
                        notify('Support credentials updated.');
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
                  >
                    Update Support Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. MODERATION TAB */}
      {tab === 'moderation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
              <span>IP &amp; Device Blocklist</span>
            </div>
            {isSuper && (
              <div className="flex flex-wrap gap-2">
                <select
                  value={blockForm.type}
                  onChange={(e) => setBlockForm({ ...blockForm, type: e.target.value })}
                  className="px-2.5 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                >
                  <option value="ip">IP</option>
                  <option value="fingerprint">Fingerprint</option>
                </select>
                <input
                  placeholder="Value"
                  value={blockForm.value}
                  onChange={(e) => setBlockForm({ ...blockForm, value: e.target.value })}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <input
                  placeholder="Reason"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/admin/blocklist', { method: 'POST', body: JSON.stringify(blockForm) });
                    setBlockForm({ type: 'ip', value: '', reason: '' });
                    await loadTabData('moderation');
                  }}
                  className="px-3 py-2 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
                >
                  Block
                </button>
              </div>
            )}
            <div className="divide-y divide-black/10 dark:divide-white/10 text-xs">
              {blocklist.length === 0 ? (
                <p className="py-3 text-[#7A7168]">No blocked IPs or fingerprints.</p>
              ) : (
                blocklist.map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold">{b.type}: {b.value}</span>
                      <p className="text-[#7A7168]">{b.reason}</p>
                    </div>
                    {isSuper && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/blocklist/${b.id}`, { method: 'DELETE' });
                          await loadTabData('moderation');
                        }}
                        className="text-red-500 cursor-pointer"
                      >
                        Unblock
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-3">
            <h3 className="text-sm font-semibold">NSFW / Safety Filter Log</h3>
            <div className="divide-y divide-black/10 dark:divide-white/10 text-xs max-h-80 overflow-y-auto">
              {modLogs.length === 0 ? (
                <p className="py-3 text-[#7A7168]">No flagged uploads recorded.</p>
              ) : (
                modLogs.map((m) => (
                  <div key={m.id} className="py-2.5">
                    <p className="font-mono text-[11px] text-[#7A7168]">
                      {m.created_at.slice(0, 19)} · {m.ip_address}
                    </p>
                    <p className="mt-0.5">{m.reason}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. PRIVACY OPS TAB */}
      {tab === 'privacy' && privacyData && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Active Temporary Selfies</p>
                <p className="font-mono text-2xl font-semibold tabular-nums mt-1">{privacyData.activeSelfies}</p>
              </div>
              <div>
                <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">Total Files Purged</p>
                <p className="font-mono text-2xl font-semibold tabular-nums mt-1">{privacyData.totalPurged}</p>
              </div>
            </div>
            {isSuper && (
              <button
                type="button"
                onClick={async () => {
                  const r = await apiFetch<{ filesPurged: number }>('/api/admin/privacy/purge', { method: 'POST' });
                  await loadTabData('privacy');
                  notify(`Manual sweep purged ${r.filesPurged} expired files.`);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Run Manual 24h Purge</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-3">
              <h3 className="text-sm font-semibold">Cleanup Job Runs</h3>
              <div className="divide-y divide-black/10 dark:divide-white/10 text-xs max-h-72 overflow-y-auto">
                {privacyData.cleanupRuns.map((c: any) => (
                  <div key={c.id} className="py-2 flex justify-between font-mono">
                    <span>{c.ran_at.slice(0, 19)} · {c.trigger_type}</span>
                    <span>{c.files_purged} files</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 dark:border-white/10 p-5 space-y-3">
              <h3 className="text-sm font-semibold">Admin Audit Log</h3>
              <div className="divide-y divide-black/10 dark:divide-white/10 text-xs max-h-72 overflow-y-auto">
                {privacyData.auditLogs.length === 0 ? (
                  <p className="py-3 text-[#7A7168]">No admin actions recorded yet.</p>
                ) : (
                  privacyData.auditLogs.map((a: any) => (
                    <div key={a.id} className="py-2">
                      <p className="font-mono text-[11px] text-[#7A7168]">
                        {a.created_at.slice(0, 19)} · {a.admin_email} · {a.action}
                      </p>
                      <p>{a.target} — {a.details}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
