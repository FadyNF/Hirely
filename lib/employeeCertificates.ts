import { GoogleGenAI } from "@google/genai";
import { db, inClause } from "./db";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getEmployeeCombinedCorpusMap(targetEmployeeIds?: number[]): Promise<Record<number, string>> {
  if (targetEmployeeIds && targetEmployeeIds.length === 0) {
    return {};
  }

  const idFilter = targetEmployeeIds ? inClause(targetEmployeeIds) : null;
  const whereClause = idFilter ? `WHERE "employeeId" IN ${idFilter.sql}` : "";
  const params = idFilter ? idFilter.params : [];

  const certificates = db
    .prepare(
      `SELECT "employeeId", "certName", "issuer", "issueDate", "expiryDate" FROM "Certificate" ${whereClause} ORDER BY "employeeId" ASC, "certName" ASC`
    )
    .all(...params) as {
    employeeId: number;
    certName: string;
    issuer: string;
    issueDate: string;
    expiryDate: string | null;
  }[];

  const experiences = db
    .prepare(
      `SELECT "employeeId", "jobTitle", "company", "description" FROM "Experience" ${whereClause} ORDER BY "employeeId" ASC`
    )
    .all(...params) as {
    employeeId: number;
    jobTitle: string;
    company: string;
    description: string | null;
  }[];

  const skills = db
    .prepare(
      `SELECT "employeeId", "category", "name", "proficiency" FROM "Skill" ${whereClause} ORDER BY "employeeId" ASC, "name" ASC`
    )
    .all(...params) as {
    employeeId: number;
    category: string;
    name: string;
    proficiency: number;
  }[];

  const employeeDataMap = new Map<number, { certs: string[]; experiences: string[]; skills: string[] }>();

  const getOrInit = (empId: number) => {
    if (!employeeDataMap.has(empId)) {
      employeeDataMap.set(empId, { certs: [], experiences: [], skills: [] });
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
    const parts = [exp.jobTitle, exp.company, exp.description]
      .filter((value): value is string => Boolean(value));

    if (parts.length > 0) {
      getOrInit(empId).experiences.push(parts.join(" - "));
    }
  }

  for (const skill of skills) {
    const empId = Number(skill.employeeId);
    const skillTextParts = [skill.category, skill.name, skill.proficiency ? `proficiency ${skill.proficiency}` : undefined]
      .filter((value): value is string => Boolean(value));

    if (skillTextParts.length > 0) {
      getOrInit(empId).skills.push(skillTextParts.join(" - "));
    }
  }

  const result: Record<number, string> = {};

  for (const [employeeId, data] of Array.from(employeeDataMap.entries())) {
    const summarySegments: string[] = [];

    if (data.certs.length > 0) summarySegments.push(`Certificates: ${data.certs.join(", ")}`);
    if (data.experiences.length > 0) summarySegments.push(`Experience: ${data.experiences.join(", ")}`);
    if (data.skills.length > 0) summarySegments.push(`Skills: ${data.skills.join(", ")}`);

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

// Replaces the old markEmployeeEmbeddingDirty export from lib/prisma.ts —
// same INSERT ... ON CONFLICT DO UPDATE, called after every employee
// create/update so the next sync picks up the change.
export function markEmployeeEmbeddingDirty(employeeId: number): void {
  db.prepare(
    `INSERT INTO "EmployeeEmbedding" ("employeeId", "allexperience", "embedding", "isdirty")
     VALUES (?, '', '[]', 1)
     ON CONFLICT ("employeeId") DO UPDATE SET "isdirty" = 1`
  ).run(employeeId);
}

export async function populateEmployeeEmbeddingsFromCertificates(): Promise<number> {
  const employees = db.prepare(`SELECT "id" FROM "Employee" ORDER BY "id" ASC`).all() as { id: number }[];

  const existingRows = db.prepare(`SELECT "employeeId" FROM "EmployeeEmbedding"`).all() as { employeeId: number }[];

  const existingIds = new Set(existingRows.map((row) => row.employeeId));
  const missingEmployeeIds = employees.map((employee) => employee.id).filter((employeeId) => !existingIds.has(employeeId));

  if (missingEmployeeIds.length > 0) {
    const insertMissing = db.prepare(
      `INSERT INTO "EmployeeEmbedding" ("employeeId", "allexperience", "embedding", "isdirty") VALUES (?, '', '[]', 1)`
    );
    for (const employeeId of missingEmployeeIds) {
      insertMissing.run(employeeId);
    }
  }

  const dirtyRecords = db.prepare(`SELECT "employeeId" FROM "EmployeeEmbedding" WHERE "isdirty" = 1`).all() as {
    employeeId: number;
  }[];

  const dirtyIds =
    dirtyRecords && dirtyRecords.length > 0 ? dirtyRecords.map((r) => r.employeeId) : employees.map((employee) => employee.id);

  const textMap = await getEmployeeCombinedCorpusMap(dirtyIds);
  let processedCount = 0;

  for (const employeeId of dirtyIds) {
    const text = textMap[employeeId];

    if (!text) {
      db.prepare(`UPDATE "EmployeeEmbedding" SET "allexperience" = '', "embedding" = '[]', "isdirty" = 0 WHERE "employeeId" = ?`).run(
        employeeId
      );
      continue;
    }

    const embedding = await generateEmbeddingVector(text);

    db.prepare(`UPDATE "EmployeeEmbedding" SET "allexperience" = ?, "embedding" = ?, "isdirty" = 0 WHERE "employeeId" = ?`).run(
      text,
      JSON.stringify(embedding),
      employeeId
    );

    processedCount += 1;
  }

  return processedCount;
}
