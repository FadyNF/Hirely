// app/api/chatbot/commit/route.ts
//
// This is the ONLY place in the chatbot flow that actually writes to the
// database — it only ever runs after the admin clicks Confirm in the UI.
// Nothing upstream of this route touches Prisma's create/update methods.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireUserId } from "@/lib/requireAuth";
import { validateExtractedFields } from "@/lib/chatbotValidate";

// Fields that live directly on the Employee row (not in a related table).
const SCALAR_FIELDS = [
  "fullName", "phone", "birthDate", "nationality", "maritalStatus",
  "email", "workLocation", "gender", "nationalId", "militaryStatus",
  // Optional import-only fields — see OPTIONAL_INFO_FIELDS in tabConfig.ts.
  "companyID", "hiringDate", "position", "age",
  "yearsExpPrev", "yearsExpElsewedy", "totalExperience",
] as const;

// Pulls out only the scalar fields that actually have a real value —
// this is what makes "never blank out unmentioned fields" work: a field
// simply never appears in the object we hand to Prisma unless the
// extraction step genuinely found a value for it.
function buildScalarData(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const field of SCALAR_FIELDS) {
    const value = data[field];
    if (value !== undefined && value !== null && value !== "") {
      result[field] = value;
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    if (!requireUserId(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { action, employeeId, data } = await request.json();

    if (action !== "create" && action !== "update") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    // Re-validate here, at the actual write boundary — not just trust
    // that whatever called this route already went through
    // /api/chatbot/extract's validation first. This is what actually
    // stops bad data from reaching the database regardless of how this
    // route gets invoked (a tampered request, a future caller that skips
    // extract entirely, etc.). `data || {}` also means a request with no
    // data at all is handled cleanly instead of crashing.
    const { cleaned } = validateExtractedFields(data || {});
    const scalarData = buildScalarData(cleaned);

    // Relation arrays only get included if they actually have entries —
    // an empty array would otherwise create a no-op nested write.
    const relationData: Record<string, unknown> = {};
    for (const key of ["experience", "education", "certificates", "skills", "performanceReviews"] as const) {
      const value = cleaned[key];
      if (Array.isArray(value) && value.length) relationData[key] = { create: value };
    }

    if (action === "create") {
      if (!scalarData.fullName) {
        return NextResponse.json(
          { error: "Full name is required to create a new employee." },
          { status: 400 }
        );
      }
      const employee = await prisma.employee.create({
        data: { ...scalarData, ...relationData } as never,
      });
      return NextResponse.json({ status: "created", employee });
    }

    // action === "update"
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required for updates." }, { status: 400 });
    }
    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: { ...scalarData, ...relationData } as never,
    });
    return NextResponse.json({ status: "updated", employee });
  } catch (error) {
    // P2002 = unique-constraint violation. nationalId and companyID are
    // both unique on Employee now, so check WHICH column actually
    // collided (Prisma reports it in error.meta.target) rather than
    // assuming it's always nationalId — return an actionable 409 instead
    // of a generic 500 so the admin knows exactly which field to fix.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The better-sqlite3 adapter leaves meta.target undefined and names the
      // column deeper in meta (…constraint.fields / the driver's "UNIQUE
      // constraint failed: Employee.companyID" message), so match against the
      // whole meta blob rather than target alone.
      const blob = JSON.stringify(error.meta ?? "").toLowerCase();
      const [field, label] = blob.includes("companyid")
        ? ["companyID", "company ID"]
        : blob.includes("nationalid")
          ? ["nationalId", "national ID"]
          : [null, "unique field"];
      return NextResponse.json(
        { error: `An employee with that ${label} already exists.`, field },
        { status: 409 }
      );
    }
    // P2025 = record to update not found (e.g. the employee was deleted
    // between disambiguation and confirm).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "That employee no longer exists." },
        { status: 404 }
      );
    }
    console.error("Chatbot commit error:", error);
    return NextResponse.json(
      { error: "Something went wrong saving that." },
      { status: 500 }
    );
  }
}