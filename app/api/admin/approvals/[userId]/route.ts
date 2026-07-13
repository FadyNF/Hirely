// app/api/admin/approvals/[userId]/route.ts
//
// Root-only actions on a single pending admin. POST approves the row
// (approved=true) and emails them a one-click magic-login link so they
// land straight on the dashboard instead of coming back to re-enter
// their password. DELETE declines it (hard-deletes the User row so the
// same email can re-register later — see the decline-behavior discussion
// in this session's plan).

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRootUserId } from "@/lib/requireAuth";
import { sendApprovalEmail } from "@/lib/mailer";

const MAGIC_LOGIN_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const rootId = await requireRootUserId(request);
  if (!rootId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { userId } = await ctx.params;
  const id = Number(userId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "No such user." }, { status: 404 });
    if (user.role === "root") {
      // The root's own row is bootstrapped as approved by ensureRootAdminFromEnv;
      // approving it again is a no-op semantically but implies a UI mistake.
      return NextResponse.json({ error: "The root account can't be re-approved." }, { status: 400 });
    }

    // Raw token goes in the email link; only its hash is stored (same
    // pattern as refreshTokenHash) so a DB leak can't be used to log in
    // as anyone.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const magicLoginTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const magicLoginTokenExpiresAt = new Date(Date.now() + MAGIC_LOGIN_TTL_MS);

    await prisma.user.update({
      where: { id },
      data: { approved: true, magicLoginTokenHash, magicLoginTokenExpiresAt },
    });

    const magicLink = new URL(`/api/auth/magic-login?token=${rawToken}`, request.url).toString();

    // The account IS approved regardless of whether this send succeeds —
    // same "DB update is the primary action, email is a courtesy on top"
    // pattern as the support-request resolve flow. A failed send just
    // means they fall back to logging in normally with their password.
    let emailSent = false;
    try {
      await sendApprovalEmail(user.email, magicLink);
      emailSent = true;
    } catch (error) {
      console.error("Approval email failed to send:", error);
    }

    return NextResponse.json({ ok: true, emailSent });
  } catch (error) {
    console.error("Approve user error:", error);
    return NextResponse.json({ error: "Could not approve that account." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const rootId = await requireRootUserId(request);
  if (!rootId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { userId } = await ctx.params;
  const id = Number(userId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "No such user." }, { status: 404 });
    if (user.role === "root") {
      return NextResponse.json({ error: "The root account can't be deleted here." }, { status: 400 });
    }
    // Hard-delete: any support requests they filed have onDelete: SetNull
    // so their FK becomes null but the row survives with the email snapshot.
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Decline user error:", error);
    return NextResponse.json({ error: "Could not delete that account." }, { status: 500 });
  }
}
