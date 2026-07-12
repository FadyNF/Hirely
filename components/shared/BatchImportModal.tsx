'use client';

// components/shared/BatchImportModal.tsx
//
// Batch (tabular) Excel import — upload, per-row/per-field review with
// inline editing, then commit. Shared between the Records page and the
// chatbot's Import menu so this fairly large piece of UI exists exactly
// once. Supports multiple files at once (each parsed and merged into one
// review table) and drag-and-drop, in addition to the file picker.

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  NUMERIC_SCALAR_FIELDS,
  validateFieldValue,
  validateRelationField,
  type FieldIssue,
  type RelationKey,
} from '@/lib/chatbotValidate';

const COLORS = {
  red: '#DC2626',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
};

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

interface ReviewedRow {
  rowNumber: number;
  sourceFile: string;
  // The editable working copy — starts as the server's rawData and is
  // mutated in place as the admin fixes flagged values inline. This is
  // exactly what gets sent to /api/import/batch/commit, which re-resolves
  // it (via the same validateBatchRow used at preview time) as the sole
  // source of truth for what's written and what's flagged.
  data: Record<string, unknown>;
  issues: FieldIssue[];
}

const RELATION_LABELS_BATCH: Record<RelationKey, string> = {
  experience: 'exp', education: 'edu', certificates: 'cert', skills: 'skill', performanceReviews: 'review',
};

const RELATION_ENTRY_LABEL: Record<RelationKey, string> = {
  experience: 'Experience', education: 'Education', certificates: 'Certificate', skills: 'Skill', performanceReviews: 'Performance review',
};

// The relation entry fields that arrive/leave as real numbers rather than
// text — mirrors EmployeeForm's own NUMERIC_RELATION_FIELDS convention.
const NUMERIC_RELATION_FIELDS = new Set(['graduationYear', 'proficiency', 'year', 'score']);

function relationSummary(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, label] of Object.entries(RELATION_LABELS_BATCH)) {
    const arr = data[key];
    if (Array.isArray(arr) && arr.length > 0) parts.push(`${arr.length} ${label}${arr.length > 1 ? 's' : ''}`);
  }
  return parts.join(', ');
}

function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z])([A-Z])/g, '$1 $2');
  const titled = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  // "nationalId" -> "National Id" otherwise — schema camelCases only the
  // leading letter of "Id", unlike "companyID" which is already all-caps.
  return titled.replace(/\bId\b/, 'ID');
}

function issueLabel(issue: FieldIssue): string {
  if (issue.scope === 'employee') return humanizeField(issue.field);
  return `${RELATION_ENTRY_LABEL[issue.scope]} ${(issue.entryIndex ?? 0) + 1} — ${humanizeField(issue.field)}`;
}

function issueKey(issue: FieldIssue): string {
  return `${issue.scope}:${issue.entryIndex ?? ''}:${issue.field}`;
}

function getIssueValue(data: Record<string, unknown>, issue: FieldIssue): unknown {
  if (issue.scope === 'employee') return data[issue.field];
  const arr = data[issue.scope] as Record<string, unknown>[] | undefined;
  return arr?.[issue.entryIndex ?? -1]?.[issue.field];
}

function setIssueValue(data: Record<string, unknown>, issue: FieldIssue, value: unknown): Record<string, unknown> {
  if (issue.scope === 'employee') return { ...data, [issue.field]: value };
  const arr = [...((data[issue.scope] as Record<string, unknown>[] | undefined) ?? [])];
  const idx = issue.entryIndex ?? -1;
  if (idx < 0 || idx >= arr.length) return data;
  arr[idx] = { ...arr[idx], [issue.field]: value };
  return { ...data, [issue.scope]: arr };
}

// performanceReviews.score is stored as a 0-1 fraction (see
// lib/chatbotValidate.ts's RELATION_FIELDS comment) but shown/typed here as
// a 0-100 percentage, same as everywhere else in the app — convert at this
// boundary only.
function issueDisplayValue(issue: FieldIssue, rawValue: unknown): string {
  if (issue.scope === 'performanceReviews' && issue.field === 'score' && typeof rawValue === 'number') {
    return String(Math.round(rawValue * 100));
  }
  return rawValue === null || rawValue === undefined ? '' : String(rawValue);
}

