'use client';

// components/chatbot/ChatbotView.tsx
//
// Visual structure ported from their real ChatArea.tsx — welcome screen,
// avatar + bubble message layout, typing indicator, input console — with
// everything voice/attachment/Excel/avatar-customization related left out,
// since none of that applies to a CRUD-only employee data assistant.
// Every piece of OUR logic (extraction, resolution, one-by-one field
// collection, disambiguation, confirmation) is unchanged from before.

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire, faRobot, faPaperPlane, faCheck, faXmark,
  faUserPlus, faUserPen, faCircleQuestion, faIdCard,
  faBriefcase, faGraduationCap, faCertificate, faBolt,
  faPaperclip, faSpinner, faCircleExclamation, faFileExcel,
  faFileArrowUp, faFileArrowDown, faUser, faUsers,
  faChevronRight, faChevronDown, faPlus,
} from '@fortawesome/free-solid-svg-icons';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS } from '@/lib/tabConfig';
import { useAuth } from '@/context/AuthContext';
import EmployeeForm, { type BuiltEmployeeData, type SubmitResult } from './EmployeeForm';
import BatchImportModal from '@/components/shared/BatchImportModal';

const RELATION_LABELS: Record<string, string> = {
  experience: 'Experience', education: 'Education',
  certificates: 'Certificates', skills: 'Skills',
};
const RELATION_KEYS = Object.keys(RELATION_LABELS);

const COLORS = {
  red: '#DC2626',
  redDark: '#B91C1C',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
};

interface EmployeeMatch {
  id: number;
  fullName: string;
  email: string | null;
  nationalId: string | null;
}

interface ExtractResponse {
  action: 'create' | 'update' | 'disambiguate' | 'unsupported' | 'needsInfo' | 'invalidField' | 'info' | 'disambiguateRead' | 'confirmIdentity' | 'askIdentity' | 'createForm';
  matches?: EmployeeMatch[];
  data?: Record<string, unknown>;
  field?: string;
  reason?: string;
  warnings?: string[];
  message?: string;
  found?: boolean;
  employee?: Record<string, unknown>;
  requestedFields?: string[];
  suggestedEmployee?: { id: number; fullName: string };
}

const FIELD_QUESTIONS: Record<string, string> = {
  fullName: "What's the employee's full name?",
  phone: "What's their phone number? (11 digits, e.g. 01012345678)",
  birthDate: "What's their birth date? (YYYY-MM-DD)",
  nationality: "What's their nationality?",
  maritalStatus: "What's their marital status? (Single, Married, Divorced, or Widowed)",
  email: "What's their email address?",
  workLocation: "Which department are they in?",
  gender: "What's their gender? (Male or Female)",
  nationalId: "What's their National ID? (exactly 14 digits)",
  militaryStatus: "What's their military status? (Exempted, Completed, Postponed, or Not Applicable)",
};

interface Message {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  pending?: ExtractResponse;
  importQueue?: ImportQueueItem[];
  timestamp: string;
}

// One entry per file selected for Excel import. 'parsing' while the
// server-side parse+classify pipeline runs, then settles to 'ready' (with
// pre-fill data for the review modal) or 'error'.
interface ImportQueueItem {
  fileName: string;
  status: 'parsing' | 'ready' | 'error';
  initialData?: Record<string, unknown>;
  error?: string;
}

function genId() {
  return Math.random().toString(36).slice(2);
}

function nowTimestamp() {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function summarizeData(data: Record<string, unknown>) {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(BASIC_INFO_LABELS)) {
    if (data[key]) lines.push(`${label}: ${data[key]}`);
  }
  if (Array.isArray(data.experience) && data.experience.length) {
    lines.push(`Experience: +${data.experience.length} entr${data.experience.length > 1 ? 'ies' : 'y'}`);
  }
  if (Array.isArray(data.education) && data.education.length) {
    lines.push(`Education: +${data.education.length} entr${data.education.length > 1 ? 'ies' : 'y'}`);
  }
  if (Array.isArray(data.certificates) && data.certificates.length) {
    lines.push(`Certificates: +${data.certificates.length} entr${data.certificates.length > 1 ? 'ies' : 'y'}`);
  }
  if (Array.isArray(data.skills) && data.skills.length) {
    lines.push(`Skills: +${data.skills.length} entr${data.skills.length > 1 ? 'ies' : 'y'}`);
  }
  return lines;
}

const RELATION_ICONS = {
  experience: faBriefcase, education: faGraduationCap,
  certificates: faCertificate, skills: faBolt,
} as const;

// Some existing records have the literal string "null" (or "undefined")
// stored instead of a real NULL — leftover from data that reached the
// database without going through validateFieldValue (e.g. direct writes
// to /api/chatbot/commit). Treat those the same as a genuinely empty
// value rather than displaying the word "null" as if it were real data.
function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length === 0 || trimmed === 'null' || trimmed === 'undefined';
}

// ---- Profile display (the "info" lookup card) ----
// Separate from summarizeData (used for create/update proposals, which
// only lists fields actually being SET) — this is for "tell me about X" /
// "what's his Y" answers, where blanks should be visible as "missing"
// rather than silently dropped.

