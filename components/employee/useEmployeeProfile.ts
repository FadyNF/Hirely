'use client';

// components/employee/useEmployeeProfile.ts
//
// Shared between the My Profile page and the Assistant page (two separate
// routes now, see components/layout/Sidebar.tsx) — both need the same
// "fetch my own record, hold the edit-form modal's state, merge a
// chat-driven update in on top" logic, since the Assistant page opens the
// same EmployeeForm modal in place when the chat hands off an update
// rather than navigating to the profile page to do it.

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { parseGpaValue } from '@/lib/chatbotValidate';
import type { BuiltEmployeeData, SubmitResult } from '@/components/shared/EmployeeForm';

export type EmployeeRecord = Record<string, unknown> & { id: number; fullName: string; email: string | null; nationalId: string | null };

const RELATION_KEYS_LIST = ['experience', 'education', 'certificates', 'skills', 'performanceReviews'] as const;

// Chat-extracted data is always PARTIAL (only whatever the message
// actually mentioned) and, for relations, always the NEW entry alone —
// never the complete list. Since EmployeeForm always saves via
// replaceRelations: true (a full-record resubmit), naively using the
// chat data as-is for a relation key would wipe out every existing entry
// that wasn't just mentioned. Scalars overwrite (the chat value wins);
// relation arrays append onto what's already on file.
function mergeChatDataIntoEmployee(base: EmployeeRecord, chatData: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(chatData)) {
    if ((RELATION_KEYS_LIST as readonly string[]).includes(key) && Array.isArray(value)) {
      merged[key] = [...((base[key] as unknown[]) || []), ...value];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

export function useEmployeeProfile() {
  const { authFetch } = useAuth();
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  // Set only when the Assistant chat hands off an "update" request — see
  // openEditFromChat below. Merged on top of the current profile before
  // EmployeeForm opens, so a chat message like "update my phone" goes
  // through the exact same full-record validation (required fields, enum
  // dropdowns, date/format checks) as manually clicking Edit profile,
  // instead of the lighter server-only check the chatbot's direct-commit
  // path used to rely on alone.
  const [chatPrefill, setChatPrefill] = useState<Record<string, unknown> | null>(null);
  // Bumped to re-trigger the fetch effect below on demand (after saving an
  // edit) — same "define the fetch inline in the effect, drive it by a
  // dependency" shape AuthContext's own on-mount hydrate() uses, rather
  // than calling an async function directly from inside a useEffect body.
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
  const editSource = employee && chatPrefill ? (mergeChatDataIntoEmployee(employee, chatPrefill) as EmployeeRecord) : employee;
  const editInitialData = editSource
    ? {
        ...editSource,
        performanceReviews: ((editSource.performanceReviews as Record<string, unknown>[]) || []).map((p) => ({
          ...p,
          score: Math.round(Number(p.score) * 100),
        })),
        education: ((editSource.education as Record<string, unknown>[]) || []).map((e) => {
          if (!e.gpa) return e;
          const { value, scale } = parseGpaValue(String(e.gpa));
          return { ...e, gpa: value, gpaScale: scale };
        }),
      }
    : undefined;

  const openEdit = useCallback(() => {
    setChatPrefill(null);
    setEditOpen(true);
  }, []);

  // The Assistant chat's hand-off point: instead of committing an
  // "update" extraction directly, open the real edit form pre-filled with
  // it — same validation, same UI, as clicking Edit profile by hand.
  const openEditFromChat = useCallback((data: Record<string, unknown>) => {
    setChatPrefill(data);
    setEditOpen(true);
  }, []);

  const closeEdit = useCallback(() => {
    setEditOpen(false);
    setChatPrefill(null);
  }, []);

  const handleEditSubmit = useCallback(
    async (data: BuiltEmployeeData): Promise<SubmitResult> => {
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
        closeEdit();
        reload();
        return { ok: true };
      }
      if (res.status === 409 && result.field) {
        return { ok: false, fieldError: { field: result.field, message: result.error || 'That value already exists.' } };
      }
      return { ok: false, error: result.error || 'Something went wrong saving that.' };
    },
    [authFetch, closeEdit, reload]
  );

  return {
    employee,
    loading,
    error,
    reload,
    editOpen,
    editInitialData,
    chatPrefill,
    openEdit,
    openEditFromChat,
    closeEdit,
    handleEditSubmit,
  };
}
