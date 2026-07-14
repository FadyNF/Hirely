// app/api/admin/approvals/[userId]/route.ts
//
// Root-only: promotes a plain employee to admin. There's no more
// "pending approval" queue to approve/decline out of — every signup
// already lands as a fully usable "employee" account (see the onboarding
// rewrite in app/api/auth/register/route.ts) — so promotion is the whole
// surface here. No approved/magic-login plumbing needed: the user can
// already log in, this just widens what they're allowed to do.

import { NextRequest, NextResponse } from "next/server";
import { findUserById, updateUser } from "@/lib/users";
import { requireRootUserId } from "@/lib/requireAuth";

export async function POST(request: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const rootId = await requireRootUserId(request);
  if (!rootId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { userId } = await ctx.params;
  const id = Number(userId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  try {
    const user = findUserById(id);
    if (!user) return NextResponse.json({ error: "No such user." }, { status: 404 });
    if (user.role !== "employee") {
      return NextResponse.json({ error: "Only an employee can be promoted to admin." }, { status: 400 });
    }

    updateUser(id, { role: "admin" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Promote user error:", error);
    return NextResponse.json({ error: "Could not promote that account." }, { status: 500 });
  }
}
