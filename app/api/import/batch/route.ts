// app/api/import/batch/route.ts
//
// Parses an uploaded batch (tabular) file and resolves every row, returning
// a structured preview the review UI renders: each row's writable data
// (employeeData/relationData — already safe to commit as-is) alongside every
// issue found. Nothing is written here — the admin reviews, optionally fixes
// flagged values inline, selects rows, and confirms via
// /api/import/batch/commit, which re-resolves and writes ReviewFlag rows for
// whatever's still unresolved at that point.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { parseBatchExcel } from "@/lib/excelImport/batchParser";
import { validateBatchRow } from "@/lib/chatbotValidate";

export async function POST(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let files: File[];
  try {
    const formData = await request.formData();
    files = formData.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No file was provided." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }

  // Duplicate national IDs / company IDs — WITHIN a file or ACROSS however
  // many were uploaded together — the DB's unique constraint would reject
  // the 2nd write, so catch it here rather than letting half a batch commit
  // and then fail. Unlike a format error, a duplicate can't be "written
  // as-is" (the DB would still reject it), so the field is left out and
  // flagged instead. Shared across all files so a fresh reviewer can spot
  // the same ID reused between, say, an "Engineering.xlsx" and a
  // "Sales.xlsx" uploaded in the same batch.
  const seenNationalId = new Map<string, string>();
  const seenCompanyId = new Map<string, string>();
  const allWarnings: string[] = [];
  const allRows: {
    rowNumber: number;
    sourceFile: string;
    employeeData: Record<string, unknown>;
    relationData: ReturnType<typeof validateBatchRow>["relationData"];
    rawData: Record<string, unknown>;
    issues: ReturnType<typeof validateBatchRow>["issues"];
  }[] = [];
  let nextRowNumber = 1;

  for (const file of files) {
    let parsed: ReturnType<typeof parseBatchExcel>;
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      parsed = parseBatchExcel(buffer);
    } catch (error) {
      console.error("Batch import parse error:", error);
      allWarnings.push(`${file.name}: couldn't be read — make sure it matches the batch template.`);
      continue;
    }
    if (parsed.rows.length === 0) {
      allWarnings.push(`${file.name}: ${parsed.warnings[0] || "no employee rows were found."}`);
      continue;
    }
    allWarnings.push(...parsed.warnings.map((w) => `${file.name}: ${w}`));

    for (const { data } of parsed.rows) {
      const rowNumber = nextRowNumber++;
      const { employeeData, relationData, issues } = validateBatchRow(data);

      const displayLabel = `row ${rowNumber}`;
      const nid = employeeData.nationalId;
      if (typeof nid === "string") {
        if (seenNationalId.has(nid)) {
          issues.push({ scope: "employee", field: "nationalId", rawValue: nid, reason: `Duplicate National ID in this upload (also ${seenNationalId.get(nid)}).` });
          delete employeeData.nationalId;
        } else {
          seenNationalId.set(nid, displayLabel);
        }
      }
      const cid = employeeData.companyID;
      if (typeof cid === "string") {
        if (seenCompanyId.has(cid)) {
          issues.push({ scope: "employee", field: "companyID", rawValue: cid, reason: `Duplicate Company ID in this upload (also ${seenCompanyId.get(cid)}).` });
          delete employeeData.companyID;
        } else {
          seenCompanyId.set(cid, displayLabel);
        }
      }

      allRows.push({ rowNumber, sourceFile: file.name, employeeData, relationData, rawData: data, issues });
    }
  }

  if (allRows.length === 0) {
    return NextResponse.json(
      { error: allWarnings[0] || "No employee rows were found in that file." },
      { status: 400 }
    );
  }

  return NextResponse.json({ rows: allRows, warnings: allWarnings });
}
