'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context';
import { LoginScreen } from '@/components/auth';

function LoginInner() {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace('/app');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  return <LoginScreen onSwitchToRegister={() => router.push('/register')} />;
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginInner />
    </AuthProvider>
  );
}