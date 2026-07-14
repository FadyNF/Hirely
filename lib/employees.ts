// lib/employees.ts
//
// Single shared query for "every employee with all their related data."
// Both the Dashboard (for stats) and Records (for display) import this,
// instead of each writing their own slightly-different version of the
// same query. Prisma's `include` becomes: one query for the Employee
// row(s), then one query per child table filtered by employeeId IN (...),
// stitched together here in JS.

import { db, inClause, runInTransaction } from "./db";

export interface Experience {
  id: number;
  jobTitle: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string | null;
  employeeId: number;
}

export interface Education {
  id: number;
  degree: string;
  fieldOfStudy: string;
  institution: string;
  graduationYear: number;
  gpa: string | null;
  employeeId: number;
}

export interface Certificate {
  id: number;
  certName: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  rawText: string | null;
  employeeId: number;
}

export interface Skill {
  id: number;
  category: string;
  name: string;
  proficiency: number;
  employeeId: number;
}

export interface PerformanceReview {
  id: number;
  quarter: string;
  year: number;
  score: number;
  employeeId: number;
}

export interface EmployeeRow {
  id: number;
  fullName: string;
  phone: string | null;
  birthDate: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  email: string | null;
  workLocation: string | null;
  gender: string | null;
  nationalId: string | null;
  militaryStatus: string | null;
  companyID: string | null;
  hiringDate: string | null;
  position: string | null;
  age: number | null;
  yearsExpPrev: number | null;
  yearsExpElsewedy: number | null;
  totalExperience: number | null;
  createdAt: string;
  // Links this record to the self-service login account that owns it, if
  // any (most historical/imported records have no linked User at all).
  userId: number | null;
}

export interface EmployeeWithRelations extends EmployeeRow {
  experience: Experience[];
  education: Education[];
  certificates: Certificate[];
  skills: Skill[];
  performanceReviews: PerformanceReview[];
}

// The full shape, including `createdAt` as a plain ISO string — kept out
// of the type Client Components receive, same boundary as before (Server
// Components stripped it for serialization; a raw string would actually
// serialize fine now, but the boundary is kept identical on purpose).
export type SerializedEmployee = Omit<EmployeeWithRelations, "createdAt">;

function attachRelations(employees: EmployeeRow[]): EmployeeWithRelations[] {
  if (employees.length === 0) return [];
  const ids = employees.map((e) => e.id);
  const { sql: idsSql, params: idsParams } = inClause(ids);

  const experience = db.prepare(`SELECT * FROM "Experience" WHERE "employeeId" IN ${idsSql}`).all(...idsParams) as Experience[];
  const education = db.prepare(`SELECT * FROM "Education" WHERE "employeeId" IN ${idsSql}`).all(...idsParams) as Education[];
  const certificates = db.prepare(`SELECT * FROM "Certificate" WHERE "employeeId" IN ${idsSql}`).all(...idsParams) as Certificate[];
  const skills = db.prepare(`SELECT * FROM "Skill" WHERE "employeeId" IN ${idsSql}`).all(...idsParams) as Skill[];
  const performanceReviews = db
    .prepare(`SELECT * FROM "PerformanceReview" WHERE "employeeId" IN ${idsSql}`)
    .all(...idsParams) as PerformanceReview[];

  const byEmployee = new Map<number, EmployeeWithRelations>();
  for (const e of employees) {
    byEmployee.set(e.id, { ...e, experience: [], education: [], certificates: [], skills: [], performanceReviews: [] });
  }
  for (const row of experience) byEmployee.get(row.employeeId)?.experience.push(row);
  for (const row of education) byEmployee.get(row.employeeId)?.education.push(row);
  for (const row of certificates) byEmployee.get(row.employeeId)?.certificates.push(row);
  for (const row of skills) byEmployee.get(row.employeeId)?.skills.push(row);
  for (const row of performanceReviews) byEmployee.get(row.employeeId)?.performanceReviews.push(row);

  return employees.map((e) => byEmployee.get(e.id)!);
}

export async function getAllEmployees(): Promise<EmployeeWithRelations[]> {
  const employees = db.prepare(`SELECT * FROM "Employee" ORDER BY "id" ASC`).all() as EmployeeRow[];
  return attachRelations(employees);
}

