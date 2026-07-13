-- CreateTable
CREATE TABLE "EmployeeEmbedding" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "employeeId" INTEGER NOT NULL,
    "allcertificates" TEXT,
    "embedding" TEXT,
    "is_dirty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EmployeeEmbedding_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEmbedding_employeeId_key" ON "EmployeeEmbedding"("employeeId");
