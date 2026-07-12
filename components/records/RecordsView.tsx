'use client';

// components/records/RecordsView.tsx
//
// Same UI/UX as the old React prototype's RecordsView.jsx, but the data
// comes in as a prop from the server (already queried from the real
// database) instead of being generated in the browser. No mock data,
// no randomization on reload — the same 20 seeded employees every time.

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG, SKILL_CATEGORIES } from '@/lib/tabConfig';
import type { SerializedEmployee } from '@/lib/employees';
import { useAuth } from '@/context/AuthContext';

// Triggers a browser download from an auth-gated route (authFetch handles
// the cookie + 401 refresh; a plain <a href> would skip the retry).
async function downloadFromRoute(
  authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
  url: string,
  fallbackName: string
) {
  const res = await authFetch(url);
  if (!res.ok) return false;
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
  return true;
}

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
  const { authFetch } = useAuth();
  const [exporting, setExporting] = useState(false);

  // Export this employee as the single-employee Excel template. authFetch
  // sends the auth cookie (and refreshes on 401); the blob becomes a click
  // on a temporary object-URL.
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await authFetch(`/api/export/employee/${employee.id}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const name = match ? match[1] : `employee-${employee.id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: COLORS.border, color: COLORS.red }}
            >
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-lg leading-none transition-colors hover:bg-gray-100"
              style={{ color: COLORS.gray }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
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

// ---- Batch import modal ----

interface ReviewedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: Record<string, string>;
  valid: boolean;
}

function BatchImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ReviewedRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; failed: { rowNumber: number; error: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await authFetch('/api/import/batch', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't read that file.");
        return;
      }
      const reviewed: ReviewedRow[] = json.rows;
      setRows(reviewed);
      // Pre-select every valid row.
      setSelected(new Set(reviewed.filter((r) => r.valid).map((r) => r.rowNumber)));
    } catch {
      setError('Something went wrong reaching the server.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (rowNumber: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });

  const handleImport = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => r.valid && selected.has(r.rowNumber)).map((r) => ({ rowNumber: r.rowNumber, data: r.data }));
    if (toImport.length === 0) return;
    setBusy(true);
    try {
      const res = await authFetch('/api/import/batch/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: toImport }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Import failed.');
        return;
      }
      setResult(json);
      if (json.created > 0) {
        onImported();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const validCount = rows?.filter((r) => r.valid).length ?? 0;
  const selectedCount = rows?.filter((r) => r.valid && selected.has(r.rowNumber)).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(17,17,17,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-xl overflow-hidden flex flex-col" style={{ height: 'min(680px, 88vh)' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: COLORS.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>Import employees from a batch sheet</h2>
            <p className="text-xs" style={{ color: COLORS.gray }}>Upload the tabular template — one row per employee.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-lg hover:bg-gray-100" style={{ color: COLORS.gray }} aria-label="Close">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: COLORS.pinkBg, color: COLORS.red }}>{error}</div>
          )}

          {/* Result screen */}
          {result ? (
            <div>
              <p className="text-sm mb-2" style={{ color: COLORS.black }}>
                Imported <span style={{ color: COLORS.red, fontWeight: 600 }}>{result.created}</span> employee{result.created === 1 ? '' : 's'}.
              </p>
              {result.failed.length > 0 && (
                <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: COLORS.pinkBg, color: COLORS.red }}>
                  <p className="font-medium">{result.failed.length} row{result.failed.length === 1 ? '' : 's'} could not be saved:</p>
                  {result.failed.map((f) => <p key={f.rowNumber}>Row {f.rowNumber}: {f.error}</p>)}
                </div>
              )}
            </div>
          ) : !rows ? (
            /* Upload screen */
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
              />
              <p className="text-sm" style={{ color: COLORS.gray }}>Choose a filled-in batch sheet to preview and import.</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: COLORS.red }}
              >
                {busy ? 'Reading…' : 'Choose file'}
              </button>
              <button
                onClick={() => downloadFromRoute(authFetch, '/api/templates/batch', 'batch-employees-template.xlsx')}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Download the blank batch template
              </button>
            </div>
          ) : (
            /* Review table */
            <div>
              <p className="text-xs mb-2" style={{ color: COLORS.gray }}>
                {rows.length} row{rows.length === 1 ? '' : 's'} found · {validCount} valid · {rows.length - validCount} with problems.
                Rows with problems can&apos;t be selected — fix them in the sheet and re-upload.
              </p>
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: COLORS.border }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB' }}>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Row</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Full Name</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Email</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Department</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className="border-t" style={{ borderColor: '#F3F4F6' }}>
                        <td className="p-2 text-center">
                          <input type="checkbox" disabled={!r.valid} checked={selected.has(r.rowNumber)} onChange={() => toggle(r.rowNumber)} />
                        </td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{r.rowNumber}</td>
                        <td className="p-2" style={{ color: COLORS.black }}>{String(r.data.fullName ?? r.errors.fullName ? (r.data.fullName ?? '—') : '—')}</td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{String(r.data.email ?? '—')}</td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{String(r.data.workLocation ?? '—')}</td>
                        <td className="p-2">
                          {r.valid ? (
                            <span style={{ color: '#16A34A' }}>Ready</span>
                          ) : (
                            <span style={{ color: COLORS.red }}>{Object.entries(r.errors).map(([f, m]) => `${f}: ${m}`).join('; ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 shrink-0" style={{ borderColor: COLORS.border }}>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-lg border hover:bg-gray-50" style={{ borderColor: COLORS.border, color: COLORS.black }}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {rows && !result && (
            <button
              onClick={handleImport}
              disabled={busy || selectedCount === 0}
              className="text-sm font-semibold px-5 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ backgroundColor: COLORS.red }}
            >
              {busy ? 'Importing…' : `Import ${selectedCount} selected`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main component ----

export default function RecordsView({ employees }: { employees: SerializedEmployee[] }) {
  const { authFetch } = useAuth();
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalEmployeeId, setModalEmployeeId] = useState<number | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Export what the admin is currently looking at: pass the live search so
  // the sheet contains exactly the filtered subset (or everyone if blank).
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const q = query.trim();
      const url = q ? `/api/export/batch?search=${encodeURIComponent(q)}` : '/api/export/batch';
      await downloadFromRoute(authFetch, url, 'employees.xlsx');
    } finally {
      setExporting(false);
    }
  };

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name or ID..."
          className="w-full sm:w-72 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4"
          style={{ borderColor: COLORS.border }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBatchOpen(true)}
            className="text-sm font-medium px-3 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: COLORS.red }}
          >
            Import batch
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm font-medium px-3 py-2 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: COLORS.border, color: COLORS.black }}
          >
            {exporting ? 'Exporting…' : query.trim() ? 'Export filtered' : 'Export all'}
          </button>
        </div>
      </div>

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
      {batchOpen && <BatchImportModal onClose={() => setBatchOpen(false)} onImported={() => { /* router.refresh handles the reload */ }} />}
    </div>
  );
}