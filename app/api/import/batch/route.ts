// app/api/import/batch/route.ts
//
// Parses an uploaded batch (tabular) file and validates every row, returning
// a structured preview the review UI renders: each row with its cleaned data,
// per-field errors, and a valid flag. Nothing is written here — the admin
// reviews, selects rows, and confirms via /api/import/batch/commit.

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { parseBatchExcel } from "@/lib/excelImport/batchParser";
import { validateBatchRow } from "@/lib/chatbotValidate";

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
    const { rows, warnings } = parseBatchExcel(buffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: warnings[0] || "No employee rows were found in that file." },
        { status: 400 }
      );
    }

    // Duplicate national IDs / company IDs WITHIN the uploaded file itself —
    // the DB's unique constraint would reject the 2nd write, so flag it here
    // rather than letting half a batch commit and then fail.
    const seenNationalId = new Map<string, number>();
    const seenCompanyId = new Map<string, number>();

    const reviewed = rows.map(({ rowNumber, data }) => {
      // `valid` is recomputed below after adding in-file duplicate errors.
      const { cleaned, errors } = validateBatchRow(data);
      const nid = cleaned.nationalId;
      if (typeof nid === "string") {
        if (seenNationalId.has(nid)) errors.nationalId = `Duplicate National ID in this file (also row ${seenNationalId.get(nid)}).`;
        else seenNationalId.set(nid, rowNumber);
      }
      const cid = cleaned.companyID;
      if (typeof cid === "string") {
        if (seenCompanyId.has(cid)) errors.companyID = `Duplicate Company ID in this file (also row ${seenCompanyId.get(cid)}).`;
        else seenCompanyId.set(cid, rowNumber);
      }
      return { rowNumber, data: cleaned, rawData: data, errors, valid: Object.keys(errors).length === 0 };
    });

    return NextResponse.json({ rows: reviewed, warnings });
  } catch (error) {
    console.error("Batch import parse error:", error);
    return NextResponse.json(
      { error: "Couldn't read that file — make sure it matches the batch template." },
      { status: 400 }
    );
  }
}
