'use client';

// components/admin/UserRoleActionList.tsx
//
// Shared row/pagination rendering for the two role-flip lists (Promote to
// Admin, Admins/Demote) — same shape (avatar initial, name, email, joined
// date, one action button), differing only in which action and label.
// Paginated client-side via usePagination, same convention RecordsView
// already uses for its employee table.

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { usePagination } from './usePagination';
import PaginationControls from './PaginationControls';

const COLORS = { red: '#DC2626', black: '#111111', gray: '#6B7280', pinkBg: '#FEE2E2', border: '#E5E5E5' };
const PAGE_SIZE = 10;

export interface RoleUser {
  id: number;
  email: string;
  fullName: string | null;
  createdAtIso: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function UserRoleActionList({
  users,
  emptyMessage,
  actionLabel,
  actionBusyLabel,
  actionIcon,
  actionColor,
  onAction,
}: {
  users: RoleUser[];
  emptyMessage: string;
  actionLabel: string;
  actionBusyLabel: string;
  actionIcon: IconDefinition;
  actionColor: string;
  onAction: (userId: number) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const { pageItems, currentPage, totalPages, pageStart, setCurrentPage } = usePagination(users, PAGE_SIZE);

  const handleAction = async (userId: number) => {
    setBusyId(userId);
    try {
      await onAction(userId);
    } finally {
      setBusyId(null);
    }
  };

  if (users.length === 0) {
    return <p className="text-sm" style={{ color: COLORS.gray }}>{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
        {pageItems.map((u) => (
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
              onClick={() => handleAction(u.id)}
              disabled={busyId !== null}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5 transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:hover:opacity-50 disabled:hover:shadow-none shrink-0"
              style={{ backgroundColor: actionColor }}
            >
              <FontAwesomeIcon icon={actionIcon} className="text-xs" />
              {busyId === u.id ? actionBusyLabel : actionLabel}
            </button>
          </div>
        ))}
      </div>
      <PaginationControls
        currentPage={currentPage}
        totalPages={totalPages}
        pageStart={pageStart}
        pageSize={PAGE_SIZE}
        totalCount={users.length}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
