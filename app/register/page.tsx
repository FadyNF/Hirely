'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context';
import { RegisterScreen } from '@/components/auth';

function RegisterInner() {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace(user?.role === 'employee' ? '/app/employee' : '/app');
    }
  }, [isAuthLoading, isAuthenticated, user, router]);

  return <RegisterScreen onSwitchToLogin={() => router.push('/login')} />;
}

export default function RegisterPage() {
  return (
    <AuthProvider>
      <RegisterInner />
    </AuthProvider>
  );
}