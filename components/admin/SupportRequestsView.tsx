'use client';

// components/admin/SupportRequestsView.tsx
//
// Split out of the old monolithic AdminConsoleView.tsx (now its own
// /app/admin/support-requests subpage) — same reply/resolve/reopen
// behavior as before, now paginated client-side so a long history of
// requests doesn't mean one endless scroll.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faTriangleExclamation, faLightbulb, faCircleQuestion, faReply } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';
import { usePagination } from './usePagination';
import PaginationControls from './PaginationControls';

const COLORS = {
  red: '#DC2626', black: '#111111', gray: '#6B7280',
  border: '#E5E5E5', green: '#16A34A', amber: '#B45309',
};
const PAGE_SIZE = 10;

export interface SupportRequestSummary {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
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
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SupportRequestsView({ requests }: { requests: SupportRequestSummary[] }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [emailWarningId, setEmailWarningId] = useState<number | null>(null);
  const { pageItems, currentPage, totalPages, pageStart, setCurrentPage } = usePagination(requests, PAGE_SIZE);

  const setStatus = async (requestId: number, status: 'open' | 'resolved', reply?: string) => {
    setBusyId(requestId);
    setEmailWarningId(null);
    try {
      const res = await authFetch(`/api/admin/support-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reply !== undefined ? { status, reply } : { status }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        if (status === 'resolved' && json.emailSent === false) setEmailWarningId(requestId);
        setReplyingId(null);
        setReplyDraft('');
        router.refresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return <p className="text-sm" style={{ color: COLORS.gray }}>No support messages yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {pageItems.map((r) => {
          const meta = TYPE_META[r.type] ?? TYPE_META.other;
          const isResolved = r.status === 'resolved';
          return (
            <div
              key={r.id}
              className="rounded-lg border p-4 transition-colors"
              style={{ borderColor: COLORS.border, background: isResolved ? '#F9FAFB' : 'white', opacity: isResolved ? 0.75 : 1 }}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: '#F9FAFB' }}>
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
                    {r.submittedById === null && <span style={{ color: COLORS.amber }}> · account no longer exists</span>}
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
                  {emailWarningId === r.id && (
                    <p className="text-xs mt-2" style={{ color: COLORS.amber }}>
                      Marked resolved, but the notification email couldn&apos;t be sent — check the server logs.
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
                          {busyId === r.id ? 'Sending…' : 'Send & resolve'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {replyingId !== r.id && (
                  <button
                    onClick={() => {
                      if (isResolved) setStatus(r.id, 'open');
                      else { setReplyDraft(''); setReplyingId(r.id); }
                    }}
                    disabled={busyId !== null}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    style={{ borderColor: COLORS.border, color: COLORS.black }}
                  >
                    {busyId === r.id ? '…' : isResolved ? 'Reopen' : 'Mark resolved'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageSize={PAGE_SIZE}
        totalCount={requests.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
