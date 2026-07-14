// app/api/review-flags/[id]/route.ts
//
// Marks one batch-import review flag as resolved once the admin has fixed
// (or consciously accepted) the value it pointed at — see the ReviewFlag
// model in prisma/schema.prisma and the Dashboard's "Flagged for review"
// section.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/requireAuth";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!requireUserId(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const flagId = Number(id);
  if (!Number.isInteger(flagId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const result = db.prepare(`UPDATE "ReviewFlag" SET "resolved" = 1 WHERE "id" = ?`).run(flagId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "That flag no longer exists." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
