// app/api/import/batch/commit/route.ts
//
// Writes the admin-selected batch rows. Each row is created individually so
// one collision (e.g. a National ID already in the DB) doesn't abort the
// whole import — the response reports how many were created and which rows
// failed and why. Every row is re-validated here at the write boundary,
// independent of the preview step.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireUserId } from "@/lib/requireAuth";
import { validateBatchRow } from "@/lib/chatbotValidate";

interface IncomingRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const rows: IncomingRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }

  let created = 0;
  const failed: { rowNumber: number; error: string }[] = [];

  for (const row of rows) {
    const { cleaned, valid } = validateBatchRow(row.data || {});
    if (!valid) {
      failed.push({ rowNumber: row.rowNumber, error: "Row failed validation and was skipped." });
      continue;
    }
    try {
      await prisma.employee.create({ data: cleaned as never });
      created++;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // The better-sqlite3 adapter leaves meta.target undefined and instead
        // names the column deeper in meta (…constraint.fields / the driver's
        // "UNIQUE constraint failed: Employee.companyID" message), so match
        // against the whole meta blob rather than target alone.
        const blob = JSON.stringify(error.meta ?? "").toLowerCase();
        const label = blob.includes("companyid") ? "Company ID" : blob.includes("nationalid") ? "National ID" : "unique field";
        failed.push({ rowNumber: row.rowNumber, error: `An employee with that ${label} already exists.` });
      } else {
        console.error("Batch commit row error:", error);
        failed.push({ rowNumber: row.rowNumber, error: "Could not be saved." });
      }
    }
  }

  return NextResponse.json({ created, failed });
}
