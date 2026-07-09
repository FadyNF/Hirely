'use client';

// components/layout/Sidebar.tsx
//
// The permanent left-hand navigation for the authenticated app area.
// Two widths: expanded (icons + labels) and collapsed (icons only) —
// toggled by the chevron button, tracked with plain useState (no need
// to persist this across reloads for now, keeps it simple).

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faGaugeHigh,
  faTableList,
  faComments,
  faGear,
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';

const RED = '#DC2626';
const RED_DARK = '#B91C1C';

// The three main destinations. Defined as data, not repeated JSX, so
// adding a fourth page later is a one-line change here, not a copy-paste.
const NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: faGaugeHigh },
  { href: '/app/records', label: 'Records', icon: faTableList },
  { href: '/app/chatbot', label: 'Chatbot', icon: faComments },
];

function NavLink({
  href,
  label,
  icon,
  collapsed,
  active,
}: {
  href: string;
  label: string;
  icon: typeof faGaugeHigh;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors"
      style={{
        color: active ? RED : '#4B5563',
        backgroundColor: active ? 'rgba(220, 38, 38, 0.08)' : 'transparent',
        borderLeft: active ? `3px solid ${RED}` : '3px solid transparent',
      }}
    >
      <FontAwesomeIcon icon={icon} className="text-base w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Exact match for "/app" (Dashboard), but a "starts with" check for the
  // others — so "/app/records/123" (a future detail view) still highlights
  // "Records" as active, not just the exact bare URL.
  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <aside
      className="h-screen sticky top-0 flex flex-col border-r bg-white shrink-0 transition-all duration-200"
      style={{ width: collapsed ? '76px' : '240px', borderColor: '#E5E5E5' }}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${RED_DARK}, ${RED})` }}
          >
            <FontAwesomeIcon icon={faFire} className="text-white text-sm" />
          </div>
          {!collapsed && <span className="font-bold text-gray-800 truncate">Foundry</span>}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} className="text-xs" />
        </button>
      </div>

      {/* Main navigation — takes up remaining space so the bottom
          section (below) is always pinned to the bottom, not just
          sitting wherever the last nav item happens to end. */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
            active={isActive(item.href)}
          />
        ))}
      </nav>

      {/* Bottom: account options, separated by a divider */}
      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: '#E5E5E5' }}>
        <Link
          href="/app/settings"
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faGear} className="text-base w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faRightFromBracket} className="text-base w-4 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>

        {/* Small account chip at the very bottom, so it's always clear
            who's actually logged in. */}
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-3.5 pt-3 mt-2 border-t" style={{ borderColor: '#F3F4F6' }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
              style={{ background: '#FEE2E2', color: RED }}
            >
              {user.email.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-gray-500 truncate">{user.email}</span>
          </div>
        )}
      </div>
    </aside>
  );
}