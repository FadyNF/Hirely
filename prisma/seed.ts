// prisma/seed.ts
//
// Running this script inserts realistic mock employee data directly into
// the real database. This is the exact same generator LOGIC from the old
// mockEmployees.js — same field names, same "miss likelihood" per field,
// same realistic value pools — just writing real rows via Prisma instead
// of returning an in-memory array for React to read.

import { db } from "../lib/db";
import { createEmployeeWithRelations, type RelationValues } from "../lib/employees";

// ---- Value pools (identical to mockEmployees.js) ----

const NAMES = [
  "Fady Nabil", "Nour Amgad", "Nour Bassem", "Omneya Osama", "Layla Mohamed",
  "Mostafa Sello", "Youssef Adel", "Salma Fathy", "Ahmed Kamal", "Mariam Zaki",
  "Karim Sami", "Rania Mostafa", "Hossam Adly", "Dina Farouk", "Amr Sherif",
  "Hana Wael", "Tarek Ismail", "Basma Nour", "Sherif Gamal", "Yara Ehab",
];

const NATIONALITIES = ["Egyptian", "Egyptian", "Egyptian", "Sudanese", "Jordanian"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced"];
const WORK_LOCATIONS = ["Head Office", "Alexandria Branch", "October Branch", "Remote"];
const GENDERS = ["Male", "Female"];
const MILITARY_STATUSES = ["Exempted", "Completed", "Postponed", "Not Applicable"];

const JOB_TITLES = ["Software Engineer", "Electrical Engineer", "HR Specialist", "Project Manager", "Data Analyst", "Sales Executive"];
const COMPANIES = ["Elsewedy Electric", "Vodafone Egypt", "Orange Egypt", "EFG Hermes", "Rowad Modern Engineering", "Freelance"];
const DESCRIPTIONS = [
  "Led cross-functional projects and improved delivery timelines.",
  "Maintained internal tools and supported daily operations.",
  "Coordinated between departments to streamline processes.",
];

const DEGREES = ["Bachelor of Science", "Bachelor of Engineering", "Bachelor of Commerce", "Master of Science"];
const FIELDS_OF_STUDY = ["Computer Science", "Electrical Engineering", "Business Administration", "Mechatronics", "Artificial Intelligence"];
const INSTITUTIONS = ["Cairo University", "Ain Shams University", "Misr International University", "German University in Cairo", "Alexandria University"];

const CERT_NAMES = ["AWS Certified Cloud Practitioner", "Google Data Analytics", "PMP", "Microsoft Azure Fundamentals", "Scrum Master Certified"];
const ISSUERS = ["Amazon Web Services", "Google", "PMI", "Microsoft", "Scrum Alliance"];

const TECH_SKILLS = ["Next.js", "Python", "React", "SQL", "Flutter", "PyTorch"];
const LANGUAGES = ["English", "Arabic", "French", "German"];

// ---- Helpers ----

function pick<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function randomDate(startYear: number, endYear: number): string {
  const year = startYear + Math.floor(Math.random() * (endYear - startYear + 1));
  const month = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
  const day = String(1 + Math.floor(Math.random() * 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function randomPhone(): string {
  const prefix = pick(["010", "011", "012", "015"]);
  const rest = String(Math.floor(10000000 + Math.random() * 89999999));
  return `${prefix}${rest}`;
}

// Tracks every national ID handed out this run, so the do/while below can
// guarantee no two employees share one — matching the @unique constraint
// on Employee.nationalId.
const usedNationalIds = new Set<string>();

// Builds a national ID whose embedded birth date is REAL and matches the
// employee's own birthDate, and whose century digit is correct (2 for
// 1900s births, 3 for 2000s) — i.e. one that actually passes the same
// validation the chatbot enforces, instead of 14 random digits with an
// impossible month like "84".
function makeNationalId(year: number, month: number, day: number): string {
  const century = year < 2000 ? "2" : "3";
  const yy = String(year).slice(2);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const prefix = `${century}${yy}${mm}${dd}`; // 7 digits: century + YYMMDD
  let id: string;
  do {
    // Remaining 7 digits (governorate + serial + check) are cosmetic —
    // our validation deliberately doesn't verify them — but they still
    // need to make the whole 14-digit value unique.
    id = prefix + String(Math.floor(1000000 + Math.random() * 9000000));
  } while (usedNationalIds.has(id));
  usedNationalIds.add(id);
  return id;
}

function emailFromName(name: string): string {
  // Must match the current employee-email rule: exact-case @elsewedy.com.
  return `${name.toLowerCase().replace(/\s+/g, ".")}@elsewedy.com`;
}

// A field is dropped to null/undefined with the given likelihood; otherwise
// it gets a value from the generator function.
function maybeValue<T>(likelihood: number, generator: () => T): T | null {
  return Math.random() < likelihood ? null : generator();
}

// ---- Main seeding logic ----

async function main() {
  console.log("Clearing existing employee data...");
  // Order matters: child tables first, since they reference Employee.
  // PRAGMA foreign_keys = ON (lib/db.ts) would cascade this automatically
  // if we just deleted employees, but being explicit here makes the seed
  // script's behavior obvious without relying on that side effect.
  db.exec(`
    DELETE FROM "Skill";
    DELETE FROM "Certificate";
    DELETE FROM "Education";
    DELETE FROM "Experience";
    DELETE FROM "Employee";
  `);

  console.log("Seeding 20 mock employees...");

  for (let i = 0; i < 20; i++) {
    const name = NAMES[i % NAMES.length];
    // One birth date per employee, so the birthDate field and the date
    // embedded in the national ID below always agree with each other.
    const birthYear = 1985 + Math.floor(Math.random() * 20);
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthDateStr = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

    const scalarData: Record<string, unknown> = {
      fullName: name,
      phone: maybeValue(0.05, randomPhone),
      birthDate: maybeValue(0.08, () => birthDateStr),
      nationality: maybeValue(0.04, () => pick(NATIONALITIES)),
      maritalStatus: maybeValue(0.1, () => pick(MARITAL_STATUSES)),
      email: maybeValue(0.03, () => emailFromName(name)),
      workLocation: maybeValue(0.1, () => pick(WORK_LOCATIONS)),
      gender: maybeValue(0.03, () => pick(GENDERS)),
      nationalId: maybeValue(0.05, () => makeNationalId(birthYear, birthMonth, birthDay)),
      militaryStatus: maybeValue(0.12, () => pick(MILITARY_STATUSES)),
    };
    // Drop nulls — createEmployeeWithRelations only inserts columns
    // actually present in the object, same "never write a field with no
    // value" rule the rest of the app follows.
    for (const key of Object.keys(scalarData)) {
      if (scalarData[key] === null) delete scalarData[key];
    }

    const relations: RelationValues = {};

    // ---- Experience: 0-3 entries ----
    const experienceCount = Math.floor(Math.random() * 4);
    relations.experience = Array.from({ length: experienceCount }, () => ({
      jobTitle: pick(JOB_TITLES),
      company: pick(COMPANIES),
      startDate: randomDate(2015, 2022),
      endDate: randomDate(2022, 2026),
      description: maybeValue(0.3, () => pick(DESCRIPTIONS)),
    }));

    // ---- Education: 0-2 entries ----
    const educationCount = Math.floor(Math.random() * 3);
    relations.education = Array.from({ length: educationCount }, () => ({
      degree: pick(DEGREES),
      fieldOfStudy: pick(FIELDS_OF_STUDY),
      institution: pick(INSTITUTIONS),
      graduationYear: 2015 + Math.floor(Math.random() * 11),
      // gpa is text now, tagged with its scale (e.g. "3.24/4.0
      // (American)") — the seed always generates American-scale values,
      // same range as before (2.5-4.0).
      gpa: maybeValue(0.5, () => `${(2.5 + Math.random() * 1.5).toFixed(2)}/4.0 (American)`),
    }));

    // ---- Certificates: 0-3 entries ----
    const certCount = Math.floor(Math.random() * 4);
    relations.certificates = Array.from({ length: certCount }, () => ({
      certName: pick(CERT_NAMES),
      issuer: pick(ISSUERS),
      issueDate: randomDate(2019, 2025),
      expiryDate: maybeValue(0.6, () => randomDate(2026, 2029)),
    }));

    // ---- Skills: technical + language ----
    const techCount = Math.floor(Math.random() * 6);
    const shuffledTech = [...TECH_SKILLS].sort(() => Math.random() - 0.5);
    const langCount = Math.floor(Math.random() * 3);
    const shuffledLang = [...LANGUAGES].sort(() => Math.random() - 0.5);
    relations.skills = [
      ...shuffledTech.slice(0, techCount).map((skillName) => ({
        category: "technical",
        name: skillName,
        proficiency: 40 + Math.floor(Math.random() * 60),
      })),
      ...shuffledLang.slice(0, langCount).map((langName) => ({
        category: "language",
        name: langName,
        proficiency: 40 + Math.floor(Math.random() * 60),
      })),
    ];

    createEmployeeWithRelations(scalarData, relations);
  }

  console.log("Done seeding 20 employees.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});