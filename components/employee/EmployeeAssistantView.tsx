'use client';

// components/employee/EmployeeAssistantView.tsx
//
// The "employee"-role Assistant page (rendered at /app/employee/assistant)
// — its own route now rather than a tab on the My Profile page, so
// navigating between them goes through the sidebar like every other role.
// Shares the same profile-fetch/edit-modal state as EmployeeSelfServiceView
// via useEmployeeProfile, since a chat-driven "update" hands off to the
// exact same EmployeeForm modal, opened right here rather than requiring a
// trip to the My Profile page.

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments } from '@fortawesome/free-solid-svg-icons';
import EmployeeForm from '@/components/shared/EmployeeForm';
import ScopedAssistant from '@/components/employee/ScopedAssistant';
import { useEmployeeProfile } from '@/components/employee/useEmployeeProfile';

const COLORS = { red: '#DC2626', black: '#111111', gray: '#6B7280', border: '#E5E5E5' };

export default function EmployeeAssistantView() {
  const {
    employee,
    loading,
    error,
    editOpen,
    editInitialData,
    chatPrefill,
    openEditFromChat,
    closeEdit,
    handleEditSubmit,
  } = useEmployeeProfile();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2" style={{ color: COLORS.black }}>
          <FontAwesomeIcon icon={faComments} className="text-base" style={{ color: COLORS.red }} />
          Assistant
        </h1>
        <p className="text-sm" style={{ color: COLORS.gray }}>
          Ask about or update your own profile — nobody else&apos;s data is visible here.
        </p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: COLORS.gray }}>Loading your profile…</p>
      ) : error ? (
        <p className="text-sm" style={{ color: COLORS.red }}>{error}</p>
      ) : employee ? (
        <ScopedAssistant
          ownEmployee={{ id: employee.id, fullName: employee.fullName, email: employee.email, nationalId: employee.nationalId }}
          onRequestEdit={openEditFromChat}
        />
      ) : null}

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
