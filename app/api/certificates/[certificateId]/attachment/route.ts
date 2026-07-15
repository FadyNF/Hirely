// app/api/certificates/[certificateId]/attachment/route.ts
//
// Serves the original uploaded certificate file back — reads from the
// local data/certificates/ folder (never public/, since these are HR
// documents). Not a static public URL: ownership is checked on every
// request. An employee can only fetch their own certificates' files;
// admin/root can fetch any.

import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { getCertificateById } from "@/lib/employees";
import { requireCallerContext } from "@/lib/requireAuth";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ certificateId: string }> }) {
  const caller = await requireCallerContext(request);
  if (!caller) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { certificateId } = await ctx.params;
  const id = Number(certificateId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid certificate id." }, { status: 400 });
  }

  const certificate = getCertificateById(id);
  if (!certificate || !certificate.attachmentPath) {
    return NextResponse.json({ error: "No attachment found for that certificate." }, { status: 404 });
  }

  // Employees may only fetch their own; admin/root may fetch any.
  if (caller.role === "employee" && caller.employeeId !== certificate.employeeId) {
    return NextResponse.json({ error: "You don't have access to that file." }, { status: 403 });
  }

  const filePath = path.join(process.cwd(), "data", certificate.attachmentPath);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "That file is missing from storage." }, { status: 404 });
  }

  const ext = path.extname(certificate.attachmentPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${path.basename(certificate.attachmentPath)}"`,
    },
  });
}
