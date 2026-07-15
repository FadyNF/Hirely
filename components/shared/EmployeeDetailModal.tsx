"use client";

// components/shared/EmployeeDetailModal.tsx
//
// Read-only, tabbed employee detail popup — same modal RecordsView has
// always used to view (not edit) a record, extracted out so Job Matching's
// candidate cards can open the exact same view-only popup on click rather
// than re-implementing it. Editing still only ever happens through
// EmployeeForm, opened separately.

import { useState } from "react";
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

const COLORS = {
    red: "#DC2626",
    black: "#111111",
    gray: "#6B7280",
    pinkBg: "#FEE2E2",
    border: "#E5E5E5",
};

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
                <div key={i}>
                    <EntryCard
                        fields={fields}
                        entry={entry}
                        index={i}
                        label={config.label}
                    />
                    {/* Only certificates can have an uploaded attachment
                        (see the employee self-service certificate-upload
                        feature) — experience/education entries never have
                        this field, so entry.attachmentPath is simply
                        undefined for them. */}
                    {tabKey === "certificates" && Boolean(entry.attachmentPath) && (
                        <a
                            href={`/api/certificates/${entry.id}/attachment`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline underline-offset-2 -mt-2 mb-3 inline-block"
                            style={{ color: COLORS.red }}
                        >
                            View attachment
                        </a>
                    )}
                </div>
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

export default function EmployeeDetailModal({
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
