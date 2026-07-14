'use client';

// context/AuthContext.tsx
//
// Mirrors the shape of the company's real AuthContext.tsx: a React Context
// that holds "who's logged in" and exposes login/register/logout functions
// any page or component can call via useAuth(). Simplified to email +
// password only (no employee ID, username, or CAPTCHA — see project notes
// on why those were scoped out).
//
// The access/refresh tokens themselves are httpOnly cookies now — this
// file never sees or stores their raw values. The browser attaches them
// automatically on every same-origin request; this context only tracks
// *who* the server says is logged in (the `user` object), for UI purposes
// like showing an email in the sidebar or redirecting an already-logged-in
// visitor away from /login.

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { Role } from '@/lib/roles';

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
  // "employee" (default for every fresh signup) | "admin" (root promotes
  // an employee to this) | "root" — the env-configured account that can
  // promote employees and triage support requests. Determined server-side
  // from the User.role DB column, never trusted from the client.
  role: Role;
}

// Result surface for login/verifyCode — callers need to distinguish
// "logged in" from "OTP still needed" to route the user to the right
// screen. Kept as a plain union rather than throwing, since these are
// both expected outcomes of a normal flow, not exceptional errors.
export type AuthOutcome =
  | { status: 'ok' }
  | { status: 'verification_required' };

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<AuthOutcome>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
  pendingVerification: PendingVerification | null;
  verifyCode: (email: string, code: string) => Promise<AuthOutcome>;
  resendCode: (email: string) => Promise<void>;
  clearPendingVerification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<PendingVerification | null>(() => {
    try {
      const raw = storage?.getItem(PENDING_VERIFICATION_KEY);
      return raw ? (JSON.parse(raw) as PendingVerification) : null;
    } catch {
      return null;
    }
  });
  // ---- On mount: ask the server who (if anyone) the access-token cookie
  // belongs to. The cookie is httpOnly — invisible to this code — so this
  // request is the only way to find out. ----
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const fresh = await res.json();
          if (!cancelled) setUser(fresh);
        } else if (res.status === 401) {
          // Access token cookie expired — the refresh token cookie might
          // still be good. Try it before giving up and treating the user
          // as logged out.
          const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
          if (refreshRes.ok) {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok && !cancelled) setUser(await meRes.json());
          }
        }
      } catch {
        // Corrupt state or network error — treat as logged out.
      }
      if (!cancelled) setIsHydrated(true);
    }

    hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    if (pendingVerification) {
      storage?.setItem(PENDING_VERIFICATION_KEY, JSON.stringify(pendingVerification));
    } else {
      storage?.removeItem(PENDING_VERIFICATION_KEY);
    }
  }, [pendingVerification, isHydrated]);

  // ---- authFetch: cookies are attached automatically by the browser now,
  // so this no longer manages a token — it just retries once through
  // /api/auth/refresh on a 401, same behavior as before. ----
  const authFetch = useCallback(async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const res = await fetch(input, init);
    if (res.status !== 401) return res;

    const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
    if (!refreshRes.ok) {
      setUser(null);
      return res;
    }

    return fetch(input, init);
  }, []);

  // ---- login ----
  const login = useCallback(async (email: string, password: string): Promise<AuthOutcome> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed.');

    if (data.status === 'verification_required') {
      setPendingVerification({ email: data.email, ttl: data.ttl });
      return { status: 'verification_required' };
    }

    setUser(data.user);
    return { status: 'ok' };
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
  const verifyCode = useCallback(async (email: string, code: string): Promise<AuthOutcome> => {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Verification failed.');

    setUser(data.user);
    setPendingVerification(null);
    return { status: 'ok' };
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

  // ---- clearPendingVerification ----
  // Lets the UI back out of the OTP step entirely (e.g. "use a different
  // email") without a page reload — which wouldn't even work, since
  // pendingVerification is persisted to sessionStorage and would just
  // come right back after reloading.
  const clearPendingVerification = useCallback(() => {
    setPendingVerification(null);
  }, []);

  // ---- logout ----
  // Now a real server call: client-side JS can't read or clear an
  // httpOnly cookie itself, so logging out has to ask the server to
  // clear them (and invalidate the stored refresh token hash).
  const logout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setPendingVerification(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isAuthLoading: !isHydrated,
        login,
        register,
        logout,
        authFetch,
        pendingVerification,
        verifyCode,
        resendCode,
        clearPendingVerification,
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
