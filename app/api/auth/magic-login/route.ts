// app/api/auth/magic-login/route.ts
//
// The link an admin clicks from the "you're approved" email — logs them
// in directly (issues the real access/refresh cookies) and sends them to
// the dashboard, without asking them to type their password again. The
// token is single-use: consumed (cleared from the DB) the moment it's
// redeemed here, so a re-click, a forwarded email, or an email-scanner
// prefetch can't reuse it to log in a second time.

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { findUserByMagicLoginTokenHash, updateUser } from "@/lib/users";
import { signTokenPair, setAuthCookies } from "@/lib/authTokens";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const loginUrl = new URL("/login", request.url);

  if (!token) {
    loginUrl.searchParams.set("magicLoginError", "1");
    return NextResponse.redirect(loginUrl);
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = findUserByMagicLoginTokenHash(tokenHash);

  if (!user || !user.magicLoginTokenExpiresAt || user.magicLoginTokenExpiresAt < new Date()) {
    loginUrl.searchParams.set("magicLoginError", "1");
    return NextResponse.redirect(loginUrl);
  }

  const { accessToken, refreshToken, refreshTokenHash } = signTokenPair(user.id, user.email);

  // Consume the token here (not just on success elsewhere) so this link
  // only ever works once, no matter how it's reached.
  updateUser(user.id, {
    refreshTokenHash,
    magicLoginTokenHash: null,
    magicLoginTokenExpiresAt: null,
  });

  const response = NextResponse.redirect(new URL("/app", request.url));
  setAuthCookies(response, accessToken, refreshToken);
  return response;
}
