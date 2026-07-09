// lib/chatbotResolve.ts
//
// The SEARCH is identical whether you're about to write to a record or
// just ask about one — only the INTERPRETATION of "zero matches" differs
// (for a write, zero means "make a new one"; for a read, zero means
// "no such person"). One shared search function, two thin wrappers.

import { prisma } from "./prisma";
import type { ExtractedEmployeeData } from "./gemini";

export interface EmployeeMatch {
  id: number;
  fullName: string;
  email: string | null;
  nationalId: string | null;
}

async function searchByName(name: string): Promise<EmployeeMatch[]> {
  // SQLite doesn't support case-insensitive equality the way Postgres
  // does, so we compare in plain JavaScript — fine at this scale.
  const all = await prisma.employee.findMany({
    select: { id: true, fullName: true, email: true, nationalId: true },
  });
  const target = name.trim().toLowerCase();
  return all.filter((e) => e.fullName.trim().toLowerCase() === target);
}

async function findMatches(extracted: ExtractedEmployeeData): Promise<EmployeeMatch[]> {
  // ---- Tier 1: identifierHint — the actual "who" signal ----
  if (extracted.identifierHint) {
    const hint = extracted.identifierHint.trim();

    const asId = Number(hint);
    if (Number.isInteger(asId) && String(asId) === hint) {
      const employee = await prisma.employee.findUnique({
        where: { id: asId },
        select: { id: true, fullName: true, email: true, nationalId: true },
      });
      if (employee) return [employee];
    }

    const byNationalId = await prisma.employee.findFirst({
      where: { nationalId: hint },
      select: { id: true, fullName: true, email: true, nationalId: true },
    });
    if (byNationalId) return [byNationalId];

    // identifierHint can also just BE a name — e.g. inferred from
    // conversation history when the admin says "his"/"her". Try it as
    // a name search too, BEFORE ever falling back to fullName — since
    // fullName might hold a proposed NEW value (a rename), not who
    // the message is about.
    const byNameHint = await searchByName(hint);
    if (byNameHint.length > 0) return byNameHint;
  }

  // ---- Tier 2: fall back to fullName only if identifierHint gave us nothing ----
  if (!extracted.fullName) return [];
  return searchByName(extracted.fullName);
}

// ---- Write interpretation (create / update) ----

export interface WriteResolution {
  action: "create" | "update" | "disambiguate";
  matches: EmployeeMatch[];
}

export async function resolveEmployeeMatches(
  extracted: ExtractedEmployeeData
): Promise<WriteResolution> {
  const matches = await findMatches(extracted);
  if (matches.length === 0) return { action: "create", matches: [] };
  if (matches.length === 1) return { action: "update", matches };
  return { action: "disambiguate", matches };
}

// ---- Read interpretation (lookup / existence question) ----

export interface ReadResolution {
  action: "found" | "notFound" | "disambiguate";
  matches: EmployeeMatch[];
}

export async function resolveEmployeeQuery(
  extracted: ExtractedEmployeeData
): Promise<ReadResolution> {
  const matches = await findMatches(extracted);
  if (matches.length === 0) return { action: "notFound", matches: [] };
  if (matches.length === 1) return { action: "found", matches };
  return { action: "disambiguate", matches };
}