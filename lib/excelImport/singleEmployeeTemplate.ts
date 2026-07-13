// Builds the single-employee "Talent Profile" workbook — the same shape as
// the Excel template the importer reads. Two uses from one builder:
//   • buildSingleEmployeeWorkbook()            -> a blank template to fill in
//   • buildSingleEmployeeWorkbook(employee)    -> that employee's data, exported
//
// The layout mirrors the real ElSewedy template (section headers, label/value
// blocks, the Experience History table, the two-column Training Historical
// Record) so a file exported here re-imports cleanly through
// singleEmployeeParser.ts. Styling mirrors the original: grey (#C0C0C0)
// section-header fills, bold black labels, thin cell borders.

import ExcelJS from "exceljs";

// The subset of an Employee (with relations) this workbook renders. Kept
// loose (all optional) so both a full DB record and a partial one work.
// Shared by the single-employee builder AND the batch export builder — the
// batch sheet needs every scalar field plus all relations, not just the
// ones the single-employee template's fixed layout happens to show.
export interface EmployeeWorkbookData {
  fullName?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
  email?: string | null;
  workLocation?: string | null;
  gender?: string | null;
  nationalId?: string | null;
  militaryStatus?: string | null;
  companyID?: string | null;
  hiringDate?: string | null;
  position?: string | null;
  age?: number | null;
  yearsExpPrev?: number | null;
  yearsExpElsewedy?: number | null;
  totalExperience?: number | null;
  // "Graduation" / "Graduation year" in the single-employee template come
  // from the first education entry's fieldOfStudy / graduationYear (that's
  // how the parser maps them in reverse).
  education?: Array<{
    degree?: string | null;
    fieldOfStudy?: string | null;
    institution?: string | null;
    graduationYear?: number | null;
    gpa?: string | null;
  }>;
  experience?: Array<{
    jobTitle?: string | null;
    company?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
  }>;
  certificates?: Array<{
    certName?: string | null;
    issuer?: string | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    rawText?: string | null;
  }>;
  skills?: Array<{
    category?: string | null;
    name?: string | null;
    proficiency?: number | null;
  }>;
  performanceReviews?: Array<{
    quarter?: string | null;
    year?: number | null;
    score?: number | null; // fraction 0-1
  }>;
}

const GREY = "FFC0C0C0";
const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const ALL_THIN = { top: thin, bottom: thin, left: thin, right: thin };
const DATE_FMT = "yyyy-mm-dd";

// The parser reads dates from real Excel date cells (not text), so any
// YYYY-MM-DD value must be written as a Date. A non-ISO string (e.g. the
// "Current" end-date sentinel) is written through unchanged.
function dateOrText(v: string | null | undefined): { value: ExcelJS.CellValue; isDate: boolean } {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { value: new Date(`${v}T00:00:00Z`), isDate: true };
  return { value: v ?? null, isDate: false };
}

function writeDateCell(cell: ExcelJS.Cell, v: string | null | undefined) {
  const { value, isDate } = dateOrText(v);
  cell.value = value;
  if (isDate) cell.numFmt = DATE_FMT;
}

// Section headers always span columns B..H (2..8).
function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.mergeCells(`B${row}:H${row}`);
  const cell = ws.getCell(`B${row}`);
  cell.value = text;
  cell.font = { bold: true, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  cell.alignment = { vertical: "middle" };
  for (let c = 2; c <= 8; c++) {
    ws.getRow(row).getCell(c).border = ALL_THIN;
    if (c !== 2) ws.getRow(row).getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  }
}

function labelValue(ws: ExcelJS.Worksheet, row: number, label: string, value: unknown) {
  const l = ws.getCell(`B${row}`);
  l.value = label;
  l.font = { bold: true, size: 11 };
  const v = ws.getCell(`C${row}`);
  v.value = value === null || value === undefined || value === "" ? null : (value as ExcelJS.CellValue);
  v.font = { size: 11 };
  v.border = { bottom: thin };
}

