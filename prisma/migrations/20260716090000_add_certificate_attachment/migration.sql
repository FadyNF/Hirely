-- AlterTable: certificate uploads (image/PDF) keep a pointer to the saved
-- file alongside the Gemini-parsed fields. Nullable — every certificate
-- entered any other way (manual form, Excel import) has no attachment.
ALTER TABLE "Certificate" ADD COLUMN "attachmentPath" TEXT;
