import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch, getAuthHeaders } from '../lib/api';
import { Look, QuotaInfo } from '../types';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';

async function analyzeAndResizeClientImage(file: File): Promise<{ blob: Blob; previewDataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (img.width < 200 || img.height < 200) {
          reject(new Error('Image is too small. Please choose a portrait at least 200px wide.'));
          return;
        }
        const maxSide = 2048;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas processing failed.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        // Brightness check on center portrait region
        const sample = ctx.getImageData(Math.floor(w * 0.2), Math.floor(h * 0.15), Math.floor(w * 0.6), Math.floor(h * 0.6));
        let lumSum = 0;
        for (let i = 0; i < sample.data.length; i += 16) {
          const r = sample.data[i];
          const g = sample.data[i + 1];
          const b = sample.data[i + 2];
          lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avgLum = lumSum / (sample.data.length / 16);
        if (avgLum < 22) {
          reject(new Error('This photo looks too dark. Please use a brighter, front-lit selfie.'));
          return;
        }

        const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        canvas.toBlob(
          (blob) => {
            if (!blob) reject(new Error('Failed to prepare image.'));
            else resolve({ blob, previewDataUrl });
          },
          'image/jpeg',
          0.92
        );
      };
      img.onerror = () => reject(new Error('Could not read this image format. Try JPG, PNG, or WebP.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function BoothPage() {
  const {
    user,
    looks,
    settings,
    quota,
    refreshQuota,
    refreshUser,
    boothProgress,
    setBoothProgress,
    clearBoothProgress,
    openCheckout,
    navigate,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (boothProgress.generationId && boothProgress.previewUrl) return 3;
    if (boothProgress.selfieId) return 2;
    return 1;
  });

  // Step 1 state
  const [consentChecked, setConsentChecked] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 2 state
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [showPaywallModal, setShowPaywallModal] = useState(false);

  // Step 3 state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selfieDeletedBanner, setSelfieDeletedBanner] = useState(false);
  const [completedLookMeta, setCompletedLookMeta] = useState<{ name: string; category: string } | null>(null);
  const [hasCelebrated, setHasCelebrated] = useState(false);

  // Check URL ?look= preselection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lookParam = params.get('look');
    if (lookParam && looks.length > 0) {
      const found = looks.find((l) => l.id === lookParam || l.slug === lookParam);
      if (found) {
        setBoothProgress((prev) => ({ ...prev, selectedLook: found }));
      }
    }
  }, [looks, setBoothProgress]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setCountdown(null);
  };

  const startCamera = async () => {
    setUploadError(null);
    setCapturedPreview(null);
    setCapturedBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setUploadError('Camera permission was denied or no webcam was found. You can upload a photo instead.');
    }
  };

  const triggerCountdownCapture = () => {
    if (!videoRef.current) return;
    setCountdown(3);
    let current = 3;
    const timer = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
      } else {
        clearInterval(timer);
        setCountdown(null);
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 960;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Mirror horizontally to match front-camera preview
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              setCapturedPreview(dataUrl);
              setCapturedBlob(blob);
              stopCamera();
            }
          },
          'image/jpeg',
          0.92
        );
      }
    }, 900);
  };

  const submitSelfieBlob = async (blob: Blob, filename = 'selfie.jpg') => {
    if (!consentChecked || !ageChecked) {
      setUploadError('Please confirm you are 18+ and accept the biometric privacy notice before continuing.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('selfie', blob, filename);
      fd.append('consentAccepted', 'true');
      fd.append('ageConfirmed', 'true');

      const res = await apiFetch<{ selfieId: string; selfieUrl: string; isDemo: boolean; quota: QuotaInfo }>(
        '/api/booth/upload-selfie',
        {
          method: 'POST',
          body: fd,
          isFormData: true,
        }
      );

      setBoothProgress((prev) => ({
        ...prev,
        selfieId: res.selfieId,
        selfieUrl: res.selfieUrl,
        generationId: null,
        previewUrl: null,
        isDemo: false,
      }));
      setSelfieDeletedBanner(false);
      setCompletedLookMeta(null);
      await refreshQuota();
      setStep(2);
    } catch (err: any) {
      setUploadError(err.message || 'Selfie upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const maxMb = settings.maxUploadMb || 10;
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(`File exceeds ${maxMb}MB limit. Please choose a smaller photo.`);
      return;
    }
    try {
      const prepared = await analyzeAndResizeClientImage(file);
      setCapturedPreview(prepared.previewDataUrl);
      setCapturedBlob(prepared.blob);
    } catch (err: any) {
      setUploadError(err.message);
    }
  };

  const handleUseSampleDemo = async () => {
    if (!consentChecked || !ageChecked) {
      setUploadError('Please check both consent boxes below before entering the studio.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const res = await apiFetch<{ selfieId: string; selfieUrl: string; isDemo: boolean }>('/api/booth/demo-selfie', {
        method: 'POST',
      });
      setBoothProgress((prev) => ({
        ...prev,
        selfieId: res.selfieId,
        selfieUrl: res.selfieUrl,
        generationId: null,
        previewUrl: null,
        isDemo: true,
      }));
      setSelfieDeletedBanner(false);
      setCompletedLookMeta(null);
      setStep(2);
    } catch (err: any) {
      setUploadError(err.message || 'Unable to start sample booth.');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateLook = async (look: Look) => {
    if (!boothProgress.selfieId) {
      setStep(1);
      return;
    }

    setBoothProgress((prev) => ({ ...prev, selectedLook: look }));
    setGenerating(true);
    setGenError(null);

    try {
      const res = await apiFetch<{
        generationId: string;
        look: Look;
        isDemo: boolean;
        previewUrl: string;
        selfieUrl: string;
        quota: QuotaInfo;
      }>('/api/booth/generate', {
        method: 'POST',
        body: JSON.stringify({
          selfieId: boothProgress.selfieId,
          lookId: look.id,
        }),
      });

      setBoothProgress((prev) => ({
        ...prev,
        generationId: res.generationId,
        previewUrl: res.previewUrl,
        selfieUrl: res.selfieUrl,
        selectedLook: look,
      }));
      setSelfieDeletedBanner(false);
      await refreshQuota();
      setStep(3);

      if (!hasCelebrated) {
        setHasCelebrated(true);
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#D4AF37', '#F5F2EC', '#A9A29A'],
        });
      }
    } catch (err: any) {
      if (err.code === 'FREE_LIMIT_REACHED') {
        setShowPaywallModal(true);
      } else {
        setGenError(err.message || 'Unable to generate look right now.');
      }
    } finally {
      setGenerating(false);
    }
  };

  const performHdDownload = async () => {
    const genId = boothProgress.generationId;
    if (!genId) return;
    const lookMeta = boothProgress.selectedLook
      ? { name: boothProgress.selectedLook.name, category: boothProgress.selectedLook.category, slug: boothProgress.selectedLook.slug }
      : { name: 'Studio Look', category: 'Reclik', slug: 'portrait' };

    setDownloading(true);
    setDownloadError(null);

    try {
      const prep = await apiFetch<{ downloadUrl: string }>('/api/downloads/prepare', {
        method: 'POST',
        body: JSON.stringify({ generationId: genId }),
      });

      // Stream file cleanly with Blob download so it works inside sandboxed iframes and completes deterministically
      const fileRes = await fetch(prep.downloadUrl, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        let errMsg = 'Download failed.';
        try {
          errMsg = JSON.parse(errText)?.error || errMsg;
        } catch {
          // ignore parse error
        }
        throw new Error(errMsg);
      }

      const blob = await fileRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `reclik-${lookMeta.slug || 'portrait'}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);

      await refreshUser();

      // Verify post-download purge status immediately and clear stale preview paths from boothProgress
      const status = await apiFetch<{ selfieDeleted: boolean; generationDeleted?: boolean }>(
        `/api/downloads/status/${genId}`
      ).catch(() => ({ selfieDeleted: true, generationDeleted: true }));

      setCompletedLookMeta({ name: lookMeta.name, category: lookMeta.category });
      if (status.selfieDeleted || status.generationDeleted) {
        setSelfieDeletedBanner(true);
        clearBoothProgress();
      }
    } catch (err: any) {
      if (err.status === 401) {
        navigate('/signup');
      } else if (err.code === 'NO_CREDITS') {
        setShowPaywallModal(true);
      } else {
        setDownloadError(err.message || 'Download failed.');
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadButtonClick = () => {
    if (!user) {
      navigate('/signup');
      return;
    }
    if (user.credits > 0) {
      performHdDownload();
    } else {
      setShowPaywallModal(true);
    }
  };

  const handleStartOver = () => {
    clearBoothProgress();
    setCapturedPreview(null);
    setCapturedBlob(null);
    setSelfieDeletedBanner(false);
    setCompletedLookMeta(null);
    setGenError(null);
    setDownloadError(null);
    setStep(1);
  };

  const categories = ['All', ...Array.from(new Set(looks.map((l) => l.category)))];
  const filteredLooks = looks.filter((l) => {
    const matchesCat = categoryFilter === 'All' || l.category === categoryFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const stepsMeta = [
    { num: 1, title: 'Upload Selfie' },
    { num: 2, title: 'Select Look' },
    { num: 3, title: 'Preview & Download' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {/* Top Wizard Header + Free Preview Counter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center gap-3 sm:gap-6">
          {stepsMeta.map((s) => {
            const active = step === s.num;
            const completed = step > s.num;
            return (
              <div key={s.num} className="flex items-center gap-2 text-xs sm:text-sm">
                <span
                  className={`font-mono w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    active
                      ? 'bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908]'
                      : completed
                      ? 'bg-[#D4AF37]/25 text-[#171412] dark:text-[#D4AF37]'
                      : 'border border-black/15 dark:border-white/15 text-[#7A7168] dark:text-[#A9A29A]'
                  }`}
                >
                  {s.num}
                </span>
                <span
                  className={`whitespace-nowrap ${
                    active ? 'font-semibold text-[#171412] dark:text-[#F5F2EC]' : 'text-[#7A7168] dark:text-[#A9A29A]'
                  }`}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-[#575049] dark:text-[#A9A29A]">
          {user && user.credits > 0 ? (
            <span className="font-semibold text-[#171412] dark:text-[#D4AF37]">
              {user.credits} HD downloads left
              {user.pack_expires_at ? ` · exp ${new Date(user.pack_expires_at).toLocaleDateString()}` : ''}
            </span>
          ) : (
            <span>
              {quota.remaining} of {quota.limit} free previews left
            </span>
          )}
        </div>
      </div>

      {/* STEP 1: UPLOAD OR CAPTURE SELFIE */}
      {step === 1 && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-[#171412] dark:text-[#F5F2EC]">
                Step 1: Add one clear selfie
              </h1>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] mt-2">
                Front-facing, natural lighting, one adult face. JPG, PNG, WebP, or HEIC up to {settings.maxUploadMb || 10}MB.
              </p>
            </div>

            {!cameraActive && !capturedPreview && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFileChange(e.dataTransfer.files?.[0]);
                }}
                className="rounded-2xl border border-dashed border-black/25 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.02] p-8 text-center space-y-5"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                  className="hidden"
                />

                <div className="mx-auto w-12 h-12 rounded-xl bg-[#D4AF37]/15 text-[#C59B27] dark:text-[#D4AF37] flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>

                <div className="space-y-1">
                  <p className="text-base font-semibold text-[#171412] dark:text-[#F5F2EC]">
                    Drop your portrait here, or choose an option
                  </p>
                  <p className="text-xs text-[#7A7168] dark:text-[#A9A29A]">
                    EXIF camera metadata is stripped automatically upon upload.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={startCamera}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-black/15 dark:border-white/15 text-sm font-medium text-[#171412] dark:text-[#F5F2EC] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take Selfie</span>
                  </button>

                  <button
                    type="button"
                    disabled={uploading}
                    onClick={handleUseSampleDemo}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-[#575049] dark:text-[#A9A29A] underline underline-offset-4 hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Try Sample Portrait</span>
                  </button>
                </div>
              </div>
            )}

            {/* Live Browser Camera View */}
            {cameraActive && (
              <div className="rounded-2xl border border-black/15 dark:border-white/15 bg-black overflow-hidden relative aspect-[3/4] max-w-md mx-auto">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                    <span className="font-display text-7xl font-bold text-[#D4AF37]">{countdown}</span>
                  </div>
                )}
                <div className="absolute bottom-4 inset-x-4 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-xl bg-black/70 text-white text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={countdown !== null}
                    onClick={triggerCountdownCapture}
                    className="px-6 py-2.5 rounded-xl bg-[#D4AF37] text-[#0A0908] text-sm font-semibold cursor-pointer"
                  >
                    {countdown !== null ? 'Hold Still…' : 'Capture (3s)'}
                  </button>
                </div>
              </div>
            )}

            {/* Captured / Uploaded Preview Confirmation */}
            {capturedPreview && (
              <div className="rounded-2xl border border-black/15 dark:border-white/15 bg-[#F2EDE3] dark:bg-[#141210] p-5 flex flex-col sm:flex-row gap-5 items-center">
                <img
                  src={capturedPreview}
                  alt="Prepared selfie preview"
                  className="w-40 aspect-[3/4] object-cover rounded-xl border border-black/10 dark:border-white/10"
                />
                <div className="flex-1 space-y-4">
                  <div>
                    <p className="font-semibold text-base text-[#171412] dark:text-[#F5F2EC]">Portrait ready</p>
                    <p className="text-xs text-[#575049] dark:text-[#A9A29A] mt-1">
                      Brightness and framing passed local inspection. Accept the biometric consent below to continue.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => capturedBlob && submitSelfieBlob(capturedBlob)}
                      className="px-5 py-2.5 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {uploading ? 'Checking & Encrypting…' : 'Continue to Looks →'}
                    </button>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => {
                        setCapturedPreview(null);
                        setCapturedBlob(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-black/15 dark:border-white/15 text-xs font-medium text-[#575049] dark:text-[#A9A29A] cursor-pointer"
                    >
                      Retake / Choose Another
                    </button>
                  </div>
                </div>
              </div>
            )}

            {uploadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Required Privacy & Biometric Consent Card */}
          <aside className="lg:col-span-5 rounded-2xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-6 space-y-5">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-[#171412] dark:text-[#F5F2EC]">
              <ShieldAlert className="w-4 h-4 text-[#C59B27] dark:text-[#D4AF37]" />
              <span>Privacy & Biometric Notice</span>
            </div>

            <p className="text-xs leading-relaxed text-[#575049] dark:text-[#A9A29A]">
              “Your selfie is used only to create your look. It is automatically deleted after you download, and never
              used to train AI or shared. Download your look before leaving, because once deleted it can&apos;t be
              recovered.”
            </p>

            <div className="space-y-3 pt-2 border-t border-black/10 dark:border-white/10 text-xs">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-[#D4AF37]"
                />
                <span className="text-[#171412] dark:text-[#F5F2EC] leading-relaxed">
                  I consent to temporary biometric portrait processing strictly to generate my preview/download (US
                  BIPA / CUBI notice).
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageChecked}
                  onChange={(e) => setAgeChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded accent-[#D4AF37]"
                />
                <span className="text-[#171412] dark:text-[#F5F2EC] leading-relaxed">
                  I confirm I am 18 years of age or older and uploading my own photo.
                </span>
              </label>
            </div>
          </aside>
        </div>
      )}

      {/* STEP 2: SELECT A LOOK */}
      {step === 2 && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-[#171412] dark:text-[#F5F2EC]">
                Step 2: Select a look
              </h1>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A] mt-1">
                {boothProgress.isDemo
                  ? 'Sample Demo Portrait loaded. Select any look to preview the watermarked transformation.'
                  : 'Your selfie is encrypted in private storage. Click any look to generate a watermarked preview.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleStartOver}
              className="self-start text-xs font-medium text-[#575049] dark:text-[#A9A29A] underline underline-offset-4 cursor-pointer"
            >
              Change Selfie
            </button>
          </div>

          {/* Search + Category Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
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

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7168] dark:text-[#A9A29A]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search looks…"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-black/15 dark:border-white/15 bg-transparent text-[#171412] dark:text-[#F5F2EC] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {genError && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{genError}</span>
              </div>
              {!boothProgress.isDemo && (
                <button
                  type="button"
                  onClick={handleUseSampleDemo}
                  className="px-4 py-2 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Switch to Sample Demo
                </button>
              )}
            </div>
          )}

          {!generating && boothProgress.selectedLook && (
            <div className="rounded-xl border border-[#C59B27]/40 dark:border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-[#7A7168] dark:text-[#A9A29A]">Pre-selected look: </span>
                <strong className="text-[#171412] dark:text-[#F5F2EC]">{boothProgress.selectedLook.name}</strong>
              </div>
              <button
                type="button"
                onClick={() => boothProgress.selectedLook && handleGenerateLook(boothProgress.selectedLook)}
                className="px-4 py-1.5 rounded-lg bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-xs font-semibold cursor-pointer"
              >
                Generate Selected Look →
              </button>
            </div>
          )}

          {/* Animated Photo-Booth Strip Loader */}
          {generating ? (
            <div className="rounded-2xl border border-black/15 dark:border-white/15 bg-[#F2EDE3] dark:bg-[#141210] p-10 text-center space-y-6">
              <div className="mx-auto flex items-center justify-center gap-3">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.35, 1, 0.35], y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.22 }}
                    className="w-16 h-24 rounded-lg border border-[#C59B27]/40 dark:border-[#D4AF37]/40 bg-black/10 dark:bg-white/5"
                  />
                ))}
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">
                  Developing {boothProgress.selectedLook?.name}…
                </h3>
                <p className="text-xs text-[#575049] dark:text-[#A9A29A] font-mono">
                  Estimated time: 8–12 seconds · Baking preview watermark server-side
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {filteredLooks.map((look) => {
                const isSelected = boothProgress.selectedLook?.id === look.id;
                return (
                  <button
                    key={look.id}
                    type="button"
                    onClick={() => handleGenerateLook(look)}
                    className={`group text-left rounded-2xl border bg-[#F2EDE3] dark:bg-[#141210] overflow-hidden hover:border-[#C59B27] dark:hover:border-[#D4AF37] transition-colors cursor-pointer ${
                      isSelected ? 'border-2 border-[#C59B27] dark:border-[#D4AF37]' : 'border-black/10 dark:border-white/10'
                    }`}
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-[#1A1816]">
                      <img
                        src={look.thumbnail_url}
                        alt={look.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" />
                      <span className="absolute bottom-3 left-3 text-xs text-white/90">{look.category}</span>
                    </div>
                    <div className="p-4 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm text-[#171412] dark:text-[#F5F2EC]">{look.name}</h3>
                        <span className="text-xs font-medium text-[#C59B27] dark:text-[#D4AF37]">Generate</span>
                      </div>
                      <p className="text-xs text-[#575049] dark:text-[#A9A29A] line-clamp-2">{look.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STEP 3: PREVIEW AND DOWNLOAD */}
      {step === 3 && (selfieDeletedBanner || (boothProgress.previewUrl && boothProgress.selfieUrl)) && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Photo-booth strip frame */}
          <div className="lg:col-span-6 rounded-2xl border border-black/15 dark:border-white/15 bg-[#ECE6DA] dark:bg-[#141210] p-4 sm:p-6 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-[#575049] dark:text-[#A9A29A]">
              <span>RECLIK STRIP · WATERMARKED PREVIEW</span>
              <span>Drag slider</span>
            </div>

            {selfieDeletedBanner ? (
              <div className="aspect-[3/4] rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <h3 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">
                  Selfie deleted successfully
                </h3>
                <p className="text-sm text-[#575049] dark:text-[#A9A29A] max-w-sm">
                  Your HD portrait has downloaded and your original selfie plus intermediate previews have been
                  permanently purged from private storage.
                </p>
              </div>
            ) : (
              <BeforeAfterSlider
                beforeSrc={boothProgress.selfieUrl || ''}
                afterSrc={boothProgress.previewUrl || ''}
                beforeAlt="Original uploaded selfie"
                afterAlt={`Watermarked preview of ${completedLookMeta?.name || boothProgress.selectedLook?.name || 'look'}`}
                protectAfter={true}
              />
            )}

            <p className="text-[11px] text-[#7A7168] dark:text-[#A9A29A] text-center">
              AI-generated portrait preview (max 768px). Clean HD files are delivered only after purchase.
            </p>
          </div>

          {/* Action & Privacy Column */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#7A7168] dark:text-[#A9A29A]">
                {completedLookMeta?.category || boothProgress.selectedLook?.category} · {selfieDeletedBanner ? 'Downloaded & Purged' : 'Ready in HD'}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-[#171412] dark:text-[#F5F2EC]">
                {completedLookMeta?.name || boothProgress.selectedLook?.name}
              </h1>
              <p className="text-sm text-[#575049] dark:text-[#A9A29A]">
                {selfieDeletedBanner
                  ? 'Your HD download completed and your temporary selfie has been purged. Ready for a new portrait anytime.'
                  : 'Drag the divider across the frame to compare your original selfie with your transformed look.'}
              </p>
            </div>

            {downloadError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {downloadError}
              </div>
            )}

            <div className="space-y-3">
              {!selfieDeletedBanner && (
                <button
                  type="button"
                  disabled={downloading}
                  onClick={handleDownloadButtonClick}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl bg-[#171412] text-[#F8F5EF] dark:bg-[#D4AF37] dark:text-[#0A0908] text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {downloading
                      ? 'Preparing Secure HD Download…'
                      : user && user.credits > 0
                      ? `Download Clean HD (Use 1 of ${user.credits} Credits)`
                      : `Download Clean HD ($${settings.singlePriceUsd} or Pack)`}
                  </span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                {!selfieDeletedBanner && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-black/15 dark:border-white/15 text-xs sm:text-sm font-medium text-[#171412] dark:text-[#F5F2EC] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Another Look</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartOver}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-black/15 dark:border-white/15 text-xs sm:text-sm font-medium text-[#575049] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer ${
                    selfieDeletedBanner ? 'col-span-2' : ''
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Start Over</span>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-[#F2EDE3] dark:bg-[#141210] p-4 text-xs leading-relaxed text-[#575049] dark:text-[#A9A29A] space-y-2">
              <p className="font-semibold text-[#171412] dark:text-[#F5F2EC]">Download Deletion Notice</p>
              <p>
                Your selfie is used only to create your look. It is automatically deleted after you download, and never
                used to train AI or shared. Download your look before leaving, because once deleted it can&apos;t be
                recovered.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Paywall / Upgrade Modal */}
      {showPaywallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/15 dark:border-white/15 bg-[#F8F5EF] dark:bg-[#141210] p-6 shadow-2xl space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#C59B27] dark:text-[#D4AF37]">Unlock Clean HD Portraits</p>
              <h3 className="font-display text-2xl text-[#171412] dark:text-[#F5F2EC]">
                Choose how you want to download
              </h3>
              <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
                {user
                  ? 'Select a single download or our 12-look studio pack (best value).'
                  : 'Your current selfie & look are saved—create an account or sign in to complete your HD purchase.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowPaywallModal(false);
                  if (!user) {
                    navigate('/signup');
                  } else {
                    openCheckout({
                      planType: 'single',
                      generationId: boothProgress.generationId || undefined,
                      onSuccess: () => performHdDownload(),
                    });
                  }
                }}
                className="text-left rounded-xl border border-black/15 dark:border-white/15 p-4 hover:border-[#D4AF37] transition-colors cursor-pointer space-y-2"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-sm text-[#171412] dark:text-[#F5F2EC]">Single HD</span>
                  <span className="font-mono text-lg font-semibold text-[#171412] dark:text-[#F5F2EC]">
                    ${settings.singlePriceUsd}
                  </span>
                </div>
                <p className="text-xs text-[#575049] dark:text-[#A9A29A]">1 clean unwatermarked HD download.</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPaywallModal(false);
                  if (!user) {
                    navigate('/signup');
                  } else {
                    openCheckout({
                      planType: 'pack_12',
                      generationId: boothProgress.generationId || undefined,
                      onSuccess: () => {
                        if (boothProgress.generationId) performHdDownload();
                      },
                    });
                  }
                }}
                className="text-left rounded-xl border-2 border-[#C59B27] dark:border-[#D4AF37] bg-[#D4AF37]/10 p-4 cursor-pointer space-y-2"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-sm text-[#171412] dark:text-[#F5F2EC]">
                    {settings.packSize}-Look Pack
                  </span>
                  <span className="font-mono text-lg font-semibold text-[#171412] dark:text-[#F5F2EC]">
                    ${settings.packPriceUsd}
                  </span>
                </div>
                <p className="text-xs text-[#575049] dark:text-[#A9A29A]">
                  Best value: ${(settings.packPriceUsd / settings.packSize).toFixed(2)}/look · Valid{' '}
                  {settings.packValidityDays} days.
                </p>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowPaywallModal(false)}
                className="text-xs text-[#7A7168] dark:text-[#A9A29A] hover:text-[#171412] dark:hover:text-[#F5F2EC] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
