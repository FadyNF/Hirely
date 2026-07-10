'use client';

// components/chatbot/EmployeeForm.tsx
//
// The structured "add a new employee" form, shown as a modal over the chat.
// Replaces the one-by-one question flow for creates: the admin fills labelled
// fields directly (all 10 basic-info fields are required), and can add any
// number of experience / education / certificate / skill entries via the
// "+ Add" buttons.
//
// Validation reuses the exact same rules the server enforces
// (validateFieldValue / validateRelationField from lib/chatbotValidate),
// so the instant inline feedback here and the authoritative server check
// can't disagree on what's valid. Frontend validation is UX only — the
// commit route re-validates everything regardless.

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faXmark, faTrashCan, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS } from '@/lib/tabConfig';
import {
  validateFieldValue,
  validateRelationField,
  validateGpaValue,
  ENUM_OPTIONS,
  GPA_SCALES,
  RELATION_FIELDS,
  type RelationKey,
  type GpaScale,
} from '@/lib/chatbotValidate';

const COLORS = {
  red: '#DC2626',
  redDark: '#B91C1C',
  black: '#111111',
  gray: '#6B7280',
  border: '#E5E5E5',
  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',
  errorText: '#991B1B',
};

// ---------------------------------------------------------------------------
// Field presentation config
// ---------------------------------------------------------------------------

type BasicInputType = 'text' | 'email' | 'date' | 'tel' | 'select';

// How each basic-info field renders. Keys/labels come from tabConfig; only
// the input TYPE (and enum source) is new here. Proper input types prevent
// whole classes of errors up front (dropdowns can't be mis-typed, date
// pickers can't produce "month 84").
const BASIC_INPUT: Record<string, { type: BasicInputType; placeholder?: string; enumKey?: string }> = {
  fullName: { type: 'text', placeholder: 'e.g. Ahmed Ali' },
  phone: { type: 'tel', placeholder: '01012345678' },
  birthDate: { type: 'date' },
  nationality: { type: 'select', enumKey: 'nationality' },
  maritalStatus: { type: 'select', enumKey: 'maritalStatus' },
  email: { type: 'email', placeholder: 'name@elsewedy.com' },
  // Relabeled "Department" below (Elsewedy is one company — asking "where
  // do they work" doesn't apply) — same underlying field, just the wording
  // shown to the admin changed.
  workLocation: { type: 'text', placeholder: 'e.g. Engineering' },
  gender: { type: 'select', enumKey: 'gender' },
  nationalId: { type: 'text', placeholder: '14 digits' },
  militaryStatus: { type: 'select', enumKey: 'militaryStatus' },
};

type RelFieldType = 'text' | 'date' | 'endDate' | 'number' | 'textarea' | 'select' | 'gpa';

interface RelFieldSpec {
  key: string;
  label: string;
  type: RelFieldType;
  placeholder?: string;
  hint?: string;
  enumOptions?: string[];
}

