// lib/authTokens.ts
//
// One shared place to mint the access/refresh token pair and set them as
// httpOnly cookies on a response — replacing three near-identical copies
// of this logic that used to live in login/verify-code/refresh, and (more
// importantly) moving the tokens out of the JSON response body entirely.
// A cookie marked httpOnly can never be read by client-side JavaScript —
// only the browser attaches it automatically on same-origin requests —
// which is what lets a Server Component check "is this request logged
// in?" itself, server-side, before ever touching the database.

import jwt from "jsonwebtoken";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./requireAuth";

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signTokenPair(userId: number, email: string) {
  const accessToken = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
  const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  return { accessToken, refreshToken, refreshTokenHash };
}

// Access token: needed on every request, so it's scoped to the whole site.
// Refresh token: only ever needed by /api/auth/* routes, so scoping its
// path there means it's never even sent to the chatbot/employee routes —
// one less place a stolen cookie could matter.
export function setAuthCookies(response: NextResponse, accessToken: string, refreshToken: string) {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse) {
  const isProd = process.env.NODE_ENV === "production";
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/api/auth", maxAge: 0 });
}
