'use client';

// context/AuthContext.tsx
//
// Mirrors the shape of the company's real AuthContext.tsx: a React Context
// that holds "who's logged in" and exposes login/register/logout functions
// any page or component can call via useAuth(). Simplified to email +
// password only (no employee ID, username, or CAPTCHA — see project notes
// on why those were scoped out).

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

const AUTH_STORAGE_KEY = 'foundry-auth';
const PENDING_VERIFICATION_KEY = 'foundry-pending-verification';

// sessionStorage only exists in the browser, not during server-side
// rendering — this guards against crashing when Next.js renders on the
// server, where `window` doesn't exist at all.
const storage = typeof window !== 'undefined' ? window.sessionStorage : null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingVerification {
  email: string;
  ttl: number;
}

export interface User {
  id: number;
  email: string;
  emailVerified: boolean;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  pendingVerification: PendingVerification | null;
  verifyCode: (email: string, code: string) => Promise<void>;
  resendCode: (email: string) => Promise<void>;
}

interface StoredAuth {
  user: User;
  accessToken: string;
  refreshToken: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(() => {
    try {
      const raw = storage?.getItem(PENDING_VERIFICATION_KEY);
      return raw ? (JSON.parse(raw) as PendingVerification) : null;
    } catch {
      return null;
    }
  });

  // Refs mirror the state values so authFetch always reads the LATEST
  // token even inside a callback created earlier — without this, a stale
  // closure could keep using an old, already-expired token.
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  useEffect(() => { refreshTokenRef.current = refreshToken; }, [refreshToken]);

  // ---- Hydrate from sessionStorage on first load ----
  // This is what makes "staying logged in" survive a page refresh: we
  // check if there's a saved session, and if so, confirm it's still
  // valid by asking the server (via /api/auth/me).
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const raw = storage?.getItem(AUTH_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StoredAuth;
          if (parsed?.user?.email && parsed.accessToken) {
            setUser(parsed.user);
            setAccessToken(parsed.accessToken);
            setRefreshToken(parsed.refreshToken ?? null);

            const res = await fetch('/api/auth/me', {
              headers: { Authorization: `Bearer ${parsed.accessToken}` },
            });

            if (res.ok) {
              const fresh = await res.json();
              if (!cancelled) setUser(fresh);
            } else if (res.status === 401 && parsed.refreshToken) {
              // Access token expired — try refreshing silently before
              // giving up and logging the user out.
              const refreshRes = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: parsed.refreshToken }),
              });
              if (refreshRes.ok && !cancelled) {
                const data = await refreshRes.json();
                setAccessToken(data.access_token);
                accessTokenRef.current = data.access_token;
                setRefreshToken(data.refresh_token);
                refreshTokenRef.current = data.refresh_token;
              } else if (!cancelled) {
                setUser(null);
                setAccessToken(null);
                setRefreshToken(null);
                storage?.removeItem(AUTH_STORAGE_KEY);
              }
            }
          }
        }
      } catch {
        // Corrupt storage or network error — treat as logged out.
      }
      if (!cancelled) setIsHydrated(true);
    }

    hydrate();
    return () => { cancelled = true; };
  }, []);

  // ---- Persist to sessionStorage whenever auth state changes ----
  useEffect(() => {
    if (!isHydrated) return;
    if (user && accessToken) {
      const stored: StoredAuth = { user, accessToken, refreshToken: refreshToken ?? '' };
      storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored));
    } else {
      storage?.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user, accessToken, refreshToken, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (pendingVerification) {
      storage?.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(pendingVerification));
    } else {
      storage?.removeItem(PENDING_VERIFICATION_KEY);
    }
  }, [pendingVerification, isHydrated]);

  // ---- authFetch: attaches the token, retries once on 401 ----
  const authFetch = useCallback(async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (accessTokenRef.current) headers.set('Authorization', `Bearer ${accessTokenRef.current}`);

    const res = await fetch(input, { ...init, headers });
    if (res.status !== 401) return res;

    const rt = refreshTokenRef.current;
    if (!rt) return res;

    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!refreshRes.ok) {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      return res;
    }

    const data = await refreshRes.json();
    setAccessToken(data.access_token);
    accessTokenRef.current = data.access_token;
    setRefreshToken(data.refresh_token);
    refreshTokenRef.current = data.refresh_token;

    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('Authorization', `Bearer ${data.access_token}`);
    return fetch(input, { ...init, headers: retryHeaders });
  }, []);

  // ---- login ----
  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed.');

    if (data.status === 'verification_required') {
      setPendingVerification({ email: data.email, ttl: data.ttl });
      return;
    }

    setUser(data.user);
    setAccessToken(data.access_token);
    accessTokenRef.current = data.access_token;
    setRefreshToken(data.refresh_token);
    refreshTokenRef.current = data.refresh_token;
  }, []);

  // ---- register ----
  const register = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Registration failed.');

    setPendingVerification({ email: data.email, ttl: data.ttl });
  }, []);

  // ---- verifyCode ----
  const verifyCode = useCallback(async (email: string, code: string) => {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Verification failed.');

    setUser(data.user);
    setAccessToken(data.access_token);
    accessTokenRef.current = data.access_token;
    setRefreshToken(data.refresh_token);
    refreshTokenRef.current = data.refresh_token;
    setPendingVerification(null);
  }, []);

  // ---- resendCode ----
  const resendCode = useCallback(async (email: string) => {
    const res = await fetch('/api/auth/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to resend code.');
  }, []);

  // ---- logout ----
  // Note: this only clears CLIENT-side state. A future improvement would
  // add a real /api/auth/logout route that also clears refreshTokenHash
  // server-side, so the old refresh token can't be used again even if
  // someone captured it before logout. Deferred for now — not blocking.
  const logout = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    setPendingVerification(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: user !== null && accessToken !== null,
        isAuthLoading: !isHydrated,
        login,
        register,
        logout,
        authFetch,
        pendingVerification,
        verifyCode,
        resendCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}