// Presentation for each relation's sub-fields. Field keys match the Prisma
// schema and the validators exactly; required/optional is driven by
// RELATION_FIELDS (imported), not re-declared here.
const RELATION_UI: Record<RelationKey, { label: string; singular: string; fields: RelFieldSpec[] }> = {
  experience: {
    label: 'Experience',
    singular: 'role',
    fields: [
      { key: 'jobTitle', label: 'Job Title', type: 'text' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'startDate', label: 'Start Date', type: 'date' },
      { key: 'endDate', label: 'End Date', type: 'endDate' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Optional summary of responsibilities' },
    ],
  },
  education: {
    label: 'Education',
    singular: 'degree',
    fields: [
      { key: 'degree', label: 'Degree', type: 'text' },
      { key: 'fieldOfStudy', label: 'Field of Study', type: 'text' },
      { key: 'institution', label: 'Institution', type: 'text' },
      { key: 'graduationYear', label: 'Graduation Year', type: 'number', placeholder: 'e.g. 2020' },
      // Rendered as a compound scale-select + number control (see the
      // 'gpa' branch in renderRelationField) — GPA_SCALES.other stores
      // "Egyptian or Other" as one option since neither has an official
      // format to distinguish, per the earlier design decision.
      { key: 'gpa', label: 'GPA', type: 'gpa', placeholder: 'Optional' },
    ],
  },
  certificates: {
    label: 'Certificates',
    singular: 'certificate',
    fields: [
      { key: 'certName', label: 'Certificate Name', type: 'text' },
      { key: 'issuer', label: 'Issuing Organization', type: 'text' },
      { key: 'issueDate', label: 'Issue Date', type: 'date' },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date', placeholder: 'Optional' },
    ],
  },
  skills: {
    label: 'Skills',
    singular: 'skill',
    fields: [
      { key: 'category', label: 'Category', type: 'select', enumOptions: ['technical', 'language'] },
      { key: 'name', label: 'Skill Name', type: 'text' },
      { key: 'proficiency', label: 'Proficiency (0-100)', type: 'number', placeholder: '0-100' },
    ],
  },
};

const RELATION_ORDER: RelationKey[] = ['experience', 'education', 'certificates', 'skills'];
// gpa is deliberately excluded — it's a compound (value + scale) field
// handled separately (see the 'gpa' branches below), not a plain number.
const NUMERIC_RELATION_FIELDS = new Set(['graduationYear', 'proficiency']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelationEntry = Record<string, string>;

interface FormState {
  basic: Record<string, string>;
  experience: RelationEntry[];
  education: RelationEntry[];
  certificates: RelationEntry[];
  skills: RelationEntry[];
}

// What onSubmit receives — scalars as strings (the commit route drops empty
// ones), numeric relation fields already coerced to numbers.
export interface BuiltEmployeeData {
  [field: string]: unknown;
  experience: Record<string, unknown>[];
  education: Record<string, unknown>[];
  certificates: Record<string, unknown>[];
  skills: Record<string, unknown>[];
}

// onSubmit resolves to a result: ok, or an error to surface — either a
// general banner message or one tied to a specific basic-info field (e.g.
// the server's 409 duplicate-national-ID maps back onto the nationalId field).
export interface SubmitResult {
  ok: boolean;
  error?: string;
  fieldError?: { field: string; message: string };
}

interface EmployeeFormProps {
  initialData?: Partial<Record<string, unknown>>;
  onSubmit: (data: BuiltEmployeeData) => Promise<SubmitResult>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyEntry(relationKey: RelationKey): RelationEntry {
  const entry: RelationEntry = {};
  for (const f of RELATION_UI[relationKey].fields) entry[f.key] = '';
  // gpaScale is a form-only companion to education.gpa — never sent to the
  // server as its own field, just used to build the final "value/denom
  // (Scale)" string before submit.
  if (relationKey === 'education') entry.gpaScale = '';
  return entry;
}

// Turns a possibly-partial extracted object (from Gemini pre-fill) into the
// all-strings form state.
function buildInitialState(initial?: Partial<Record<string, unknown>>): FormState {
  const basic: Record<string, string> = {};
  for (const f of BASIC_INFO_FIELDS) {
    const v = initial?.[f];
    basic[f] = v === undefined || v === null ? '' : String(v);
  }
  const readRelation = (key: RelationKey): RelationEntry[] => {
    const arr = initial?.[key];
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map((raw) => {
      const entry = emptyEntry(key);
      const obj = raw as Record<string, unknown>;
      for (const f of RELATION_UI[key].fields) {
        const v = obj[f.key];
        entry[f.key] = v === undefined || v === null ? '' : String(v);
      }
      return entry;
    });
  };
  return {
    basic,
    experience: readRelation('experience'),
    education: readRelation('education'),
    certificates: readRelation('certificates'),
    skills: readRelation('skills'),
  };
}

function coerceRelationValue(field: string, raw: string): string | number {
  if (!NUMERIC_RELATION_FIELDS.has(field)) return raw;
  const s = raw.trim();
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isNaN(n) ? NaN : n;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeForm({ initialData, onSubmit, onClose }: EmployeeFormProps) {
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const setBasic = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, basic: { ...prev.basic, [field]: value } }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  const setRelationField = (rk: RelationKey, index: number, field: string, value: string) => {
    setForm((prev) => {
      const next = prev[rk].map((entry, i) => (i === index ? { ...entry, [field]: value } : entry));
      return { ...prev, [rk]: next };
    });
    const key = `${rk}.${index}.${field}`;
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const addEntry = (rk: RelationKey) =>
    setForm((prev) => ({ ...prev, [rk]: [...prev[rk], emptyEntry(rk)] }));

  const removeEntry = (rk: RelationKey, index: number) =>
    setForm((prev) => ({ ...prev, [rk]: prev[rk].filter((_, i) => i !== index) }));

  // ---- Validation (mirrors the server's rules) ----
  function validateAll(): Record<string, string> {
    const next: Record<string, string> = {};

    // Basic info — all 10 required.
    for (const field of BASIC_INFO_FIELDS) {
      const value = (form.basic[field] ?? '').trim();
      if (!value) {
        next[field] = 'This field is required.';
        continue;
      }
      const result = validateFieldValue(field, value);
      if (!result.valid) next[field] = result.reason ?? 'Invalid value.';
    }

    // Relations — required sub-fields invalidate the whole check; optional
    // ones only when actually filled in.
    for (const rk of RELATION_ORDER) {
      const { required, optional } = RELATION_FIELDS[rk];
      form[rk].forEach((entry, i) => {
        for (const field of required) {
          const raw = (entry[field] ?? '').trim();
          const key = `${rk}.${i}.${field}`;
          if (!raw) {
            next[key] = 'This field is required.';
            continue;
          }
          const result = validateRelationField(rk, field, coerceRelationValue(field, raw));
          if (!result.valid) next[key] = result.reason ?? 'Invalid value.';
        }
        for (const field of optional) {
          // gpa is a compound (value + scale) field, validated separately
          // below — the generic single-value path doesn't fit it.
          if (rk === 'education' && field === 'gpa') continue;
          const raw = (entry[field] ?? '').trim();
          if (!raw) continue;
          const result = validateRelationField(rk, field, coerceRelationValue(field, raw));
          if (!result.valid) next[`${rk}.${i}.${field}`] = result.reason ?? 'Invalid value.';
        }
      });
    }

    // GPA: value and scale are validated together — a value with no scale
    // selected is an error; a scale with no value is fine (nothing to save).
    form.education.forEach((entry, i) => {
      const raw = (entry.gpa ?? '').trim();
      if (!raw) return;
      const scale = (entry.gpaScale ?? '') as GpaScale | '';
      if (!scale) {
        next[`education.${i}.gpa`] = 'Select a GPA scale.';
        return;
      }
      const result = validateGpaValue(scale, Number(raw));
      if (!result.valid) next[`education.${i}.gpa`] = result.reason ?? 'Invalid value.';
    });

    return next;
  }

  function buildData(): BuiltEmployeeData {
    const data: BuiltEmployeeData = { experience: [], education: [], certificates: [], skills: [] };
    for (const field of BASIC_INFO_FIELDS) data[field] = (form.basic[field] ?? '').trim();

    const buildEntries = (rk: RelationKey) =>
      form[rk].map((entry) => {
        const out: Record<string, unknown> = {};
        const { required, optional } = RELATION_FIELDS[rk];
        for (const field of [...required, ...optional]) {
          if (rk === 'education' && field === 'gpa') continue; // combined below
          const raw = (entry[field] ?? '').trim();
          if (raw === '') continue; // optional & empty — omit entirely
          out[field] = NUMERIC_RELATION_FIELDS.has(field) ? Number(raw) : raw;
        }
        if (rk === 'education') {
          const raw = (entry.gpa ?? '').trim();
          const scale = (entry.gpaScale ?? '') as GpaScale | '';
          if (raw !== '' && scale) {
            const result = validateGpaValue(scale, Number(raw));
            if (result.valid) out.gpa = result.normalized;
          }
        }
        return out;
      });

    data.experience = buildEntries('experience');
    data.education = buildEntries('education');
    data.certificates = buildEntries('certificates');
    data.skills = buildEntries('skills');
    return data;
  }

  const handleSubmit = async () => {
    if (submitting) return;
    setGeneralError('');
    const found = validateAll();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSubmitting(true);
    try {
      const result = await onSubmit(buildData());
      if (result.ok) return; // parent closes the modal on success
      if (result.fieldError) {
        setErrors((e) => ({ ...e, [result.fieldError!.field]: result.fieldError!.message }));
      } else {
        setGeneralError(result.error ?? 'Something went wrong saving that.');
      }
    } catch {
      setGeneralError('Something went wrong reaching the server.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render helpers ----
  const inputClass = (hasError: boolean) =>
    `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${hasError ? 'ring-1' : ''}`;
  const inputStyle = (hasError: boolean) =>
    ({ borderColor: hasError ? COLORS.errorBorder : COLORS.border, color: COLORS.black }) as React.CSSProperties;

  function ErrorText({ msg }: { msg?: string }) {
    if (!msg) return null;
    return <p className="text-xs mt-1" style={{ color: COLORS.red }}>{msg}</p>;
  }

  function renderBasicField(field: string) {
    const cfg = BASIC_INPUT[field];
    const err = errors[field];
    const label = BASIC_INFO_LABELS[field] ?? field;
    return (
      <div key={field}>
        <label className="block text-xs font-medium mb-1" style={{ color: COLORS.gray }}>
          {label} <span style={{ color: COLORS.red }}>*</span>
        </label>
        {cfg.type === 'select' ? (
          <select
            value={form.basic[field] ?? ''}
            onChange={(e) => setBasic(field, e.target.value)}
            className={inputClass(!!err)}
            style={inputStyle(!!err)}
          >
            <option value="">Select…</option>
            {(ENUM_OPTIONS[cfg.enumKey!] ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type={cfg.type}
            value={form.basic[field] ?? ''}
            placeholder={cfg.placeholder}
            inputMode={cfg.type === 'tel' ? 'numeric' : undefined}
            onChange={(e) => setBasic(field, e.target.value)}
            className={inputClass(!!err)}
            style={inputStyle(!!err)}
          />
        )}
        <ErrorText msg={err} />
      </div>
    );
  }

  function renderRelationField(rk: RelationKey, index: number, spec: RelFieldSpec) {
    const entry = form[rk][index];
    const value = entry[spec.key] ?? '';
    const key = `${rk}.${index}.${spec.key}`;
    const err = errors[key];
    const isOptional = (RELATION_FIELDS[rk].optional as readonly string[]).includes(spec.key);

    const labelEl = (
      <label className="block text-xs font-medium mb-1" style={{ color: COLORS.gray }}>
        {spec.label} {!isOptional && <span style={{ color: COLORS.red }}>*</span>}
      </label>
    );

    // Experience end date: a date picker plus a "Current" checkbox that, when
    // ticked, stores the sentinel "Current" and disables the date input.
    if (spec.type === 'endDate') {
      const isCurrent = value === 'Current';
      return (
        <div key={spec.key}>
          {labelEl}
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={isCurrent ? '' : value}
              disabled={isCurrent}
              onChange={(e) => setRelationField(rk, index, spec.key, e.target.value)}
              className={inputClass(!!err)}
              style={{ ...inputStyle(!!err), opacity: isCurrent ? 0.5 : 1 }}
            />
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap" style={{ color: COLORS.gray }}>
              <input
                type="checkbox"
                checked={isCurrent}
                onChange={(e) => setRelationField(rk, index, spec.key, e.target.checked ? 'Current' : '')}
              />
              Current
            </label>
          </div>
          <ErrorText msg={err} />
        </div>
      );
    }

    // GPA: a scale dropdown next to the number, so "1.3" can never be
    // ambiguous between an excellent German grade and a nearly-failing
    // American one — both are stored tagged with their scale.
    if (spec.type === 'gpa') {
      const scale = (entry.gpaScale ?? '') as GpaScale | '';
      return (
        <div key={spec.key}>
          {labelEl}
          <div className="flex items-center gap-2">
            <select
              value={scale}
              onChange={(e) => setRelationField(rk, index, 'gpaScale', e.target.value)}
              className={inputClass(!!err)}
              style={{ ...inputStyle(!!err), flex: '0 0 auto', width: '9.5rem' }}
            >
              <option value="">Scale…</option>
              {Object.entries(GPA_SCALES).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="any"
              value={value}
              placeholder={spec.placeholder}
              onChange={(e) => setRelationField(rk, index, spec.key, e.target.value)}
              className={inputClass(!!err)}
              style={inputStyle(!!err)}
            />
          </div>
          <ErrorText msg={err} />
        </div>
      );
    }

    return (
      <div key={spec.key} className={spec.type === 'textarea' ? 'sm:col-span-2' : ''}>
        {labelEl}
        {spec.type === 'select' ? (
          <select
            value={value}
            onChange={(e) => setRelationField(rk, index, spec.key, e.target.value)}
            className={inputClass(!!err)}
            style={inputStyle(!!err)}
          >
            <option value="">Select…</option>
            {(spec.enumOptions ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
            ))}
          </select>
        ) : spec.type === 'textarea' ? (
          <textarea
            value={value}
            placeholder={spec.placeholder}
            rows={2}
            onChange={(e) => setRelationField(rk, index, spec.key, e.target.value)}
            className={inputClass(!!err) + ' resize-none'}
            style={inputStyle(!!err)}
          />
        ) : (
          <input
            type={spec.type === 'number' ? 'number' : spec.type}
            value={value}
            placeholder={spec.placeholder}
            onChange={(e) => setRelationField(rk, index, spec.key, e.target.value)}
            className={inputClass(!!err)}
            style={inputStyle(!!err)}
          />
        )}
        {spec.hint && !err && <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>{spec.hint}</p>}
        <ErrorText msg={err} />
      </div>
    );
  }

  function renderRelationSection(rk: RelationKey) {
    const cfg = RELATION_UI[rk];
    return (
      <div key={rk}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.black }}>{cfg.label}</h3>
          <button
            type="button"
            onClick={() => addEntry(rk)}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
            style={{ borderColor: COLORS.border, color: COLORS.red }}
          >
            <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
            Add {cfg.singular}
          </button>
        </div>
        {form[rk].length === 0 ? (
          <p className="text-xs italic mb-1" style={{ color: '#9CA3AF' }}>None added.</p>
        ) : (
          <div className="space-y-3">
            {form[rk].map((_, i) => (
              <div key={i} className="rounded-lg border p-3 relative" style={{ borderColor: COLORS.border }}>
                <button
                  type="button"
                  onClick={() => removeEntry(rk, i)}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-gray-100"
                  style={{ color: COLORS.gray }}
                  aria-label={`Remove ${cfg.singular} ${i + 1}`}
                >
                  <FontAwesomeIcon icon={faTrashCan} className="text-xs" />
                </button>
                <p className="text-xs font-medium mb-2" style={{ color: COLORS.gray }}>
                  {cfg.label} {i + 1}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cfg.fields.map((spec) => renderRelationField(rk, i, spec))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17, 17, 17, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-xl overflow-hidden flex flex-col"
        style={{ height: 'min(720px, 90vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: COLORS.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>Add a new employee</h2>
            <p className="text-xs" style={{ color: COLORS.gray }}>All basic-info fields are required.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-gray-100"
            style={{ color: COLORS.gray }}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {generalError && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{ background: COLORS.errorBg, border: `1px solid ${COLORS.errorBorder}`, color: COLORS.errorText }}
            >
              {generalError}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.black }}>Basic Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BASIC_INFO_FIELDS.map((field) => renderBasicField(field))}
            </div>
          </div>

          {RELATION_ORDER.map((rk) => renderRelationSection(rk))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 shrink-0" style={{ borderColor: COLORS.border }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-sm font-medium px-4 py-2 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: COLORS.border, color: COLORS.black }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-sm font-semibold px-5 py-2 rounded-lg text-white flex items-center gap-2 transition-colors disabled:opacity-60"
            style={{ backgroundColor: COLORS.red }}
          >
            {submitting && <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />}
            {submitting ? 'Saving…' : 'Create employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
