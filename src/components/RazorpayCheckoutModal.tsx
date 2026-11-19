import { useEffect, useState } from 'react';
import { CreditCard, Lock, ShieldCheck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/api';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function RazorpayCheckoutModal() {
  const { checkoutRequest, closeCheckout, user, settings, refreshUser, navigate } = useApp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxOrder, setSandboxOrder] = useState<{
    razorpayOrderId: string;
    amountCents: number;
    planType: string;
  } | null>(null);

  useEffect(() => {
    setError(null);
    setSandboxOrder(null);
  }, [checkoutRequest]);

  if (!checkoutRequest) return null;

  const isPack = checkoutRequest.planType === 'pack_12';
  const priceUsd = isPack ? settings.packPriceUsd : settings.singlePriceUsd;

  const startPayment = async () => {
    if (!user) {
      closeCheckout();
      navigate('/signup');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const order = await apiFetch<{
        orderId: string;
        razorpayOrderId: string;
        amountCents: number;
        currency: string;
        keyId: string;
        mode: 'razorpay' | 'sandbox';
      }>('/api/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({
          planType: checkoutRequest.planType,
          generationId: checkoutRequest.generationId,
        }),
      });

      if (order.mode === 'razorpay') {
        // Load official Razorpay checkout script dynamically
        if (!window.Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
            document.body.appendChild(script);
          });
        }

        const rzp = new window.Razorpay({
          key: order.keyId,
          amount: order.amountCents,
          currency: order.currency || settings.checkoutCurrency || 'USD',
          name: settings.razorpayCheckoutName || 'Reclik',
          description: isPack ? `${settings.packSize}-Download Look Pack` : 'Single HD Portrait Download',
          order_id: order.razorpayOrderId,
          prefill: { name: user.name, email: user.email },
          theme: { color: settings.razorpayThemeColor || '#D4AF37' },
          handler: async (resp: any) => {
            try {
              await apiFetch('/api/payments/verify', {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: resp.razorpay_order_id,
                  razorpay_payment_id: resp.razorpay_payment_id,
                  razorpay_signature: resp.razorpay_signature,
                }),
              });
              await refreshUser();
              const cb = checkoutRequest.onSuccess;
              closeCheckout();
              cb?.();
            } catch (verifyErr: any) {
              setError(verifyErr.message || 'Verification failed.');
            }
          },
        });
        rzp.open();
      } else {
        setSandboxOrder({
          razorpayOrderId: order.razorpayOrderId,
          amountCents: order.amountCents,
          planType: checkoutRequest.planType,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Unable to initiate checkout.');
    } finally {
      setLoading(false);
    }
  };

  const confirmSandboxPayment = async (simulateFail = false) => {
    if (!sandboxOrder) return;
    setLoading(true);
    setError(null);
    try {
      if (simulateFail) {
        await apiFetch('/api/payments/webhook', {
          method: 'POST',
          body: JSON.stringify({
            event: 'payment.failed',
            payload: { payment: { entity: { order_id: sandboxOrder.razorpayOrderId, id: `pay_fail_${Date.now()}` } } },
          }),
        });
        setError('Payment declined in test mode. No charge was made.');
        setLoading(false);
        return;
      }

      await apiFetch('/api/payments/verify', {
        method: 'POST',
        body: JSON.stringify({
          razorpay_order_id: sandboxOrder.razorpayOrderId,
          simulateSandboxSuccess: true,
        }),
      });

      await refreshUser();
      const cb = checkoutRequest.onSuccess;
      closeCheckout();
      cb?.();
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-black/10 dark:border-white/10">
          <div>
            <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">Razorpay USD Checkout</p>
            <h3 className="font-display text-2xl font-semibold text-[#171412] dark:text-[#F5F2EC] mt-0.5">
              {isPack ? `${settings.packSize}-Download Pack` : 'Single HD Download'}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close checkout"
            onClick={closeCheckout}
            className="w-9 h-9 rounded-lg border border-black/10 dark:border-white/10 flex items-center justify-center text-[#575049] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-5 space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[#575049] dark:text-[#A9A29A]">Total due today</span>
            <span className="font-mono text-2xl font-semibold tabular-nums text-[#171412] dark:text-[#F5F2EC]">
              ${priceUsd.toFixed(2)} USD
            </span>
          </div>

          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-4 text-xs text-[#575049] dark:text-[#A9A29A] space-y-1.5">
            {isPack ? (
              <>
                <p className="font-medium text-[#171412] dark:text-[#F5F2EC]">
                  Includes {settings.packSize} clean unwatermarked HD downloads
                </p>
                <p>Valid for {settings.packValidityDays} days from purchase · ${(priceUsd / settings.packSize).toFixed(2)} per look</p>
              </>
            ) : (
              <>
                <p className="font-medium text-[#171412] dark:text-[#F5F2EC]">
                  Includes 1 clean unwatermarked HD download
                </p>
                <p>Selfie is permanently deleted immediately after download completes.</p>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {!sandboxOrder ? (
            <button
              type="button"
              disabled={loading}
              onClick={startPayment}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>{loading ? 'Preparing Razorpay Order…' : user ? `Pay $${priceUsd.toFixed(2)} USD` : 'Sign up to Pay'}</span>
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-[#C59B27]/40 dark:border-[#D4AF37]/40 p-4 bg-[#D4AF37]/5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#171412] dark:text-[#F5F2EC]">Razorpay Test Sandbox</span>
                <span className="font-mono text-[#7A7168] dark:text-[#A9A29A]">{sandboxOrder.razorpayOrderId}</span>
              </div>
              <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
                Test-mode order created. Simulate a card authorization or test failure to verify server-side signature handling.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => confirmSandboxPayment(false)}
                  className="py-2.5 px-3 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying…' : 'Authorize Test Pay'}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => confirmSandboxPayment(true)}
                  className="py-2.5 px-3 rounded-lg border border-black/15 dark:border-white/15 text-xs font-medium text-[#575049] dark:text-[#A9A29A] cursor-pointer disabled:opacity-50"
                >
                  Simulate Decline
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 pt-1 text-[11px] text-[#7A7168] dark:text-[#A9A29A]">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Server-verified HMAC
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Email receipt included
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
