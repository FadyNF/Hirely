-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "submittedById" INTEGER,
    "submittedByEmail" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationCode" TEXT,
    "codeExpiresAt" DATETIME,
    "refreshTokenHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Backfill: everyone who already existed is treated as an approved admin,
-- so nobody gets locked out on deploy. New signups after this migration
-- default to approved=false and go through the root's approval flow.
INSERT INTO "new_User" ("codeExpiresAt", "createdAt", "email", "emailVerified", "id", "passwordHash", "refreshTokenHash", "verificationCode", "role", "approved") SELECT "codeExpiresAt", "createdAt", "email", "emailVerified", "id", "passwordHash", "refreshTokenHash", "verificationCode", 'admin', true FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
