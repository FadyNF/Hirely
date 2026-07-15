'use client';

const COLORS = { border: '#E5E5E5', black: '#111111', gray: '#6B7280' };

export default function PaginationControls({
  currentPage,
  totalPages,
  pageStart,
  pageSize,
  totalCount,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  pageStart: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between pt-1">
      <p className="text-xs" style={{ color: COLORS.gray }}>
        Showing {pageStart + 1}–{Math.min(pageStart + pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: COLORS.border, color: COLORS.black }}
        >
          Previous
        </button>
        <span className="text-xs" style={{ color: COLORS.gray }}>
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: COLORS.border, color: COLORS.black }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
