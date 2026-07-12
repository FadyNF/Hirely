// app/api/import/batch/commit/route.ts
//
// Writes the admin-selected batch rows. Each row is created individually so
// one collision (e.g. a National ID already in the DB) doesn't abort the
// whole import — the response reports how many were created, how many of
// those needed a review flag, and which rows failed outright.
//
// Every row is re-resolved here via validateBatchRow, independent of the
// preview step — the client sends back the same rawData shape the preview
// returned (with any inline edits merged in), and this route is the sole
// source of truth for what actually gets written and what gets flagged.
// Nothing is silently dropped: an invalid value is written as-is (or, for a
// unique-field collision, left out) and recorded as a ReviewFlag rather than
// blocking the row.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireUserId } from "@/lib/requireAuth";
import { validateBatchRow, type FieldIssue } from "@/lib/chatbotValidate";

interface IncomingRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

const RELATION_KEYS = ["experience", "education", "certificates", "skills", "performanceReviews"] as const;

function issueField(issue: FieldIssue): string {
  return issue.entryIndex !== undefined ? `${issue.scope}[${issue.entryIndex}].${issue.field}` : issue.field;
}

function issueRawValue(issue: FieldIssue): string {
  return issue.rawValue === undefined || issue.rawValue === null || issue.rawValue === "" ? "(empty)" : String(issue.rawValue);
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
  let flagged = 0;
  const failed: { rowNumber: number; error: string }[] = [];

  for (const row of rows) {
    const { employeeData, relationData, issues } = validateBatchRow(row.data || {});

    const relationCreates: Record<string, unknown> = {};
    for (const key of RELATION_KEYS) {
      const entries = relationData[key];
      if (entries && entries.length > 0) relationCreates[key] = { create: entries };
    }

    const create = async (scalarData: Record<string, unknown>, flagIssues: FieldIssue[]) => {
      const employee = await prisma.employee.create({ data: { ...scalarData, ...relationCreates } as never });
      if (flagIssues.length > 0) {
        await prisma.reviewFlag.createMany({
          data: flagIssues.map((issue) => ({
            employeeId: employee.id,
            field: issueField(issue),
            rawValue: issueRawValue(issue),
            reason: issue.reason,
          })),
        });
      }
      return employee;
    };

    // A collision can't be written as-is the way a format error can — the
    // DB would reject it again. Strip the colliding unique field, flag it,
    // and retry. Bounded at Employee's two @unique fields (nationalId,
    // companyID) — a row could collide on both at once (P2002 only ever
    // reports the first constraint it hits per attempt), so one retry isn't
    // always enough.
    let scalarData = employeeData;
    let currentIssues = issues;
    let ok = false;
    let rowFailure: string | null = null;
    let attempts = 0;
    while (!ok && !rowFailure && attempts <= 2) {
      attempts++;
      try {
        await create(scalarData, currentIssues);
        created++;
        if (currentIssues.length > 0) flagged++;
        ok = true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // The better-sqlite3 adapter leaves meta.target undefined and
          // instead names the column deeper in meta (…constraint.fields /
          // the driver's "UNIQUE constraint failed: Employee.companyID"
          // message), so match against the whole meta blob rather than
          // target alone.
          const blob = JSON.stringify(error.meta ?? "").toLowerCase();
          const collidingField = blob.includes("companyid") ? "companyID" : blob.includes("nationalid") ? "nationalId" : null;

          if (collidingField && collidingField in scalarData) {
            const label = collidingField === "companyID" ? "Company ID" : "National ID";
            const collidingValue = scalarData[collidingField];
            const nextData = { ...scalarData };
            delete nextData[collidingField];
            scalarData = nextData;
            currentIssues = [
              ...currentIssues,
              { scope: "employee", field: collidingField, rawValue: collidingValue, reason: `An employee with that ${label} already exists.` },
            ];
            continue;
          }

          const label = collidingField === "companyID" ? "Company ID" : collidingField === "nationalId" ? "National ID" : "unique field";
          rowFailure = `An employee with that ${label} already exists.`;
        } else {
          console.error("Batch commit row error:", error);
          rowFailure = "Could not be saved.";
        }
      }
    }
    if (!ok) {
      // Either a non-retryable error, or both unique fields were stripped
      // and it still failed for some other reason (retries exhausted).
      failed.push({ rowNumber: row.rowNumber, error: rowFailure ?? "Could not be saved." });
    }
  }

  return NextResponse.json({ created, flagged, failed });
}
