// app/api/templates/single-employee/route.ts
//
// Streams a blank single-employee "Talent Profile" template for an admin to
// fill in by hand and then upload through the importer. Same builder as the
// export route, just with no data.

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { buildSingleEmployeeWorkbook } from "@/lib/excelImport/singleEmployeeTemplate";

export async function GET(request: Request) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const wb = buildSingleEmployeeWorkbook();
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="single-employee-template.xlsx"',
    },
  });
}
