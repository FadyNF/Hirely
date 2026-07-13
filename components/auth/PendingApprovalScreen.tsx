'use client';

// components/auth/PendingApprovalScreen.tsx
//
// Shown after a successful email verification for accounts that still
// need the root admin to approve them. Same visual language as the
// LoginScreen / RegisterScreen (grid background, red gradient bar,
// Wedy.ai logo card) so it feels like a natural step in the same flow.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHourglassHalf, faEnvelopeCircleCheck, faArrowRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';
import Logo from '@/components/shared/Logo';
import SupportRequestModal from '@/components/shared/SupportRequestModal';

export default function PendingApprovalScreen() {
  const { pendingApproval, logout, clearPendingApproval } = useAuth();
  const router = useRouter();
  const [supportOpen, setSupportOpen] = useState(false);

  const handleLogout = () => {
    logout();
    clearPendingApproval();
    router.replace('/login');
  };

  return (
    <div className="login-page min-h-screen flex flex-col items-center justify-between bg-grid relative bg-white">
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: 'linear-gradient(90deg, #B91C1C, #DC2626, #EF9A9A, #DC2626, #B91C1C)' }}
      />

      <div className="flex-1" />

      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8 animate-login-fade-in-up login-delay-1">
          <div className="inline-flex items-center justify-center mb-5">
            <Logo height={56} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-gray-800">Hirely</h1>
          <div className="login-underline-accent w-16 mx-auto mt-2.5 mb-2.5" />
          <p className="text-xs font-medium uppercase text-gray-500" style={{ letterSpacing: '0.15em' }}>
            by Elsewedy Electric
          </p>
        </div>

        <div className="login-card-container rounded-xl bg-white p-8 animate-login-fade-in-up login-delay-2" style={{ borderRadius: '12px' }}>
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
              style={{ background: '#FEF2F2' }}
            >
              <FontAwesomeIcon icon={faHourglassHalf} className="text-2xl" style={{ color: '#B91C1C' }} />
            </div>
            <h2 className="text-lg font-semibold mb-1.5 text-gray-800">Waiting for approval</h2>
            <p className="text-sm leading-relaxed text-gray-500">
              Your account is pending review by an administrator. Once it&apos;s approved, we&apos;ll email you a link that signs you in directly — no need to come back here.
            </p>
          </div>

          {pendingApproval && (
            <div
              className="flex items-center gap-2.5 p-3 rounded-lg mb-6 border"
              style={{ background: '#F9FAFB', borderColor: '#E5E7EB' }}
            >
              <FontAwesomeIcon icon={faEnvelopeCircleCheck} className="text-sm" style={{ color: '#4B5563' }} />
              <span className="text-sm text-gray-700 truncate">{pendingApproval.email}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              onClick={() => setSupportOpen(true)}
              className="w-full text-sm font-semibold py-2.5 rounded-lg text-white transition-all hover:opacity-90 hover:shadow-md"
              style={{ backgroundColor: '#DC2626' }}
            >
              Request assistance
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-sm font-medium py-2.5 rounded-lg border flex items-center justify-center gap-2 transition-colors hover:bg-gray-50"
              style={{ borderColor: '#E5E5E5', color: '#111111' }}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} className="text-xs" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1" />

      <footer className="w-full py-5 text-center animate-login-fade-in-up login-delay-5 shrink-0">
        <p className="text-[11px] text-gray-500">
          &copy; 2026 Hirely. All rights reserved.
        </p>
      </footer>

      {supportOpen && (
        <SupportRequestModal
          submitterEmail={pendingApproval?.email ?? ''}
          onClose={() => setSupportOpen(false)}
        />
      )}
    </div>
  );
}
