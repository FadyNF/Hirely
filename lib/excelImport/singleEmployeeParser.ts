// Parses the specially-formatted single-employee Excel "talent profile"
// template. Layout is NOT fixed row/column coordinates — every section is
// located by searching for its label text, since the row positions can
// shift between real files (confirmed: this is not the same layout on
// every export).

import * as XLSX from "xlsx";

export interface ParsedBasicInfo {
  companyID?: string;
  fullName?: string;
  hiringDate?: string; // ISO YYYY-MM-DD
  position?: string;
  workLocation?: string; // "Department" in the sheet
  age?: number;
  yearsExpPrev?: number;
  yearsExpElsewedy?: number;
  totalExperience?: number;
  // Raw "Graduation" text (e.g. "Faculty of Computer Science") — not yet
  // mapped to a specific Education field, see report.
  graduationField?: string;
  graduationYear?: number;
}

export interface ParsedPerformanceReview {
  quarter: string; // "Q1".."Q4"
  year: number;
  score: number; // fraction, e.g. 0.95
}

export interface ParsedExperienceEntry {
  jobTitle?: string;
  company?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
}

export interface ParsedSingleEmployeeExcel {
  sheetName: string;
  sheetCount: number;
  basic: ParsedBasicInfo;
  performanceReviews: ParsedPerformanceReview[];
  experience: ParsedExperienceEntry[];
  // Flat, unparsed lines from the "Training Historical Record" section —
  // deliberately not split into Certificate/Education here; that's the
  // Gemini batch-classification pass (Phase C).
  trainingRawLines: string[];
  warnings: string[];
}

type Grid = (XLSX.CellObject | undefined)[][];

function buildGrid(ws: XLSX.WorkSheet): Grid {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const grid: Grid = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: (XLSX.CellObject | undefined)[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(ws[XLSX.utils.encode_cell({ r, c })]);
    }
    grid.push(row);
  }
  return grid;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  if (cell.v instanceof Date) return cell.w ? String(cell.w).trim() : "";
  return String(cell.v).trim();
}

function normalizeLabel(s: string): string {
  return s.trim().replace(/:$/, "").toLowerCase();
}

function findLabelCell(
  grid: Grid,
  label: string,
  rowRange?: [number, number]
): { r: number; c: number } | undefined {
  const target = normalizeLabel(label);
  const [minR, maxR] = rowRange ?? [0, grid.length - 1];
  for (let r = minR; r <= maxR && r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const text = cellText(grid[r][c]);
      if (text && normalizeLabel(text) === target) return { r, c };
    }
  }
  return undefined;
}

function findCellContaining(grid: Grid, substr: string): { r: number; c: number } | undefined {
  const target = substr.toLowerCase();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const text = cellText(grid[r][c]).toLowerCase();
      if (text.includes(target)) return { r, c };
    }
  }
  return undefined;
}

function excelDateToISO(value: unknown): string | undefined {
  if (!(value instanceof Date)) return undefined;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) return Number(value);
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return undefined; // dates handled separately
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

const BASIC_LABELS: Array<[label: string, key: keyof ParsedBasicInfo, kind: "string" | "number" | "date"]> = [
  ["ID:", "companyID", "string"],
  ["Employee Name:", "fullName", "string"],
  ["Hiring Date:", "hiringDate", "date"],
  ["Position:", "position", "string"],
  ["Department:", "workLocation", "string"],
  ["Age:", "age", "number"],
  ["Years of Exp. Prev:", "yearsExpPrev", "number"],
  ["Elsewedy Years of Exp.:", "yearsExpElsewedy", "number"],
  ["Total Experience:", "totalExperience", "number"],
  ["Graduation:", "graduationField", "string"],
  ["Graduation year:", "graduationYear", "number"],
];

