// Builds the batch (tabular) workbook — one header row, one row per
// employee. Two uses:
//   • buildBatchTemplateWorkbook()          -> blank template + 1 example row
//   • buildBatchExportWorkbook(employees)   -> all given employees, exported
//
// Column order/labels come from batchColumns.ts, shared with the parser.

import ExcelJS from "exceljs";
import { BATCH_COLUMNS, BATCH_EXAMPLE_ROW } from "./batchColumns";
import type { EmployeeWorkbookData } from "./singleEmployeeTemplate";

const GREY = "FFC0C0C0";
const thin = { style: "thin" as const, color: { argb: "FF000000" } };
const ALL_THIN = { top: thin, bottom: thin, left: thin, right: thin };
const DATE_FMT = "yyyy-mm-dd";

function writeHeader(ws: ExcelJS.Worksheet) {
  BATCH_COLUMNS.forEach((col, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY } };
    cell.border = ALL_THIN;
    cell.alignment = { vertical: "middle", wrapText: true };
    ws.getColumn(i + 1).width = Math.max(col.label.length + 4, 16);
  });
  ws.getRow(1).height = 20;
  ws.views = [{ state: "frozen", ySplit: 1 }]; // keep the header visible while scrolling
}

function writeRow(ws: ExcelJS.Worksheet, rowIndex: number, values: Record<string, unknown>) {
  BATCH_COLUMNS.forEach((col, i) => {
    const cell = ws.getRow(rowIndex).getCell(i + 1);
    const v = values[col.field];
    if (v === null || v === undefined || v === "") return;
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
  wb.creator = "Foundry";
  const ws = wb.addWorksheet("Employees");
  writeHeader(ws);

  // One example row, greyed/italic, so the format is obvious. The parser
  // treats it as a normal row, so an admin must replace or delete it — the
  // instruction cell below the table says so.
  writeRow(ws, 2, BATCH_EXAMPLE_ROW);
  const exampleRow = ws.getRow(2);
  for (let i = 1; i <= BATCH_COLUMNS.length; i++) {
    exampleRow.getCell(i).font = { italic: true, color: { argb: "FF999999" }, size: 11 };
  }

  // Note sits BESIDE the example row, two columns past the last data
  // column, so re-importing the template never parses it as a data row
  // (unmapped columns don't count toward a row having values).
  const noteCol = BATCH_COLUMNS.length + 2;
  const note = ws.getRow(2).getCell(noteCol);
  note.value = "← Example row: replace with real data or delete it. Only Full Name is required.";
  note.font = { italic: true, color: { argb: "FF999999" }, size: 10 };

  return wb;
}

export function buildBatchExportWorkbook(employees: EmployeeWorkbookData[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Foundry";
  const ws = wb.addWorksheet("Employees");
  writeHeader(ws);
  employees.forEach((emp, i) => {
    writeRow(ws, i + 2, emp as Record<string, unknown>);
  });
  return wb;
}
