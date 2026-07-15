import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { matchTopProfiles } from "@/lib/jobMatching";
import { db, inClause } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const jobDescription = body?.jobDescription;
  const topN = typeof body?.topN === "number" ? body.topN : undefined;

  if (!jobDescription || typeof jobDescription !== "string" || jobDescription.trim().length === 0) {
    return NextResponse.json({ error: "Job description is required." }, { status: 400 });
  }
  if (topN !== undefined && (!Number.isInteger(topN) || topN < 1)) {
    return NextResponse.json({ error: "topN must be a positive integer." }, { status: 400 });
  }

  try {
    const matches = await matchTopProfiles(jobDescription.trim(), topN);

    const employeeIds = matches.map((m) => m.employeeId);
    const { sql, params } = inClause(employeeIds);
    const employees =
      employeeIds.length === 0
        ? []
        : (db
            .prepare(`SELECT "id", "fullName", "email", "position", "workLocation", "nationality" FROM "Employee" WHERE "id" IN ${sql}`)
            .all(...params) as {
            id: number;
            fullName: string;
            email: string | null;
            position: string | null;
            workLocation: string | null;
            nationality: string | null;
          }[]);

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const results = matches.map((m) => ({
      employeeId: m.employeeId,
      text: m.text,
      matchScore: m.matchScore,
      positives: m.positives,
      negatives: m.negatives,
      employee: employeeMap.get(m.employeeId) ?? null,
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Job matching error:", error);
    return NextResponse.json(
      { error: "Something went wrong running the match." },
      { status: 500 }
    );
  }
}
