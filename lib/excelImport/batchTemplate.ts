// Builds the batch (tabular) workbook — one header row, one row per
// employee, scalar fields PLUS numbered relation slots (see
// batchColumns.ts for the column scheme). Two uses:
//   • buildBatchTemplateWorkbook()          -> blank template + 1 example row
//   • buildBatchExportWorkbook(employees)   -> all given employees, exported

import ExcelJS from "exceljs";
import {
  BATCH_COLUMNS,
  BATCH_EXAMPLE_ROW,
  BATCH_RELATION_GROUPS,
  BATCH_EXAMPLE_RELATIONS,
  relationColumnHeader,
  type BatchRelationGroup,
} from "./batchColumns";
import type { EmployeeWorkbookData } from "./singleEmployeeTemplate";

const GREY = "FFC0C0C0";
const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const ALL_THIN = { top: thin, bottom: thin, left: thin, right: thin };
const DATE_FMT = "yyyy-mm-dd";

type ColDef =
  | { type: "scalar"; field: string; header: string; kind: "text" | "date" | "number" }
  | { type: "relation"; relationKey: BatchRelationGroup["relationKey"]; slot: number; field: string; header: string; kind: "text" | "date" | "number" };

function buildLayout(): ColDef[] {
  const layout: ColDef[] = BATCH_COLUMNS.map((c) => ({ type: "scalar", field: c.field, header: c.label, kind: c.kind }));
  for (const group of BATCH_RELATION_GROUPS) {
    for (let slot = 1; slot <= group.slots; slot++) {
      for (const f of group.fields) {
        layout.push({
          type: "relation",
          relationKey: group.relationKey,
          slot,
          field: f.key,
          header: relationColumnHeader(group, slot, f),
          kind: f.kind,
        });
      }
    }
  }
  return layout;
}

const LAYOUT = buildLayout();

function writeHeader(ws: ExcelJS.Worksheet) {
  LAYOUT.forEach((col, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    cell.border = ALL_THIN;
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = Math.max(Math.min(col.header.length, 24) + 2, 14);
  });
  ws.getRow(1).height = 30;
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }]; // keep name column + header visible while scrolling
}

function writeRow(ws: ExcelJS.Worksheet, rowIndex: number, values: Record<string, unknown>) {
  LAYOUT.forEach((col, i) => {
    const cell = ws.getRow(rowIndex).getCell(i + 1);

    let v: unknown;
    if (col.type === "scalar") {
      v = values[col.field];
    } else {
      const arr = values[col.relationKey] as Record<string, unknown>[] | undefined;
      v = arr?.[col.slot - 1]?.[col.field];
    }
    if (v === null || v === undefined || v === "") return;

    // performanceReviews.score is stored as a 0-1 fraction; shown/entered
    // as a 0-100 percentage in the sheet, same convention as EmployeeForm.
    if (col.type === "relation" && col.relationKey === "performanceReviews" && col.field === "score" && typeof v === "number") {
      cell.value = Math.round(v * 100);
      return;
    }

    if (col.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      cell.value = new Date(`${v}T00:00:00Z`);
      cell.numFmt = DATE_FMT;
    } else {
      cell.value = v as ExcelJS.CellValue;
    }
  });
}

export function buildBatchTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hirely";
  const ws = wb.addWorksheet("Employees");
  writeHeader(ws);

  // One example row (scalar + one entry in slot 1 of each relation),
  // greyed/italic, so the format is obvious. The parser treats it as a
  // normal row, so an admin must replace or delete it.
  const exampleValues: Record<string, unknown> = { ...BATCH_EXAMPLE_ROW };
  for (const [relationKey, entry] of Object.entries(BATCH_EXAMPLE_RELATIONS)) {
    exampleValues[relationKey] = [entry];
  }
  writeRow(ws, 2, exampleValues);
  const exampleRow = ws.getRow(2);
  for (let i = 1; i <= LAYOUT.length; i++) {
    exampleRow.getCell(i).font = { italic: true, color: { argb: "FF999999" }, size: 10 };
  }

  // Note sits BESIDE the example row, two columns past the last data
  // column, so re-importing the template never parses it as a data row
  // (unmapped columns don't count toward a row having values).
  const note = ws.getRow(2).getCell(LAYOUT.length + 2);
  note.value =
    "← Example row: replace with real data or delete it. Only Full Name is required. Relation columns (Experience/Education/Certificate/Skill/Performance) are optional — leave a whole slot blank to skip it.";
  note.font = { italic: true, color: { argb: "FF999999" }, size: 10 };
  ws.getColumn(LAYOUT.length + 2).width = 60;

  return wb;
}

export function buildBatchExportWorkbook(employees: EmployeeWorkbookData[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hirely";
  const ws = wb.addWorksheet("Employees");
  writeHeader(ws);
  employees.forEach((emp, i) => {
    writeRow(ws, i + 2, emp as Record<string, unknown>);
  });
  return wb;
}
