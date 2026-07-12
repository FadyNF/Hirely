// app/api/export/employee/[id]/route.ts
//
// Streams one employee's record as the single-employee "Talent Profile"
// Excel file — the same format the importer reads, so an export can be
// edited and re-imported. Auth-gated like every other data route.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireAuth";
import { buildSingleEmployeeWorkbook } from "@/lib/excelImport/singleEmployeeTemplate";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId)) {
    return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { experience: true, education: true, certificates: true, performanceReviews: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const wb = buildSingleEmployeeWorkbook(employee);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  // A safe ASCII filename from the employee's name.
  const safeName = (employee.fullName || `employee-${employeeId}`).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName || "employee"}.xlsx"`,
    },
  });
}
