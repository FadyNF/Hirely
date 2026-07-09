// prisma/seed.ts
//
// Running this script inserts realistic mock employee data directly into
// the real database. This is the exact same generator LOGIC from the old
// mockEmployees.js — same field names, same "miss likelihood" per field,
// same realistic value pools — just writing real rows via Prisma instead
// of returning an in-memory array for React to read.

import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

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
  return `${name.toLowerCase().replace(/\s+/g, ".")}@company.com`;
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
  // Prisma's onDelete: Cascade would handle this automatically if we
  // just deleted employees, but being explicit here makes the seed
  // script's behavior obvious without relying on that side effect.
  await prisma.skill.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.education.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.employee.deleteMany();

  console.log("Seeding 20 mock employees...");

  for (let i = 0; i < 20; i++) {
    const name = NAMES[i % NAMES.length];
    // One birth date per employee, so the birthDate field and the date
    // embedded in the national ID below always agree with each other.
    const birthYear = 1985 + Math.floor(Math.random() * 20);
    const birthMonth = 1 + Math.floor(Math.random() * 12);
    const birthDay = 1 + Math.floor(Math.random() * 28);
    const birthDateStr = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

    const employee = await prisma.employee.create({
      data: {
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
      },
    });

    // ---- Experience: 0-3 entries ----
    const experienceCount = Math.floor(Math.random() * 4);
    for (let j = 0; j < experienceCount; j++) {
      await prisma.experience.create({
        data: {
          employeeId: employee.id,
          jobTitle: pick(JOB_TITLES),
          company: pick(COMPANIES),
          startDate: randomDate(2015, 2022),
          endDate: randomDate(2022, 2026),
          description: maybeValue(0.3, () => pick(DESCRIPTIONS)),
        },
      });
    }

    // ---- Education: 0-2 entries ----
    const educationCount = Math.floor(Math.random() * 3);
    for (let j = 0; j < educationCount; j++) {
      await prisma.education.create({
        data: {
          employeeId: employee.id,
          degree: pick(DEGREES),
          fieldOfStudy: pick(FIELDS_OF_STUDY),
          institution: pick(INSTITUTIONS),
          graduationYear: 2015 + Math.floor(Math.random() * 11),
          gpa: maybeValue(0.5, () => Number((2.5 + Math.random() * 1.5).toFixed(2))),
        },
      });
    }

    // ---- Certificates: 0-3 entries ----
    const certCount = Math.floor(Math.random() * 4);
    for (let j = 0; j < certCount; j++) {
      await prisma.certificate.create({
        data: {
          employeeId: employee.id,
          certName: pick(CERT_NAMES),
          issuer: pick(ISSUERS),
          issueDate: randomDate(2019, 2025),
          expiryDate: maybeValue(0.6, () => randomDate(2026, 2029)),
        },
      });
    }

    // ---- Skills: technical + language ----
    const techCount = Math.floor(Math.random() * 6);
    const shuffledTech = [...TECH_SKILLS].sort(() => Math.random() - 0.5);
    for (const skillName of shuffledTech.slice(0, techCount)) {
      await prisma.skill.create({
        data: {
          employeeId: employee.id,
          category: "technical",
          name: skillName,
          proficiency: 40 + Math.floor(Math.random() * 60),
        },
      });
    }

    const langCount = Math.floor(Math.random() * 3);
    const shuffledLang = [...LANGUAGES].sort(() => Math.random() - 0.5);
    for (const langName of shuffledLang.slice(0, langCount)) {
      await prisma.skill.create({
        data: {
          employeeId: employee.id,
          category: "language",
          name: langName,
          proficiency: 40 + Math.floor(Math.random() * 60),
        },
      });
    }
  }

  console.log("Done seeding 20 employees.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });