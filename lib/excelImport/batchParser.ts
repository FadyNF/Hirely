// Parses the batch (tabular) template: header row + one row per employee.
// Uses SheetJS so it reads both legacy .xls and .xlsx. Maps each column to
// an Employee scalar field OR a (relationKey, slot, field) triple via the
// shared BATCH_COLUMNS / BATCH_RELATION_GROUPS headers, tolerant of case /
// extra whitespace. Slots for the same relation get collected back into an
// array (empty slots skipped) so downstream validation can reuse the exact
// same relation validators the chatbot/single-import flows already use.

import * as XLSX from "xlsx";
import { BATCH_COLUMNS, BATCH_RELATION_GROUPS, relationColumnHeader } from "./batchColumns";

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

// Direct cell access instead of XLSX.utils.sheet_to_json: sheet_to_json's
// header:1 mode was found (during testing) to shift date cells by the
// system's local UTC offset when extracting them — e.g. a real "2019-01-01"
// cell came back as "2018-12-31". Reading raw cell.v directly (same
// approach singleEmployeeParser.ts already uses) doesn't have that bug.
function buildGrid(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: unknown[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      row.push(cell ? cell.v : null);
    }
    grid.push(row);
  }
  return grid;
}

function coerceValue(raw: unknown, kind: string): unknown {
  if (kind === "date") {
    const iso = excelDateToISO(raw);
    return iso ?? (typeof raw === "string" ? raw.trim() : String(raw)); // text dates ("Current") pass through
  }
  if (kind === "number") {
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    return Number.isNaN(n) ? String(raw).trim() : n;
  }
  return typeof raw === "string" ? raw.trim() : raw;
}

export function parseBatchExcel(buffer: Buffer): BatchParseResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], warnings: ["The workbook has no sheets."] };

  const grid = buildGrid(sheet);
  if (grid.length === 0) return { rows: [], warnings: ["The sheet is empty."] };

  const headerRow = grid[0].map((h) => normalizeHeader(String(h ?? "")));

  const colToScalar = new Map<number, { field: string; kind: string }>();
  for (const col of BATCH_COLUMNS) {
    const idx = headerRow.indexOf(normalizeHeader(col.label));
    if (idx !== -1) colToScalar.set(idx, { field: col.field, kind: col.kind });
  }

  const colToRelation = new Map<number, { relationKey: string; slot: number; field: string; kind: string }>();
  for (const group of BATCH_RELATION_GROUPS) {
    for (let slot = 1; slot <= group.slots; slot++) {
      for (const f of group.fields) {
        const idx = headerRow.indexOf(normalizeHeader(relationColumnHeader(group, slot, f)));
        if (idx !== -1) colToRelation.set(idx, { relationKey: group.relationKey, slot, field: f.key, kind: f.kind });
      }
    }
  }

  if (colToScalar.size === 0) {
    return { rows: [], warnings: ['No recognizable column headers were found — make sure the first row matches the batch template (e.g. "Full Name", "Email").'] };
  }

  const rows: BatchParsedRow[] = [];
  for (let r = 1; r < grid.length; r++) {
    const rawRow = grid[r];
    const data: Record<string, unknown> = {};
    let anyValue = false;

    for (const [colIdx, { field, kind }] of colToScalar) {
      const raw = rawRow[colIdx];
      if (raw === null || raw === undefined || raw === "") continue;
      data[field] = coerceValue(raw, kind);
      anyValue = true;
    }

    // Group relation columns back into per-slot entry objects, then into
    // arrays (in slot order, skipping empty slots) — the shape
    // validateExtractedFields' relation validators already expect.
    const relationSlots = new Map<string, Map<number, Record<string, unknown>>>();
    for (const [colIdx, { relationKey, slot, field, kind }] of colToRelation) {
      const raw = rawRow[colIdx];
      if (raw === null || raw === undefined || raw === "") continue;
      anyValue = true;
      let value = coerceValue(raw, kind);
      // performanceReviews.score: admin enters a 0-100 percentage; the
      // relation validator (and the DB column) expect a 0-1 fraction.
      if (relationKey === "performanceReviews" && field === "score" && typeof value === "number") {
        value = value / 100;
      }
      if (!relationSlots.has(relationKey)) relationSlots.set(relationKey, new Map());
      const slots = relationSlots.get(relationKey)!;
      if (!slots.has(slot)) slots.set(slot, {});
      slots.get(slot)![field] = value;
    }
    for (const [relationKey, slots] of relationSlots) {
      const orderedSlots = Array.from(slots.keys()).sort((a, b) => a - b);
      data[relationKey] = orderedSlots.map((slot) => slots.get(slot));
    }

    if (anyValue) rows.push({ rowNumber: r + 1, data });
  }

  if (rows.length === 0) warnings.push("No data rows were found beneath the header.");
  return { rows, warnings };
}
