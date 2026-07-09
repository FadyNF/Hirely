// app/api/auth/logout/route.ts
//
// A real server-side logout, which the httpOnly cookie switch makes
// mandatory rather than optional: client-side JavaScript can no longer
// read OR clear the access/refresh cookies itself (that's the whole
// point of httpOnly), so "logging out" has to mean a request to the
// server that clears them and invalidates the stored refresh token hash
// — otherwise a captured refresh token would remain valid indefinitely
// even after the user clicks Logout.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/requireAuth";
import { clearAuthCookies } from "@/lib/authTokens";

export async function POST(request: Request) {
  const userId = requireUserId(request);
  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    }).catch(() => {
      // Best-effort — even if this fails, still clear the cookies below.
    });
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
