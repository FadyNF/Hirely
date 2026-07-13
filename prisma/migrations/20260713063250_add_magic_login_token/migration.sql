-- AlterTable
ALTER TABLE "User" ADD COLUMN "magicLoginTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "magicLoginTokenHash" TEXT;
