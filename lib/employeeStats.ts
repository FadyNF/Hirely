// lib/employeeStats.ts
//
// This file only ever runs on the server (it's imported by Server
// Components, never by anything with "use client"). It fetches every
// employee WITH their related rows in one query, then computes the same
// health metrics the old AdminDashboard.jsx computed over mock data —
// except this is now real data, real math, no fabrication.

import { prisma } from "./prisma";
import { getAllEmployees, type EmployeeWithRelations } from "./employees";
import { BASIC_INFO_FIELDS, BASIC_INFO_LABELS, MULTI_TAB_CONFIG, SKILL_CATEGORIES } from "./tabConfig";

export interface FieldGap {
  field: string;
  gapPercent: number;
}

export interface TabOverviewRow {
  key: string;
  label: string;
  overallGap: number | null;
  reviewCount: number;
}

export interface DashboardData {
  totalEmployees: number;
  overallCompletion: number;
  needsReviewCount: number;
  basicInfo: { fieldCompletion: FieldGap[]; overallGap: number };
  multiTabs: Record<string, { coverage: number; fieldCompletion: FieldGap[]; overallGap: number; totalEntries: number }>;
  skills: { category: string; label: string; coverage: number; avgProficiency: number | null }[];
  tabOverview: TabOverviewRow[];
}

// EmployeeWithRelations and getAllEmployees now live in lib/employees.ts,
// shared with the Records page.

function computeBasicInfoStats(employees: EmployeeWithRelations[]) {
  const fieldCompletion: FieldGap[] = BASIC_INFO_FIELDS.map((field) => {
    const missing = employees.filter((e) => !e[field]).length;
    return {
      field: BASIC_INFO_LABELS[field],
      gapPercent: employees.length ? Math.round((missing / employees.length) * 100) : 0,
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

  // Flatten every entry across every employee into one array, so field
  // completeness is measured against "entries that exist," not employees.
  const allEntries = employees.flatMap(
    (e) => e[tabKey] as unknown as Record<string, unknown>[]
  );

  const fieldCompletion: FieldGap[] = config.requiredFields.map((field) => {
    if (allEntries.length === 0) return { field: config.fieldLabels[field], gapPercent: 0 };
    const missing = allEntries.filter((entry) => !entry[field]).length;
    return {
      field: config.fieldLabels[field],
      gapPercent: Math.round((missing / allEntries.length) * 100),
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

    return { category: key, label, coverage, avgProficiency };
  });
}

export async function getDashboardData(): Promise<DashboardData> {
  const employees = await getAllEmployees();

  const basicInfo = computeBasicInfoStats(employees);

  const multiTabs: DashboardData["multiTabs"] = {};
  for (const config of MULTI_TAB_CONFIG) {
    multiTabs[config.key] = computeMultiTabStats(employees, config.key, config);
  }

  const skills = computeSkillsStats(employees);

  // ---- Tab overview: one row per tab, for the clickable list ----
  const tabOverview: TabOverviewRow[] = [
    { key: "basicInfo", label: "Basic Info", overallGap: basicInfo.overallGap, reviewCount: 0 },
    ...MULTI_TAB_CONFIG.map((c) => ({
      key: c.key,
      label: c.label,
      overallGap: multiTabs[c.key].overallGap,
      reviewCount: 0,
    })),
    {
      key: "skills",
      label: "Skills",
      overallGap: Math.round(100 - skills.reduce((sum, s) => sum + s.coverage, 0) / skills.length),
      reviewCount: 0,
    },
    { key: "performance", label: "Performance", overallGap: null, reviewCount: 0 },
  ];

  const gapRows = tabOverview.filter((r) => r.overallGap !== null) as (TabOverviewRow & { overallGap: number })[];
  const overallCompletion = gapRows.length
    ? Math.round(100 - gapRows.reduce((sum, r) => sum + r.overallGap, 0) / gapRows.length)
    : 0;

  return {
    totalEmployees: employees.length,
    overallCompletion,
    // No ValidationFlags table exists yet — that's tied to the chatbot,
    // which is still ahead of us. Honest zero, not a fabricated number.
    needsReviewCount: 0,
    basicInfo,
    multiTabs,
    skills,
    tabOverview,
  };
}