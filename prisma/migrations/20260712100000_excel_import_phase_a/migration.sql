-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN "rawText" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "age" INTEGER;
ALTER TABLE "Employee" ADD COLUMN "companyID" TEXT;
ALTER TABLE "Employee" ADD COLUMN "hiringDate" TEXT;
ALTER TABLE "Employee" ADD COLUMN "position" TEXT;

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "score" REAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyID_key" ON "Employee"("companyID");

