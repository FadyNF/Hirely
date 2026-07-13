'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context';
import PendingApprovalScreen from '@/components/auth/PendingApprovalScreen';

function PendingInner() {
  const { pendingApproval, isAuthenticated, isAuthLoading } = useAuth();
  const router = useRouter();

  // Guard against visiting /pending directly (typing it in, back button
  // after logout, etc.) — if there's no pending-approval state stashed,
  // there's nothing meaningful to show, so bounce to the appropriate
  // landing spot.
  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated) {
      router.replace('/app');
    } else if (!pendingApproval) {
      router.replace('/login');
    }
  }, [pendingApproval, isAuthenticated, isAuthLoading, router]);

  if (isAuthLoading || (!pendingApproval && !isAuthenticated)) return null;
  return <PendingApprovalScreen />;
}

export default function PendingPage() {
  return (
    <AuthProvider>
      <PendingInner />
    </AuthProvider>
  );
}
