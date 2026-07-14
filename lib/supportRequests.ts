// lib/supportRequests.ts
//
// Hand-written data-access helpers for the SupportRequest table,
// replacing the prisma.supportRequest.* calls used by the support-request
// submission route and the root admin console.

import { db } from "./db";

export interface SupportRequest {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
  rootReply: string | null;
  submittedById: number | null;
  submittedByEmail: string;
  createdAt: Date;
}

interface SupportRequestRow {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
  rootReply: string | null;
  submittedById: number | null;
  submittedByEmail: string;
  createdAt: string;
}

function mapRow(row: SupportRequestRow): SupportRequest {
  return { ...row, createdAt: new Date(row.createdAt) };
}

export function createSupportRequest(input: {
  type: string;
  subject: string;
  message: string;
  submittedByEmail: string;
  submittedById: number | null;
}): void {
  db.prepare(
    `INSERT INTO "SupportRequest" ("type", "subject", "message", "submittedByEmail", "submittedById") VALUES (?, ?, ?, ?, ?)`
  ).run(input.type, input.subject, input.message, input.submittedByEmail, input.submittedById);
}

export function findSupportRequestById(id: number): SupportRequest | null {
  const row = db.prepare(`SELECT * FROM "SupportRequest" WHERE "id" = ?`).get(id) as SupportRequestRow | undefined;
  return row ? mapRow(row) : null;
}

// Throws if the row doesn't exist, matching the try/catch-into-404 the
// caller (app/api/admin/support-requests/[id]/route.ts) already expects.
export function updateSupportRequestStatus(id: number, status: string, reply: string | null | undefined): SupportRequest {
  const existing = findSupportRequestById(id);
  if (!existing) throw new Error("SUPPORT_REQUEST_NOT_FOUND");

  if (reply !== undefined) {
    db.prepare(`UPDATE "SupportRequest" SET "status" = ?, "rootReply" = ? WHERE "id" = ?`).run(status, reply, id);
  } else {
    db.prepare(`UPDATE "SupportRequest" SET "status" = ? WHERE "id" = ?`).run(status, id);
  }
  return findSupportRequestById(id)!;
}

// Matches Prisma's orderBy: [{ status: "asc" }, { createdAt: "desc" }] —
// plain alphabetical status sort ("open" before "resolved"), not a
// semantic "unresolved first" computation.
export function listSupportRequestsForAdmin(): SupportRequest[] {
  const rows = db
    .prepare(`SELECT * FROM "SupportRequest" ORDER BY "status" ASC, "createdAt" DESC`)
    .all() as SupportRequestRow[];
  return rows.map(mapRow);
}