function ProfileFieldGrid({ employee, fields }: { employee: Record<string, unknown>; fields: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {fields.map((key) => {
        const raw = employee[key];
        const value = isBlankValue(raw) ? null : String(raw);
        return (
          <div key={key} className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: '#9CA3AF' }}>
              {BASIC_INFO_LABELS[key] ?? key}
            </p>
            <p className="text-sm truncate" style={value ? { color: COLORS.black } : { color: '#B0B4BB', fontStyle: 'italic' }}>
              {value ?? 'missing'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function RelationBadges({ employee, keys }: { employee: Record<string, unknown>; keys: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => {
        const arr = employee[key];
        const count = Array.isArray(arr) ? arr.length : 0;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
            style={count
              ? { backgroundColor: COLORS.pinkBg, color: COLORS.red }
              : { backgroundColor: '#F3F4F6', color: '#9CA3AF', fontStyle: 'italic' }}
          >
            <FontAwesomeIcon icon={RELATION_ICONS[key as keyof typeof RELATION_ICONS]} className="text-[10px]" />
            {RELATION_LABELS[key]}: {count ? `+${count}` : 'missing'}
          </span>
        );
      })}
    </div>
  );
}

// The admin asked about a relation BY NAME ("show me his experience") —
// so show the actual entries, not just how many there are.
function relationEntrySummary(key: string, entry: Record<string, unknown>): { title: string; subtitle?: string; meta?: string } {
  const clean = (v: unknown) => (isBlankValue(v) ? undefined : v);
  const join = (parts: unknown[], sep: string) => parts.map(clean).filter(Boolean).join(sep) || undefined;

  switch (key) {
    case 'experience':
      return {
        title: join([entry.jobTitle, entry.company], ' at ') ?? 'Untitled role',
        subtitle: join([entry.startDate, entry.endDate], ' – '),
        meta: clean(entry.description) as string | undefined,
      };
    case 'education':
      return {
        title: join([entry.degree, entry.fieldOfStudy], ', ') ?? 'Untitled degree',
        subtitle: join([entry.institution, entry.graduationYear], ' · '),
        meta: entry.gpa != null ? `GPA: ${entry.gpa}` : undefined,
      };
    case 'certificates':
      return {
        title: (clean(entry.certName) as string | undefined) ?? 'Untitled certificate',
        subtitle: clean(entry.issuer) ? `Issued by ${entry.issuer}` : undefined,
        meta: [
          !isBlankValue(entry.issueDate) ? `Issued ${entry.issueDate}` : null,
          !isBlankValue(entry.expiryDate) ? `Expires ${entry.expiryDate}` : null,
        ].filter(Boolean).join(' · ') || undefined,
      };
    default: // skills
      return {
        title: (clean(entry.name) as string | undefined) ?? 'Untitled skill',
        subtitle: entry.category === 'technical' ? 'Technical' : entry.category === 'language' ? 'Language' : undefined,
        meta: entry.proficiency != null ? `Proficiency: ${entry.proficiency}%` : undefined,
      };
  }
}

function RelationDetail({ relationKey, employee }: { relationKey: string; employee: Record<string, unknown> }) {
  const entries = (employee[relationKey] as Record<string, unknown>[]) || [];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <FontAwesomeIcon icon={RELATION_ICONS[relationKey as keyof typeof RELATION_ICONS]} className="text-[11px]" style={{ color: COLORS.red }} />
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
          {RELATION_LABELS[relationKey]}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm italic" style={{ color: '#B0B4BB' }}>missing — nothing on file</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, i) => {
            const { title, subtitle, meta } = relationEntrySummary(relationKey, entry);
            return (
              <div key={i} className="rounded-lg px-3 py-2" style={{ backgroundColor: '#F9FAFB', border: `1px solid ${COLORS.border}` }}>
                <p className="text-sm font-medium" style={{ color: COLORS.black }}>{title}</p>
                {subtitle && <p className="text-xs" style={{ color: COLORS.gray }}>{subtitle}</p>}
                {meta && <p className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>{meta}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- ImportQueueCard: live status list while uploaded files parse ----

function ImportQueueCard({ items }: { items: ImportQueueItem[] }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={faFileExcel} style={{ color: COLORS.red }} />
        <p className="text-sm font-medium" style={{ color: COLORS.black }}>
          Importing {items.length} file{items.length > 1 ? 's' : ''}
        </p>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {item.status === 'parsing' && (
              <FontAwesomeIcon icon={faSpinner} className="animate-spin" style={{ color: COLORS.gray }} />
            )}
            {item.status === 'ready' && <FontAwesomeIcon icon={faCheck} style={{ color: '#16A34A' }} />}
            {item.status === 'error' && <FontAwesomeIcon icon={faCircleExclamation} style={{ color: COLORS.red }} />}
            <span className="font-medium truncate" style={{ color: COLORS.black }}>{item.fileName}</span>
            <span style={{ color: item.status === 'error' ? COLORS.red : COLORS.gray }}>
              {item.status === 'parsing' && 'Parsing…'}
              {item.status === 'ready' && 'Ready for review'}
              {item.status === 'error' && (item.error || "Couldn't be read.")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- ConfirmationCard: UNCHANGED logic from before, every action variant ----

function ConfirmationCard({
  pending, onConfirm, onCancel, onPickEmployee, onCreateAnyway, onPickForInfo, onConfirmIdentity, onOpenForm,
}: {
  pending: ExtractResponse;
  onConfirm: (employeeId?: number) => void;
  onCancel: () => void;
  onPickEmployee: (id: number) => void;
  onCreateAnyway: () => void;
  onPickForInfo: (id: number) => void;
  onConfirmIdentity: (confirmed: boolean) => void;
  onOpenForm: () => void;
}) {
  // A create — offer the structured form rather than the old one-by-one
  // question flow. The form opens pre-filled with whatever was extracted.
  if (pending.action === 'createForm') {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon icon={faUserPlus} style={{ color: COLORS.red }} />
          <p className="text-sm font-medium" style={{ color: COLORS.black }}>Let&apos;s add a new employee</p>
        </div>
        <p className="text-xs mb-3" style={{ color: COLORS.gray }}>
          Fill in the details in the form — I&apos;ve pre-filled anything I picked up from your message.
        </p>
        <button
          onClick={onOpenForm}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: COLORS.red }}
        >
          <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
          Open the form
        </button>
      </div>
    );
  }

  if (pending.action === 'unsupported') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
        {pending.message}
      </div>
    );
  }

  // Deterministic fallback: we couldn't resolve who this is about, but
  // we DO know who this conversation was last discussing — a real
  // memory, not a hopeful guess baked into one giant extraction call.
  if (pending.action === 'confirmIdentity' && pending.suggestedEmployee) {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-2 mb-3">
          <FontAwesomeIcon icon={faCircleQuestion} style={{ color: COLORS.red }} />
          <p className="text-sm font-medium" style={{ color: COLORS.black }}>
            Did you mean {pending.suggestedEmployee.fullName} — who we were just discussing?
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirmIdentity(true)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: COLORS.red }}
          >
            <FontAwesomeIcon icon={faCheck} className="text-xs" />
            Yes, that's who I mean
          </button>
          <button
            onClick={() => onConfirmIdentity(false)}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
            style={{ borderColor: COLORS.border, color: COLORS.gray }}
          >
            No, someone else
          </button>
        </div>
      </div>
    );
  }

  // No fallback available either — genuinely ask, rather than guess.
  if (pending.action === 'askIdentity') {
    return (
      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
        I'm not sure who you mean — could you tell me their name or ID?
      </div>
    );
  }

  if (pending.action === 'info') {
    if (!pending.found || !pending.employee) {
      return (
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
          No employee found matching that.
        </div>
      );
    }
    const e = pending.employee;
    const requested = pending.requestedFields ?? [];
    const isFullProfile = requested.length === 0;
    const scalarFields = isFullProfile ? [...BASIC_INFO_FIELDS] : requested.filter((f) => !RELATION_KEYS.includes(f));
    const relationFields = isFullProfile ? [] : requested.filter((f) => RELATION_KEYS.includes(f));

    return (
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: COLORS.border }}>
        <div
          className="px-4 py-3 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${COLORS.redDark}, ${COLORS.red})` }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <FontAwesomeIcon icon={faIdCard} className="text-white text-sm" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm truncate">{String(e.fullName)}</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.8)' }}>Employee ID #{String(e.id)}</p>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {scalarFields.length > 0 && <ProfileFieldGrid employee={e} fields={scalarFields} />}
          {isFullProfile && <RelationBadges employee={e} keys={RELATION_KEYS} />}
          {relationFields.map((key) => <RelationDetail key={key} relationKey={key} employee={e} />)}
        </div>
      </div>
    );
  }

  if (pending.action === 'disambiguateRead' && pending.matches) {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <p className="text-sm font-medium mb-3" style={{ color: COLORS.black }}>
          Found {pending.matches.length} employees with that name — which one?
        </p>
        <div className="space-y-2">
          {pending.matches.map((m) => (
            <button
              key={m.id}
              onClick={() => onPickForInfo(m.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: COLORS.border }}
            >
              <span className="text-sm font-medium" style={{ color: COLORS.black }}>{m.fullName}</span>
              <span className="text-xs ml-2" style={{ color: COLORS.gray }}>
                ID #{m.id} · {m.email || 'no email on file'}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (pending.action === 'needsInfo' && pending.field) {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <div className="flex items-center gap-2 mb-2">
          <FontAwesomeIcon icon={faCircleQuestion} style={{ color: COLORS.red }} />
          <p className="text-sm font-medium" style={{ color: COLORS.black }}>
            {FIELD_QUESTIONS[pending.field] ?? `What's the ${BASIC_INFO_LABELS[pending.field]}?`}
          </p>
        </div>
        <p className="text-xs mb-3" style={{ color: COLORS.gray }}>
          Type "skip" to leave this blank for now.
        </p>
        <button
          onClick={onCreateAnyway}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: COLORS.border, color: COLORS.gray }}
        >
          Create anyway, with what I've got
        </button>
      </div>
    );
  }

  if (pending.action === 'invalidField' && pending.field) {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <div className="rounded-lg p-2.5 mb-3" style={{ backgroundColor: COLORS.pinkBg }}>
          <p className="text-xs" style={{ color: COLORS.red }}>{pending.reason}</p>
        </div>
        <p className="text-sm font-medium mb-3" style={{ color: COLORS.black }}>
          {FIELD_QUESTIONS[pending.field] ?? `What's the ${BASIC_INFO_LABELS[pending.field]}?`}
        </p>
        <button
          onClick={onCreateAnyway}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: COLORS.border, color: COLORS.gray }}
        >
          Create anyway, with what I've got
        </button>
      </div>
    );
  }

  if (pending.action === 'disambiguate' && pending.matches) {
    return (
      <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
        <p className="text-sm font-medium mb-3" style={{ color: COLORS.black }}>
          Found {pending.matches.length} employees with that name — which one do you mean?
        </p>
        <div className="space-y-2">
          {pending.matches.map((m) => (
            <button
              key={m.id}
              onClick={() => onPickEmployee(m.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: COLORS.border }}
            >
              <span className="text-sm font-medium" style={{ color: COLORS.black }}>{m.fullName}</span>
              <span className="text-xs ml-2" style={{ color: COLORS.gray }}>
                ID #{m.id} · {m.email || 'no email on file'}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isCreate = pending.action === 'create';
  const matchedEmployee = pending.matches?.[0];
  const summary = summarizeData(pending.data || {});

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: COLORS.border }}>
      <div className="flex items-center gap-2 mb-3">
        <FontAwesomeIcon icon={isCreate ? faUserPlus : faUserPen} style={{ color: COLORS.red }} />
        <p className="text-sm font-medium" style={{ color: COLORS.black }}>
          {isCreate ? 'This looks like a new employee' : `Update ${matchedEmployee?.fullName}?`}
        </p>
      </div>
      {!isCreate && matchedEmployee && (
        <p className="text-xs mb-2" style={{ color: COLORS.gray }}>
          Matched existing record: ID #{matchedEmployee.id} · {matchedEmployee.email || 'no email on file'}
        </p>
      )}
      {pending.warnings && pending.warnings.length > 0 && (
        <div className="rounded-lg p-2.5 mb-2 space-y-1" style={{ backgroundColor: COLORS.pinkBg }}>
          {pending.warnings.map((w, i) => (
            <p key={i} className="text-xs" style={{ color: COLORS.red }}>{w}</p>
          ))}
        </div>
      )}
      <div className="rounded-lg p-3 mb-3 space-y-1" style={{ backgroundColor: '#F9FAFB' }}>
        {summary.length === 0 ? (
          <p className="text-xs" style={{ color: COLORS.gray }}>No recognizable fields were extracted.</p>
        ) : (
          summary.map((line, i) => <p key={i} className="text-xs" style={{ color: COLORS.gray }}>{line}</p>)
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(matchedEmployee?.id)}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: COLORS.red }}
        >
          <FontAwesomeIcon icon={faCheck} className="text-xs" />
          {isCreate ? 'Create employee' : 'Confirm update'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
          style={{ borderColor: COLORS.border, color: COLORS.gray }}
        >
          <FontAwesomeIcon icon={faXmark} className="text-xs" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Quick-action starter prompts for the welcome screen ----
// Unlike theirs (which auto-sends a canned message), the 'prefill' ones
// just fill the textarea — lookups and updates genuinely need a real name
// typed in, so auto-sending an incomplete phrase wouldn't be useful here.
// 'upload' opens the file picker directly instead — there's no text
// equivalent to prefill. Import gets the same visual prominence as the
// other three actions specifically because an icon-only button elsewhere
// on the page tested as easy to miss on first visit.
type QuickAction =
  | { type: 'prefill'; label: string; icon: typeof faUserPlus; prefill: string }
  | { type: 'upload'; label: string; icon: typeof faUserPlus };

const QUICK_ACTIONS: QuickAction[] = [
  { type: 'prefill', label: 'Add a new hire', icon: faUserPlus, prefill: 'Add a new hire, ' },
  { type: 'prefill', label: 'Look up an employee', icon: faIdCard, prefill: 'Is there an employee named ' },
  { type: 'prefill', label: "Update someone's info", icon: faUserPen, prefill: 'Update ' },
  { type: 'upload', label: 'Import from Excel', icon: faFileExcel },
];

// The paperclip's popup menu — click to expand "Import" or "Export", each
// revealing its two file-shape options in place (an accordion, not a true
// flyout submenu — simpler to position reliably next to a button that now
// lives beside the input bar). Opens upward (bottom-full) since the input
// bar sits near the bottom of the panel, same as Claude's chat attach menu.
function AttachMenu({
  onImportSingle,
  onImportBatch,
  onExportSingleTemplate,
  onExportBatchTemplate,
  onClose,
}: {
  onImportSingle: () => void;
  onImportBatch: () => void;
  onExportSingleTemplate: () => void;
  onExportBatchTemplate: () => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<'import' | 'export' | null>('import');

  const sections: {
    key: 'import' | 'export';
    label: string;
    icon: typeof faFileArrowUp;
    options: { label: string; icon: typeof faUser; onClick: () => void }[];
  }[] = [
    {
      key: 'import',
      label: 'Import',
      icon: faFileArrowUp,
      options: [
        { label: 'Single employee', icon: faUser, onClick: onImportSingle },
        { label: 'Batch', icon: faUsers, onClick: onImportBatch },
      ],
    },
    {
      key: 'export',
      label: 'Export',
      icon: faFileArrowDown,
      options: [
        { label: 'Single employee template', icon: faUser, onClick: onExportSingleTemplate },
        { label: 'Batch template', icon: faUsers, onClick: onExportBatchTemplate },
      ],
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute bottom-full left-0 mb-2 w-60 bg-white rounded-xl shadow-lg border z-50 overflow-hidden"
        style={{ borderColor: COLORS.border }}
      >
        {sections.map((s) => (
          <div key={s.key}>
            <button
              onClick={() => setSection((cur) => (cur === s.key ? null : s.key))}
              className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm hover:bg-gray-50 transition-colors"
              style={{ color: COLORS.black }}
            >
              <span className="flex items-center gap-2.5">
                <FontAwesomeIcon icon={s.icon} className="text-xs w-3.5" style={{ color: COLORS.red }} />
                {s.label}
              </span>
              <FontAwesomeIcon
                icon={section === s.key ? faChevronDown : faChevronRight}
                className="text-xs"
                style={{ color: COLORS.gray }}
              />
            </button>
            {section === s.key && (
              <div className="border-t" style={{ borderColor: COLORS.border, backgroundColor: '#FAFAFA' }}>
                {s.options.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      opt.onClick();
                      onClose();
                    }}
                    className="w-full flex items-center gap-2.5 pl-9 pr-3.5 py-2 text-sm hover:bg-gray-100 transition-colors text-left"
                    style={{ color: COLORS.gray }}
                  >
                    <FontAwesomeIcon icon={opt.icon} className="text-xs w-3" />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function ChatbotView() {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCreateDraft, setPendingCreateDraft] = useState<Record<string, unknown> | null>(null);
  const [pendingCreateField, setPendingCreateField] = useState<string | null>(null);
  // Real, deterministic memory of who this conversation last resolved
  // to — NOT hoping the LLM infers it correctly from a wall of history
  // text. We know for certain who was found/confirmed in prior turns,
  // since our own code did the resolving. Used as a fallback suggestion
  // when a follow-up reference (like "his") can't otherwise be resolved.
  const [lastEmployee, setLastEmployee] = useState<{ id: number; fullName: string } | null>(null);
  // The structured create form, when open — holds the pre-fill data the
  // extract step pulled out of the admin's opening message.
  const [formInitialData, setFormInitialData] = useState<Record<string, unknown> | null>(null);
  // Excel import: the queue of successfully-parsed files awaiting review,
  // and which one is currently open in the form modal. Separate from
  // formInitialData above since this queue needs to auto-advance to the
  // next file on submit OR cancel, instead of just closing.
  const [importReviewQueue, setImportReviewQueue] = useState<ImportQueueItem[] | null>(null);
  const [importReviewIndex, setImportReviewIndex] = useState(0);
  const [importResultCounts, setImportResultCounts] = useState({ created: 0, skipped: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // The paperclip's popup menu (click), and a dismissible callout pointing
  // at it that's visible from the moment the page renders — not hover-
  // triggered, since a hover tooltip is easy to never discover in the
  // first place. Starts open, closes for good once dismissed (no
  // persistence — same as the rest of the chat, nothing here survives
  // a reload on purpose). Both now live beside the chat input, matching
  // where Claude's own chat puts its attach control.
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAttachCallout, setShowAttachCallout] = useState(true);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Holds the pending "hide the drag overlay" timeout — see handleDragOver.
  const dragHideTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // No messages yet -> show the centered welcome screen instead of the
  // normal scrolling chat view. Replaces the old static intro bubble.
  // Checks ALL messages, not just user ones: an Excel import can add
  // bot-only messages (the queue status card, the finish summary) before
  // the admin ever types anything, and those still need to be visible in
  // the normal chat log rather than silently appended behind the welcome
  // screen.
  const showWelcome = messages.length === 0;

  const appendMessage = (msg: Omit<Message, 'timestamp'>) =>
    setMessages((prev) => [...prev, { ...msg, timestamp: nowTimestamp() }]);

  const MAX_HISTORY_MESSAGES = 12;

  const summarizeForHistory = (m: Message): string => {
    if (m.text) return m.text;
    const p = m.pending;
    if (!p) return '';
    switch (p.action) {
      case 'unsupported': return p.message || 'Declined an out-of-scope request.';
      case 'info': return p.found ? `Found employee: ${p.employee?.fullName}.` : 'No matching employee found.';
      case 'needsInfo': return `Asked the admin for the missing "${p.field}" field.`;
      case 'invalidField': return `Asked the admin to re-enter "${p.field}": ${p.reason}`;
      case 'disambiguate':
      case 'disambiguateRead': return 'Found multiple employees with that name and asked which one was meant.';
      case 'create': return 'Proposed creating a new employee record, awaiting confirmation.';
      case 'createForm': return 'Opened the new-employee form for the admin to fill in.';
      case 'update': return 'Proposed updating an employee record, awaiting confirmation.';
      default: return 'Responded with a structured prompt.';
    }
  };

  const buildHistory = () =>
    messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: summarizeForHistory(m) }));

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    appendMessage({ id: genId(), role: 'user', text });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const res = await authFetch('/api/chatbot/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          existingDraft: pendingCreateDraft || undefined,
          expectedField: pendingCreateField || undefined,
          history: pendingCreateField ? undefined : buildHistory(),
          lastEmployee: pendingCreateField ? undefined : lastEmployee,
        }),
      });
      const result = await res.json();

      if (!res.ok) {
        appendMessage({ id: genId(), role: 'bot', text: `Something went wrong: ${result.error || 'please try again.'}` });
        return;
      }

      // Update our real memory of who's being discussed, whenever a
      // response resolves to exactly one specific person.
      if (result.action === 'update' && result.matches?.[0]) {
        setLastEmployee({ id: result.matches[0].id, fullName: result.matches[0].fullName });
      } else if (result.action === 'info' && result.found && result.employee) {
        setLastEmployee({ id: result.employee.id as number, fullName: result.employee.fullName as string });
      }

      if (result.action === 'needsInfo' || result.action === 'invalidField') {
        setPendingCreateDraft(result.data || pendingCreateDraft);
        setPendingCreateField(result.field || null);
      } else {
        setPendingCreateDraft(null);
        setPendingCreateField(null);
      }

      appendMessage({ id: genId(), role: 'bot', pending: result });
    } catch {
      appendMessage({ id: genId(), role: 'bot', text: 'Something went wrong reaching the extraction service.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAnyway = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pending) return m;
        return { ...m, pending: { action: 'create', matches: [], data: m.pending.data } };
      })
    );
    setPendingCreateDraft(null);
    setPendingCreateField(null);
  };

  const handlePickEmployee = (messageId: string, employeeId: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pending) return m;
        const picked = m.pending.matches?.find((e) => e.id === employeeId);
        if (picked) setLastEmployee({ id: picked.id, fullName: picked.fullName });
        return { ...m, pending: { action: 'update', matches: picked ? [picked] : [], data: m.pending.data } };
      })
    );
  };

  // The disambiguate picker only ever has the thin id/fullName/email/
  // nationalId shape used for name matching — showing that as if it were
  // the whole profile would make real data (phone, birth date, etc.)
  // look "missing" once summarizeProfile started labeling blanks. So a
  // pick here fetches the real record instead of reusing the thin one.
  const handlePickForInfo = async (messageId: string, employeeId: number) => {
    const message = messages.find((m) => m.id === messageId);
    const picked = message?.pending?.matches?.find((e) => e.id === employeeId);
    const requestedFields = message?.pending?.requestedFields;
    if (!picked) return;

    setLastEmployee({ id: picked.id, fullName: picked.fullName });
    try {
      const res = await authFetch(`/api/chatbot/employee/${employeeId}`);
      const result = await res.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pending: { action: 'info', found: res.ok, employee: result.employee, requestedFields } }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, pending: { action: 'info', found: false } } : m))
      );
    }
  };

  // The "Yes, that's who I mean" / "No, someone else" response to a
  // confirmIdentity suggestion. "Yes" converts straight into a normal
  // update-confirmation card — same Confirm/Cancel flow as everywhere
  // else, just with the identity question already settled.
  const handleConfirmIdentity = (messageId: string, confirmed: boolean) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.pending || !m.pending.suggestedEmployee) return m;
        if (confirmed) {
          // suggestedEmployee only ever carries {id, fullName} — the
          // deterministic lastEmployee memory never held email/nationalId,
          // so there's nothing more to fill in here.
          const emp = { ...m.pending.suggestedEmployee, email: null, nationalId: null };
          return { ...m, pending: { action: 'update', matches: [emp], data: m.pending.data } };
        }
        return { ...m, pending: { action: 'askIdentity', data: m.pending.data } };
      })
    );
  };

  const handleConfirm = async (messageId: string, pending: ExtractResponse, employeeId?: number) => {
    try {
      const res = await authFetch('/api/chatbot/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pending.action, employeeId, data: pending.data }),
      });
      const result = await res.json();

      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pending: undefined } : m)));

      if (!res.ok) {
        appendMessage({ id: genId(), role: 'bot', text: `Couldn't save that: ${result.error}` });
        return;
      }
      setLastEmployee({ id: result.employee.id, fullName: result.employee.fullName });
      appendMessage({
        id: genId(),
        role: 'bot',
        text: result.status === 'created'
          ? `Created a new employee: ${result.employee.fullName}.`
          : `Updated ${result.employee.fullName}'s record.`,
      });
    } catch {
      appendMessage({ id: genId(), role: 'bot', text: 'Something went wrong saving that.' });
    }
  };

  // Submit from the structured create form. Posts straight to the commit
  // route (no Gemini — the fields are already structured). A duplicate
  // unique field (409 — nationalId or companyID) maps back onto that
  // specific field so the form can flag it inline; any other error
  // surfaces as a banner. On success we close the form, remember the new
  // employee, and drop a confirmation into the chat.
  const handleFormSubmit = async (data: BuiltEmployeeData): Promise<SubmitResult> => {
    const res = await authFetch('/api/chatbot/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', data }),
    });
    const result = await res.json();

    if (res.ok) {
      setFormInitialData(null);
      setLastEmployee({ id: result.employee.id, fullName: result.employee.fullName });
      appendMessage({ id: genId(), role: 'bot', text: `Created a new employee: ${result.employee.fullName}.` });
      return { ok: true };
    }
    if (res.status === 409 && result.field) {
      return { ok: false, fieldError: { field: result.field, message: result.error || 'That value already exists.' } };
    }
    return { ok: false, error: result.error || 'Something went wrong saving that.' };
  };

  // Excel import: one request per file, parsed server-side (parse + Gemini
  // classification), streaming status updates into the queue card as each
  // finishes rather than waiting for all of them. Once every file has
  // settled, the successfully-parsed ones start the sequential review.
  const handleFilesSelected = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0 || isImporting) return;
    setIsImporting(true);

    const msgId = genId();
    const items: ImportQueueItem[] = files.map((f) => ({ fileName: f.name, status: 'parsing' }));
    appendMessage({ id: msgId, role: 'bot', importQueue: items });

    for (let i = 0; i < files.length; i++) {
      try {
        const body = new FormData();
        body.append('file', files[i]);
        const res = await authFetch('/api/chatbot/import-excel', { method: 'POST', body });
        const result = await res.json();
        items[i] = res.ok
          ? { fileName: files[i].name, status: 'ready', initialData: result.data }
          : { fileName: files[i].name, status: 'error', error: result.error || "Couldn't be read." };
      } catch {
        items[i] = { fileName: files[i].name, status: 'error', error: 'Something went wrong reaching the server.' };
      }
      const snapshot = [...items];
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, importQueue: snapshot } : m)));
    }

    setIsImporting(false);
    const readyItems = items.filter((item) => item.status === 'ready');
    if (readyItems.length > 0) {
      setImportResultCounts({ created: 0, skipped: 0 });
      setImportReviewIndex(0);
      setImportReviewQueue(readyItems);
    } else {
      appendMessage({ id: genId(), role: 'bot', text: "None of the files could be imported — see the errors above." });
    }
  };

  // Drag-and-drop across the whole chat panel — scoped wide rather than to
  // just the input bar, since requiring a precise drop target mid-drag is
  // exactly the kind of friction that makes a feature easy to miss.
  //
  // dragover (not dragenter/dragleave) drives this: it fires continuously
  // and frequently for as long as the cursor is anywhere over the panel,
  // including over child elements, so every dragover just (re)shows the
  // overlay and resets a short hide-timer — no counter needed, and no
  // dependence on every dragenter having a correctly-paired dragleave
  // (which bubbling through nested elements does not reliably guarantee).
  const handleDragOver = (e: React.DragEvent) => {
    // preventDefault is also required for onDrop to fire at all — the
    // browser's default is to reject drops everywhere.
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    setIsDraggingFile(true);
    if (dragHideTimeoutRef.current) clearTimeout(dragHideTimeoutRef.current);
    dragHideTimeoutRef.current = window.setTimeout(() => setIsDraggingFile(false), 150);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragHideTimeoutRef.current) clearTimeout(dragHideTimeoutRef.current);
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  // Advances the import review queue by one, closing the modal and
  // posting a summary once every file has been reviewed. Reads state
  // straight from the closure rather than functional updaters — this is
  // only ever called once per render cycle (a button click), so there's
  // no staleness risk, and it avoids double-incrementing the counts.
  const advanceImportQueue = (outcome: 'created' | 'skipped') => {
    const newCounts = { ...importResultCounts, [outcome]: importResultCounts[outcome] + 1 };
    setImportResultCounts(newCounts);

    const queue = importReviewQueue ?? [];
    const nextIndex = importReviewIndex + 1;
    if (nextIndex >= queue.length) {
      setImportReviewQueue(null);
      const parts = [
        newCounts.created > 0 ? `created ${newCounts.created} employee${newCounts.created > 1 ? 's' : ''}` : null,
        newCounts.skipped > 0 ? `skipped ${newCounts.skipped}` : null,
      ].filter(Boolean);
      appendMessage({
        id: genId(),
        role: 'bot',
        text: parts.length > 0 ? `Import finished — ${parts.join(', ')}.` : 'Import finished.',
      });
    } else {
      setImportReviewIndex(nextIndex);
    }
  };

  const handleImportFormSubmit = async (data: BuiltEmployeeData): Promise<SubmitResult> => {
    const res = await authFetch('/api/chatbot/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', data }),
    });
    const result = await res.json();

    if (res.ok) {
      setLastEmployee({ id: result.employee.id, fullName: result.employee.fullName });
      advanceImportQueue('created');
      return { ok: true };
    }
    if (res.status === 409 && result.field) {
      return { ok: false, fieldError: { field: result.field, message: result.error || 'That value already exists.' } };
    }
    return { ok: false, error: result.error || 'Something went wrong saving that.' };
  };

  const handleImportFormCancel = () => advanceImportQueue('skipped');

  // Downloads a file from an auth-gated route: authFetch handles the cookie
  // (and a token refresh on 401), then we turn the blob into a click on a
  // temporary object-URL. A plain <a href> would skip the refresh retry.
  const downloadFromRoute = async (url: string, fallbackName: string) => {
    try {
      const res = await authFetch(url);
      if (!res.ok) {
        appendMessage({ id: genId(), role: 'bot', text: "Couldn't download that file — please try again." });
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const name = match ? match[1] : fallbackName;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      appendMessage({ id: genId(), role: 'bot', text: "Couldn't download that file — please try again." });
    }
  };

  const handleDownloadTemplate = () =>
    downloadFromRoute('/api/templates/single-employee', 'single-employee-template.xlsx');

  const handleDownloadBatchTemplate = () =>
    downloadFromRoute('/api/templates/batch', 'batch-employees-template.xlsx');

  // Nothing here is persisted anywhere (no localStorage, no server-side
  // history) — the conversation only ever lived in this component's state,
  // so "new chat" is just resetting it back to the same values it started
  // with.
  const handleNewChat = () => {
    setMessages([]);
    setInput('');
    setIsLoading(false);
    setPendingCreateDraft(null);
    setPendingCreateField(null);
    setLastEmployee(null);
    setFormInitialData(null);
    setImportReviewQueue(null);
    setImportReviewIndex(0);
    setImportResultCounts({ created: 0, skipped: 0 });
    setIsImporting(false);
    setIsDraggingFile(false);
    setShowAttachMenu(false);
    setBatchModalOpen(false);
  };

  const handleCancel = (messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pending: undefined } : m)));
    setPendingCreateDraft(null);
    setPendingCreateField(null);
    appendMessage({ id: genId(), role: 'bot', text: 'Cancelled — no changes were made.' });
  };

  const handleQuickAction = (prefill: string) => {
    setInput(prefill);
    textareaRef.current?.focus();
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---- Shared input console — same component used in both welcome and chat views ----
  // The paperclip (import/export) control now lives inside the input bar
  // itself, to the left of the textarea — the same spot Claude's own chat
  // puts its attach button — rather than up in the header.
  const renderInputArea = () => (
    <div className={showWelcome ? '' : 'bg-gradient-to-t from-white via-white to-transparent px-4 md:px-8 py-4 shrink-0'}>
      <div className="max-w-2xl mx-auto">
        <div
          className="flex items-end gap-1 bg-gray-100 border rounded-2xl p-1.5 shadow-sm focus-within:ring-4 transition-all"
          style={{ borderColor: COLORS.border }}
        >
          <div className="relative shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) handleFilesSelected(e.target.files);
                e.target.value = ''; // allow re-selecting the same file(s) later
              }}
            />
            <button
              onClick={() => { setShowAttachMenu((v) => !v); setShowAttachCallout(false); }}
              disabled={isImporting}
              className="p-2.5 rounded-xl transition-all disabled:opacity-50"
              style={{
                color: showAttachMenu ? COLORS.red : COLORS.gray,
                backgroundColor: showAttachMenu ? COLORS.pinkBg : 'transparent',
                cursor: isImporting ? 'not-allowed' : 'pointer',
              }}
              aria-label="Import or export employee data as Excel spreadsheets"
            >
              <FontAwesomeIcon icon={isImporting ? faSpinner : faPaperclip} className={isImporting ? 'text-lg animate-spin' : 'text-lg'} />
            </button>

            {showAttachCallout && !showAttachMenu && (
              <div
                className="absolute bottom-full left-0 mb-2 w-64 rounded-xl shadow-lg z-50 p-3.5"
                style={{ backgroundColor: COLORS.red }}
              >
                <div className="absolute -bottom-1.5 left-5 w-3 h-3 rotate-45" style={{ backgroundColor: COLORS.red }} />
                <button
                  onClick={() => setShowAttachCallout(false)}
                  className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 text-white"
                  aria-label="Dismiss"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-xs" />
                </button>
                <p className="text-sm text-white pr-4 leading-snug">
                  You can import or export employee data as Excel spreadsheets here.
                </p>
              </div>
            )}

            {showAttachMenu && (
              <AttachMenu
                onImportSingle={() => fileInputRef.current?.click()}
                onImportBatch={() => setBatchModalOpen(true)}
                onExportSingleTemplate={handleDownloadTemplate}
                onExportBatchTemplate={handleDownloadBatchTemplate}
                onClose={() => setShowAttachMenu(false)}
              />
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={showWelcome ? 'Ask anything about employee records' : 'Type your message...'}
            rows={1}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 px-3 py-2.5 focus:outline-none text-[15px] resize-none max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-3 rounded-xl transition-all shrink-0 text-white"
            style={{
              backgroundColor: input.trim() && !isLoading ? COLORS.red : '#D1D5DB',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
            }}
            aria-label="Send message"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="text-sm" />
          </button>
        </div>
        {!showWelcome && (
          <p className="text-xs text-gray-400 text-center mt-3">
            Foundry Assistant can make mistakes. Please verify important information.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="h-screen flex flex-col bg-white relative overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Subtle background texture, matching their exact pattern */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      {/* Top-left corner: just the New chat control now — the paperclip
          moved down beside the input bar (see renderInputArea). New chat
          is an icon-only button, red and larger, for quick access. */}
      <div className="flex items-center px-4 md:px-8 py-3 shrink-0 relative z-10">
        {!showWelcome && (
          <button
            onClick={handleNewChat}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-50"
            style={{ color: COLORS.red }}
            aria-label="New chat"
          >
            <FontAwesomeIcon icon={faPlus} className="text-xl" />
          </button>
        )}
      </div>

      {isDraggingFile && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
        >
          <div
            className="flex flex-col items-center gap-3 px-10 py-8 rounded-2xl border-2 border-dashed"
            style={{ borderColor: COLORS.red, backgroundColor: '#FEF2F2' }}
          >
            <FontAwesomeIcon icon={faFileExcel} className="text-3xl" style={{ color: COLORS.red }} />
            <p className="text-sm font-medium" style={{ color: COLORS.black }}>
              Drop Excel files to import employee data
            </p>
          </div>
        </div>
      )}

      {showWelcome ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-8 pb-20 overflow-y-auto">
          <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-10 animate-fade-in">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${COLORS.redDark}, ${COLORS.red})` }}
              >
                <FontAwesomeIcon icon={faFire} className="text-white text-3xl" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Foundry</h1>
              <p className="text-gray-500 text-lg">
                Create, update, and look up employee records — just by chatting
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                {QUICK_ACTIONS.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => (qa.type === 'upload' ? fileInputRef.current?.click() : handleQuickAction(qa.prefill))}
                    className="px-5 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-700 transition-all hover:shadow-md flex items-center gap-2"
                  >
                    <FontAwesomeIcon icon={qa.icon} style={{ color: COLORS.red }} />
                    {qa.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleDownloadTemplate}
                className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
              >
                Download a blank Excel template to fill in
              </button>
            </div>
            <div className="mt-10">{renderInputArea()}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 chat-scrollbar">
            <div className="max-w-2xl mx-auto space-y-6">
              {messages.map((m) => (
                <div key={m.id} className="animate-fade-in">
                  {m.role === 'bot' ? (
                    <div className="flex gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
                        style={{ background: `linear-gradient(135deg, ${COLORS.redDark}, ${COLORS.red})` }}
                      >
                        <FontAwesomeIcon icon={faRobot} className="text-white text-sm" />
                      </div>
                      <div className="flex-1 max-w-xl">
                        {m.text && (
                          <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3 prose prose-sm max-w-none prose-p:my-1">
                            <ReactMarkdown>{m.text}</ReactMarkdown>
                          </div>
                        )}
                        {m.pending && (
                          <ConfirmationCard
                            pending={m.pending}
                            onConfirm={(employeeId) => handleConfirm(m.id, m.pending!, employeeId)}
                            onCancel={() => handleCancel(m.id)}
                            onPickEmployee={(id) => handlePickEmployee(m.id, id)}
                            onCreateAnyway={() => handleCreateAnyway(m.id)}
                            onPickForInfo={(id) => handlePickForInfo(m.id, id)}
                            onConfirmIdentity={(confirmed) => handleConfirmIdentity(m.id, confirmed)}
                            onOpenForm={() => setFormInitialData(m.pending!.data ?? {})}
                          />
                        )}
                        {m.importQueue && <ImportQueueCard items={m.importQueue} />}
                        <span className="text-xs text-gray-400 mt-1 block">{m.timestamp}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3 justify-end">
                      <div className="flex-1 max-w-xl flex flex-col items-end">
                        <div className="rounded-2xl rounded-tr-md px-4 py-3" style={{ backgroundColor: COLORS.red }}>
                          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                        <span className="text-xs text-gray-400 mt-1">{m.timestamp}</span>
                      </div>
                      <Image
                        src="/images/Wedy.ai_Logo.png"
                        alt="User"
                        width={36}
                        height={36}
                        className="w-9 h-9 rounded-xl flex-shrink-0 border-2"
                        style={{ borderColor: COLORS.border }}
                      />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 animate-fade-in">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
                    style={{ background: `linear-gradient(135deg, ${COLORS.redDark}, ${COLORS.red})` }}
                  >
                    <FontAwesomeIcon icon={faRobot} className="text-white text-sm" />
                  </div>
                  <div className="flex-1 max-w-xl">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                      <div className="flex items-center gap-1.5 h-5">
                        <span className="dot-bounce w-2 h-2 rounded-full bg-gray-400" style={{ animationDelay: '0s' }} />
                        <span className="dot-bounce w-2 h-2 rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }} />
                        <span className="dot-bounce w-2 h-2 rounded-full bg-gray-400" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
          {renderInputArea()}
        </>
      )}

      {formInitialData !== null && (
        <EmployeeForm
          initialData={formInitialData}
          onSubmit={handleFormSubmit}
          onClose={() => setFormInitialData(null)}
        />
      )}

      {importReviewQueue !== null && importReviewQueue[importReviewIndex] && (
        <EmployeeForm
          key={importReviewIndex}
          initialData={importReviewQueue[importReviewIndex].initialData}
          onSubmit={handleImportFormSubmit}
          onClose={handleImportFormCancel}
          progressLabel={`Reviewing ${importReviewIndex + 1} of ${importReviewQueue.length}`}
        />
      )}

      {batchModalOpen && (
        <BatchImportModal onClose={() => setBatchModalOpen(false)} onImported={() => { /* the modal's own result screen already summarizes what happened */ }} />
      )}
    </div>
  );
}