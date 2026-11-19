import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, setAuthToken } from '../lib/api';

export function AuthPage({ mode }: { mode: 'login' | 'signup' | 'reset' | 'admin_login' }) {
  const { navigate, refreshUser, boothProgress, user } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => user?.email || '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const res = await apiFetch<{ token?: string; message: string }>('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email,
            password,
            selfieId: boothProgress.selfieId,
            generationId: boothProgress.generationId,
          }),
        });
        if (res.token) setAuthToken(res.token);
        await refreshUser();
        navigate(boothProgress.generationId ? '/booth' : '/dashboard');
      } else if (mode === 'login' || mode === 'admin_login') {
        const res = await apiFetch<{ token?: string; user: { role: string } }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            selfieId: boothProgress.selfieId,
            generationId: boothProgress.generationId,
          }),
        });
        if (mode === 'admin_login') {
          if (res.user.role === 'super_admin' || res.user.role === 'support') {
            if (res.token) setAuthToken(res.token);
            await refreshUser();
            navigate('/admin');
          } else {
            await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
            setAuthToken(null);
            await refreshUser();
            setError('This account does not have admin permissions.');
          }
        } else {
          if (res.token) setAuthToken(res.token);
          await refreshUser();
          navigate(boothProgress.generationId ? '/booth' : '/dashboard');
        }
      } else if (mode === 'reset') {
        const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            email,
            currentPassword: password,
            newPassword,
          }),
        });
        setStatusMessage(res.message);
        setPassword('');
        setNewPassword('');
        setTimeout(() => navigate('/login'), 1200);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-7 space-y-6">
        <div className="space-y-1.5">
          {mode === 'admin_login' && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C59B27] dark:text-[#D4AF37]">
              <Lock className="w-3.5 h-3.5" />
              <span>Admin Operations Console</span>
            </div>
          )}
          <h1 className="font-display text-3xl text-[#171412] dark:text-[#F5F2EC]">
            {mode === 'signup'
              ? 'Create your Reclik account'
              : mode === 'reset'
              ? 'Change password'
              : mode === 'admin_login'
              ? 'Admin sign in'
              : 'Welcome back'}
          </h1>
          <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
            {mode === 'signup' && boothProgress.generationId
              ? 'Set your email and password directly (no OTP required)—your look preview is saved and ready.'
              : mode === 'signup'
              ? 'Set your email and password directly. No OTP or email verification code is sent.'
              : mode === 'reset'
              ? 'Update your password directly using your email and current password. No OTP is sent.'
              : mode === 'admin_login'
              ? 'Restricted to super admin and support team credentials.'
              : 'Sign in with your email and password to access credits and downloads.'}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <p>{statusMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Full name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-[#171412] dark:text-[#F5F2EC] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === 'admin_login' ? 'ntrs8899@gmail.com' : 'you@example.com'}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-[#171412] dark:text-[#F5F2EC] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">
              {mode === 'reset' ? 'Current password' : 'Password'}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-[#171412] dark:text-[#F5F2EC] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {mode === 'reset' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#171412] dark:text-[#F5F2EC]">New password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-[#171412] dark:text-[#F5F2EC] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {loading
              ? 'Please wait…'
              : mode === 'signup'
              ? 'Create Account'
              : mode === 'reset'
              ? 'Update Password'
              : 'Sign In'}
          </button>
        </form>

        <div className="pt-2 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#575049] dark:text-[#A9A29A]">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => navigate('/signup')} className="hover:underline cursor-pointer">
                Need an account? Sign up
              </button>
              <button type="button" onClick={() => navigate('/reset-password')} className="hover:underline cursor-pointer">
                Change password
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button type="button" onClick={() => navigate('/login')} className="hover:underline cursor-pointer">
              Already have an account? Sign in
            </button>
          )}
          {mode === 'reset' && (
            <>
              <button type="button" onClick={() => navigate('/login')} className="hover:underline cursor-pointer">
                Back to sign in
              </button>
              <button type="button" onClick={() => navigate('/contact')} className="hover:underline cursor-pointer">
                Need help? Contact support
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
