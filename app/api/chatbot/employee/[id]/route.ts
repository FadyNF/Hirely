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
import { requireUserId } from "@/lib/requireAuth";

export async function GET(request: Request, ctx: RouteContext<"/api/chatbot/employee/[id]">) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }
  return NextResponse.json({ employee });
}
