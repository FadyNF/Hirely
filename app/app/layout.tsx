'use client';

// app/app/layout.tsx
//
// This wraps EVERY page under /app (Dashboard, Records, Chatbot, Settings)
// automatically — Next.js applies a layout.tsx to its own folder and every
// folder nested inside it. So this one file is what makes the sidebar
// appear on all three pages without repeating it in each one.

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context';
import { Sidebar } from '@/components/layout';

function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Anyone not logged in gets bounced to /login. This is the actual
  // "front door lock" for the whole authenticated area — every page
  // under /app inherits this check for free, just by living here.
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  // Role split: an employee never sees the company-wide surfaces
  // (Dashboard/Records/Chatbot/Matching/Admin) — only their own scoped
  // view. Conversely admin/root have no linked Employee row, so
  // /app/employee isn't theirs either. This is a client-side redirect for
  // snappy UX everywhere; Dashboard/Records additionally hard-check this
  // server-side (see their page.tsx) since they fetch company-wide data
  // before this effect could ever fire.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !user) return;
    const onEmployeeArea = pathname.startsWith('/app/employee');
    if (user.role === 'employee' && !onEmployeeArea) {
      router.replace('/app/employee');
    } else if (user.role !== 'employee' && onEmployeeArea) {
      router.replace('/app');
    }
  }, [isAuthLoading, isAuthenticated, user, pathname, router]);

  // While we're still checking (or about to redirect), render nothing
  // rather than briefly flashing real page content to a logged-out user.
  if (isAuthLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div
          className="w-8 h-8 rounded-full border-2 border-gray-200 animate-spin"
          style={{ borderTopColor: '#DC2626' }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}