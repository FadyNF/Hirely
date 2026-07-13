import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { matchTopProfiles } from "@/lib/jobMatching";
import { prisma } from "@/lib/prisma";

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

  try {
    const matches = await matchTopProfiles(jobDescription.trim(), topN);

    const employeeIds = matches.map((m) => m.employeeId);
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        fullName: true,
        email: true,
        position: true,
        workLocation: true,
        nationality: true,
      },
    });

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const results = matches.map((m) => ({
      ...m,
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
