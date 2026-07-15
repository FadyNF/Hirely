import { useState } from 'react';

// Shared client-side pagination math — same shape RecordsView.tsx already
// uses (fetch the full list server-side, slice it in the browser). Pulled
// into one hook since the admin console now has three separate paginated
// lists (Promote, Admins, Support Requests) that would otherwise each
// hand-roll the same six lines.
export function usePagination<T>(items: T[], pageSize: number) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = items.slice(pageStart, pageStart + pageSize);
  return { pageItems, currentPage: safePage, totalPages, pageStart, setCurrentPage };
}
