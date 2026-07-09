'use client';

// components/records/RecordsView.tsx
//
// Same UI/UX as the old React prototype's RecordsView.jsx, but the data
// comes in as a prop from the server (already queried from the real
// database) instead of being generated in the browser. No mock data,
// no randomization on reload — the same 20 seeded employees every time.

import { useState } from 'react';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG, SKILL_CATEGORIES } from '@/lib/tabConfig';
import type { SerializedEmployee } from '@/lib/employees';

const COLORS = {
  red: '#DC2626',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
};

const PAGE_SIZE = 5;

// ---- Small building blocks ----

function Placeholder() {
  return <span style={{ color: '#D1D5DB' }}>— not provided —</span>;
}

function FieldRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="py-2.5 border-b" style={{ borderColor: '#F3F4F6' }}>
      <p className="text-xs mb-0.5" style={{ color: COLORS.gray }}>{label}</p>
      <p className="text-sm font-medium" style={{ color: value !== null && value !== undefined && value !== '' ? COLORS.black : undefined }}>
        {value !== null && value !== undefined && value !== '' ? value : <Placeholder />}
      </p>
    </div>
  );
}

function EntryCard({
  fields, entry, index, label,
}: {
  fields: { key: string; label: string }[];
  entry: Record<string, unknown>;
  index: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border p-4 mb-3" style={{ borderColor: COLORS.border }}>
      <p className="text-xs font-medium mb-2" style={{ color: COLORS.gray }}>{label} {index + 1}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        {fields.map((f) => (
          <FieldRow key={f.key} label={f.label} value={entry[f.key] as string | number | null} />
        ))}
      </div>
    </div>
  );
}

function SkillPill({ name, proficiency }: { name: string; proficiency: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium mr-2 mb-2"
      style={{ backgroundColor: COLORS.pinkBg, color: COLORS.red }}
    >
      {name}
      <span style={{ color: '#F0A9AB' }}>·</span>
      {proficiency}%
    </span>
  );
}

// ---- Modal detail renderers, one per tab type ----

function BasicInfoDetail({ employee }: { employee: SerializedEmployee }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
      {BASIC_INFO_FIELDS.map((field) => (
        <FieldRow key={field} label={BASIC_INFO_LABELS[field]} value={employee[field]} />
      ))}
    </div>
  );
}

function MultiEntryDetail({
  employee, tabKey,
}: {
  employee: SerializedEmployee;
  tabKey: 'experience' | 'education' | 'certificates';
}) {
  const config = MULTI_TAB_CONFIG.find((c) => c.key === tabKey)!;
  const fields = [...config.requiredFields, ...config.optionalFields].map((key) => ({
    key, label: config.fieldLabels[key],
  }));
  const entries = employee[tabKey] as Record<string, unknown>[];

  if (entries.length === 0) {
    return <p className="text-sm py-4" style={{ color: COLORS.gray }}>No {config.label.toLowerCase()} entries on record.</p>;
  }
  return (
    <div>
      {entries.map((entry, i) => (
        <EntryCard key={i} fields={fields} entry={entry} index={i} label={config.label} />
      ))}
    </div>
  );
}

