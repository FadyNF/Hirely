/*
  Warnings:

  - You are about to drop the column `allcertificates` on the `EmployeeEmbedding` table. All the data in the column will be lost.
  - You are about to drop the column `is_dirty` on the `EmployeeEmbedding` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EmployeeEmbedding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "allexperience" TEXT,
    "embedding" TEXT,
    "isdirty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EmployeeEmbedding_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EmployeeEmbedding" ("embedding", "employeeId", "id") SELECT "embedding", "employeeId", "id" FROM "EmployeeEmbedding";
DROP TABLE "EmployeeEmbedding";
ALTER TABLE "new_EmployeeEmbedding" RENAME TO "EmployeeEmbedding";
CREATE UNIQUE INDEX "EmployeeEmbedding_employeeId_key" ON "EmployeeEmbedding"("employeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
