// app/api/export/batch/route.ts
//
// Exports employees as the batch (tabular) sheet. Optional ?search= filters
// by name / email / department / national ID (case-insensitive contains) —
// matching what the admin can already narrow the Records view down to — so
// they can export exactly the subset they're looking at, or all of them.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireAuth";
import { buildBatchExportWorkbook } from "@/lib/excelImport/batchTemplate";

export async function GET(request: NextRequest) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("search")?.trim();
  const where = search
    ? {
        OR: [
          { fullName: { contains: search } },
          { email: { contains: search } },
          { workLocation: { contains: search } },
          { nationalId: { contains: search } },
          { position: { contains: search } },
        ],
      }
    : undefined;

  const employees = await prisma.employee.findMany({ where, orderBy: { id: "asc" } });
  const wb = buildBatchExportWorkbook(employees);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const suffix = search ? "-filtered" : "-all";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="employees${suffix}.xlsx"`,
    },
  });
}
