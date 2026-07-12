// Streams the blank batch (tabular) template — header row + one example row.
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { buildBatchTemplateWorkbook } from "@/lib/excelImport/batchTemplate";

export async function GET(request: Request) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const wb = buildBatchTemplateWorkbook();
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="batch-employees-template.xlsx"',
    },
  });
}