export function parseSingleEmployeeExcel(buffer: Buffer): ParsedSingleEmployeeExcel {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = buildGrid(ws);
  const warnings: string[] = [];

  if (wb.SheetNames.length > 1) {
    warnings.push(
      `Workbook has ${wb.SheetNames.length} sheets (${wb.SheetNames.join(", ")}) — only the first ("${sheetName}") was parsed.`
    );
  }

  // --- Basic info block ---
  const basic: ParsedBasicInfo = {};
  for (const [label, key, kind] of BASIC_LABELS) {
    const pos = findLabelCell(grid, label);
    if (!pos) {
      warnings.push(`Label not found: "${label}"`);
      continue;
    }
    const valueCell = grid[pos.r]?.[pos.c + 1];
    if (kind === "date") {
      const iso = excelDateToISO(valueCell?.v);
      if (iso) basic[key] = iso as never;
      else warnings.push(`Could not read a date value for "${label}"`);
    } else if (kind === "number") {
      const n = asNumber(valueCell?.v);
      if (n !== undefined) basic[key] = n as never;
      else warnings.push(`Could not read a numeric value for "${label}"`);
    } else {
      const s = asString(valueCell?.v);
      if (s !== undefined) basic[key] = s as never;
      else warnings.push(`Could not read a text value for "${label}"`);
    }
  }

  // --- Performance appraisal history (%) ---
  const performanceReviews: ParsedPerformanceReview[] = [];
  const perfHeader = findCellContaining(grid, "performance appraisal history");
  if (perfHeader) {
    let r = perfHeader.r + 1;
    let misses = 0;
    while (r < grid.length && misses < 3) {
      const label = cellText(grid[r][perfHeader.c]);
      const m = label.match(/^Q([1-4])\s*-\s*(\d{4})$/i);
      if (m) {
        const score = asNumber(grid[r][perfHeader.c + 1]?.v);
        if (score !== undefined) {
          performanceReviews.push({ quarter: `Q${m[1]}`, year: Number(m[2]), score });
        } else {
          warnings.push(`Performance row "${label}" has no readable score`);
        }
        misses = 0;
      } else if (label === "") {
        misses++;
      } else {
        break; // hit a different section's label (e.g. "Attendance Behavior")
      }
      r++;
    }
  } else {
    warnings.push('Section not found: "Performance appraisal history (%)"');
  }

  // --- Experience History table ---
  const experience: ParsedExperienceEntry[] = [];
  const expHeader = findCellContaining(grid, "experience history");
  const trainingHeaderProbe = findCellContaining(grid, "training historical record");
  const expSearchRange: [number, number] | undefined = expHeader
    ? [expHeader.r, trainingHeaderProbe ? trainingHeaderProbe.r : grid.length - 1]
    : undefined;

  const titlePos = findLabelCell(grid, "Title", expSearchRange);
  const orgPos = findLabelCell(grid, "Organization", expSearchRange);
  const fromPos = findLabelCell(grid, "From", expSearchRange);
  const toPos = findLabelCell(grid, "To", expSearchRange);

  if (titlePos && orgPos && fromPos && toPos) {
    let r = Math.max(titlePos.r, orgPos.r, fromPos.r, toPos.r) + 1;
    let blanks = 0;
    while (r < grid.length && blanks < 2) {
      const jobTitle = asString(grid[r][titlePos.c]?.v);
      const company = asString(grid[r][orgPos.c]?.v);
      const startDate = excelDateToISO(grid[r][fromPos.c]?.v);
      const endDate = excelDateToISO(grid[r][toPos.c]?.v);
      if (!jobTitle && !company && !startDate && !endDate) {
        blanks++;
      } else {
        experience.push({ jobTitle, company, startDate, endDate });
        blanks = 0;
      }
      r++;
    }
  } else {
    warnings.push('Experience History table headers (Title/Organization/From/To) not fully found');
  }

  // --- Training Historical Record (free-text lists) ---
  const trainingRawLines: string[] = [];
  const trainingHeader = findCellContaining(grid, "training historical record");
  if (trainingHeader) {
    const subHeaderRow = trainingHeader.r + 1;
    const listCols: number[] = [];
    if (grid[subHeaderRow]) {
      for (let c = 0; c < grid[subHeaderRow].length; c++) {
        if (cellText(grid[subHeaderRow][c])) listCols.push(c);
      }
    }
    if (listCols.length === 0) {
      warnings.push('Sub-headers for "Training Historical Record" not found');
    } else {
      let r = subHeaderRow + 1;
      let blanks = 0;
      while (r < grid.length && blanks < 2) {
        let any = false;
        for (const c of listCols) {
          const text = cellText(grid[r][c]);
          if (text) {
            trainingRawLines.push(text);
            any = true;
          }
        }
        blanks = any ? 0 : blanks + 1;
        r++;
      }
    }
  } else {
    warnings.push('Section not found: "Training Historical Record"');
  }

  return {
    sheetName,
    sheetCount: wb.SheetNames.length,
    basic,
    performanceReviews,
    experience,
    trainingRawLines,
    warnings,
  };
}
