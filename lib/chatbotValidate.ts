// lib/chatbotValidate.ts
//
// This is the deterministic layer beneath the LLM — the same "structural
// plausibility check" idea we designed at the very start of this whole
// project. The LLM extracts a value; this file decides whether that
// value is actually shaped like a real one before it goes anywhere near
// the database.

export interface FieldValidation {
  valid: boolean;
  reason?: string;
  // The canonical form to actually store, if different from what was
  // typed — e.g. "male" typed in becomes "Male" stored.
  normalized?: string;
}

function isRealCalendarDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  // A date-only ISO string ("2026-02-30") is parsed as UTC MIDNIGHT per
  // spec — so it must be read back with the UTC getters too. Reading it
  // back with local getters (the previous bug here) mismatches on any
  // server running behind UTC, wrongly rejecting real dates near
  // midnight local time.
  const date = new Date(v);
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

// Strips ordinal suffixes ("7th" -> "7") so the JS date parser below
// handles them reliably rather than depending on engine-specific leniency.
const ORDINAL_SUFFIX_RE = /(\d+)(st|nd|rd|th)\b/gi;

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Fallback for a written-out date like "June 7th, 2000" — normalizes it
// to YYYY-MM-DD, or returns null if it doesn't parse to a real date.
// Unlike the ISO case above, "June 7, 2000" is parsed by JS as LOCAL
// midnight (not UTC), so it's read back with local getters here — the
// two date paths intentionally use different getters because the two
// input FORMATS are parsed differently by JS itself.
function tryParseWrittenDate(v: string): string | null {
  const cleaned = v.replace(ORDINAL_SUFFIX_RE, "$1");
  const lower = cleaned.toLowerCase();
  // Only handle strings that actually name a month — scopes this to
  // genuinely "written out" dates (what was asked for), not ambiguous
  // numeric formats like "02/30/2000" that Date() would also attempt
  // (and sometimes wrongly succeed at) parsing.
  const monthIndex = MONTH_NAMES.findIndex((name) => lower.includes(name));
  if (monthIndex === -1) return null;

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return null;
  // JS silently ROLLS OVER an out-of-range day into the next month
  // instead of failing — "February 30, 2000" silently becomes March 1
  // — the exact same quirk isRealCalendarDate above guards against for
  // the ISO case. Comparing the parsed month against the month name
  // actually written catches any such rollover, since day overflow
  // always shifts the month forward.
  if (parsed.getMonth() !== monthIndex) return null;

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Shared by birthDate and every date-shaped field inside experience/
// education/certificates — one real-date check, reused everywhere a date
// is expected instead of copy-pasted per field.
function validateDateString(value: string): FieldValidation {
  if (isRealCalendarDate(value)) return { valid: true };
  const written = tryParseWrittenDate(value);
  if (written) return { valid: true, normalized: written };
  return { valid: false };
}

// Fields with a fixed, small set of valid answers — matched
// case-insensitively, but stored in this exact canonical casing.
const ENUM_OPTIONS: Record<string, string[]> = {
  gender: ["Male", "Female"],
  maritalStatus: ["Single", "Married", "Divorced", "Widowed"],
  militaryStatus: ["Exempted", "Completed", "Postponed", "Not Applicable"],
};

export function validateFieldValue(field: string, rawValue: string): FieldValidation {
  const value = rawValue.trim();
  if (!value) {
    return { valid: false, reason: "That was empty — please provide a value." };
  }

  if (field in ENUM_OPTIONS) {
    const options = ENUM_OPTIONS[field];
    const match = options.find((o) => o.toLowerCase() === value.toLowerCase());
    if (!match) return { valid: false, reason: `Must be one of: ${options.join(", ")}.` };
    return { valid: true, normalized: match };
  }

  switch (field) {
    case "fullName":
      // At least 3 characters AND at least one space — catches a bare
      // first name ("Ahmed") without demanding an exact word count.
      if (value.length < 3 || !/\s/.test(value)) {
        return { valid: false, reason: "Should include a first and last name (at least 3 characters)." };
      }
      return { valid: true };

    case "phone":
      // Egyptian mobile numbers: exactly 11 digits, starting with
      // 010, 011, 012, or 015 — not a loose "digits only" check.
      if (!/^01[0125]\d{8}$/.test(value)) {
        return { valid: false, reason: "Must be an 11-digit Egyptian number starting with 010, 011, 012, or 015." };
      }
      return { valid: true };

    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { valid: false, reason: "Must be a valid email address, e.g. name@company.com." };
      }
      return { valid: true };

    case "nationalId": {
      // Egyptian National IDs are exactly 14 digits, structured as:
      // [century][YYMMDD birth date][governorate][sequence+gender][checksum].
      // We validate what we can verify confidently — the length, the
      // century digit, and that the embedded birth date is real. We
      // deliberately DON'T check the governorate code (digits 8-9) or the
      // final checksum digit — we don't have a verified source for either
      // algorithm, and guessing wrong would reject real, valid IDs, which
      // is worse than not checking them at all.
      if (!/^\d{14}$/.test(value)) {
        return { valid: false, reason: "Must be exactly 14 digits." };
      }
      const century = value[0];
      if (century !== "2" && century !== "3") {
        return {
          valid: false,
          reason: "The 1st digit must be 2 (born 1900-1999) or 3 (born 2000 onward).",
        };
      }
      const fullYear = (century === "2" ? "19" : "20") + value.slice(1, 3);
      const embeddedBirthDate = `${fullYear}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
      if (!isRealCalendarDate(embeddedBirthDate)) {
        return {
          valid: false,
          reason: "Digits 2-7 should be a real birth date (YYMMDD) matching the century in digit 1.",
        };
      }
      return { valid: true };
    }

    case "birthDate": {
      const result = validateDateString(value);
      if (!result.valid) {
        return {
          valid: false,
          reason: "Must be a real date — either YYYY-MM-DD or written out, e.g. \"June 7, 2000\".",
        };
      }
      return result;
    }

    case "workLocation":
    case "nationality":
      if (value.length < 2) {
        return { valid: false, reason: "Must be at least 2 characters." };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

// ---------------------------------------------------------------------------
// Relation-array validation (experience / education / certificates / skills)
// ---------------------------------------------------------------------------
//
// Unlike the top-level Employee fields above (every one of them an optional
// database column), nearly every field on these four child tables is a
// REQUIRED, non-nullable column (see prisma/schema.prisma) — jobTitle,
// company, startDate, endDate; degree, fieldOfStudy, institution,
// graduationYear; certName, issuer, issueDate; category, name, proficiency.
// An invalid value in one of those can't just be dropped the way a scalar
// warning drops one field — Prisma would either reject the write outright
// (a NOT NULL column missing entirely) or store a meaningless row (a skill
// with no category). So an invalid REQUIRED field drops the WHOLE entry,
// reported as one warning. Only the two genuinely optional columns
// (Education.gpa, Certificate.expiryDate) get single-field dropping, the
// same as scalar fields do above.

function isNonEmptyText(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidDate(v: unknown): boolean {
  return typeof v === "string" && validateDateString(v).valid;
}

// endDate is the one date-shaped field that ALSO accepts a non-date
// sentinel meaning "still ongoing" — normalized to a fixed casing ("current"
// typed in becomes "Current" stored), same idea as the gender/marital-status
// enum normalization above.
function validateEndDate(v: unknown): FieldValidation {
  if (typeof v !== "string") return { valid: false };
  if (v.trim().toLowerCase() === "current") return { valid: true, normalized: "Current" };
  return validateDateString(v);
}

const CURRENT_YEAR = new Date().getFullYear();
function isPlausibleGraduationYear(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1950 && v <= CURRENT_YEAR + 1;
}

// The union of every accepted GPA scale (0-4.0, 0.7-4.0 German, 0-100
// percentage) collapses to this one range, since the first two both sit
// entirely inside the third.
function isValidGpa(v: unknown): boolean {
  return typeof v === "number" && v >= 0 && v <= 100;
}
const GPA_HINT = "Must be a GPA on one of: 0-4.0 (standard scale), 0.7-4.0 (German scale), or 0-100 (percentage grade).";

function isValidProficiency(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;
}

interface RelationCheck {
  cleaned: Record<string, unknown>[];
  warnings: string[];
}

function validateExperienceEntries(entries: unknown): RelationCheck {
  const cleaned: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(entries)) return { cleaned, warnings };

  entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const label = `Experience entry ${i + 1}`;
    if (!isNonEmptyText(e.jobTitle)) return warnings.push(`${label} was left out — missing a job title.`);
    if (!isNonEmptyText(e.company)) return warnings.push(`${label} was left out — missing a company.`);
    if (!isValidDate(e.startDate)) return warnings.push(`${label} was left out — "${e.startDate}" isn't a real start date.`);
    const end = validateEndDate(e.endDate);
    if (!end.valid) return warnings.push(`${label} was left out — "${e.endDate}" isn't a real end date (or "Current").`);

    cleaned.push({
      jobTitle: e.jobTitle,
      company: e.company,
      startDate: e.startDate,
      endDate: end.normalized ?? e.endDate,
      // description is the one optional column here — kept only if it's
      // actually a non-empty string, dropped silently otherwise (no
      // warning, since leaving it out entirely is a valid choice).
      ...(isNonEmptyText(e.description) ? { description: e.description } : {}),
    });
  });

  return { cleaned, warnings };
}

