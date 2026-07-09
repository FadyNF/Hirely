// lib/requireAuth.ts
//
// Verifies the Bearer access token on a request and returns the
// authenticated user's id, or null if the request isn't authenticated.
// Every API route that shouldn't be reachable by a logged-out caller
// should check this first — the chatbot routes (extract/commit/employee)
// previously had no such check at all.

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

// Typed as the plain, standard `Request` (not NextRequest) since this
// only ever touches `.headers` — that keeps it usable from route
// handlers that receive either type (e.g. dynamic routes typed via
// RouteContext, which hand the callback a plain Request).
export function requireUserId(request: Request): number | null {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    return payload.userId;
  } catch {
    return null;
  }
}
