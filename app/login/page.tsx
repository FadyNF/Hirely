'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context';
import { LoginScreen } from '@/components/auth';

function LoginInner() {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace(user?.role === 'employee' ? '/app/employee' : '/app');
    }
  }, [isAuthLoading, isAuthenticated, user, router]);

  return <LoginScreen onSwitchToRegister={() => router.push('/register')} />;
}

export default function LoginPage() {
  return (
    <AuthProvider>
      {/* LoginScreen reads useSearchParams() (for the magic-login-expired
          flag) — the App Router requires that behind a Suspense boundary,
          otherwise `next build` fails static generation for this route. */}
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
    </AuthProvider>
  );
}