// app/api/chatbot/employee/[id]/route.ts
//
// A plain, no-Gemini-involved fetch of one employee's full record (with
// relations). Needed for the read-disambiguation flow: after the admin
// picks one of several same-named matches, we only had the thin
// id/fullName/email/nationalId shape used for matching — showing that
// as if it were the whole profile would make real data look "missing".
// This route gets the real thing without spending a model call on it.

import { NextResponse } from "next/server";
import { getEmployeeById } from "@/lib/employees";
import { requireCallerContext } from "@/lib/requireAuth";

export async function GET(request: Request, ctx: RouteContext<"/api/chatbot/employee/[id]">) {
  const caller = await requireCallerContext(request);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  let employeeId = Number(id);
  if (!Number.isInteger(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  // Defense in depth: an employee-role caller can only ever fetch their
  // own linked record, regardless of what id the URL asks for — the
  // self-service UI never sends anyone else's id, but a tampered request
  // shouldn't be able to read another employee's data either.
  if (caller.role === "employee") {
    if (!caller.employeeId) {
      return NextResponse.json({ error: "No linked employee record found for this account." }, { status: 403 });
    }
    employeeId = caller.employeeId;
  }

  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  return NextResponse.json({ employee });
}
