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
// Exported so the form can render these as dropdowns (one source of truth
// for the valid options, instead of the form hardcoding its own list).
export const ENUM_OPTIONS: Record<string, string[]> = {
  gender: ["Male", "Female"],
  maritalStatus: ["Single", "Married", "Divorced", "Widowed"],
  militaryStatus: ["Exempted", "Completed", "Postponed", "Not Applicable"],
  // "Other" is deliberately kept as an escape hatch — without it, a real
  // employee whose nationality isn't on this list couldn't be saved at all.
  nationality: [
    "Egyptian", "Sudanese", "Jordanian", "Saudi", "Emirati", "Lebanese",
    "Syrian", "Palestinian", "Iraqi", "Libyan", "Algerian", "Moroccan",
    "Tunisian", "Turkish", "Indian", "Pakistani", "Filipino", "British",
    "American", "Other",
  ],
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
      // Letters only (any script — \p{L} covers Arabic, accented Latin,
      // etc. — plus combining marks \p{M} for Arabic diacritics), spaces,
      // hyphens, and apostrophes. Catches "Fady Nabil 88" or "<script>
      // alert" while still allowing "O'Brien Smith", "Anne-Marie Fouad",
      // and "محمد أحمد".
      if (!/^[\p{L}\p{M}\s'-]+$/u.test(value)) {
        return { valid: false, reason: "Should only contain letters — no numbers or symbols." };
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
      // Company email only — exact-case "@elsewedy.com", no subdomains.
      // (Deliberately case-SENSITIVE per the current requirement, even
      // though real email domains are case-insensitive — revisit if that
      // ever causes real false rejections.)
      if (!/^[^\s@]+@elsewedy\.com$/.test(value)) {
        return { valid: false, reason: "Must be a company email ending in @elsewedy.com (exact case, no subdomain)." };
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
      // validateDateString only checks the date is real (correct month/day
      // combination) — it never checked the YEAR was plausible at all, so
      // "5006-12-01" or "9999-01-01" passed as "valid" dates. No lower
      // bound for now (unbounded how far back is fine) — but a birth date
      // can't be later than today, full stop.
      const iso = result.normalized ?? value;
      if (new Date(`${iso}T00:00:00Z`).getTime() > Date.now()) {
        return { valid: false, reason: "Birth date can't be in the future." };
      }
      return result;
    }

    case "workLocation":
      // Relabeled "Department" in the UI (Elsewedy is one company, so
      // "where do they work" doesn't apply) — the underlying field and
      // its shape check are unchanged, just the wording shown to admins.
      if (value.length < 2) {
        return { valid: false, reason: "Must be at least 2 characters." };
      }
      return { valid: true };

    case "hiringDate": {
      const result = validateDateString(value);
      if (!result.valid) {
        return {
          valid: false,
          reason: "Must be a real date — either YYYY-MM-DD or written out, e.g. \"June 7, 2000\".",
        };
      }
      // Unlike birthDate, a future hiring date is plausible (an already-
      // agreed future start date) — no future-date restriction here.
      return result;
    }

    case "age":
    case "yearsExpPrev":
    case "yearsExpElsewedy":
    case "totalExperience":
      if (!/^\d+$/.test(value)) {
        return { valid: false, reason: "Must be a whole number, zero or greater." };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

// Optional scalar Employee fields that are stored as Int in the schema
// (see OPTIONAL_INFO_FIELDS in lib/tabConfig.ts) — validateExtractedFields
// below coerces these back to real numbers after validation succeeds,
// since Prisma needs an actual number for an Int column, not a numeric
// string.
export const NUMERIC_SCALAR_FIELDS = new Set([
  "age", "yearsExpPrev", "yearsExpElsewedy", "totalExperience",
]);

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
// Named for its original use (graduationYear) but genuinely generic — any
// plausible calendar year, reused below for performance-review years too.
function isPlausibleGraduationYear(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 1950 && v <= CURRENT_YEAR + 1;
}

const REVIEW_QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

// GPA is stored as TEXT now ("2.5/4.0 (American)"), not a bare number —
// a plain "1.3" is genuinely ambiguous between an excellent German grade
// and a nearly-failing American one, since both scales share the same 4.0
// denominator. Tagging the scale removes the ambiguity at effectively zero
// extra admin effort (one dropdown, already being filled in anyway).
export const GPA_SCALES = {
  american: { label: "American (0-4.0)", min: 0, max: 4, denom: "4.0", name: "American" },
  german: { label: "German (0.7-4.0)", min: 0.7, max: 4, denom: "4.0", name: "German" },
  other: { label: "Egyptian or Other (0-100)", min: 0, max: 100, denom: "100", name: "Other" },
} as const;
export type GpaScale = keyof typeof GPA_SCALES;

// Validates a raw number against the chosen scale's range, and — if valid —
// returns the fully-formatted string to actually store, e.g. "2.5/4.0
// (American)". Used by the form, which collects the scale via its own
// dropdown rather than trying to parse it back out of free text.
export function validateGpaValue(scale: GpaScale, rawValue: number): FieldValidation {
  const cfg = GPA_SCALES[scale];
  if (typeof rawValue !== "number" || Number.isNaN(rawValue) || rawValue < cfg.min || rawValue > cfg.max) {
    return { valid: false, reason: `Must be between ${cfg.min} and ${cfg.max} on the ${cfg.label} scale.` };
  }
  return { valid: true, normalized: `${rawValue}/${cfg.denom} (${cfg.name})` };
}

// The lenient fallback for GPA arriving as a bare number from natural-
// language extraction (an update mentioned in chat, not the create form) —
// Gemini has no scale dropdown to draw from, so there's no way to know
// which scale a casual "GPA is 3.5" refers to. Kept permissive (union of
// every scale's range) rather than rejecting these outright, and stored
// WITHOUT a scale tag, honestly reflecting that it wasn't specified.
function isValidGpaNumber(v: unknown): boolean {
  return typeof v === "number" && v >= 0 && v <= 100;
}
export const GPA_HINT = "Must be a GPA on one of: 0-4.0 (standard scale), 0.7-4.0 (German scale), or 0-100 (percentage grade).";

function isValidProficiency(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;
}

// Which sub-fields each relation has, split into required (a bad value
// invalidates the whole entry) and optional (a bad value just drops that
// one field). Exported so the form knows which inputs to render and which
// to mark optional — same lists the entry validators below enforce.
export const RELATION_FIELDS = {
  experience: { required: ["jobTitle", "company", "startDate", "endDate"], optional: ["description"] },
  education: { required: ["degree", "fieldOfStudy", "institution", "graduationYear"], optional: ["gpa"] },
  certificates: { required: ["certName", "issuer", "issueDate"], optional: ["expiryDate", "rawText"] },
  skills: { required: ["category", "name", "proficiency"], optional: [] },
  // score here is a PERCENTAGE (0-100) — that's the unit the admin actually
  // types into the form. It gets divided by 100 into the fraction the
  // PerformanceReview.score column stores right before submit (see
  // EmployeeForm's buildData), which is why this live/inline check and the
  // server-side entry validator below use different ranges for the same
  // field name: this one runs BEFORE that conversion, the server one after.
  performanceReviews: { required: ["quarter", "year", "score"], optional: [] },
} as const;

export type RelationKey = keyof typeof RELATION_FIELDS;

// Per-field validation for a single relation sub-field, returning the same
// FieldValidation shape as validateFieldValue. Built on the SAME primitives
// (isValidDate, validateEndDate, isPlausibleGraduationYear, isValidGpaNumber,
// isValidProficiency, isNonEmptyText) the server-side entry validators use,
// so the form's inline errors and the server's checks can't diverge on what
// counts as valid. The form calls this for live per-field feedback — except
// gpa, which the form handles separately via validateGpaValue since it's a
// compound (value + scale) field, not a single one.
export function validateRelationField(
  relationKey: RelationKey,
  field: string,
  value: unknown
): FieldValidation {
  if (relationKey === "experience" && field === "endDate") {
    const r = validateEndDate(value);
    return r.valid ? r : { valid: false, reason: 'Must be a real date, or "Current" for an ongoing role.' };
  }
  if (
    (relationKey === "experience" && field === "startDate") ||
    (relationKey === "certificates" && (field === "issueDate" || field === "expiryDate"))
  ) {
    return isValidDate(value) ? { valid: true } : { valid: false, reason: "Must be a real date (YYYY-MM-DD)." };
  }
  if (relationKey === "education" && field === "graduationYear") {
    return isPlausibleGraduationYear(value)
      ? { valid: true }
      : { valid: false, reason: `Must be a year between 1950 and ${CURRENT_YEAR + 1}.` };
  }
  if (relationKey === "education" && field === "gpa") {
    // Lenient fallback for a bare number with no scale context (see
    // isValidGpaNumber above) — the form itself never reaches this branch.
    return isValidGpaNumber(value) ? { valid: true } : { valid: false, reason: GPA_HINT };
  }
  if (relationKey === "skills" && field === "proficiency") {
    return isValidProficiency(value)
      ? { valid: true }
      : { valid: false, reason: "Must be a whole number from 0 to 100." };
  }
  if (relationKey === "skills" && field === "category") {
    const c = typeof value === "string" ? value.toLowerCase() : "";
    return c === "technical" || c === "language"
      ? { valid: true, normalized: c }
      : { valid: false, reason: 'Must be "technical" or "language".' };
  }
  if (relationKey === "performanceReviews" && field === "quarter") {
    const q = typeof value === "string" ? value.trim().toUpperCase() : "";
    return REVIEW_QUARTERS.includes(q)
      ? { valid: true, normalized: q }
      : { valid: false, reason: "Must be Q1, Q2, Q3, or Q4." };
  }
  if (relationKey === "performanceReviews" && field === "year") {
    return isPlausibleGraduationYear(value)
      ? { valid: true }
      : { valid: false, reason: `Must be a year between 1950 and ${CURRENT_YEAR + 1}.` };
  }
  if (relationKey === "performanceReviews" && field === "score") {
    // Percentage range (0-100) — see the RELATION_FIELDS comment above for
    // why this differs from the server-side entry validator's 0-1 range.
    return typeof value === "number" && value >= 0 && value <= 100
      ? { valid: true }
      : { valid: false, reason: "Must be a percentage from 0 to 100." };
  }
  // experience.description is the only optional free-text field — anything
  // goes (including empty). Every other field here is required free text.
  if (relationKey === "experience" && field === "description") {
    return { valid: true };
  }
  return isNonEmptyText(value) ? { valid: true } : { valid: false, reason: "This field is required." };
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
    // gpa arrives in one of two shapes: a bare number from natural-language
    // extraction (no scale info available — validated leniently, stored as
    // plain text with no scale tag), or an already-formatted string like
    // "2.5/4.0 (American)" from the create form (which built and validated
    // it itself via validateGpaValue) — trusted as-is here, the same way
    // other free-text fields are.
    if (typeof e.gpa === "number") {
      if (isValidGpaNumber(e.gpa)) {
        entry.gpa = String(e.gpa);
      } else {
        warnings.push(`"${e.gpa}" for ${label}'s GPA was left out — ${GPA_HINT}`);
      }
    } else if (isNonEmptyText(e.gpa)) {
      entry.gpa = e.gpa;
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
    // Provenance only (which Excel-import source line this came from, if
    // any) — no shape to validate, just kept if present.
    if (isNonEmptyText(e.rawText)) entry.rawText = e.rawText;
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

function validatePerformanceReviewEntries(entries: unknown): RelationCheck {
  const cleaned: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(entries)) return { cleaned, warnings };

  entries.forEach((raw, i) => {
    const e = raw as Record<string, unknown>;
    const label = `Performance review entry ${i + 1}`;
    const quarter = typeof e.quarter === "string" ? e.quarter.trim().toUpperCase() : "";
    if (!REVIEW_QUARTERS.includes(quarter)) {
      return warnings.push(`${label} was left out — quarter must be Q1, Q2, Q3, or Q4.`);
    }
    if (!isPlausibleGraduationYear(e.year)) {
      return warnings.push(`${label} was left out — "${e.year}" isn't a plausible year.`);
    }
    // This is the fraction (0-1) EmployeeForm already converted the
    // admin-entered percentage into — see the RELATION_FIELDS comment.
    if (typeof e.score !== "number" || e.score < 0 || e.score > 1) {
      return warnings.push(`${label} was left out — score must be a percentage from 0 to 100.`);
    }
    cleaned.push({ quarter, year: e.year, score: e.score });
  });

  return { cleaned, warnings };
}

const RELATION_VALIDATORS: Record<string, (entries: unknown) => RelationCheck> = {
  experience: validateExperienceEntries,
  education: validateEducationEntries,
  certificates: validateCertificateEntries,
  skills: validateSkillEntries,
  performanceReviews: validatePerformanceReviewEntries,
};

// Used for bulk messages (updates, full freeform pastes) — validates
// every field actually present, dropping anything that fails its own
// shape check and explaining why, rather than writing bad data.
export function validateExtractedFields(data: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = { ...data };
  const warnings: string[] = [];

  for (const [field, rawValue] of Object.entries(data)) {
    if (field in RELATION_VALIDATORS) continue;
    // Most fields arrive as strings (Gemini extraction, or the form's own
    // trimmed text inputs). The numeric Int? fields (age, yearsExpPrev,
    // etc.) may instead arrive as a real number — coerce to a string just
    // to run the same shape check, then coerce back to a number below.
    const isNumeric = typeof rawValue === "number" && NUMERIC_SCALAR_FIELDS.has(field);
    if (typeof rawValue !== "string" && !isNumeric) continue;
    const stringValue = isNumeric ? String(rawValue) : (rawValue as string);
    if (stringValue.length === 0) continue;

    const result = validateFieldValue(field, stringValue);
    if (!result.valid) {
      warnings.push(`"${stringValue}" for ${field} was left out — ${result.reason}`);
      delete cleaned[field];
    } else if (NUMERIC_SCALAR_FIELDS.has(field)) {
      cleaned[field] = Number(stringValue);
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

// Validates one row of the batch (tabular) import — scalar fields only.
// Unlike validateExtractedFields (which silently drops bad fields and
// returns prose warnings), this returns a STRUCTURED per-field error map so
// the batch review table can flag exactly which cell in which row is wrong,
// and a `valid` flag so rows can be selected/deselected for import. fullName
// is required (it's the one NOT NULL Employee column).
export function validateBatchRow(data: Record<string, unknown>): {
  cleaned: Record<string, unknown>;
  errors: Record<string, string>;
  valid: boolean;
} {
  const cleaned: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [field, rawValue] of Object.entries(data)) {
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    const stringValue = String(rawValue).trim();
    if (stringValue.length === 0) continue;

    const result = validateFieldValue(field, stringValue);
    if (!result.valid) {
      errors[field] = result.reason ?? "Invalid value.";
      continue;
    }
    cleaned[field] = NUMERIC_SCALAR_FIELDS.has(field)
      ? Number(stringValue)
      : result.normalized ?? stringValue;
  }

  if (!cleaned.fullName) errors.fullName = "Full name is required.";

  return { cleaned, errors, valid: Object.keys(errors).length === 0 };
}