// app/api/chatbot/commit/route.ts
//
// This is the ONLY place in the chatbot flow that actually writes to the
// database — it only ever runs after the admin clicks Confirm in the UI.
// Nothing upstream of this route touches Prisma's create/update methods.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createEmployeeWithRelations,
  updateEmployeeWithRelations,
  EmployeeNotFoundError,
  type RelationValues,
} from "@/lib/employees";
import { markEmployeeEmbeddingDirty } from "@/lib/employeeCertificates";
import { requireCallerContext } from "@/lib/requireAuth";
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
    const caller = await requireCallerContext(request);
    if (!caller) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const { action, data, replaceRelations, resolveFlagId } = body;
    let employeeId: number | undefined = body.employeeId;

    // An employee-role caller can only ever update their OWN linked
    // record — never trust employeeId/action from the request body for
    // that role. This closes a real authorization gap: requireCallerContext
    // only proves "some valid login," not "whose record this is," so
    // without this check any authenticated employee could pass an
    // arbitrary employeeId here (devtools, curl) and edit someone else's
    // data. admin/root behavior below is completely unchanged.
    if (caller.role === "employee") {
      if (!caller.employeeId) {
        return NextResponse.json({ error: "No linked employee record found for this account." }, { status: 403 });
      }
      if (action !== "update") {
        return NextResponse.json({ error: "Employees can only update their own record." }, { status: 403 });
      }
      employeeId = caller.employeeId;
    }

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

    // Relation arrays: two different callers, two different meanings.
    // - The chatbot's conversational update only ever includes the ONE
    //   relation entry actually mentioned in that message ("add a cert
    //   for X") — so relationData here must be ADDITIVE, just `create`.
    // - The full-record edit form (Records' "Edit" action, EmployeeForm)
    //   always submits the COMPLETE current set for every relation, since
    //   the admin can add/edit/remove entries freely before saving — so
    //   re-submitting untouched entries as plain `create` would duplicate
    //   every one of them. `replaceRelations: true` switches to a full
    //   delete-then-recreate so the DB ends up matching exactly what's on
    //   the form, including a relation the admin cleared out entirely.
    const relationValues: RelationValues = {};
    for (const key of ["experience", "education", "certificates", "skills", "performanceReviews"] as const) {
      const value = cleaned[key];
      if (Array.isArray(value) && value.length > 0) {
        relationValues[key] = value as Record<string, unknown>[];
      }
    }

    if (action === "create") {
      if (!scalarData.fullName) {
        return NextResponse.json(
          { error: "Full name is required to create a new employee." },
          { status: 400 }
        );
      }
      const employee = createEmployeeWithRelations(scalarData, relationValues);
      markEmployeeEmbeddingDirty(employee.id);
      return NextResponse.json({ status: "created", employee });
    }

    // action === "update"
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required for updates." }, { status: 400 });
    }
    const employee = updateEmployeeWithRelations(employeeId, scalarData, relationValues, Boolean(replaceRelations));
    markEmployeeEmbeddingDirty(employee.id);

    // Best-effort: the edit itself already succeeded, so a failure here
    // (bad/stale flag id, already resolved elsewhere) shouldn't turn a
    // successful save into an error response.
    if (resolveFlagId) {
      try {
        db.prepare(`UPDATE "ReviewFlag" SET "resolved" = 1 WHERE "id" = ?`).run(resolveFlagId);
      } catch (err) {
        console.error("Failed to auto-resolve review flag after edit:", err);
      }
    }

    return NextResponse.json({ status: "updated", employee });
  } catch (error) {
    // Unique-constraint violation. nationalId and companyID are both
    // unique on Employee, so check WHICH column actually collided —
    // better-sqlite3's own error message already names it directly (e.g.
    // "UNIQUE constraint failed: Employee.companyID") — rather than
    // assuming it's always nationalId, so we can return an actionable 409
    // instead of a generic 500.
    if (error instanceof Error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      const message = error.message.toLowerCase();
      const [field, label] = message.includes("companyid")
        ? ["companyID", "company ID"]
        : message.includes("nationalid")
          ? ["nationalId", "national ID"]
          : [null, "unique field"];
      return NextResponse.json(
        { error: `An employee with that ${label} already exists.`, field },
        { status: 409 }
      );
    }
    // Record to update not found (e.g. the employee was deleted between
    // disambiguation and confirm).
    if (error instanceof EmployeeNotFoundError) {
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