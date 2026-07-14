// app/api/export/batch/route.ts
//
// Exports employees (with all their relations) as the batch (tabular)
// sheet. Optional query filters mirror what the Records page toolbar can
// filter by — ?search= (free-text across name/email/department/national
// ID/position) plus exact-match ?department=/?gender=/?nationality=/
// ?maritalStatus=/?militaryStatus= — so an export always matches exactly
// what the admin is looking at.

import { NextRequest, NextResponse } from "next/server";
import { getFilteredEmployees } from "@/lib/employees";
import { requireUserId } from "@/lib/requireAuth";
import { buildBatchExportWorkbook } from "@/lib/excelImport/batchTemplate";

export async function GET(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim();
  const department = params.get("department")?.trim();
  const gender = params.get("gender")?.trim();
  const nationality = params.get("nationality")?.trim();
  const maritalStatus = params.get("maritalStatus")?.trim();
  const militaryStatus = params.get("militaryStatus")?.trim();

  const hasFilters = Boolean(search || department || gender || nationality || maritalStatus || militaryStatus);
  const employees = await getFilteredEmployees({ search, department, gender, nationality, maritalStatus, militaryStatus });
  const wb = buildBatchExportWorkbook(employees);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const suffix = hasFilters ? "-filtered" : "-all";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees${suffix}.xlsx"`,
    },
  });
}
