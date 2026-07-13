// lib/prisma.ts
//
// This is the ONE place PrismaClient gets created. Every API route
// imports `prisma` from HERE instead of creating its own — same idea
// as having one shared database connection instead of every file
// opening its own separate connection.

import { PrismaClient } from "./generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// The "adapter" is the translator that knows how to speak SQLite
// specifically. We hand it the same DATABASE_URL from .env.
const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

export const prisma = new PrismaClient({ adapter });

export async function markEmployeeEmbeddingDirty(employeeId: number) {
  await prisma.$executeRaw`
    INSERT INTO "EmployeeEmbedding" ("employeeId", "allcertificates", "embedding", "is_dirty")
    VALUES (${employeeId}, '', '[]', 1)
    ON CONFLICT ("employeeId") DO UPDATE SET "is_dirty" = 1
  `;
}