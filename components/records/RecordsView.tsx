"use client";

// components/records/RecordsView.tsx
//
// Same UI/UX as the old React prototype's RecordsView.jsx, but the data
// comes in as a prop from the server (already queried from the real
// database) instead of being generated in the browser. No mock data,
// no randomization on reload — the same 20 seeded employees every time.

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BASIC_INFO_FIELDS,
    BASIC_INFO_LABELS,
    OPTIONAL_INFO_FIELDS,
    OPTIONAL_INFO_LABELS,
    MULTI_TAB_CONFIG,
    SKILL_CATEGORIES,
} from "@/lib/tabConfig";
import type { SerializedEmployee } from "@/lib/employees";
import { useAuth } from "@/context/AuthContext";
import { ENUM_OPTIONS, parseGpaValue } from "@/lib/chatbotValidate";
import BatchImportModal from "@/components/shared/BatchImportModal";
import EmployeeForm, { type BuiltEmployeeData, type SubmitResult } from "@/components/shared/EmployeeForm";

// Triggers a browser download from an auth-gated route (authFetch handles
// the cookie + 401 refresh; a plain <a href> would skip the retry).
async function downloadFromRoute(
    authFetch: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
    url: string,
    fallbackName: string,
) {
    const res = await authFetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = match ? match[1] : fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
}

const COLORS = {
    red: "#DC2626",
    black: "#111111",
    gray: "#6B7280",
    pinkBg: "#FEE2E2",
    border: "#E5E5E5",
};

const PAGE_SIZE = 5;

// ---- Small building blocks ----

function Placeholder() {
    return <span style={{ color: "#D1D5DB" }}>— not provided —</span>;
}

function FieldRow({
    label,
    value,
}: {
    label: string;
    value: string | number | null | undefined;
}) {
    return (
        <div className="py-2.5 border-b" style={{ borderColor: "#F3F4F6" }}>
            <p className="text-xs mb-0.5" style={{ color: COLORS.gray }}>
                {label}
            </p>
            <p
                className="text-sm font-medium"
                style={{
                    color:
                        value !== null && value !== undefined && value !== ""
                            ? COLORS.black
                            : undefined,
                }}
            >
                {value !== null && value !== undefined && value !== "" ? (
                    value
                ) : (
                    <Placeholder />
                )}
            </p>
        </div>
    );
}

function EntryCard({
    fields,
    entry,
    index,
    label,
}: {
    fields: { key: string; label: string }[];
    entry: Record<string, unknown>;
    index: number;
    label: string;
}) {
    return (
        <div
            className="rounded-lg border p-4 mb-3"
            style={{ borderColor: COLORS.border }}
        >
            <p
                className="text-xs font-medium mb-2"
                style={{ color: COLORS.gray }}
            >
                {label} {index + 1}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {fields.map((f) => (
                    <FieldRow
                        key={f.key}
                        label={f.label}
                        value={entry[f.key] as string | number | null}
                    />
                ))}
            </div>
        </div>
    );
}

function SkillPill({
    name,
    proficiency,
}: {
    name: string;
    proficiency: number;
}) {
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium mr-2 mb-2"
            style={{ backgroundColor: COLORS.pinkBg, color: COLORS.red }}
        >
            {name}
            <span style={{ color: "#F0A9AB" }}>·</span>
            {proficiency}%
        </span>
    );
}

// ---- Modal detail renderers, one per tab type ----

