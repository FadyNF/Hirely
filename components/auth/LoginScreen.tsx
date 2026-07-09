'use client';

import { useState, useEffect, FormEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faCircleExclamation,
  faCircleInfo,
  faArrowRight,
  faLock,
  faCircleQuestion,
  faHeadset,
  faEye,
  faEyeSlash,
  faEnvelope,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';

interface LoginScreenProps {
  onSwitchToRegister: () => void;
}

export default function LoginScreen({ onSwitchToRegister }: LoginScreenProps) {
  const { login, pendingVerification } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  // If a verification is already pending (e.g. from a previous register
  // attempt), send the user to the register page, which handles the
  // OTP step-2 screen.
  useEffect(() => {
    if (pendingVerification) {
      router.replace('/register');
    }
  }, [pendingVerification, router]);

  const isValid = email.trim().length > 3 && password.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || isLoading || submittingRef.current) return;

    submittingRef.current = true;
    setError('');
    setIsLoading(true);

    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  };

  if (!mounted) return null;

  return (
    <div className="login-page min-h-screen flex flex-col items-center justify-between bg-grid relative bg-white">
      {/* Top gradient bar */}
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: 'linear-gradient(90deg, #B91C1C, #DC2626, #EF9A9A, #DC2626, #B91C1C)' }}
      />

      {/* Decorative blurs */}
      <div
        className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-[0.03]"
        style={{ background: 'radial-gradient(circle, #B91C1C, transparent 70%)', filter: 'blur(60px)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-96 h-96 rounded-full opacity-[0.02]"
        style={{ background: 'radial-gradient(circle, #DC2626, transparent 70%)', filter: 'blur(80px)' }}
      />

      <div className="flex-1" />

      <div className="w-full max-w-md mx-4">
        {/* Logo — a flame stands in for "Foundry" the same way a shield
            represented "Radar.ai": something concrete tied to the name. */}
        <div className="text-center mb-8 animate-login-fade-in-up login-delay-1">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{
              background: 'linear-gradient(135deg, #B91C1C, #DC2626)',
              boxShadow: '0 4px 16px rgba(185, 28, 28, 0.25)',
            }}
          >
            <FontAwesomeIcon icon={faFire} className="text-white text-2xl" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-800">Foundry</h1>
          <div className="login-underline-accent w-16 mx-auto mt-2.5 mb-2.5" />
          <p className="text-xs font-medium uppercase text-gray-500" style={{ letterSpacing: '0.15em' }}>
            by Elsewedy Electric
          </p>
        </div>

        <div
          className="login-card-container rounded-xl bg-white p-8 animate-login-fade-in-up login-delay-2"
          style={{ borderRadius: '12px' }}
        >
          <div className="text-center mb-7">
            <h2 className="text-lg font-semibold mb-1.5 text-gray-800">Welcome back</h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Sign in with your email and password
            </p>
          </div>

          {error && (
            <div
              className="login-error-alert flex items-center gap-2.5 p-3 rounded-lg mb-5"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
              role="alert"
            >
              <FontAwesomeIcon icon={faCircleExclamation} className="text-sm" style={{ color: '#991B1B' }} />
              <span className="text-sm font-medium" style={{ color: '#991B1B' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-800">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faEnvelope} className="text-sm" style={{ color: '#9CA3AF' }} />
                </div>
                <input
                  type="email"
                  id="login-email"
                  name="email"
                  className="login-input w-full pl-10 pr-4 py-3 rounded-lg text-sm font-medium text-gray-800"
                  style={{ borderRadius: '8px' }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                  aria-describedby="login-email-hint"
                  aria-required="true"
                />
              </div>
              <p id="login-email-hint" className="flex items-center gap-1.5 text-xs mt-1 text-gray-500">
                <FontAwesomeIcon icon={faCircleInfo} className="text-[10px]" />
                Use the email you registered with
              </p>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-800">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faLock} className="text-sm" style={{ color: '#9CA3AF' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  name="password"
                  className="login-input w-full pl-10 pr-10 py-3 rounded-lg text-sm font-medium text-gray-800"
                  style={{ borderRadius: '8px' }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <FontAwesomeIcon
                    icon={showPassword ? faEyeSlash : faEye}
                    className="text-sm"
                    style={{ color: '#9CA3AF' }}
                  />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="login-btn w-full py-3 rounded-lg text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2"
              style={{ borderRadius: '8px' }}
              disabled={!isValid || isLoading}
              aria-label="Login to Foundry"
            >
              {isLoading ? (
                <>
                  <div className="login-spinner" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Login</span>
                  <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                </>
              )}
            </button>
          </form>

          <div
            className="flex items-center justify-center mt-6 pt-5"
            style={{ borderTop: '1px solid #E5E7EB' }}
          >
            <span className="text-xs text-gray-500">New here?&nbsp;</span>
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="text-xs font-semibold"
              style={{ color: '#B91C1C' }}
            >
              Create an account
            </button>
          </div>
        </div>

        <div className="animate-login-fade-in-up login-delay-3 flex items-center justify-center gap-4 mt-5">
          <a href="#" className="login-security-badge text-xs font-medium flex items-center gap-1.5 text-gray-500">
            <FontAwesomeIcon icon={faCircleQuestion} className="text-[10px]" />
            Need help?
          </a>
          <span className="text-xs" style={{ color: '#E5E7EB' }}>|</span>
          <a href="#" className="login-security-badge text-xs font-medium flex items-center gap-1.5 text-gray-500">
            <FontAwesomeIcon icon={faHeadset} className="text-[10px]" />
            Contact IT Support
          </a>
        </div>
      </div>

      <div className="flex-1" />

      <footer className="w-full py-5 text-center animate-login-fade-in-up login-delay-5 shrink-0">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background: '#B91C1C' }}>
            <FontAwesomeIcon icon={faFire} className="text-white text-[7px]" />
          </div>
          <span className="text-xs font-semibold text-gray-800">Elsewedy Electric</span>
        </div>
        <p className="text-[11px] text-gray-500">
          &copy; 2026 Foundry. All rights reserved.
        </p>
      </footer>
    </div>
  );
}