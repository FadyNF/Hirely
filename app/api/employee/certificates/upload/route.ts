// app/api/employee/certificates/upload/route.ts
//
// Employee self-service only: upload a picture or PDF of a certificate,
// parse it via Gemini into structured fields, and save the original file
// locally under data/certificates/ (not public/ — HR documents shouldn't
// be fetchable by anyone with the URL, no auth). This route does NOT
// write the Certificate row itself — it only parses + saves the file and
// hands the result back for the employee to review/edit, same "AI
// extracts, human confirms" shape already used by the chatbot and Excel
// import. The actual write happens via the existing, already
// employee-scoped POST /api/chatbot/commit once they confirm.

import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireCallerContext } from "@/lib/requireAuth";
import { extractCertificateFromFile } from "@/lib/gemini";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — no existing upload route in this codebase enforces a limit, but this is the first one writing raw bytes to disk.
const ALLOWED_MIME_PREFIXES = ["image/"];
const ALLOWED_EXACT_MIME = ["application/pdf"];

function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_EXACT_MIME.includes(mimeType) || ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

// Strips everything but a conservative character set and caps length —
// never trust a client-supplied filename directly when building a disk
// path (path separators, "..", null bytes, etc.).
function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(-100) || "file";
}

export async function POST(request: NextRequest) {
  const caller = await requireCallerContext(request);
  if (!caller) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (caller.role !== "employee" || !caller.employeeId) {
    return NextResponse.json({ error: "Only an employee can upload a certificate to their own profile." }, { status: 403 });
  }

  let file: File;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: "No file was provided." }, { status: 400 });
    }
    file = entry;
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }

  if (!isAllowedMimeType(file.type)) {
    return NextResponse.json({ error: "Only images or PDF files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That file is too large (10 MB max)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await extractCertificateFromFile(buffer, file.type);
  } catch (error) {
    console.error("Certificate extraction error:", error);
    return NextResponse.json({ error: "Couldn't read that certificate — please try again." }, { status: 500 });
  }

  const employeeDir = path.join(process.cwd(), "data", "certificates", String(caller.employeeId));
  const storedFilename = `${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const attachmentPath = path.posix.join("certificates", String(caller.employeeId), storedFilename);

  try {
    await fs.mkdir(employeeDir, { recursive: true });
    await fs.writeFile(path.join(employeeDir, storedFilename), buffer);
  } catch (error) {
    console.error("Certificate file save error:", error);
    return NextResponse.json({ error: "Couldn't save that file — please try again." }, { status: 500 });
  }

  return NextResponse.json({ parsed, attachmentPath });
}