export async function getEmployeeById(id: number): Promise<EmployeeWithRelations | null> {
  const employee = db.prepare(`SELECT * FROM "Employee" WHERE "id" = ?`).get(id) as EmployeeRow | undefined;
  if (!employee) return null;
  return attachRelations([employee])[0];
}

// Resolves a logged-in User to the Employee record they own, for the
// self-service view and every route that must scope a caller to their own
// data. Not folded into SCALAR_COLUMNS/createEmployeeWithRelations's
// generic write path on purpose — `userId` is a link established once at
// signup (see createBlankEmployeeForUser below), never something a
// chatbot/admin edit payload should be able to touch.
export function getEmployeeIdForUserId(userId: number): number | null {
  const row = db.prepare(`SELECT "id" FROM "Employee" WHERE "userId" = ?`).get(userId) as { id: number } | undefined;
  return row?.id ?? null;
}

// Creates the blank Employee record a fresh signup is linked to (see
// app/api/auth/register/route.ts). An empty fullName is already an
// anticipated case elsewhere in this codebase (the Dashboard's flagged
// fields view falls back to "(No name on file)") — the employee fills
// their own name in via the self-service profile page afterward.
export function createBlankEmployeeForUser(userId: number, email: string): EmployeeRow {
  const info = db
    .prepare(`INSERT INTO "Employee" ("fullName", "email", "userId") VALUES ('', ?, ?)`)
    .run(email, userId);
  return db.prepare(`SELECT * FROM "Employee" WHERE "id" = ?`).get(Number(info.lastInsertRowid)) as EmployeeRow;
}

// Compensating action for register's rollback-on-email-failure path —
// deletes the just-created blank Employee row before the User row is
// removed, so it doesn't survive orphaned (userId SetNull'd) once the User
// FK fires.
export function deleteEmployee(id: number): void {
  db.prepare(`DELETE FROM "Employee" WHERE "id" = ?`).run(id);
}

// Mirrors the Records/export toolbar's filter set — ?search= (free-text
// across name/email/department/national ID/position) plus exact-match
// department/gender/nationality/maritalStatus/militaryStatus.
export interface EmployeeFilters {
  search?: string;
  department?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  militaryStatus?: string;
}

