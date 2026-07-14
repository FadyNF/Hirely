-- RedefineTable: change User.role/approved defaults for the new
-- employee-only onboarding flow. Every fresh signup is now `role:
-- 'employee'`, `approved: true` (no pending-admin-approval step left to
-- gate on) instead of the old `role: 'admin'`, `approved: false`.
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
    "role" TEXT NOT NULL DEFAULT 'employee',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "magicLoginTokenHash" TEXT,
    "magicLoginTokenExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("id", "email", "passwordHash", "emailVerified", "verificationCode", "codeExpiresAt", "refreshTokenHash", "role", "approved", "magicLoginTokenHash", "magicLoginTokenExpiresAt", "createdAt")
SELECT "id", "email", "passwordHash", "emailVerified", "verificationCode", "codeExpiresAt", "refreshTokenHash", "role", "approved", "magicLoginTokenHash", "magicLoginTokenExpiresAt", "createdAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- AlterTable: link Employee -> User (1:1, nullable). SetNull rather than
-- Cascade: if a login account is ever removed, the HR record is real
-- company data and should survive, just unlinked.
ALTER TABLE "Employee" ADD COLUMN "userId" INTEGER REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
