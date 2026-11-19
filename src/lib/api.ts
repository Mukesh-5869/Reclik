const AUTH_TOKEN_KEY = 'boothie_auth_token';
const VISITOR_TOKEN_KEY = 'boothie_vid_token';
const FP_KEY = 'boothie_fp';

export function getOrCreateFingerprint(): string {
  try {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      const raw = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        Math.random().toString(36).slice(2, 10),
      ].join('|');
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash << 5) - hash + raw.charCodeAt(i);
        hash |= 0;
      }
      fp = `fp_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    return 'fp_fallback';
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getVisitorToken(): string | null {
  try {
    return localStorage.getItem(VISITOR_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setVisitorToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(VISITOR_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(VISITOR_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Boothie-Fp': getOrCreateFingerprint(),
  };
  const authToken = getAuthToken();
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const visitorToken = getVisitorToken();
  if (visitorToken) {
    headers['X-Boothie-Vid'] = visitorToken;
  }
  return headers;
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { isFormData?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!options.isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (typeof data === 'object' && data !== null && typeof data.visitorToken === 'string' && data.visitorToken) {
    setVisitorToken(data.visitorToken);
  }

  if (!res.ok) {
    const err: any = new Error(
      typeof data === 'object' && data?.error ? data.error : `Request failed (${res.status})`
    );
    err.status = res.status;
    err.code = typeof data === 'object' ? data?.code : undefined;
    err.data = data;
    throw err;
  }

  return data as T;
}