export function buildSingleEmployeeWorkbook(emp?: EmployeeWorkbookData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hirely";
  const ws = wb.addWorksheet("ETP");

  ws.getColumn(1).width = 3; // A — spacer, matches the original's left margin
  ws.getColumn(2).width = 26; // B — labels
  ws.getColumn(3).width = 28; // C — values / From
  ws.getColumn(4).width = 20; // D — To / Title
  ws.getColumn(5).width = 22; // E
  ws.getColumn(6).width = 30; // F — Organization / EET&D
  ws.getColumn(7).width = 26; // G — perf labels
  ws.getColumn(8).width = 14; // H — perf values

  // --- Title ---
  ws.mergeCells("B2:H2");
  const title = ws.getCell("B2");
  title.value = "Employee's Talent Profile";
  title.font = { bold: true, size: 14 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 24;

  const edu0 = emp?.education?.[0];

  // --- Basic info block (B/C), rows 4-14 ---
  labelValue(ws, 4, "ID:", emp?.companyID ?? null);
  labelValue(ws, 5, "Employee Name:", emp?.fullName ?? null);
  // Hiring Date must be a real date cell (see writeDateCell) — label written
  // separately so the value can carry the date number format.
  ws.getCell("B6").value = "Hiring Date:";
  ws.getCell("B6").font = { bold: true, size: 11 };
  writeDateCell(ws.getCell("C6"), emp?.hiringDate ?? null);
  ws.getCell("C6").font = { size: 11 };
  ws.getCell("C6").border = { bottom: thin };
  labelValue(ws, 7, "Position:", emp?.position ?? null);
  labelValue(ws, 8, "Department:", emp?.workLocation ?? null);
  labelValue(ws, 9, "Age:", emp?.age ?? null);
  labelValue(ws, 10, "Years of Exp. Prev:", emp?.yearsExpPrev ?? null);
  labelValue(ws, 11, "Elsewedy Years of Exp.:", emp?.yearsExpElsewedy ?? null);
  labelValue(ws, 12, "Total Experience:", emp?.totalExperience ?? null);
  labelValue(ws, 13, "Graduation:", edu0?.fieldOfStudy ?? null);
  labelValue(ws, 14, "Graduation year:", edu0?.graduationYear ?? null);

  // --- Performance appraisal history block (G/H) ---
  const perfHeader = ws.getCell("G4");
  perfHeader.value = "Performance appraisal history (%)";
  perfHeader.font = { bold: true, size: 11 };
  const reviews = emp?.performanceReviews ?? [];
  for (let i = 0; i < 4; i++) {
    const r = reviews[i];
    const labelCell = ws.getCell(`G${5 + i}`);
    labelCell.value = r ? `${r.quarter} - ${r.year}` : null;
    const valCell = ws.getCell(`H${5 + i}`);
    if (r && typeof r.score === "number") {
      valCell.value = r.score; // stored as a fraction; % number format renders it
      valCell.numFmt = "0%";
    }
    valCell.border = { bottom: thin };
  }

  // --- Experience History ---
  sectionHeader(ws, 16, "Experience History");
  const wp = ws.getCell("B18");
  wp.value = "Work Period";
  wp.font = { bold: true, size: 11 };
  ws.getCell("D18").value = "Title";
  ws.getCell("D18").font = { bold: true, size: 11 };
  ws.getCell("F18").value = "Organization";
  ws.getCell("F18").font = { bold: true, size: 11 };
  ws.getCell("B19").value = "From";
  ws.getCell("B19").font = { bold: true, size: 11 };
  ws.getCell("C19").value = "To";
  ws.getCell("C19").font = { bold: true, size: 11 };
  for (const c of ["B18", "C18", "D18", "E18", "F18", "B19", "C19"]) ws.getCell(c).border = ALL_THIN;

  const experience = emp?.experience ?? [];
  // At least 3 blank rows in the template so there's room to write in.
  const expRows = Math.max(experience.length, emp ? experience.length : 3);
  for (let i = 0; i < expRows; i++) {
    const e = experience[i];
    const row = 20 + i;
    writeDateCell(ws.getCell(`B${row}`), e?.startDate ?? null);
    writeDateCell(ws.getCell(`C${row}`), e?.endDate ?? null); // "Current" passes through as text
    ws.getCell(`D${row}`).value = e?.jobTitle ?? null;
    ws.getCell(`F${row}`).value = e?.company ?? null;
    for (const c of ["B", "C", "D", "E", "F"]) ws.getCell(`${c}${row}`).border = ALL_THIN;
  }

  // --- Training Historical Record (two freetext columns) ---
  const trainStart = 20 + expRows + 2;
  sectionHeader(ws, trainStart, "Training Historical Record");
  const pd = ws.getCell(`B${trainStart + 1}`);
  pd.value = "Personal Development";
  pd.font = { bold: true, size: 11 };
  const eetd = ws.getCell(`E${trainStart + 1}`);
  eetd.value = "EET&D (Learning & Development)";
  eetd.font = { bold: true, size: 11 };

  // Education (degrees) go in the "Personal Development" column; certificates
  // in "EET&D" — the same split the classifier produces in the other
  // direction, so the file round-trips.
  const eduLines = (emp?.education ?? [])
    .filter((_, i) => i > 0 || (edu0 && (edu0.degree || edu0.institution))) // skip the bare Graduation-only entry
    .map((e) => [e.degree, e.institution, e.graduationYear].filter(Boolean).join(", "))
    .filter(Boolean);
  const certLines = (emp?.certificates ?? [])
    .map((c) => c.rawText || [c.certName, c.issuer].filter(Boolean).join(" - "))
    .filter(Boolean);

  const trainRows = Math.max(eduLines.length, certLines.length, emp ? 0 : 3);
  for (let i = 0; i < trainRows; i++) {
    const row = trainStart + 2 + i;
    if (eduLines[i]) {
      ws.mergeCells(`B${row}:D${row}`);
      ws.getCell(`B${row}`).value = eduLines[i];
      ws.getCell(`B${row}`).alignment = { wrapText: true };
    }
    if (certLines[i]) {
      ws.mergeCells(`E${row}:H${row}`);
      ws.getCell(`E${row}`).value = certLines[i];
      ws.getCell(`E${row}`).alignment = { wrapText: true };
    }
  }

  return wb;
}
