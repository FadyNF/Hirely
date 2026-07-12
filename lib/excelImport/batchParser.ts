// Parses the batch (tabular) template: header row + one row per employee.
// Uses SheetJS so it reads both legacy .xls and .xlsx. Maps each column to
// an Employee field via the shared BATCH_COLUMNS labels, tolerant of case /
// extra whitespace / minor header variations. Returns raw per-row values;
// validation happens afterward (reusing validateExtractedFields), same as
// every other import path.

import * as XLSX from "xlsx";
import { BATCH_COLUMNS } from "./batchColumns";

export interface BatchParsedRow {
  rowNumber: number; // 1-based sheet row (for "row 4 has a bad email" messages)
  data: Record<string, unknown>;
}

export interface BatchParseResult {
  rows: BatchParsedRow[];
  warnings: string[];
}

function normalizeHeader(s: string): string {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

function excelDateToISO(value: unknown): string | undefined {
  if (!(value instanceof Date)) return undefined;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseBatchExcel(buffer: Buffer): BatchParseResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], warnings: ["The workbook has no sheets."] };

  // Array-of-arrays: row 0 is the header, the rest are data.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: null });
  if (grid.length === 0) return { rows: [], warnings: ["The sheet is empty."] };

  const headerRow = grid[0].map((h) => normalizeHeader(String(h ?? "")));

  // Map each spreadsheet column index -> our field name, by matching labels.
  const colToField = new Map<number, { field: string; kind: string }>();
  for (const col of BATCH_COLUMNS) {
    const idx = headerRow.indexOf(normalizeHeader(col.label));
    if (idx !== -1) colToField.set(idx, { field: col.field, kind: col.kind });
  }

  if (colToField.size === 0) {
    return { rows: [], warnings: ['No recognizable column headers were found — make sure the first row matches the batch template (e.g. "Full Name", "Email").'] };
  }

  const rows: BatchParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const rawRow = grid[r];
    const data: Record<string, unknown> = {};
    let anyValue = false;

    for (const [colIdx, { field, kind }] of colToField) {
      const raw = rawRow[colIdx];
      if (raw === null || raw === undefined || raw === "") continue;

      if (kind === "date") {
        const iso = excelDateToISO(raw);
        data[field] = iso ?? String(raw).trim(); // pass text dates through for validation to judge
      } else if (kind === "number") {
        const n = typeof raw === "number" ? raw : Number(String(raw).trim());
        data[field] = Number.isNaN(n) ? String(raw).trim() : n;
      } else {
        data[field] = typeof raw === "string" ? raw.trim() : raw;
      }
      anyValue = true;
    }

    if (anyValue) rows.push({ rowNumber: r + 1, data }); // +1: sheet rows are 1-based
  }

  if (rows.length === 0) warnings.push("No data rows were found beneath the header.");
  return { rows, warnings };
}
