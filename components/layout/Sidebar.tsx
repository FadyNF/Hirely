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
  faGaugeHigh,
  faTableList,
  faComments,
  faGear,
  faRightFromBracket,
  faChevronLeft,
  faChevronRight,
  faBriefcase,
  faUserShield,
  faLifeRing,
  faIdCard,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/context';
import Logo from '@/components/shared/Logo';
import SupportRequestModal from '@/components/shared/SupportRequestModal';

const RED = '#DC2626';

// The four main admin/root destinations. Defined as data, not repeated
// JSX, so adding another page later is a one-line change here, not a
// copy-paste.
const NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: faGaugeHigh },
  { href: '/app/records', label: 'Records', icon: faTableList },
  { href: '/app/chatbot', label: 'Chatbot', icon: faComments },
  { href: '/app/matching', label: 'Job Matching', icon: faBriefcase },
];

// An "employee"-role user gets none of the company-wide surfaces above —
// just their own profile and its scoped chatbot, each its own route
// (rather than an in-page tab switcher) so navigation between them is
// consistent with how every other role gets around: via the sidebar.
const EMPLOYEE_NAV_ITEMS = [
  { href: '/app/employee', label: 'My Profile', icon: faIdCard },
  { href: '/app/employee/assistant', label: 'Assistant', icon: faComments },
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
  const [hovered, setHovered] = useState(false);
  // Background is state-driven (not a raw hover: class) because it's
  // already React-controlled via `active` — a plain Tailwind hover:
  // class can't win against an inline style set on the same property.
  // The hover handlers live on this wrapping span, not on <Link> itself —
  // next/link uses its own onMouseEnter internally (prefetch-on-hover),
  // and layering another one directly on it is unreliable.
  const background = active ? 'rgba(220, 38, 38, 0.08)' : hovered ? '#F9FAFB' : 'transparent';
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="block"
    >
    <Link
      href={href}
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 hover:translate-x-0.5"
      style={{
        color: active ? RED : '#4B5563',
        backgroundColor: background,
        borderLeft: active ? `3px solid ${RED}` : '3px solid transparent',
      }}
    >
      <FontAwesomeIcon icon={icon} className="text-base w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
    </span>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isRoot = user?.role === 'root';
  const isEmployee = user?.role === 'employee';
  const navItems = isEmployee ? EMPLOYEE_NAV_ITEMS : NAV_ITEMS;

  // Exact match for "/app" (Dashboard) and "/app/employee" (My Profile) —
  // both are prefixes of other real routes ("/app/admin", "/app/employee/
  // assistant") that need their OWN nav item highlighted instead, not a
  // plain "starts with". Every other item gets a "starts with" check, so
  // e.g. a future "/app/records/123" detail view still highlights
  // "Records" as active, not just the exact bare URL.
  const EXACT_MATCH_HREFS = new Set(['/app', '/app/employee']);
  const isActive = (href: string) =>
    EXACT_MATCH_HREFS.has(href) ? pathname === href : pathname.startsWith(href);

  return (
    <aside
      className="h-screen sticky top-0 flex flex-col border-r bg-white shrink-0 transition-all duration-200"
      style={{ width: collapsed ? '76px' : '240px', borderColor: '#E5E5E5' }}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-4 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2 overflow-hidden">
          <Logo height={28} className="shrink-0" />
          {!collapsed && <span className="font-bold text-gray-800 truncate">Hirely</span>}
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
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
            active={isActive(item.href)}
          />
        ))}
        {/* Only the root sees this — added conditionally so no non-root
            admin can accidentally click a link that would 302 them right
            back to /app anyway. */}
        {isRoot && (
          <NavLink
            href="/app/admin"
            label="Admin"
            icon={faUserShield}
            collapsed={collapsed}
            active={isActive('/app/admin')}
          />
        )}
      </nav>

      {/* Bottom: account options, separated by a divider */}
      <div className="px-3 py-4 border-t space-y-1" style={{ borderColor: '#E5E5E5' }}>
        {/* <Link
          href="/app/settings"
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faGear} className="text-base w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link> */}
        <button
          onClick={() => setSupportOpen(true)}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <FontAwesomeIcon icon={faLifeRing} className="text-base w-4 shrink-0" />
          {!collapsed && <span>Report an issue</span>}
        </button>
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
            <div className="min-w-0 flex-1">
              <span className="text-xs text-gray-500 truncate block">{user.email}</span>
              {isRoot && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: RED, letterSpacing: '0.08em' }}
                >
                  Root admin
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {supportOpen && user && (
        <SupportRequestModal
          submitterEmail={user.email}
          onClose={() => setSupportOpen(false)}
        />
      )}
    </aside>
  );
}