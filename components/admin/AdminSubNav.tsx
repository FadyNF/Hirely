'use client';

// components/admin/AdminSubNav.tsx
//
// The admin console used to be one page with two long, unpaginated
// sections stacked on top of each other. Split into three real routes
// (Promote / Admins / Support Requests) so each can be paginated
// independently — this is the small in-section nav between them, same
// active-link styling language as the main Sidebar.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const RED = '#DC2626';
const BORDER = '#E5E5E5';

const TABS = [
  { href: '/app/admin', label: 'Promote to Admin' },
  { href: '/app/admin/admins', label: 'Admins' },
  { href: '/app/admin/support-requests', label: 'Support Requests' },
];

export default function AdminSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b" style={{ borderColor: BORDER }}>
      {TABS.map((tab) => {
        // Exact match for the index route (/app/admin) so it doesn't stay
        // highlighted while on /app/admin/admins — the other two are
        // never prefixes of each other so a plain equality check is fine.
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-3.5 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: active ? RED : '#6B7280',
              borderBottom: active ? `2px solid ${RED}` : '2px solid transparent',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
