'use client';

// components/employee/EmployeeSelfServiceView.tsx
//
// The "employee"-role My Profile page (rendered at /app/employee) — their
// own HR record, view + edit, reusing EmployeeForm exactly as-is. The
// scoped Assistant chat lives at its own route now (/app/employee/
// assistant, see components/employee/EmployeeAssistantView.tsx) rather
// than an in-page tab switcher — navigation between the two happens via
// the sidebar, consistent with every other role. Unlike Records/Dashboard,
// there's no list, search, or pagination here — there's only ever one
// record to show, fetched via GET /api/employee/me rather than any
// company-wide query.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPenToSquare, faBriefcase, faGraduationCap, faCertificate, faBolt } from '@fortawesome/free-solid-svg-icons';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG } from '@/lib/tabConfig';
import EmployeeForm from '@/components/shared/EmployeeForm';
import CertificateUpload from '@/components/employee/CertificateUpload';
import { useEmployeeProfile } from '@/components/employee/useEmployeeProfile';

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

export default function EmployeeSelfServiceView() {
  const {
    employee,
    loading,
    error,
    reload,
    editOpen,
    editInitialData,
    chatPrefill,
    openEdit,
    closeEdit,
    handleEditSubmit,
  } = useEmployeeProfile();

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
                onClick={openEdit}
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

            {((employee.certificates as Record<string, unknown>[]) || []).some((c) => c.attachmentPath) && (
              <div className="flex flex-wrap gap-2">
                {((employee.certificates as Record<string, unknown>[]) || [])
                  .filter((c) => c.attachmentPath)
                  .map((c) => (
                    <a
                      key={c.id as number}
                      href={`/api/certificates/${c.id}/attachment`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline underline-offset-2"
                      style={{ color: COLORS.gray }}
                    >
                      View {String(c.certName) || 'attachment'}
                    </a>
                  ))}
              </div>
            )}

            <CertificateUpload onSaved={reload} />
          </>
        ) : null}
      </div>

      {editOpen && employee && (
        <EmployeeForm
          initialData={editInitialData}
          onSubmit={handleEditSubmit}
          onClose={closeEdit}
          title={chatPrefill ? 'Review your update' : 'Edit my profile'}
          subtitle={
            chatPrefill
              ? 'Pre-filled from what you told the Assistant — check the highlighted fields and save when ready.'
              : "Update the fields below — existing entries are replaced with whatever's here when you save."
          }
          submitLabel="Save changes"
        />
      )}
    </div>
  );
}
