// lib/employeeStats.ts
//
// This file only ever runs on the server (it's imported by Server
// Components, never by anything with "use client"). It fetches every
// employee WITH their related rows in one query, then computes the same
// health metrics the old AdminDashboard.jsx computed over mock data —
// except this is now real data, real math, no fabrication.

import { db } from "./db";
import { getAllEmployees, type EmployeeWithRelations } from "./employees";
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG, SKILL_CATEGORIES } from "./tabConfig";

export interface FieldGap {
  field: string;
  gapPercent: number;
  missingCount: number;
  totalCount: number;
}

export interface TopIssue {
  area: string;
  field: string;
  gapPercent: number;
  missingCount: number;
  totalCount: number;
}

export interface TabOverviewRow {
  key: string;
  label: string;
  overallGap: number | null;
  reviewCount: number;
}

// Three-way split of employees by basic-info completeness, the same shape
// as a segmented status bar (e.g. Permanent/Contract/Probation), but for
// data quality instead of employment type.
export interface RecordStatusBreakdown {
  complete: { count: number; percent: number };
  needsReview: { count: number; percent: number };
  incomplete: { count: number; percent: number };
}

export interface JobMatchingStats {
  totalProfiles: number;
  profilesSynced: number;
  jobOpenings: number;
  matchedOpenings: number;
}


// A value the batch importer couldn't confidently accept and wrote anyway
// (see prisma/schema.prisma's ReviewFlag model and lib/chatbotValidate.ts) —
// surfaced here so the admin can actually find and fix it.
export interface FlaggedField {
  id: number;
  employeeId: number;
  employeeName: string;
  field: string;
  rawValue: string;
  reason: string;
}

export interface DashboardData {
  totalEmployees: number;
  overallCompletion: number;
  needsReviewCount: number;
  basicInfo: { fieldCompletion: FieldGap[]; overallGap: number };
  multiTabs: Record<string, { coverage: number; fieldCompletion: FieldGap[]; overallGap: number; totalEntries: number }>;
  skills: { category: string; label: string; coverage: number; avgProficiency: number | null }[];
  tabOverview: TabOverviewRow[];
  topIssues: TopIssue[];
  recordStatus: RecordStatusBreakdown;
  jobMatchingStats: JobMatchingStats;
  flaggedFields: FlaggedField[];
}

function computeBasicInfoStats(employees: EmployeeWithRelations[]) {
  const fieldCompletion: FieldGap[] = BASIC_INFO_FIELDS.map((field) => {
    const missing = employees.filter((e) => !e[field]).length;
    return {
      field: BASIC_INFO_LABELS[field],
      gapPercent: employees.length ? Math.round((missing / employees.length) * 100) : 0,
      missingCount: missing,
      totalCount: employees.length,
    };
  });
  const overallGap = Math.round(
    fieldCompletion.reduce((sum, f) => sum + f.gapPercent, 0) / fieldCompletion.length
  );
  return { fieldCompletion, overallGap };
}

function computeMultiTabStats(
  employees: EmployeeWithRelations[],
  tabKey: "experience" | "education" | "certificates",
  config: (typeof MULTI_TAB_CONFIG)[number]
) {
  const withEntries = employees.filter((e) => e[tabKey].length > 0).length;
  const coverage = employees.length ? Math.round((withEntries / employees.length) * 100) : 0;

  const allEntries = employees.flatMap(
    (e) => e[tabKey] as unknown as Record<string, unknown>[]
  );

  const fieldCompletion: FieldGap[] = config.requiredFields.map((field) => {
    if (allEntries.length === 0) {
      return { field: config.fieldLabels[field], gapPercent: 0, missingCount: 0, totalCount: 0 };
    }
    const missing = allEntries.filter((entry) => !entry[field]).length;
    return {
      field: config.fieldLabels[field],
      gapPercent: Math.round((missing / allEntries.length) * 100),
      missingCount: missing,
      totalCount: allEntries.length,
    };
  });

  return { coverage, fieldCompletion, overallGap: 100 - coverage, totalEntries: allEntries.length };
}

function computeSkillsStats(employees: EmployeeWithRelations[]) {
  return SKILL_CATEGORIES.map(({ key, label }) => {
    const withCategory = employees.filter((e) => e.skills.some((s) => s.category === key));
    const coverage = employees.length ? Math.round((withCategory.length / employees.length) * 100) : 0;

    const allProficiencies = withCategory.flatMap((e) =>
      e.skills.filter((s) => s.category === key).map((s) => s.proficiency)
    );
    const avgProficiency = allProficiencies.length
      ? Math.round(allProficiencies.reduce((a, b) => a + b, 0) / allProficiencies.length)
      : null;

    return {
      category: key,
      label,
      coverage,
      avgProficiency,
      missingCount: employees.length - withCategory.length,
      totalCount: employees.length,
    };
  });
}

function computeTopIssues(
  basicInfo: { fieldCompletion: FieldGap[] },
  multiTabs: DashboardData["multiTabs"],
  skills: ReturnType<typeof computeSkillsStats>,
  limit = 5
): TopIssue[] {
  const pool: TopIssue[] = [
    ...basicInfo.fieldCompletion.map((f) => ({ area: "Basic Info", ...f })),
    ...MULTI_TAB_CONFIG.flatMap((c) =>
      multiTabs[c.key].fieldCompletion
        .filter((f) => f.totalCount > 0)
        .map((f) => ({ area: c.label, ...f }))
    ),
    ...skills.map((s) => ({
      area: "Skills",
      field: s.label,
      gapPercent: 100 - s.coverage,
      missingCount: s.missingCount,
      totalCount: s.totalCount,
    })),
  ];

  return pool
    .filter((issue) => issue.gapPercent > 0)
    .sort((a, b) => b.gapPercent - a.gapPercent)
    .slice(0, limit);
}

