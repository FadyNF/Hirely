// lib/db.ts
//
// Replaces lib/prisma.ts. Production infra policy disallows an ORM on the
// server, so this talks to the same SQLite file directly through
// better-sqlite3 (the driver Prisma's adapter used internally anyway) —
// no query engine, no generated client. Every route/lib file that used to
// import `prisma` from "./prisma" now imports `db` from here and writes
// its own SQL.
//
// prisma/schema.prisma and the `prisma` CLI still exist as a LOCAL, DEV-ONLY
// tool for designing schema changes (`prisma migrate dev` generates the next
// migration.sql) — nothing here ever shells out to Prisma, and the CLI/client
// packages are dev-only dependencies, never installed in production.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const filePath = url.replace(/^file:/, "");
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

// SQLite disables foreign-key enforcement per connection unless told
// otherwise — Prisma's better-sqlite3 adapter never turned this on either,
// so cascade/set-null rules declared in the migrations (e.g.
// SupportRequest.submittedById ON DELETE SET NULL) were never actually
// enforced by the database. Turning it on here doesn't touch existing rows
// retroactively; it only makes future writes honor the constraints the
// schema already declares.
function createConnection(): Database.Database {
  const conn = new Database(resolveDbPath());
  conn.pragma("foreign_keys = ON");
  applyMigrations(conn);
  return conn;
}

// Stands in for `prisma migrate deploy`: applies any prisma/migrations/*
// folder not yet recorded, in lexical (timestamp-prefixed) order, so
// shipping to prod is just "ship the code" — no Prisma CLI on the server.
function applyMigrations(conn: Database.Database): void {
  conn.exec(`CREATE TABLE IF NOT EXISTS "_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`);

  // Bootstrap from Prisma's own migration ledger if this database was
  // originally created by `prisma migrate dev` — those migrations already
  // shaped the tables, so record them here once rather than trying (and
  // failing) to re-run a CREATE TABLE for something that already exists.
  const hasPrismaLedger = conn
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`)
    .get();
  if (hasPrismaLedger) {
    const alreadyApplied = conn
      .prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)
      .all() as { migration_name: string }[];
    const seedOne = conn.prepare(`INSERT OR IGNORE INTO "_migrations" ("name", "appliedAt") VALUES (?, ?)`);
    conn.transaction(() => {
      for (const row of alreadyApplied) seedOne.run(row.migration_name, new Date().toISOString());
    })();
  }

  const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const applied = new Set(
    conn.prepare(`SELECT "name" FROM "_migrations"`).all().map((row) => (row as { name: string }).name)
  );

  const folders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    if (applied.has(folder)) continue;
    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, "utf-8");
    const applyOne = conn.transaction(() => {
      conn.exec(sql);
      conn.prepare(`INSERT INTO "_migrations" ("name", "appliedAt") VALUES (?, ?)`).run(folder, new Date().toISOString());
    });
    applyOne();
  }
}

// Hot-reload guard, same idea as the classic PrismaClient-on-globalThis
// pattern: without it, Next.js dev's module reloads would open a new
// better-sqlite3 handle on every edit and eventually hit "database is locked".
const globalForDb = globalThis as unknown as { __db?: Database.Database };

export const db: Database.Database = globalForDb.__db ?? createConnection();
if (process.env.NODE_ENV !== "production") globalForDb.__db = db;

// Prisma.join(...) replacement: turns an array into ("?,?,?", [values]) for
// a `column IN (...)` clause — better-sqlite3 has no array-splat helper.
export function inClause(values: readonly (string | number)[]): { sql: string; params: (string | number)[] } {
  if (values.length === 0) return { sql: "(NULL)", params: [] };
  return { sql: `(${values.map(() => "?").join(",")})`, params: [...values] };
}

// better-sqlite3 transactions are synchronous — this just names the
// pattern so call sites read the same way `prisma.$transaction` used to.
export function runInTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export function isUniqueConstraintError(error: unknown, column: string): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE" &&
    error.message.toLowerCase().includes(column.toLowerCase())
  );
}
