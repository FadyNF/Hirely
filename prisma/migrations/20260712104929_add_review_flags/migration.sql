-- CreateTable
CREATE TABLE "ReviewFlag" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "field" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeeId" INTEGER NOT NULL,
    CONSTRAINT "ReviewFlag_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
