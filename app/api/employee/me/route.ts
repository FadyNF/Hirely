// app/api/employee/me/route.ts
//
// The self-service view's own record fetch — resolves the caller's
// linked Employee row server-side rather than trusting any id from the
// client, since there's no id to send in the first place: this route
// only ever returns whichever record the caller's own account is linked
// to (see Employee.userId, created at signup).

import { NextRequest, NextResponse } from "next/server";
import { getEmployeeById } from "@/lib/employees";
import { requireCallerContext } from "@/lib/requireAuth";

export async function GET(request: NextRequest) {
  const caller = await requireCallerContext(request);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (caller.role !== "employee") {
    return NextResponse.json({ error: "This account has no linked employee record." }, { status: 403 });
  }
  if (!caller.employeeId) {
    return NextResponse.json({ error: "No linked employee record found for this account." }, { status: 404 });
  }

  const employee = await getEmployeeById(caller.employeeId);
  if (!employee) {
    return NextResponse.json({ error: "Linked employee record no longer exists." }, { status: 404 });
  }
  return NextResponse.json({ employee });
}