function validateEducationEntries(entries: unknown): RelationCheck {
  const cleaned: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(entries)) return { cleaned, warnings };

  entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const label = `Education entry ${i + 1}`;
    if (!isNonEmptyText(e.degree)) return warnings.push(`${label} was left out — missing a degree.`);
    if (!isNonEmptyText(e.fieldOfStudy)) return warnings.push(`${label} was left out — missing a field of study.`);
    if (!isNonEmptyText(e.institution)) return warnings.push(`${label} was left out — missing an institution.`);
    if (!isPlausibleGraduationYear(e.graduationYear)) {
      return warnings.push(`${label} was left out — "${e.graduationYear}" isn't a plausible graduation year.`);
    }

    const entry: Record<string, unknown> = {
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      institution: e.institution,
      graduationYear: e.graduationYear,
    };
    if (e.gpa !== undefined && e.gpa !== null) {
      if (isValidGpa(e.gpa)) {
        entry.gpa = e.gpa;
      } else {
        warnings.push(`"${e.gpa}" for ${label}'s GPA was left out — ${GPA_HINT}`);
      }
    }
    cleaned.push(entry);
  });

  return { cleaned, warnings };
}

function validateCertificateEntries(entries: unknown): RelationCheck {
  const cleaned: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(entries)) return { cleaned, warnings };

  entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const label = `Certificate entry ${i + 1}`;
    if (!isNonEmptyText(e.certName)) return warnings.push(`${label} was left out — missing a certificate name.`);
    if (!isNonEmptyText(e.issuer)) return warnings.push(`${label} was left out — missing an issuing organization.`);
    if (!isValidDate(e.issueDate)) return warnings.push(`${label} was left out — "${e.issueDate}" isn't a real issue date.`);

    const entry: Record<string, unknown> = {
      certName: e.certName,
      issuer: e.issuer,
      issueDate: e.issueDate,
    };
    if (e.expiryDate !== undefined && e.expiryDate !== null) {
      if (isValidDate(e.expiryDate)) {
        entry.expiryDate = e.expiryDate;
      } else {
        warnings.push(`"${e.expiryDate}" for ${label}'s expiry date was left out — isn't a real date.`);
      }
    }
    cleaned.push(entry);
  });

  return { cleaned, warnings };
}

