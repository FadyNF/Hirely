'use client';

// components/admin/AdminConsoleView.tsx
//
// The root's console UI — two sections: promoting employees to admin, and
// open support requests (with Mark resolved / Reopen). Small enough to
// live in one file; splitting the two sections into separate components
// isn't paying for itself yet. Kept purely client-side because the
// actions all mutate via fetch + router.refresh() rather than form
// actions.
//
// There's no more "pending approval" queue here — every signup already
// lands as a fully usable employee account (see the onboarding rewrite),
// so promoting is a one-way, non-destructive action with no decline/undo
// step needed.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faEnvelope, faTriangleExclamation, faLightbulb, faCircleQuestion, faReply } from '@fortawesome/free-solid-svg-icons';
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

export interface EmployeeUser {
  id: number;
  email: string;
  fullName: string | null;
  createdAtIso: string;
}

export interface SupportRequestSummary {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
  // The root's written response, if any — see PATCH /api/admin/support-requests/[id].
  // Set when resolving; left in place across a later reopen so a
  // re-resolve doesn't lose what was already written.
  rootReply: string | null;
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

export default function AdminConsoleView({ pending, requests }: { pending: EmployeeUser[]; requests: SupportRequestSummary[] }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  // Per-row busy state so an in-flight action disables just that row's
  // buttons, not the whole page — a plain boolean would freeze every
  // Promote button while any single one is running.
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which request's reply box is currently open — at most one at a time,
  // so "Mark resolved" doesn't fire immediately but instead reveals an
  // inline textarea first (the reply is optional; Send resolves either way).
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  // Set when the DB update succeeded but the email failed to send — used
  // by the support-request "resolve" flow only now (promoting sends no
  // email). Namespaced like busyId since ids across the two lists can
  // collide.
  const [emailWarningId, setEmailWarningId] = useState<string | null>(null);

  const promote = async (userId: number) => {
    setBusyId(`promote:${userId}`);
    try {
      const res = await authFetch(`/api/admin/approvals/${userId}`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (requestId: number, status: 'open' | 'resolved', reply?: string) => {
    setBusyId(`sr:${requestId}`);
    setEmailWarningId(null);
    try {
      const res = await authFetch(`/api/admin/support-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply !== undefined ? { status, reply } : { status }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        if (status === 'resolved' && json.emailSent === false) setEmailWarningId(`sr:${requestId}`);
        setReplyingId(null);
        setReplyDraft('');
        router.refresh();
      }
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
          Promote employees to admin and respond to support requests
        </p>
      </div>

      <SectionCard
        title="Promote to admin"
        subtitle="Every self-service employee account — pick who should also get admin access"
      >
        {pending.length === 0 ? (
          <p className="text-sm" style={{ color: COLORS.gray }}>No employee accounts yet.</p>
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
                  <p className="text-sm font-medium truncate" style={{ color: COLORS.black }}>
                    {u.fullName || '(No name on file)'}
                  </p>
                  <p className="text-xs" style={{ color: COLORS.gray }}>
                    {u.email} · Joined {formatDate(u.createdAtIso)}
                  </p>
                </div>
                <button
                  onClick={() => promote(u.id)}
                  disabled={busyId !== null}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:hover:opacity-50 disabled:hover:shadow-none shrink-0"
                  style={{ backgroundColor: COLORS.green }}
                >
                  <FontAwesomeIcon icon={faArrowUp} className="text-xs" />
                  {busyId === `promote:${u.id}` ? 'Promoting…' : 'Promote'}
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
                      {r.rootReply && (
                        <div className="mt-2.5 pl-3 border-l-2" style={{ borderColor: COLORS.border }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: COLORS.gray, letterSpacing: '0.05em' }}>
                            Your reply
                          </p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: COLORS.gray }}>{r.rootReply}</p>
                        </div>
                      )}
                      {emailWarningId === `sr:${r.id}` && (
                        <p className="text-xs mt-2" style={{ color: COLORS.amber }}>
                          Marked resolved, but the notification email couldn't be sent — check the server logs.
                        </p>
                      )}
                      {replyingId === r.id && (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            placeholder="Optional note back to the submitter — included in the resolved-notification email"
                            rows={3}
                            maxLength={5000}
                            autoFocus
                            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 resize-none"
                            style={{ borderColor: COLORS.border }}
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setReplyingId(null); setReplyDraft(''); }}
                              disabled={busyId !== null}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                              style={{ borderColor: COLORS.border, color: COLORS.black }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => setStatus(r.id, 'resolved', replyDraft.trim())}
                              disabled={busyId !== null}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50"
                              style={{ backgroundColor: COLORS.green }}
                            >
                              <FontAwesomeIcon icon={faReply} className="text-xs" />
                              {busyId === `sr:${r.id}` ? 'Sending…' : 'Send & resolve'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {replyingId !== r.id && (
                      <button
                        onClick={() => {
                          if (isResolved) {
                            setStatus(r.id, 'open');
                          } else {
                            setReplyDraft('');
                            setReplyingId(r.id);
                          }
                        }}
                        disabled={busyId !== null}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0"
                        style={{ borderColor: COLORS.border, color: COLORS.black }}
                      >
                        {busyId === `sr:${r.id}` ? '…' : isResolved ? 'Reopen' : 'Mark resolved'}
                      </button>
                    )}
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
