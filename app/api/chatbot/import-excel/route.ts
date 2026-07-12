// app/api/chatbot/import-excel/route.ts
//
// Parses ONE uploaded single-employee Excel file and returns the shape
// EmployeeForm's initialData prop expects — pre-fill only, nothing is
// written to the database here. The admin still reviews and confirms via
// the normal form + /api/chatbot/commit path.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { parseSingleEmployeeExcel } from "@/lib/excelImport/singleEmployeeParser";
import { classifyTrainingLines } from "@/lib/excelImport/classifyTraining";
import { buildEmployeeFormInitialData } from "@/lib/excelImport/mapToFormData";

export async function POST(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let file: File;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: "No file was provided." }, { status: 400 });
    }
    file = entry;
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSingleEmployeeExcel(buffer);

    // SheetJS's format auto-detection doesn't throw on every malformed
    // input — a plain text file, for instance, parses "successfully" into
    // a near-empty workbook rather than raising an error. fullName is the
    // one field every real template has, so its absence is the signal
    // that this isn't actually a single-employee template at all, not
    // just a template with sparse data.
    if (!parsed.basic.fullName) {
      return NextResponse.json(
        { error: "Couldn't find employee data in that file — make sure it's the single-employee template." },
        { status: 400 }
      );
    }

    const classified = await classifyTrainingLines(parsed.trainingRawLines);
    const initialData = buildEmployeeFormInitialData(parsed, classified);
    return NextResponse.json({
      data: initialData,
      warnings: [...parsed.warnings, ...classified.warnings],
    });
  } catch (error) {
    console.error("Excel import parse error:", error);
    return NextResponse.json(
      { error: "Couldn't read that file — make sure it's a valid Excel file in the expected format." },
      { status: 400 }
    );
  }
}