function validateSkillEntries(entries: unknown): RelationCheck {
  const cleaned: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(entries)) return { cleaned, warnings };

  entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const label = `Skill entry ${i + 1}`;
    const category = typeof e.category === "string" ? e.category.toLowerCase() : "";
    if (category !== "technical" && category !== "language") {
      return warnings.push(`${label} was left out — category must be "technical" or "language".`);
    }
    if (!isNonEmptyText(e.name)) return warnings.push(`${label} was left out — missing a skill name.`);
    if (!isValidProficiency(e.proficiency)) {
      return warnings.push(`${label} was left out — proficiency must be a number from 0-100.`);
    }

    cleaned.push({ category, name: e.name, proficiency: e.proficiency });
  });

  return { cleaned, warnings };
}

const RELATION_VALIDATORS: Record<string, (entries: unknown) => RelationCheck> = {
  experience: validateExperienceEntries,
  education: validateEducationEntries,
  certificates: validateCertificateEntries,
  skills: validateSkillEntries,
};

// Used for bulk messages (updates, full freeform pastes) — validates
// every field actually present, dropping anything that fails its own
// shape check and explaining why, rather than writing bad data.
export function validateExtractedFields(data: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = { ...data };
  const warnings: string[] = [];

  for (const [field, rawValue] of Object.entries(data)) {
    if (field in RELATION_VALIDATORS) continue;
    if (typeof rawValue !== "string" || rawValue.length === 0) continue;

    const result = validateFieldValue(field, rawValue);
    if (!result.valid) {
      warnings.push(`"${rawValue}" for ${field} was left out — ${result.reason}`);
      delete cleaned[field];
    } else if (result.normalized) {
      cleaned[field] = result.normalized;
    }
  }

  for (const [field, validate] of Object.entries(RELATION_VALIDATORS)) {
    if (!(field in data)) continue;
    const { cleaned: cleanedEntries, warnings: relationWarnings } = validate(data[field]);
    cleaned[field] = cleanedEntries;
    warnings.push(...relationWarnings);
  }

  return { cleaned, warnings };
}