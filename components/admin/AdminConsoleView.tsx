'use client';

// components/admin/AdminConsoleView.tsx
//
// The root's console UI — two sections: pending admin approvals (with
// Approve / Decline actions) and open support requests (with Mark
// resolved / Reopen). Small enough to live in one file; splitting the
// two sections into separate components isn't paying for itself yet.
// Kept purely client-side because the actions all mutate via fetch +
// router.refresh() rather than form actions.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark, faEnvelope, faTriangleExclamation, faLightbulb, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';

const COLORS = {
  red: '#DC2626',
  redDark: '#B91C1C',
  black: '#111111',
  gray: '#6B7280',
  border: '#E5E5E5',
  pinkBg: '#FEE2E2',
  green: '#16A34A',
  amber: '#B45309',
};

export interface PendingAdmin {
  id: number;
  email: string;
  emailVerified: boolean;
  createdAtIso: string;
}

export interface SupportRequestSummary {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
  submittedByEmail: string;
  submittedById: number | null;
  createdAtIso: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof faTriangleExclamation; color: string }> = {
  issue: { label: 'Issue', icon: faTriangleExclamation, color: COLORS.red },
  request: { label: 'Request', icon: faLightbulb, color: COLORS.amber },
  other: { label: 'Other', icon: faCircleQuestion, color: COLORS.gray },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-6" style={{ borderColor: COLORS.border }}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>{title}</h2>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: COLORS.gray }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function AdminConsoleView({ pending, requests }: { pending: PendingAdmin[]; requests: SupportRequestSummary[] }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  // Per-row busy state so an in-flight action disables just that row's
  // buttons, not the whole page — a plain boolean would freeze every
  // Approve/Decline while any single one is running.
  const [busyId, setBusyId] = useState<string | null>(null);

  const approve = async (userId: number) => {
    setBusyId(`approve:${userId}`);
    try {
      const res = await authFetch(`/api/admin/approvals/${userId}`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const decline = async (userId: number) => {
    setBusyId(`decline:${userId}`);
    try {
      const res = await authFetch(`/api/admin/approvals/${userId}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (requestId: number, status: 'open' | 'resolved') => {
    setBusyId(`sr:${requestId}`);
    try {
      const res = await authFetch(`/api/admin/support-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: COLORS.black }}>
          Admin <span style={{ color: COLORS.red }}>Console</span>
        </h1>
        <p className="text-sm" style={{ color: COLORS.gray }}>
          Approve new admins and respond to support requests
        </p>
      </div>

      <SectionCard
        title="Pending admin approvals"
        subtitle="People who registered and verified their email — waiting on you to let them in"
      >
        {pending.length === 0 ? (
          <p className="text-sm" style={{ color: COLORS.gray }}>Nobody's waiting. All caught up.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
            {pending.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ background: COLORS.pinkBg, color: COLORS.red }}
                >
                  {u.email.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: COLORS.black }}>{u.email}</p>
                  <p className="text-xs" style={{ color: COLORS.gray }}>
                    Registered {formatDate(u.createdAtIso)}
                    {!u.emailVerified && <span style={{ color: COLORS.amber }}> · email not verified yet</span>}
                  </p>
                </div>
                <button
                  onClick={() => approve(u.id)}
                  disabled={busyId !== null}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:hover:opacity-50 disabled:hover:shadow-none shrink-0"
                  style={{ backgroundColor: COLORS.green }}
                >
                  <FontAwesomeIcon icon={faCheck} className="text-xs" />
                  {busyId === `approve:${u.id}` ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete pending signup for ${u.email}? They'll be able to re-register with the same email later.`)) {
                      decline(u.id);
                    }
                  }}
                  disabled={busyId !== null}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0"
                  style={{ borderColor: COLORS.border, color: COLORS.black }}
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                  {busyId === `decline:${u.id}` ? 'Declining…' : 'Decline'}
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Support requests"
        subtitle="Issues and requests submitted from the app — including from pending admins"
      >
        {requests.length === 0 ? (
          <p className="text-sm" style={{ color: COLORS.gray }}>No support messages yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const meta = TYPE_META[r.type] ?? TYPE_META.other;
              const isResolved = r.status === 'resolved';
              return (
                <div
                  key={r.id}
                  className="rounded-lg border p-4 transition-colors"
                  style={{
                    borderColor: COLORS.border,
                    background: isResolved ? '#F9FAFB' : 'white',
                    opacity: isResolved ? 0.75 : 1,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: '#F9FAFB' }}
                    >
                      <FontAwesomeIcon icon={meta.icon} className="text-sm" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                        <span className="text-xs font-medium uppercase" style={{ color: meta.color, letterSpacing: '0.05em' }}>
                          {meta.label}
                        </span>
                        <span className="text-sm font-semibold" style={{ color: COLORS.black }}>{r.subject}</span>
                      </div>
                      <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: COLORS.gray }}>
                        <FontAwesomeIcon icon={faEnvelope} className="text-[10px]" />
                        {r.submittedByEmail}
                        {r.submittedById === null && (
                          <span style={{ color: COLORS.amber }}> · account no longer exists</span>
                        )}
                        <span>· {formatDate(r.createdAtIso)}</span>
                      </p>
                      <p className="text-sm whitespace-pre-wrap" style={{ color: COLORS.black }}>{r.message}</p>
                    </div>
                    <button
                      onClick={() => setStatus(r.id, isResolved ? 'open' : 'resolved')}
                      disabled={busyId !== null}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0"
                      style={{ borderColor: COLORS.border, color: COLORS.black }}
                    >
                      {busyId === `sr:${r.id}` ? '…' : isResolved ? 'Reopen' : 'Mark resolved'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
