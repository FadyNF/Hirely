// lib/users.ts
//
// Hand-written data-access helpers for the User table, replacing the
// various prisma.user.* calls scattered across the auth/admin routes.
// SQLite has no native boolean or datetime type — Prisma stored booleans
// as 0/1 INTEGER and dates as ISO-8601 TEXT, so these helpers convert both
// ways on read/write, the same conversion Prisma used to do for us.

import { db } from "./db";
import type { Role } from "./roles";

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  verificationCode: string | null;
  codeExpiresAt: Date | null;
  refreshTokenHash: string | null;
  role: Role;
  approved: boolean;
  magicLoginTokenHash: string | null;
  magicLoginTokenExpiresAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: number;
  email: string;
  passwordHash: string;
  emailVerified: number;
  verificationCode: string | null;
  codeExpiresAt: string | null;
  refreshTokenHash: string | null;
  role: string;
  approved: number;
  magicLoginTokenHash: string | null;
  magicLoginTokenExpiresAt: string | null;
  createdAt: string;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    emailVerified: !!row.emailVerified,
    verificationCode: row.verificationCode,
    codeExpiresAt: row.codeExpiresAt ? new Date(row.codeExpiresAt) : null,
    refreshTokenHash: row.refreshTokenHash,
    role: row.role as Role,
    approved: !!row.approved,
    magicLoginTokenHash: row.magicLoginTokenHash,
    magicLoginTokenExpiresAt: row.magicLoginTokenExpiresAt ? new Date(row.magicLoginTokenExpiresAt) : null,
    createdAt: new Date(row.createdAt),
  };
}

export function findUserByEmail(email: string): User | null {
  const row = db.prepare(`SELECT * FROM "User" WHERE "email" = ?`).get(email) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserById(id: number): User | null {
  const row = db.prepare(`SELECT * FROM "User" WHERE "id" = ?`).get(id) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function findUserByMagicLoginTokenHash(hash: string): User | null {
  const row = db.prepare(`SELECT * FROM "User" WHERE "magicLoginTokenHash" = ?`).get(hash) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

export function createUser(input: {
  email: string;
  passwordHash: string;
  verificationCode?: string | null;
  codeExpiresAt?: Date | null;
}): User {
  // role/approved aren't passed here — every fresh signup relies on the
  // column defaults ('employee' / true, see the migration that changed
  // them), since a normal registration is the only caller of this
  // function today. Promotion to admin happens later, via updateUser.
  const info = db
    .prepare(`INSERT INTO "User" ("email", "passwordHash", "verificationCode", "codeExpiresAt") VALUES (?, ?, ?, ?)`)
    .run(
      input.email,
      input.passwordHash,
      input.verificationCode ?? null,
      input.codeExpiresAt ? input.codeExpiresAt.toISOString() : null
    );
  return findUserById(Number(info.lastInsertRowid))!;
}

export function deleteUser(id: number): void {
  db.prepare(`DELETE FROM "User" WHERE "id" = ?`).run(id);
}

// An explicit set of updatable fields rather than a generic "pass any
// Partial<User>" — mirrors exactly what the routes need, same spirit as
// the rest of this raw-SQL layer: no query-building magic, just the
// handful of shapes actually used.
export function updateUser(
  id: number,
  fields: Partial<{
    passwordHash: string;
    emailVerified: boolean;
    verificationCode: string | null;
    codeExpiresAt: Date | null;
    refreshTokenHash: string | null;
    role: Role;
    approved: boolean;
    magicLoginTokenHash: string | null;
    magicLoginTokenExpiresAt: Date | null;
  }>
): void {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    columns.push(`"${key}" = ?`);
    if (value instanceof Date) values.push(value.toISOString());
    else if (typeof value === "boolean") values.push(value ? 1 : 0);
    else values.push(value);
  }
  if (columns.length === 0) return;
  values.push(id);
  db.prepare(`UPDATE "User" SET ${columns.join(", ")} WHERE "id" = ?`).run(...values);
}

// INSERT ... ON CONFLICT DO UPDATE replacement for prisma.user.upsert —
// idempotently makes sure the env-configured root admin row exists and is
// current, same as lib/rootAdmin.ts always did.
export function upsertRootUser(input: { email: string; passwordHash: string }): void {
  db.prepare(
    `INSERT INTO "User" ("email", "passwordHash", "role", "approved", "emailVerified")
     VALUES (?, ?, 'root', 1, 1)
     ON CONFLICT("email") DO UPDATE SET
       "passwordHash" = excluded."passwordHash",
       "role" = 'root',
       "approved" = 1,
       "emailVerified" = 1`
  ).run(input.email, input.passwordHash);
}

// Promotion candidates for the root console's "Promote to admin" list —
// every plain employee, not a pending-approval queue (there's no approval
// step left to be pending on; see the onboarding rewrite). Employee's
// fullName is joined in since the console shows whatever name the
// employee has filled in themselves (falling back to "(No name on file)"
// in the UI, the same convention used by the Dashboard's flagged fields).
export function findEmployeeUsers(): { id: number; email: string; fullName: string | null; createdAt: Date }[] {
  const rows = db
    .prepare(
      `SELECT u."id", u."email", u."createdAt", e."fullName" as "employeeFullName"
       FROM "User" u LEFT JOIN "Employee" e ON e."userId" = u."id"
       WHERE u."role" = 'employee'
       ORDER BY u."createdAt" ASC`
    )
    .all() as { id: number; email: string; createdAt: string; employeeFullName: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.employeeFullName || null,
    createdAt: new Date(r.createdAt),
  }));
}

// Demotion candidates for the root console's "Admins" list — every
// currently-promoted admin (never root, which isn't reachable through
// promote/demote at all). Same shape as findEmployeeUsers() so both lists
// render through the same row markup.
export function findAdminUsers(): { id: number; email: string; fullName: string | null; createdAt: Date }[] {
  const rows = db
    .prepare(
      `SELECT u."id", u."email", u."createdAt", e."fullName" as "employeeFullName"
       FROM "User" u LEFT JOIN "Employee" e ON e."userId" = u."id"
       WHERE u."role" = 'admin'
       ORDER BY u."createdAt" ASC`
    )
    .all() as { id: number; email: string; createdAt: string; employeeFullName: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.employeeFullName || null,
    createdAt: new Date(r.createdAt),
  }));
}