export default function BatchImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ReviewedRow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; flagged: number; failed: { rowNumber: number; error: string }[] } | null>(null);
  const [editing, setEditing] = useState<{ rowNumber: number; key: string; value: string } | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragHideTimeoutRef = useRef<number | undefined>(undefined);

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => /\.xlsx?$/i.test(f.name));
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      files.forEach((f) => body.append('file', f));
      const res = await authFetch('/api/import/batch', { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Couldn't read that file.");
        return;
      }
      const reviewed: ReviewedRow[] = json.rows.map((r: { rowNumber: number; sourceFile: string; rawData: Record<string, unknown>; issues: FieldIssue[] }) => ({
        rowNumber: r.rowNumber,
        sourceFile: r.sourceFile,
        data: r.rawData,
        issues: r.issues,
      }));
      setRows(reviewed);
      // Pre-select every row, including flagged ones — leaving a row
      // deselected by default is how records used to get silently lost;
      // the admin now has to consciously opt a row OUT, not in.
      setSelected(new Set(reviewed.map((r) => r.rowNumber)));
    } catch {
      setError('Something went wrong reaching the server.');
    } finally {
      setBusy(false);
    }
  };

  // Same dragover-driven pattern as the chatbot's whole-panel drop zone
  // (see ChatbotView.tsx's handleDragOver comment) — dragover fires
  // continuously while hovering, so it's what drives showing/hiding the
  // overlay rather than relying on paired dragenter/dragleave events.
  // stopPropagation matters here specifically: this modal can be opened
  // FROM the chatbot, which has its own page-wide drop zone underneath —
  // without stopping the event, a drop on the modal also bubbles up and
  // triggers the chatbot's own (unwanted, single-employee-shaped) handler.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    setIsDraggingFile(true);
    if (dragHideTimeoutRef.current) clearTimeout(dragHideTimeoutRef.current);
    dragHideTimeoutRef.current = window.setTimeout(() => setIsDraggingFile(false), 150);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragHideTimeoutRef.current) clearTimeout(dragHideTimeoutRef.current);
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const toggle = (rowNumber: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });

  const startEdit = (row: ReviewedRow, issue: FieldIssue) => {
    setEditing({ rowNumber: row.rowNumber, key: issueKey(issue), value: issueDisplayValue(issue, getIssueValue(row.data, issue)) });
  };

  const saveEdit = (row: ReviewedRow, issue: FieldIssue) => {
    if (!editing) return;
    const inputValue = editing.value.trim();
    const isNumeric = issue.scope === 'employee' ? NUMERIC_SCALAR_FIELDS.has(issue.field) : NUMERIC_RELATION_FIELDS.has(issue.field);

    let finalValue: unknown = inputValue;
    let valid: boolean;
    let reason: string | undefined;

    if (issue.scope === 'employee') {
      const validation = validateFieldValue(issue.field, inputValue);
      valid = validation.valid;
      reason = validation.reason;
      finalValue = valid ? (isNumeric ? Number(inputValue) : validation.normalized ?? inputValue) : inputValue;
    } else {
      const checkValue: unknown = isNumeric ? Number(inputValue) : inputValue;
      const validation = validateRelationField(issue.scope, issue.field, checkValue);
      valid = validation.valid;
      reason = validation.reason;
      finalValue = valid ? validation.normalized ?? checkValue : checkValue;
      // Convert the percentage the admin typed into the fraction the
      // column stores — see issueDisplayValue above.
      if (valid && issue.scope === 'performanceReviews' && issue.field === 'score' && typeof finalValue === 'number') {
        finalValue = finalValue / 100;
      }
    }

    setRows((prev) =>
      prev?.map((r) => {
        if (r.rowNumber !== row.rowNumber) return r;
        const newData = setIssueValue(r.data, issue, finalValue);
        const newIssues = valid
          ? r.issues.filter((i) => issueKey(i) !== issueKey(issue))
          : r.issues.map((i) => (issueKey(i) === issueKey(issue) ? { ...i, rawValue: inputValue, reason: reason ?? i.reason } : i));
        return { ...r, data: newData, issues: newIssues };
      }) ?? null
    );
    setEditing(null);
  };

  const handleImport = async () => {
    if (!rows) return;
    const toImport = rows.filter((r) => selected.has(r.rowNumber)).map((r) => ({ rowNumber: r.rowNumber, data: r.data }));
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

  const cleanCount = rows?.filter((r) => r.issues.length === 0).length ?? 0;
  const selectedCount = rows?.filter((r) => selected.has(r.rowNumber)).length ?? 0;
  const fileCount = rows ? new Set(rows.map((r) => r.sourceFile)).size : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(17,17,17,0.5)' }} onClick={onClose}>
      <div
        className="w-full max-w-4xl bg-white rounded-xl overflow-hidden flex flex-col relative"
        style={{ height: 'min(680px, 88vh)' }}
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
          >
            <div
              className="flex flex-col items-center gap-2 px-8 py-6 rounded-2xl border-2 border-dashed"
              style={{ borderColor: COLORS.red, backgroundColor: '#FEF2F2' }}
            >
              <p className="text-sm font-medium" style={{ color: COLORS.black }}>Drop Excel file(s) to preview and import</p>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: COLORS.border }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>Import employees from a batch sheet</h2>
            <p className="text-xs" style={{ color: COLORS.gray }}>Upload the tabular template — one row per employee. Drag and drop, or select one or more files.</p>
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
                {result.flagged > 0 && (
                  <> <span style={{ color: '#B45309', fontWeight: 600 }}>{result.flagged}</span> flagged for review — visit the Dashboard to resolve them.</>
                )}
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
            <div
              className="flex flex-col items-center justify-center h-full gap-4 text-center rounded-xl border-2 border-dashed"
              style={{ borderColor: '#E5E7EB' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files); e.target.value = ''; }}
              />
              <p className="text-sm" style={{ color: COLORS.gray }}>Drag and drop one or more filled-in batch sheets, or</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: COLORS.red }}
              >
                {busy ? 'Reading…' : 'Choose file(s)'}
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
                {rows.length} row{rows.length === 1 ? '' : 's'} found{fileCount > 1 ? ` across ${fileCount} files` : ''} · {cleanCount} ready · {rows.length - cleanCount} flagged for review.
                Every row can still be imported — fix a flagged value inline, or leave it and it&apos;ll be flagged for review from the Dashboard.
              </p>
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: COLORS.border }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB' }}>
                      <th className="p-2 w-8"></th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Row</th>
                      {fileCount > 1 && <th className="p-2 text-left" style={{ color: COLORS.gray }}>File</th>}
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Full Name</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Email</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Department</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Relations</th>
                      <th className="p-2 text-left" style={{ color: COLORS.gray }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className="border-t align-top" style={{ borderColor: '#F3F4F6' }}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={selected.has(r.rowNumber)} onChange={() => toggle(r.rowNumber)} />
                        </td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{r.rowNumber}</td>
                        {fileCount > 1 && <td className="p-2 truncate max-w-[8rem]" style={{ color: COLORS.gray }} title={r.sourceFile}>{r.sourceFile}</td>}
                        <td className="p-2" style={{ color: COLORS.black }}>{String(r.data.fullName ?? '—')}</td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{String(r.data.email ?? '—')}</td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{String(r.data.workLocation ?? '—')}</td>
                        <td className="p-2" style={{ color: COLORS.gray }}>{relationSummary(r.data) || '—'}</td>
                        <td className="p-2">
                          {r.issues.length === 0 ? (
                            <span style={{ color: '#16A34A' }}>Ready</span>
                          ) : (
                            <div className="space-y-1">
                              <span style={{ color: '#B45309' }} className="font-medium">
                                {r.issues.length} will be flagged for review
                              </span>
                              {r.issues.map((issue) => {
                                const key = issueKey(issue);
                                const isEditing = editing?.rowNumber === r.rowNumber && editing.key === key;
                                return (
                                  <div key={key} className="flex items-center gap-1.5">
                                    {isEditing ? (
                                      <>
                                        <input
                                          autoFocus
                                          value={editing.value}
                                          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveEdit(r, issue);
                                            if (e.key === 'Escape') setEditing(null);
                                          }}
                                          className="border rounded px-1.5 py-0.5 text-xs w-32"
                                          style={{ borderColor: COLORS.border }}
                                        />
                                        <button onClick={() => saveEdit(r, issue)} className="text-xs font-medium" style={{ color: '#16A34A' }}>Save</button>
                                        <button onClick={() => setEditing(null)} className="text-xs" style={{ color: COLORS.gray }}>Cancel</button>
                                      </>
                                    ) : (
                                      <>
                                        <span style={{ color: '#B45309' }}>{issueLabel(issue)}: {issue.reason}</span>
                                        <button onClick={() => startEdit(r, issue)} className="text-xs font-medium underline underline-offset-2 shrink-0" style={{ color: COLORS.red }}>
                                          Edit
                                        </button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
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
