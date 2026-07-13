// app/api/admin/support-requests/[id]/route.ts
//
// Root-only: mark a support request resolved (or reopen it), optionally
// with a reply that's both stored and emailed to whoever filed it —
// the "feedback loop" so a submitter isn't left wondering whether
// anyone read their message.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRootUserId } from "@/lib/requireAuth";
import { sendSupportResolvedEmail } from "@/lib/mailer";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rootId = await requireRootUserId(request);
  if (!rootId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  let body: { status?: string; reply?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const status = String(body.status ?? "").toLowerCase();
  if (status !== "open" && status !== "resolved") {
    return NextResponse.json({ error: 'Status must be "open" or "resolved".' }, { status: 400 });
  }
  const reply = typeof body.reply === "string" ? body.reply.trim() || null : undefined;

  let updated;
  try {
    updated = await prisma.supportRequest.update({
      where: { id: requestId },
      // Only touch rootReply on an actual reply value — reopening (or
      // resolving without typing anything) shouldn't erase a reply
      // written on a previous pass.
      data: reply !== undefined ? { status, rootReply: reply } : { status },
    });
  } catch {
    return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });
  }

  // Email is a courtesy on top of the status change, not a precondition
  // for it — the ticket is already resolved in the DB by this point, so
  // a flaky SMTP connection shouldn't make the action look like it failed.
  let emailSent = false;
  if (status === "resolved") {
    try {
      await sendSupportResolvedEmail(updated.submittedByEmail, updated.subject, updated.rootReply);
      emailSent = true;
    } catch (error) {
      console.error("Support-resolved email failed to send:", error);
    }
  }

  return NextResponse.json({ ok: true, emailSent });
}
