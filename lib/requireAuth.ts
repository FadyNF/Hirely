// lib/requireAuth.ts
//
// Verifies the access-token cookie and returns the authenticated user's
// id, or null if the request isn't authenticated. The token lives in an
// httpOnly cookie now (never reachable by client-side JavaScript) instead
// of a header the client had to remember to attach — this is what lets
// Server Components (Dashboard, Records) check auth themselves, before
// ever touching the database, instead of relying on a client-side redirect
// that only runs after the page's data has already been fetched and sent.

import jwt from "jsonwebtoken";
import { findUserById } from "./users";

const JWT_SECRET = process.env.JWT_SECRET!;

export const ACCESS_TOKEN_COOKIE = "foundry_access_token";
export const REFRESH_TOKEN_COOKIE = "foundry_refresh_token";

function verifyAccessToken(token: string | undefined | null): number | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    return payload.userId;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

// For Route Handlers (API routes) — reads the raw Cookie header directly,
// so this keeps working with the plain `Request` type every route already
// uses (no need to switch every route handler to a NextRequest-only API).
export function requireUserId(request: Request): number | null {
  const token = readCookie(request.headers.get("cookie"), ACCESS_TOKEN_COOKIE);
  return verifyAccessToken(token);
}

// For Server Components (Dashboard, Records) — these never receive a
// Request object at all, so next/headers' cookies() is the equivalent
// read for server-rendered pages.
export async function requireUserIdFromServerCookies(): Promise<number | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return verifyAccessToken(store.get(ACCESS_TOKEN_COOKIE)?.value);
}

// Root-only gate — same as requireUserId, but also verifies the resolved
// user's role in the DB is "root". Returns null (treated as unauthorized)
// if the user is a regular admin, even if their token is otherwise valid.
// One DB round-trip per protected request; only used on the small handful
// of root-only routes so the cost is bounded.
export async function requireRootUserId(request: Request): Promise<number | null> {
  const userId = requireUserId(request);
  if (!userId) return null;
  const user = findUserById(userId);
  return user?.role === "root" ? userId : null;
}

// Server-Component equivalent — same shape as requireUserIdFromServerCookies
// so /app/admin/page.tsx can guard itself the same way /app/page.tsx does.
export async function requireRootUserIdFromServerCookies(): Promise<number | null> {
  const userId = await requireUserIdFromServerCookies();
  if (!userId) return null;
  const user = findUserById(userId);
  return user?.role === "root" ? userId : null;
}
