// app/api/support-requests/route.ts
//
// Where any admin — including someone still waiting for approval — files
// a support message for the root admin to see. Deliberately open to
// pending-approval users too: if they can't reach the root through this
// form, they have no in-app way to appeal a rejection or ask why they
// haven't been approved yet.
//
// Because pending users don't have an auth cookie yet, this route can't
// require one — it accepts the submitter's email as a body field. The
// email is stored alongside the SupportRequest row (see the schema)
// rather than looked up via a session, so nothing here trusts more than
// what the caller submits.

import { NextRequest, NextResponse } from "next/server";
import { createSupportRequest } from "@/lib/supportRequests";
import { requireUserId } from "@/lib/requireAuth";

const ALLOWED_TYPES = new Set(["issue", "request", "other"]);

// Cheap-but-real limits so a hostile client can't fill the DB with a
// single request — Prisma will happily insert 100MB otherwise.
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

export async function POST(request: NextRequest) {
  let body: { type?: string; subject?: string; message?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const type = String(body.type ?? "").toLowerCase();
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  const submittedEmail = String(body.email ?? "").trim().toLowerCase();

  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'Type must be "issue", "request", or "other".' }, { status: 400 });
  }
  if (!subject || subject.length > MAX_SUBJECT) {
    return NextResponse.json({ error: `Subject is required (up to ${MAX_SUBJECT} characters).` }, { status: 400 });
  }
  if (!message || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `Message is required (up to ${MAX_MESSAGE} characters).` }, { status: 400 });
  }
  if (!submittedEmail) {
    return NextResponse.json({ error: "Please include the email you're contacting from." }, { status: 400 });
  }

  // If the caller happens to be authenticated, capture the userId so the
  // relation to User works — otherwise leave it null (pending users, or
  // if the token expired mid-submit). Email is always stored regardless.
  const userId = requireUserId(request);

  createSupportRequest({
    type,
    subject,
    message,
    submittedByEmail: submittedEmail,
    submittedById: userId,
  });

  return NextResponse.json({ ok: true });
}