function SkillsDetail({ employee }: { employee: SerializedEmployee }) {
  return (
    <div className="space-y-5">
      {SKILL_CATEGORIES.map(({ key, label }) => {
        const items = employee.skills.filter((s) => s.category === key);
        return (
          <div key={key}>
            <p className="text-xs font-medium mb-2" style={{ color: COLORS.gray }}>{label}</p>
            {items.length === 0 ? (
              <p className="text-sm" style={{ color: COLORS.gray }}>None listed.</p>
            ) : (
              <div>
                {items.map((skill) => (
                  <SkillPill key={skill.id} name={skill.name} proficiency={skill.proficiency} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Modal ----

const TABS = [
  { key: 'basicInfo', label: 'Basic Info' },
  { key: 'experience', label: 'Experience' },
  { key: 'education', label: 'Education' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'skills', label: 'Skills' },
  { key: 'performance', label: 'Performance' },
] as const;

function EmployeeModal({ employee, onClose }: { employee: SerializedEmployee; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('basicInfo');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17, 17, 17, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl overflow-hidden flex flex-col"
        style={{ height: 'min(640px, 85vh)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-start justify-between" style={{ borderColor: COLORS.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>{employee.fullName}</h2>
            <p className="text-sm" style={{ color: COLORS.gray }}>{employee.email || 'No email on file'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-lg leading-none transition-colors hover:bg-gray-100"
            style={{ color: COLORS.gray }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex gap-1 px-4 border-b overflow-x-auto shrink-0" style={{ borderColor: COLORS.border }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors"
              style={{
                borderColor: activeTab === tab.key ? COLORS.red : 'transparent',
                color: activeTab === tab.key ? COLORS.red : COLORS.gray,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'basicInfo' && <BasicInfoDetail employee={employee} />}
          {(activeTab === 'experience' || activeTab === 'education' || activeTab === 'certificates') && (
            <MultiEntryDetail employee={employee} tabKey={activeTab} />
          )}
          {activeTab === 'skills' && <SkillsDetail employee={employee} />}
          {activeTab === 'performance' && (
            <p className="text-sm py-4" style={{ color: COLORS.gray }}>No data recorded for this tab yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Table ----

function RecordsTable({
  employees, onViewMore,
}: {
  employees: SerializedEmployee[];
  onViewMore: (id: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: COLORS.border }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: COLORS.border, color: COLORS.gray }}>
            <th className="py-3 px-4 font-medium">ID</th>
            <th className="py-3 px-4 font-medium">Full Name</th>
            <th className="py-3 px-4 font-medium">Email</th>
            <th className="py-3 px-4 font-medium">National ID</th>
            <th className="py-3 px-4 font-medium text-right">Details</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-b" style={{ borderColor: '#F3F4F6' }}>
              <td className="py-3 px-4" style={{ color: COLORS.gray }}>{e.id}</td>
              <td className="py-3 px-4 font-medium" style={{ color: COLORS.black }}>{e.fullName}</td>
              <td className="py-3 px-4">{e.email || <Placeholder />}</td>
              <td className="py-3 px-4">{e.nationalId || <Placeholder />}</td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => onViewMore(e.id)}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                  style={{ borderColor: COLORS.border, color: COLORS.black }}
                >
                  View more
                </button>
              </td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-sm" style={{ color: COLORS.gray }}>
                No employees match that search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Main component ----

export default function RecordsView({ employees }: { employees: SerializedEmployee[] }) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalEmployeeId, setModalEmployeeId] = useState<number | null>(null);

  const filtered = employees.filter((e) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return e.fullName.toLowerCase().includes(q) || String(e.id).includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setCurrentPage(1);
  };

  const modalEmployee = employees.find((e) => e.id === modalEmployeeId);

  return (
    <div className="p-8 space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: COLORS.black }}>
          Employee <span style={{ color: COLORS.red }}>Records</span>
        </h1>
        <p className="text-sm" style={{ color: COLORS.gray }}>
          Browse individual employee data as stored, tab by tab
        </p>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search by name or ID..."
        className="w-full sm:w-72 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4"
        style={{ borderColor: COLORS.border }}
      />

      <RecordsTable employees={pageItems} onViewMore={setModalEmployeeId} />

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: COLORS.gray }}>
          {filtered.length === 0
            ? '0 results'
            : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: COLORS.border, color: COLORS.black }}
          >
            Previous
          </button>
          <span className="text-sm" style={{ color: COLORS.gray }}>Page {safePage} of {totalPages}</span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: COLORS.border, color: COLORS.black }}
          >
            Next
          </button>
        </div>
      </div>

      {modalEmployee && <EmployeeModal employee={modalEmployee} onClose={() => setModalEmployeeId(null)} />}
    </div>
  );
}