import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";
import { Prisma } from "./generated/prisma/client";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getEmployeeCombinedCorpusMap(targetEmployeeIds?: number[]): Promise<Record<number, string>> {
  if (targetEmployeeIds && targetEmployeeIds.length === 0) {
    return {};
  }

  const certificates = await prisma.certificate.findMany({
    where: targetEmployeeIds ? { employeeId: { in: targetEmployeeIds } } : undefined,
    select: {
      employeeId: true,
      certName: true,
      issuer: true,
      issueDate: true,
      expiryDate: true,
    },
    orderBy: [{ employeeId: "asc" }, { certName: "asc" }],
  });

  let experiences: { employeeId: bigint | number; jobTitle: string; company: string }[];
  if (targetEmployeeIds) {
    experiences = await prisma.$queryRaw`
      SELECT employeeId, jobTitle, company
      FROM Experience
      WHERE employeeId IN (${Prisma.join(targetEmployeeIds)})
      ORDER BY employeeId ASC
    `;
  } else {
    experiences = await prisma.$queryRaw`
      SELECT employeeId, jobTitle, company
      FROM Experience
      ORDER BY employeeId ASC
    `;
  }

  const employeeDataMap = new Map<number, { certs: string[]; experiences: string[] }>();

  const getOrInit = (empId: number) => {
    if (!employeeDataMap.has(empId)) {
      employeeDataMap.set(empId, { certs: [], experiences: [] });
    }
    return employeeDataMap.get(empId)!;
  };

  for (const cert of certificates) {
    const parts = [cert.certName, cert.issuer, cert.issueDate, cert.expiryDate]
      .filter((value): value is string => Boolean(value));

    if (parts.length > 0) {
      getOrInit(cert.employeeId).certs.push(parts.join(" - "));
    }
  }

  for (const exp of experiences) {
    const empId = Number(exp.employeeId);
    const parts = [exp.jobTitle, exp.company]
      .filter((value): value is string => Boolean(value));

    if (parts.length > 0) {
      getOrInit(empId).experiences.push(parts.join(" at "));
    }
  }

  const result: Record<number, string> = {};

  for (const [employeeId, data] of employeeDataMap.entries()) {
    const summarySegments: string[] = [];

    if (data.certs.length > 0) summarySegments.push(`Certificates: ${data.certs.join(", ")}`);
    if (data.experiences.length > 0) summarySegments.push(`Experience: ${data.experiences.join(", ")}`);

    if (summarySegments.length > 0) {
      result[employeeId] = summarySegments.join(" | ");
    }
  }

  return result;
}

async function generateEmbeddingVector(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text,
  });

  return response.embeddings?.[0]?.values ?? [];
}

export async function populateEmployeeEmbeddingsFromCertificates(): Promise<number> {
  const employees = await prisma.employee.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const existingRows = await prisma.$queryRaw<{ employeeId: bigint | number }[]>`
    SELECT "employeeId" FROM "EmployeeEmbedding"
  `;

  const existingIds = new Set(existingRows.map((row) => Number(row.employeeId)));
  const missingEmployeeIds = employees
    .map((employee) => employee.id)
    .filter((employeeId) => !existingIds.has(employeeId));

  if (missingEmployeeIds.length > 0) {
    for (const employeeId of missingEmployeeIds) {
      await prisma.$executeRaw`
        INSERT INTO "EmployeeEmbedding" ("employeeId", "allcertificates", "embedding", "is_dirty")
        VALUES (${employeeId}, '', '[]', 1)
      `;
    }
  }

  const dirtyRecords = await prisma.$queryRaw<{ employeeId: bigint | number }[]>`
    SELECT "employeeId" FROM "EmployeeEmbedding" WHERE "is_dirty" = 1
  `;

  if (!dirtyRecords || dirtyRecords.length === 0) {
    return 0;
  }

  const dirtyIds = dirtyRecords.map((r) => Number(r.employeeId));

  const textMap = await getEmployeeCombinedCorpusMap(dirtyIds);
  let processedCount = 0;

  for (const employeeId of dirtyIds) {
    const text = textMap[employeeId];

    if (!text) {
      await prisma.$executeRaw`
        UPDATE "EmployeeEmbedding"
        SET "allcertificates" = '', "embedding" = '[]', "is_dirty" = 0
        WHERE "employeeId" = ${employeeId}
      `;
      continue;
    }

    const embedding = await generateEmbeddingVector(text);

    await prisma.$executeRaw`
      UPDATE "EmployeeEmbedding"
      SET
        "allcertificates" = ${text},
        "embedding" = ${JSON.stringify(embedding)},
        "is_dirty" = 0
      WHERE "employeeId" = ${employeeId}
    `;

    processedCount += 1;
  }

  return processedCount;
}