function BasicInfoDetail({ employee }: { employee: SerializedEmployee }) {
    // Additional Info fields are only ever populated via Excel import (see
    // OPTIONAL_INFO_FIELDS in tabConfig.ts) — shown as a second block below
    // the required basics, same grouping EmployeeForm uses, rather than a
    // separate tab, since it's a small handful of fields, not a whole
    // relation.
    const hasAnyOptional = OPTIONAL_INFO_FIELDS.some((f) => {
        const v = employee[f];
        return v !== null && v !== undefined && v !== "";
    });
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                {BASIC_INFO_FIELDS.map((field) => (
                    <FieldRow
                        key={field}
                        label={BASIC_INFO_LABELS[field]}
                        value={employee[field]}
                    />
                ))}
            </div>
            {hasAnyOptional && (
                <div>
                    <p
                        className="text-xs font-medium mb-2 uppercase tracking-wide"
                        style={{ color: COLORS.gray, letterSpacing: "0.05em" }}
                    >
                        Additional Info
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                        {OPTIONAL_INFO_FIELDS.map((field) => (
                            <FieldRow
                                key={field}
                                label={OPTIONAL_INFO_LABELS[field]}
                                value={employee[field] as string | number | null}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function PerformanceDetail({ employee }: { employee: SerializedEmployee }) {
    const entries = employee.performanceReviews;
    if (entries.length === 0) {
        return (
            <p className="text-sm py-4" style={{ color: COLORS.gray }}>
                No performance reviews on record.
            </p>
        );
    }
    const fields = [
        { key: "quarter", label: "Quarter" },
        { key: "year", label: "Year" },
        { key: "score", label: "Score" },
    ];
    return (
        <div>
            {entries.map((entry, i) => (
                <EntryCard
                    key={entry.id}
                    fields={fields}
                    // Stored as a 0-1 fraction — shown as the percentage the
                    // admin actually entered (same conversion EmployeeForm
                    // does at submit time, in reverse).
                    entry={{ ...entry, score: `${Math.round(entry.score * 100)}%` }}
                    index={i}
                    label="Performance review"
                />
            ))}
        </div>
    );
}

function MultiEntryDetail({
    employee,
    tabKey,
}: {
    employee: SerializedEmployee;
    tabKey: "experience" | "education" | "certificates";
}) {
    const config = MULTI_TAB_CONFIG.find((c) => c.key === tabKey)!;
    const fields = [...config.requiredFields, ...config.optionalFields].map(
        (key) => ({
            key,
            label: config.fieldLabels[key],
        }),
    );
    const entries = employee[tabKey] as unknown as Record<string, unknown>[];

    if (entries.length === 0) {
        return (
            <p className="text-sm py-4" style={{ color: COLORS.gray }}>
                No {config.label.toLowerCase()} entries on record.
            </p>
        );
    }
    return (
        <div>
            {entries.map((entry, i) => (
                <EntryCard
                    key={i}
                    fields={fields}
                    entry={entry}
                    index={i}
                    label={config.label}
                />
            ))}
        </div>
    );
}

function SkillsDetail({ employee }: { employee: SerializedEmployee }) {
    return (
        <div className="space-y-5">
            {SKILL_CATEGORIES.map(({ key, label }) => {
                const items = employee.skills.filter((s) => s.category === key);
                return (
                    <div key={key}>
                        <p
                            className="text-xs font-medium mb-2"
                            style={{ color: COLORS.gray }}
                        >
                            {label}
                        </p>
                        {items.length === 0 ? (
                            <p
                                className="text-sm"
                                style={{ color: COLORS.gray }}
                            >
                                None listed.
                            </p>
                        ) : (
                            <div>
                                {items.map((skill) => (
                                    <SkillPill
                                        key={skill.id}
                                        name={skill.name}
                                        proficiency={skill.proficiency}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---- Modal ----

const TABS = [
    { key: "basicInfo", label: "Basic Info" },
    { key: "experience", label: "Experience" },
    { key: "education", label: "Education" },
    { key: "certificates", label: "Certificates" },
    { key: "skills", label: "Skills" },
    { key: "performance", label: "Performance" },
] as const;

function EmployeeModal({
    employee,
    onClose,
}: {
    employee: SerializedEmployee;
    onClose: () => void;
}) {
    const [activeTab, setActiveTab] =
        useState<(typeof TABS)[number]["key"]>("basicInfo");
    const [hoveredTab, setHoveredTab] = useState<(typeof TABS)[number]["key"] | null>(null);
    const { authFetch } = useAuth();
    const [exporting, setExporting] = useState(false);

    // Export this employee as the single-employee Excel template. authFetch
    // sends the auth cookie (and refreshes on 401); the blob becomes a click
    // on a temporary object-URL.
    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const res = await authFetch(`/api/export/employee/${employee.id}`);
            if (!res.ok) return;
            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") || "";
            const match = disposition.match(/filename="?([^"]+)"?/);
            const name = match ? match[1] : `employee-${employee.id}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(17, 17, 17, 0.5)" }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl bg-white rounded-xl overflow-hidden flex flex-col"
                style={{ height: "min(640px, 85vh)" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="px-6 py-4 border-b flex items-start justify-between"
                    style={{ borderColor: COLORS.border }}
                >
                    <div>
                        <h2
                            className="text-lg font-semibold"
                            style={{ color: COLORS.black }}
                        >
                            {employee.fullName}
                        </h2>
                        <p className="text-sm" style={{ color: COLORS.gray }}>
                            {employee.email || "No email on file"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                            style={{
                                borderColor: COLORS.border,
                                color: COLORS.red,
                            }}
                        >
                            {exporting ? "Exporting…" : "Export to Excel"}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center rounded-full text-lg leading-none transition-colors hover:bg-gray-100"
                            style={{ color: COLORS.gray }}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div
                    className="flex gap-1 px-4 border-b overflow-x-auto shrink-0"
                    style={{ borderColor: COLORS.border }}
                >
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className="whitespace-nowrap px-3 py-3 text-sm font-medium border-b-2 transition-colors"
                            style={{
                                borderColor:
                                    activeTab === tab.key
                                        ? COLORS.red
                                        : "transparent",
                                color:
                                    activeTab === tab.key
                                        ? COLORS.red
                                        : hoveredTab === tab.key
                                          ? COLORS.black
                                          : COLORS.gray,
                            }}
                            onMouseEnter={() => setHoveredTab(tab.key)}
                            onMouseLeave={() => setHoveredTab(null)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === "basicInfo" && (
                        <BasicInfoDetail employee={employee} />
                    )}
                    {(activeTab === "experience" ||
                        activeTab === "education" ||
                        activeTab === "certificates") && (
                        <MultiEntryDetail
                            employee={employee}
                            tabKey={activeTab}
                        />
                    )}
                    {activeTab === "skills" && (
                        <SkillsDetail employee={employee} />
                    )}
                    {activeTab === "performance" && (
                        <PerformanceDetail employee={employee} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ---- Table ----

function RecordsTable({
    employees,
    onViewMore,
}: {
    employees: SerializedEmployee[];
    onViewMore: (id: number) => void;
}) {
    return (
        <div
            className="rounded-xl border bg-white overflow-hidden"
            style={{ borderColor: COLORS.border }}
        >
            <table className="w-full text-sm">
                <thead>
                    <tr
                        className="border-b text-left"
                        style={{
                            borderColor: COLORS.border,
                            color: COLORS.gray,
                        }}
                    >
                        <th className="py-3 px-4 font-medium">ID</th>
                        <th className="py-3 px-4 font-medium">Full Name</th>
                        <th className="py-3 px-4 font-medium">Email</th>
                        <th className="py-3 px-4 font-medium">National ID</th>
                        <th className="py-3 px-4 font-medium text-right">
                            Details
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {employees.map((e) => (
                        <tr
                            key={e.id}
                            className="border-b transition-colors hover:bg-gray-50"
                            style={{ borderColor: "#F3F4F6" }}
                        >
                            <td
                                className="py-3 px-4"
                                style={{ color: COLORS.gray }}
                            >
                                {e.id}
                            </td>
                            <td
                                className="py-3 px-4 font-medium"
                                style={{ color: COLORS.black }}
                            >
                                {e.fullName}
                            </td>
                            <td className="py-3 px-4">
                                {e.email || <Placeholder />}
                            </td>
                            <td className="py-3 px-4">
                                {e.nationalId || <Placeholder />}
                            </td>
                            <td className="py-3 px-4 text-right">
                                <button
                                    onClick={() => onViewMore(e.id)}
                                    className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                                    style={{
                                        borderColor: COLORS.border,
                                        color: COLORS.black,
                                    }}
                                >
                                    View more
                                </button>
                            </td>
                        </tr>
                    ))}
                    {employees.length === 0 && (
                        <tr>
                            <td
                                colSpan={5}
                                className="py-6 text-center text-sm"
                                style={{ color: COLORS.gray }}
                            >
                                No employees match that search.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// ---- Main component ----

const EMPTY_FILTERS = {
    workLocation: "",
    gender: "",
    nationality: "",
};
type RecordsFilters = typeof EMPTY_FILTERS;

export default function RecordsView({
    employees,
}: {
    employees: SerializedEmployee[];
}) {
    const { authFetch } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState("");
    const [filters, setFilters] = useState<RecordsFilters>(EMPTY_FILTERS);
    const [currentPage, setCurrentPage] = useState(1);
    // Deep link from the Dashboard's "Flagged for review" list (?highlight=id)
    // — jump straight to the record instead of making the admin search for it.
    const [modalEmployeeId, setModalEmployeeId] = useState<number | null>(
        () => {
            const highlight = searchParams.get("highlight");
            return highlight ? Number(highlight) : null;
        },
    );
    // A second, separate deep link — also from "Flagged for review", but for
    // "Edit" specifically (?edit=id&flagId=n): opens the full edit form
    // instead of the read-only detail modal, and remembers which flag to
    // auto-resolve once the save succeeds.
    const [editEmployeeId, setEditEmployeeId] = useState<number | null>(() => {
        const edit = searchParams.get("edit");
        return edit ? Number(edit) : null;
    });
    const [editFlagId] = useState<number | null>(() => {
        const flagId = searchParams.get("flagId");
        return flagId ? Number(flagId) : null;
    });
    const [batchOpen, setBatchOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const hasActiveFilter =
        Boolean(query.trim()) || Object.values(filters).some((v) => v);

    // Department has no fixed enum (free text on Employee) — offer whatever
    // departments actually exist in the data rather than a hardcoded list.
    const departmentOptions = Array.from(
        new Set(
            employees
                .map((e) => e.workLocation)
                .filter((v): v is string => Boolean(v)),
        ),
    ).sort();

    // Export what the admin is currently looking at: same search + filters,
    // so the sheet always matches exactly what's on screen.
    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const params = new URLSearchParams();
            if (query.trim()) params.set("search", query.trim());
            if (filters.workLocation)
                params.set("department", filters.workLocation);
            if (filters.gender) params.set("gender", filters.gender);
            if (filters.nationality)
                params.set("nationality", filters.nationality);
            const qs = params.toString();
            await downloadFromRoute(
                authFetch,
                qs ? `/api/export/batch?${qs}` : "/api/export/batch",
                "employees.xlsx",
            );
        } finally {
            setExporting(false);
        }
    };

    const filtered = employees.filter((e) => {
        const q = query.toLowerCase().trim();
        if (
            q &&
            !(e.fullName.toLowerCase().includes(q) || String(e.id).includes(q))
        )
            return false;
        if (filters.workLocation && e.workLocation !== filters.workLocation)
            return false;
        if (filters.gender && e.gender !== filters.gender) return false;
        if (filters.nationality && e.nationality !== filters.nationality)
            return false;
        return true;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    const handleSearchChange = (value: string) => {
        setQuery(value);
        setCurrentPage(1);
    };

    const setFilter = (key: keyof RecordsFilters, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setQuery("");
        setFilters(EMPTY_FILTERS);
        setCurrentPage(1);
    };

    const modalEmployee = employees.find((e) => e.id === modalEmployeeId);

    const editEmployee = employees.find((e) => e.id === editEmployeeId);
    // EmployeeForm displays/edits performanceReviews.score as a 0-100
    // percentage (see components/shared/EmployeeForm.tsx); the DB stores
    // it as a 0-1 fraction — converted here on the way in, the same
    // conversion lib/excelImport/mapToFormData.ts does for Excel prefill.
    const editInitialData = editEmployee
        ? {
              ...editEmployee,
              performanceReviews: editEmployee.performanceReviews.map((p) => ({
                  ...p,
                  score: Math.round(p.score * 100),
              })),
              // A saved gpa is already the tagged string ("2.5/4.0
              // (American)") EmployeeForm's dropdown+number pair produces
              // on submit — split it back into both, or every unrelated
              // edit to this employee gets blocked by "Select a GPA
              // scale" for a field the admin never touched.
              education: editEmployee.education.map((e) => {
                  if (!e.gpa) return e;
                  const { value, scale } = parseGpaValue(e.gpa);
                  return { ...e, gpa: value, gpaScale: scale };
              }),
          }
        : undefined;

    const handleEditSubmit = async (
        data: BuiltEmployeeData,
    ): Promise<SubmitResult> => {
        const res = await authFetch("/api/chatbot/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "update",
                employeeId: editEmployeeId,
                data,
                replaceRelations: true,
                resolveFlagId: editFlagId,
            }),
        });
        const result = await res.json();

        if (res.ok) {
            setEditEmployeeId(null);
            router.refresh();
            return { ok: true };
        }
        if (res.status === 409 && result.field) {
            return {
                ok: false,
                fieldError: {
                    field: result.field,
                    message: result.error || "That value already exists.",
                },
            };
        }
        return {
            ok: false,
            error: result.error || "Something went wrong saving that.",
        };
    };

    return (
        <div className="p-8 space-y-4">
            <div>
                <h1
                    className="text-xl font-semibold"
                    style={{ color: COLORS.black }}
                >
                    Employee <span style={{ color: COLORS.red }}>Records</span>
                </h1>
                <p className="text-sm" style={{ color: COLORS.gray }}>
                    Browse individual employee data as stored, tab by tab
                </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search by name or ID..."
                    className="w-full sm:w-72 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-4"
                    style={{ borderColor: COLORS.border }}
                />
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setBatchOpen(true)}
                        className="text-sm font-medium px-3 py-2 rounded-lg text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: COLORS.red }}
                    >
                        Import batch
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="text-sm font-medium px-3 py-2 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50"
                        style={{
                            borderColor: COLORS.border,
                            color: COLORS.black,
                        }}
                    >
                        {exporting
                            ? "Exporting…"
                            : hasActiveFilter
                              ? "Export filtered"
                              : "Export all"}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={filters.workLocation}
                    onChange={(e) => setFilter("workLocation", e.target.value)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs outline-none transition-colors hover:border-gray-400 focus:ring-2"
                    style={{
                        borderColor: COLORS.border,
                        color: filters.workLocation
                            ? COLORS.black
                            : COLORS.gray,
                    }}
                >
                    <option value="">All departments</option>
                    {departmentOptions.map((d) => (
                        <option key={d} value={d}>
                            {d}
                        </option>
                    ))}
                </select>
                <select
                    value={filters.gender}
                    onChange={(e) => setFilter("gender", e.target.value)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs outline-none transition-colors hover:border-gray-400 focus:ring-2"
                    style={{
                        borderColor: COLORS.border,
                        color: filters.gender ? COLORS.black : COLORS.gray,
                    }}
                >
                    <option value="">All genders</option>
                    {ENUM_OPTIONS.gender.map((g) => (
                        <option key={g} value={g}>
                            {g}
                        </option>
                    ))}
                </select>
                <select
                    value={filters.nationality}
                    onChange={(e) => setFilter("nationality", e.target.value)}
                    className="rounded-lg border px-2.5 py-1.5 text-xs outline-none transition-colors hover:border-gray-400 focus:ring-2"
                    style={{
                        borderColor: COLORS.border,
                        color: filters.nationality ? COLORS.black : COLORS.gray,
                    }}
                >
                    <option value="">All nationalities</option>
                    {ENUM_OPTIONS.nationality.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
                {hasActiveFilter && (
                    <button
                        onClick={clearFilters}
                        className="text-xs underline underline-offset-2 transition-colors hover:text-red-800"
                        style={{ color: COLORS.red }}
                    >
                        Clear filters
                    </button>
                )}
            </div>

            <RecordsTable
                employees={pageItems}
                onViewMore={setModalEmployeeId}
            />

            <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: COLORS.gray }}>
                    {filtered.length === 0
                        ? "0 results"
                        : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() =>
                            setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={safePage === 1}
                        className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            borderColor: COLORS.border,
                            color: COLORS.black,
                        }}
                    >
                        Previous
                    </button>
                    <span className="text-sm" style={{ color: COLORS.gray }}>
                        Page {safePage} of {totalPages}
                    </span>
                    <button
                        onClick={() =>
                            setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={safePage === totalPages}
                        className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            borderColor: COLORS.border,
                            color: COLORS.black,
                        }}
                    >
                        Next
                    </button>
                </div>
            </div>

            {modalEmployee && (
                <EmployeeModal
                    employee={modalEmployee}
                    onClose={() => setModalEmployeeId(null)}
                />
            )}
            {editEmployee && (
                <EmployeeForm
                    initialData={editInitialData}
                    onSubmit={handleEditSubmit}
                    onClose={() => setEditEmployeeId(null)}
                    title={`Edit ${editEmployee.fullName}`}
                    subtitle="Update the fields below — existing entries are replaced with whatever's here when you save."
                    submitLabel="Save changes"
                />
            )}
            {batchOpen && (
                <BatchImportModal
                    onClose={() => setBatchOpen(false)}
                    onImported={() => {
                        /* router.refresh handles the reload */
                    }}
                />
            )}
        </div>
    );
}
