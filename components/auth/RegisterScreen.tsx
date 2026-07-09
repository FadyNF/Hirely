'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faCircleExclamation,
  faArrowRight,
  faLock,
  faCircleQuestion,
  faHeadset,
  faEye,
  faEyeSlash,
  faEnvelope,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';

interface FieldErrors {
  email?: string;
  password?: string;
  general?: string;
}

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export default function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const { register, pendingVerification, verifyCode, resendCode, clearPendingVerification } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // OTP step-2 state — identical mechanics to the real product.
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [ttlLeft, setTtlLeft] = useState(0);
  const [ttlDisplay, setTtlDisplay] = useState('02:00');
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!pendingVerification) return;
    setTtlLeft(pendingVerification.ttl);
    const t = setTimeout(() => codeInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [pendingVerification]);

  useEffect(() => {
    if (ttlLeft <= 0) {
      setTtlDisplay('00:00');
      return;
    }
    const mm = String(Math.floor(ttlLeft / 60)).padStart(2, '0');
    const ss = String(ttlLeft % 60).padStart(2, '0');
    setTtlDisplay(`${mm}:${ss}`);
    const id = setInterval(() => setTtlLeft(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [ttlLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const clearFieldError = (field: keyof FieldErrors) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = 'Enter a valid email address';
    if (!password || password.length < 8) e.password = 'Password must be at least 8 characters';
    return e;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const localErrors = validate();
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await register(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      // Our backend's duplicate-email error naturally maps to the email
      // field, matching the spirit of the real product's per-field errors.
      if (message.toLowerCase().includes('email')) {
        setErrors({ email: message });
      } else {
        setErrors({ general: message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingVerification) return;
    setVerifyError('');
    setIsVerifying(true);
    try {
      await verifyCode(pendingVerification.email, code);
      router.replace('/app');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid or expired code. Please try again.';
      setVerifyError(message);
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!pendingVerification || resendCooldown > 0) return;
    try {
      await resendCode(pendingVerification.email);
      setTtlLeft(600);
      setResendCooldown(30);
      setVerifyError('');
    } catch {
      setVerifyError('Failed to resend. Please try again.');
    }
  };

  // Backs out of the OTP step entirely, back to a blank email/password
  // form — clearing pendingVerification (not just reloading the page,
  // which never actually left this step since that state is persisted
  // to sessionStorage) and resetting the form's own local state too.
  const handleUseAnotherEmail = () => {
    clearPendingVerification();
    setEmail('');
    setPassword('');
    setErrors({});
    setCode('');
    setVerifyError('');
    setResendCooldown(0);
  };

  if (!mounted) return null;

  // ---- Step 2: OTP verification ----
  if (pendingVerification) {
    return (
      <div className="login-page min-h-screen flex flex-col items-center justify-between bg-grid relative bg-white">
        <div className="absolute top-0 left-0 w-full h-1"
          style={{ background: 'linear-gradient(90deg, #B91C1C, #DC2626, #EF9A9A, #DC2626, #B91C1C)' }} />
        <div className="flex-1" />
        <div className="w-full max-w-md mx-4">
          <div className="text-center mb-8 animate-login-fade-in-up login-delay-1">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
              style={{ background: 'linear-gradient(135deg, #B91C1C, #DC2626)', boxShadow: '0 4px 16px rgba(185,28,28,0.25)' }}>
              <FontAwesomeIcon icon={faFire} className="text-white text-2xl" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-800">Foundry</h1>
            <div className="login-underline-accent w-16 mx-auto mt-2.5 mb-2.5" />
            <p className="text-xs font-medium uppercase text-gray-500" style={{ letterSpacing: '0.15em' }}>by Elsewedy Electric</p>
          </div>

          <div className="login-card-container rounded-xl bg-white p-8 animate-login-fade-in-up login-delay-2">
            <div className="text-center mb-7">
              <h2 className="text-lg font-semibold mb-1.5 text-gray-800">Check your email</h2>
              <p className="text-sm leading-relaxed text-gray-500">
                We sent a 6-digit code to{' '}
                <span className="font-semibold text-gray-800">{pendingVerification.email}</span>
              </p>
            </div>

            {verifyError && (
              <div className="login-error-alert flex items-center gap-2.5 p-3 rounded-lg mb-5"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA' }} role="alert">
                <FontAwesomeIcon icon={faCircleExclamation} className="text-sm shrink-0" style={{ color: '#991B1B' }} />
                <span className="text-sm font-medium" style={{ color: '#991B1B' }}>{verifyError}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="otp-code" className="block text-sm font-medium text-gray-800">Verification code</label>
                <input
                  ref={codeInputRef}
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="login-input w-full py-3 rounded-lg text-2xl font-mono tracking-[0.5em] text-center text-gray-800"
                  style={{ borderRadius: '8px' }}
                  required
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {ttlLeft > 0 ? `Expires in ${ttlDisplay}` : 'Code expired'}
                </span>
                <button type="button" onClick={handleResend} disabled={resendCooldown > 0}
                  className="text-sm font-semibold disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                  style={{ color: resendCooldown > 0 ? undefined : '#B91C1C' }}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>

              <button type="submit"
                className="login-btn w-full py-3 rounded-lg text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2"
                style={{ borderRadius: '8px' }}
                disabled={isVerifying || code.length !== 6}>
                {isVerifying ? (
                  <><div className="login-spinner" /><span>Verifying…</span></>
                ) : (
                  <><span>Verify & sign in</span><FontAwesomeIcon icon={faArrowRight} className="text-xs" /></>
                )}
              </button>
            </form>

            <div className="mt-5 pt-5 text-center" style={{ borderTop: '1px solid #E5E7EB' }}>
              <button type="button" onClick={handleUseAnotherEmail}
                className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
                ← Use a different email
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  // ---- Step 1: email + password ----
  return (
    <div className="login-page min-h-screen flex flex-col items-center justify-between bg-grid relative bg-white">
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: 'linear-gradient(90deg, #B91C1C, #DC2626, #EF9A9A, #DC2626, #B91C1C)' }}
      />
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
            <h2 className="text-lg font-semibold mb-1.5 text-gray-800">Create an account</h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Register to access Foundry
            </p>
          </div>

          {errors.general && (
            <div
              className="login-error-alert flex items-center gap-2.5 p-3 rounded-lg mb-5"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
              role="alert"
            >
              <FontAwesomeIcon icon={faCircleExclamation} className="text-sm shrink-0" style={{ color: '#991B1B' }} />
              <span className="text-sm font-medium" style={{ color: '#991B1B' }}>{errors.general}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-800">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faEnvelope} className="text-sm" style={{ color: '#9CA3AF' }} />
                </div>
                <input
                  type="email"
                  id="reg-email"
                  className={`login-input w-full pl-10 pr-4 py-3 rounded-lg text-sm font-medium text-gray-800 ${errors.email ? 'border-red-400' : ''}`}
                  style={{ borderRadius: '8px' }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
                />
              </div>
              {errors.email && (
                <p className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: '#DC2626' }}>
                  <FontAwesomeIcon icon={faCircleExclamation} className="text-[10px]" />
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="reg-password" className="block text-sm font-medium text-gray-800">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faLock} className="text-sm" style={{ color: '#9CA3AF' }} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reg-password"
                  className={`login-input w-full pl-10 pr-10 py-3 rounded-lg text-sm font-medium text-gray-800 ${errors.password ? 'border-red-400' : ''}`}
                  style={{ borderRadius: '8px' }}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearFieldError('password'); }}
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
              {errors.password && (
                <p className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: '#DC2626' }}>
                  <FontAwesomeIcon icon={faCircleExclamation} className="text-[10px]" />
                  {errors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="login-btn w-full py-3 rounded-lg text-white text-sm font-semibold tracking-wide flex items-center justify-center gap-2 mt-2"
              style={{ borderRadius: '8px' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="login-spinner" />
                  <span>Creating account…</span>
                </>
              ) : (
                <>
                  <span>Create account</span>
                  <FontAwesomeIcon icon={faArrowRight} className="text-xs" />
                </>
              )}
            </button>
          </form>

          <div
            className="flex items-center justify-center mt-6 pt-5"
            style={{ borderTop: '1px solid #E5E7EB' }}
          >
            <span className="text-xs text-gray-500">Already have an account?&nbsp;</span>
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-xs font-semibold"
              style={{ color: '#B91C1C' }}
            >
              Sign in
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