export async function getFilteredEmployees(filters: EmployeeFilters): Promise<EmployeeWithRelations[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.search) {
    conditions.push(
      `("fullName" LIKE ? OR "email" LIKE ? OR "workLocation" LIKE ? OR "nationalId" LIKE ? OR "position" LIKE ?)`
    );
    const like = `%${filters.search}%`;
    params.push(like, like, like, like, like);
  }
  if (filters.department) {
    conditions.push(`"workLocation" = ?`);
    params.push(filters.department);
  }
  if (filters.gender) {
    conditions.push(`"gender" = ?`);
    params.push(filters.gender);
  }
  if (filters.nationality) {
    conditions.push(`"nationality" = ?`);
    params.push(filters.nationality);
  }
  if (filters.maritalStatus) {
    conditions.push(`"maritalStatus" = ?`);
    params.push(filters.maritalStatus);
  }
  if (filters.militaryStatus) {
    conditions.push(`"militaryStatus" = ?`);
    params.push(filters.militaryStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const employees = db.prepare(`SELECT * FROM "Employee" ${where} ORDER BY "id" ASC`).all(...params) as EmployeeRow[];
  return attachRelations(employees);
}

// ---- Writes: create/update with nested relation entries ----
//
// Prisma's `{ create: [...] }` / `{ deleteMany: {}, create: [...] }` nested
// writes become explicit multi-statement transactions here.

export class EmployeeNotFoundError extends Error {
  constructor() {
    super("Employee not found");
    this.name = "EmployeeNotFoundError";
  }
}

const SCALAR_COLUMNS = [
  "fullName", "phone", "birthDate", "nationality", "maritalStatus", "email", "workLocation",
  "gender", "nationalId", "militaryStatus", "companyID", "hiringDate", "position", "age",
  "yearsExpPrev", "yearsExpElsewedy", "totalExperience",
] as const;

const RELATION_TABLES = {
  experience: { table: "Experience", columns: ["jobTitle", "company", "startDate", "endDate", "description"] },
  education: { table: "Education", columns: ["degree", "fieldOfStudy", "institution", "graduationYear", "gpa"] },
  certificates: { table: "Certificate", columns: ["certName", "issuer", "issueDate", "expiryDate", "rawText"] },
  skills: { table: "Skill", columns: ["category", "name", "proficiency"] },
  performanceReviews: { table: "PerformanceReview", columns: ["quarter", "year", "score"] },
} as const;

export type RelationKey = keyof typeof RELATION_TABLES;
export type RelationValues = Partial<Record<RelationKey, Record<string, unknown>[]>>;

function insertRelationRows(employeeId: number, key: RelationKey, entries: Record<string, unknown>[]) {
  const { table, columns } = RELATION_TABLES[key];
  const stmt = db.prepare(
    `INSERT INTO "${table}" ("employeeId", ${columns.map((c) => `"${c}"`).join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`
  );
  for (const entry of entries) {
    stmt.run(employeeId, ...columns.map((c) => entry[c] ?? null));
  }
}

function deleteRelationRows(employeeId: number, key: RelationKey) {
  db.prepare(`DELETE FROM "${RELATION_TABLES[key].table}" WHERE "employeeId" = ?`).run(employeeId);
}

// Creates the Employee row plus whichever relation arrays have entries.
// Returns the plain scalar row (Prisma's `.create()` without `include`
// only ever returned the scalar Employee fields too).
export function createEmployeeWithRelations(scalarData: Record<string, unknown>, relations: RelationValues): EmployeeRow {
  return runInTransaction(() => {
    const presentColumns = SCALAR_COLUMNS.filter((c) => c in scalarData);
    const info = db
      .prepare(
        `INSERT INTO "Employee" (${presentColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${presentColumns.map(() => "?").join(", ")})`
      )
      .run(...presentColumns.map((c) => scalarData[c]));
    const employeeId = Number(info.lastInsertRowid);

    for (const key of Object.keys(relations) as RelationKey[]) {
      const entries = relations[key];
      if (entries && entries.length > 0) insertRelationRows(employeeId, key, entries);
    }

    return db.prepare(`SELECT * FROM "Employee" WHERE "id" = ?`).get(employeeId) as EmployeeRow;
  });
}

// Updates scalar columns present in `scalarData`, then applies relation
// changes: when `replaceAll` is true (the full-record edit form), every
// relation key is deleted and re-inserted from `relations[key]` (even if
// that means just deleting with nothing to re-insert); otherwise
// (chatbot's conversational update) only keys with entries are inserted,
// additively, and every other relation is left untouched — exactly
// mirroring the original per-key `{ create }` vs `{ deleteMany, create }`
// branch.
export function updateEmployeeWithRelations(
  employeeId: number,
  scalarData: Record<string, unknown>,
  relations: RelationValues,
  replaceAll: boolean
): EmployeeRow {
  return runInTransaction(() => {
    const existing = db.prepare(`SELECT "id" FROM "Employee" WHERE "id" = ?`).get(employeeId);
    if (!existing) throw new EmployeeNotFoundError();

    const presentColumns = SCALAR_COLUMNS.filter((c) => c in scalarData);
    if (presentColumns.length > 0) {
      db.prepare(`UPDATE "Employee" SET ${presentColumns.map((c) => `"${c}" = ?`).join(", ")} WHERE "id" = ?`).run(
        ...presentColumns.map((c) => scalarData[c]),
        employeeId
      );
    }

    for (const key of Object.keys(RELATION_TABLES) as RelationKey[]) {
      const entries = relations[key];
      const hasEntries = Array.isArray(entries) && entries.length > 0;
      if (replaceAll) {
        deleteRelationRows(employeeId, key);
        if (hasEntries) insertRelationRows(employeeId, key, entries!);
      } else if (hasEntries) {
        insertRelationRows(employeeId, key, entries!);
      }
    }

    return db.prepare(`SELECT * FROM "Employee" WHERE "id" = ?`).get(employeeId) as EmployeeRow;
  });
}
