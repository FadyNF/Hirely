'use client';

// components/employee/EmployeeSelfServiceView.tsx
//
// The "employee"-role landing view: their own HR record (view + edit,
// reusing EmployeeForm exactly as-is) and a chatbot scoped to just that
// record. Unlike Records/Dashboard, there's no list, search, or
// pagination here — there's only ever one record to show, fetched via
// GET /api/employee/me rather than any company-wide query.

import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faIdCard, faComments, faPenToSquare, faBriefcase, faGraduationCap, faCertificate, faBolt } from '@fortawesome/free-solid-svg-icons';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG } from '@/lib/tabConfig';
import { useAuth } from '@/context/AuthContext';
import { parseGpaValue } from '@/lib/chatbotValidate';
import EmployeeForm, { type BuiltEmployeeData, type SubmitResult } from '@/components/shared/EmployeeForm';
import ScopedAssistant from '@/components/employee/ScopedAssistant';

const COLORS = {
  red: '#DC2626',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
};

const RELATION_ICONS: Record<string, typeof faBriefcase> = {
  experience: faBriefcase,
  education: faGraduationCap,
  certificates: faCertificate,
  skills: faBolt,
};

type EmployeeRecord = Record<string, unknown> & { id: number; fullName: string; email: string | null; nationalId: string | null };

export default function EmployeeSelfServiceView() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<'profile' | 'assistant'>('profile');
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  // Bumped to re-trigger the fetch effect below on demand (after saving an
  // edit, or from the scoped Assistant) — same "define the fetch inline in
  // the effect, drive it by a dependency" shape AuthContext's own on-mount
  // hydrate() uses, rather than calling an async function directly from
  // inside a useEffect body.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetch('/api/employee/me');
        const result = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(result.error || 'Could not load your profile.');
          setLoading(false);
          return;
        }
        setEmployee(result.employee);
        setError('');
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Could not reach the server — please try again.');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authFetch, reloadKey]);

  // Same conversions RecordsView's edit flow applies before handing data
  // to EmployeeForm: score 0-1 fraction -> 0-100 percentage, and a saved
  // "value/scale (Name)" gpa string split back into the form's two fields.
  const editInitialData = employee
    ? {
        ...employee,
        performanceReviews: ((employee.performanceReviews as Record<string, unknown>[]) || []).map((p) => ({
          ...p,
          score: Math.round(Number(p.score) * 100),
        })),
        education: ((employee.education as Record<string, unknown>[]) || []).map((e) => {
          if (!e.gpa) return e;
          const { value, scale } = parseGpaValue(String(e.gpa));
          return { ...e, gpa: value, gpaScale: scale };
        }),
      }
    : undefined;

  const handleEditSubmit = async (data: BuiltEmployeeData): Promise<SubmitResult> => {
    // No employeeId in the body — the commit route resolves an
    // employee-role caller to their OWN linked record server-side and
    // ignores anything the client sends for that field.
    const res = await authFetch('/api/chatbot/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', data, replaceRelations: true }),
    });
    const result = await res.json();

    if (res.ok) {
      setEditOpen(false);
      reload();
      return { ok: true };
    }
    if (res.status === 409 && result.field) {
      return { ok: false, fieldError: { field: result.field, message: result.error || 'That value already exists.' } };
    }
    return { ok: false, error: result.error || 'Something went wrong saving that.' };
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: COLORS.black }}>
          My <span style={{ color: COLORS.red }}>Profile</span>
        </h1>
        <p className="text-sm" style={{ color: COLORS.gray }}>
          View and update your own record — nobody else&apos;s data is visible here.
        </p>
      </div>

      <div className="flex gap-2 border-b" style={{ borderColor: COLORS.border }}>
        {(
          [
            { key: 'profile' as const, label: 'My Profile', icon: faIdCard },
            { key: 'assistant' as const, label: 'Assistant', icon: faComments },
          ]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: tab === t.key ? COLORS.red : COLORS.gray,
              borderBottom: tab === t.key ? `2px solid ${COLORS.red}` : '2px solid transparent',
            }}
          >
            <FontAwesomeIcon icon={t.icon} className="text-xs" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="rounded-xl border bg-white p-6 space-y-5" style={{ borderColor: COLORS.border }}>
          {loading ? (
            <p className="text-sm" style={{ color: COLORS.gray }}>Loading your profile…</p>
          ) : error ? (
            <p className="text-sm" style={{ color: COLORS.red }}>{error}</p>
          ) : employee ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>
                  {employee.fullName || '(No name on file yet)'}
                </h2>
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: COLORS.red }}
                >
                  <FontAwesomeIcon icon={faPenToSquare} className="text-xs" />
                  Edit profile
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                {BASIC_INFO_FIELDS.map((key) => {
                  const raw = employee[key];
                  const value = raw === null || raw === undefined || raw === '' ? null : String(raw);
                  return (
                    <div key={key} className="min-w-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#9CA3AF' }}>
                        {BASIC_INFO_LABELS[key]}
                      </p>
                      <p className="text-sm truncate" style={value ? { color: COLORS.black } : { color: '#B0B4BB', fontStyle: 'italic' }}>
                        {value ?? 'Not set yet'}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {MULTI_TAB_CONFIG.map((c) => {
                  const count = ((employee[c.key] as unknown[]) || []).length;
                  return (
                    <span
                      key={c.key}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                      style={count ? { backgroundColor: COLORS.pinkBg, color: COLORS.red } : { backgroundColor: '#F3F4F6', color: '#9CA3AF' }}
                    >
                      <FontAwesomeIcon icon={RELATION_ICONS[c.key]} className="text-[10px]" />
                      {c.label}: {count || 'none yet'}
                    </span>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      )}

      {tab === 'assistant' && employee && (
        <ScopedAssistant
          ownEmployee={{ id: employee.id, fullName: employee.fullName, email: employee.email, nationalId: employee.nationalId }}
          onUpdated={reload}
        />
      )}

      {editOpen && employee && (
        <EmployeeForm
          initialData={editInitialData}
          onSubmit={handleEditSubmit}
          onClose={() => setEditOpen(false)}
          title="Edit my profile"
          subtitle="Update the fields below — existing entries are replaced with whatever's here when you save."
          submitLabel="Save changes"
        />
      )}
    </div>
  );
}