// Returns which basic-info fields a single employee is missing, using the
// same field list and labels as the tab-level stats, so the two views
// never disagree with each other.
function getMissingFields(employee: EmployeeWithRelations): string[] {
  return BASIC_INFO_FIELDS.filter((field) => !employee[field]).map((field) => BASIC_INFO_LABELS[field]);
}

function computeRecordStatus(employees: EmployeeWithRelations[]): RecordStatusBreakdown {
  const total = employees.length;
  const halfway = Math.ceil(BASIC_INFO_FIELDS.length / 2);

  let complete = 0;
  let needsReview = 0;
  let incomplete = 0;

  for (const e of employees) {
    const missing = getMissingFields(e).length;
    if (missing === 0) complete += 1;
    else if (missing < halfway) needsReview += 1;
    else incomplete += 1;
  }

  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return {
    complete: { count: complete, percent: pct(complete) },
    needsReview: { count: needsReview, percent: pct(needsReview) },
    incomplete: { count: incomplete, percent: pct(incomplete) },
  };
}

// Buckets employees by overall basic-info completeness %, giving the
// "shape" of the data quality problem the way a histogram shows the shape
// of any distribution — how many people are almost done vs. barely started.
async function computeJobMatchingStats(totalEmployees: number): Promise<JobMatchingStats> {
  const synced = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM "EmployeeEmbedding" WHERE "embedding" IS NOT NULL AND "embedding" != '[]' AND "embedding" != ''`
    )
    .get() as { cnt: number };
  return {
    totalProfiles: totalEmployees,
    profilesSynced: Number(synced?.cnt ?? 0),
    jobOpenings: 0,
    matchedOpenings: 0,
  };
}

// ReviewFlag.field is either a bare Employee column name ("email") or
// "<relationKey>[<index>].<field>" (e.g. "experience[0].startDate") — see
// the model comment in prisma/schema.prisma. Maps either shape back to the
// tabOverview key it should count against.
function reviewFlagTabKey(field: string): string {
  const match = field.match(/^(\w+)\[/);
  if (!match) return "basicInfo";
  return match[1] === "performanceReviews" ? "performance" : match[1];
}

export async function getDashboardData(): Promise<DashboardData> {
  const employees = await getAllEmployees();

  const openFlags = db
    .prepare(
      `SELECT rf."id", rf."employeeId", rf."field", rf."rawValue", rf."reason", e."fullName" as "employeeFullName"
       FROM "ReviewFlag" rf JOIN "Employee" e ON e."id" = rf."employeeId"
       WHERE rf."resolved" = 0
       ORDER BY rf."createdAt" DESC`
    )
    .all() as { id: number; employeeId: number; field: string; rawValue: string; reason: string; employeeFullName: string }[];
  const needsReviewCount = new Set(openFlags.map((f) => f.employeeId)).size;
  const reviewCountByTab: Record<string, number> = {};
  for (const f of openFlags) {
    const tabKey = reviewFlagTabKey(f.field);
    reviewCountByTab[tabKey] = (reviewCountByTab[tabKey] ?? 0) + 1;
  }
  const flaggedFields: FlaggedField[] = openFlags.map((f) => ({
    id: f.id,
    employeeId: f.employeeId,
    employeeName: f.employeeFullName || "(No name on file)",
    field: f.field,
    rawValue: f.rawValue,
    reason: f.reason,
  }));

  const basicInfo = computeBasicInfoStats(employees);

  const multiTabs: DashboardData["multiTabs"] = {};
  for (const config of MULTI_TAB_CONFIG) {
    multiTabs[config.key] = computeMultiTabStats(employees, config.key, config);
  }

  const skills = computeSkillsStats(employees);
  const topIssues = computeTopIssues(basicInfo, multiTabs, skills);
  const recordStatus = computeRecordStatus(employees);
  const jobMatchingStats = await computeJobMatchingStats(employees.length);

  const tabOverview: TabOverviewRow[] = [
    { key: "basicInfo", label: "Basic Info", overallGap: basicInfo.overallGap, reviewCount: reviewCountByTab.basicInfo ?? 0 },
    ...MULTI_TAB_CONFIG.map((c) => ({
      key: c.key,
      label: c.label,
      overallGap: multiTabs[c.key].overallGap,
      reviewCount: reviewCountByTab[c.key] ?? 0,
    })),
    {
      key: "skills",
      label: "Skills",
      overallGap: Math.round(100 - skills.reduce((sum, s) => sum + s.coverage, 0) / skills.length),
      reviewCount: reviewCountByTab.skills ?? 0,
    },
    { key: "performance", label: "Performance", overallGap: null, reviewCount: reviewCountByTab.performance ?? 0 },
  ];

  const gapRows = tabOverview.filter((r) => r.overallGap !== null) as (TabOverviewRow & { overallGap: number })[];
  const overallCompletion = gapRows.length
    ? Math.round(100 - gapRows.reduce((sum, r) => sum + r.overallGap, 0) / gapRows.length)
    : 0;

  return {
    totalEmployees: employees.length,
    overallCompletion,
    needsReviewCount,
    basicInfo,
    multiTabs,
    skills,
    tabOverview,
    topIssues,
    recordStatus,
    jobMatchingStats,
    flaggedFields,
  };
}