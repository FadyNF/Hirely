// app/api/admin/support-requests/[id]/route.ts
//
// Root-only: mark a support request resolved (or reopen it). Not a full
// CRUD — just a status toggle, which is all the console needs.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRootUserId } from "@/lib/requireAuth";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rootId = await requireRootUserId(request);
  if (!rootId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await ctx.params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) {
    return NextResponse.json({ error: "Invalid request id." }, { status: 400 });
  }

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const status = String(body.status ?? "").toLowerCase();
  if (status !== "open" && status !== "resolved") {
    return NextResponse.json({ error: 'Status must be "open" or "resolved".' }, { status: 400 });
  }

  try {
    await prisma.supportRequest.update({ where: { id: requestId }, data: { status } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });
  }
}
