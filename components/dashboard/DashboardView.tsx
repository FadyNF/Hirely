"use client";

// components/dashboard/DashboardView.tsx
//
// This is the ONLY client-side piece of the dashboard — it only exists
// because expand/collapse needs useState. Every number it displays was
// already computed server-side in lib/employeeStats.ts and handed to
// this component as props; this file does zero data-fetching or math.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from "recharts";
import type {
    DashboardData,
    FieldGap,
    TopIssue,
    RecordStatusBreakdown,
    CompletionBucket,
    AttentionEmployee,
    FlaggedField,
} from "@/lib/employeeStats";
import { useAuth } from "@/context/AuthContext";

const COLORS = {
    red: "#DC2626",
    black: "#111111",
    gray: "#6B7280",
    pinkBg: "#FEE2E2",
    border: "#E5E5E5",
};

const SEVERITY_CAP = 60;
function gapColor(gapPercent: number): string {
    const t = Math.min(gapPercent / SEVERITY_CAP, 1);
    const from = { r: 209, g: 213, b: 219 };
    const to = { r: 220, g: 38, b: 38 };
    const r = Math.round(from.r + (to.r - from.r) * t);
    const g = Math.round(from.g + (to.g - from.g) * t);
    const b = Math.round(from.b + (to.b - from.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

function getDefaultTab(rows: DashboardData["tabOverview"]): string {
    const withGap = rows.filter((r) => r.overallGap !== null);
    if (withGap.length === 0) return rows[0]?.key ?? "";
    return withGap.reduce((worst, r) =>
        r.overallGap! > worst.overallGap! ? r : worst,
    ).key;
}

function StatCard({
    label,
    value,
    accent,
}: {
    label: string;
    value: string | number;
    accent?: boolean;
}) {
    return (
        <div
            className="rounded-xl border bg-white p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
            style={{ borderColor: COLORS.border }}
        >
            <p className="text-sm mb-1.5" style={{ color: COLORS.gray }}>
                {label}
            </p>
            <p
                className="text-3xl font-semibold"
                style={{ color: accent ? COLORS.red : COLORS.black }}
            >
                {value}
            </p>
        </div>
    );
}

function SectionCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className="rounded-xl border bg-white p-6"
            style={{ borderColor: COLORS.border }}
        >
            <div className="mb-5">
                <h2
                    className="text-lg font-semibold"
                    style={{ color: COLORS.black }}
                >
                    {title}
                </h2>
                {subtitle && (
                    <p
                        className="text-sm mt-0.5"
                        style={{ color: COLORS.gray }}
                    >
                        {subtitle}
                    </p>
                )}
            </div>
            {children}
        </div>
    );
}

// The thing that makes the page worth checking: one ranked list of the
// worst fields across every tab, with real counts instead of bare percentages.
function TopIssuesList({
    issues,
    onJump,
}: {
    issues: TopIssue[];
    onJump: (area: string) => void;
}) {
    if (issues.length === 0) {
        return (
            <p className="text-sm" style={{ color: COLORS.gray }}>
                No gaps above 0% — records are in good shape.
            </p>
        );
    }
    return (
        <div className="space-y-1">
            {issues.map((issue, i) => (
                <button
                    key={`${issue.area}-${issue.field}`}
                    onClick={() => onJump(issue.area)}
                    className="w-full flex items-center gap-4 py-2.5 px-2 -mx-2 rounded-md text-left transition-colors hover:bg-gray-50"
                >
                    <span
                        className="text-sm font-semibold w-5 text-right"
                        style={{ color: COLORS.gray }}
                    >
                        {i + 1}
                    </span>
                    <span
                        className="text-sm font-semibold rounded-full px-2 py-0.5"
                        style={{
                            backgroundColor: COLORS.pinkBg,
                            color: gapColor(issue.gapPercent),
                        }}
                    >
                        {issue.gapPercent}%
                    </span>
                    <span
                        className="text-sm flex-1"
                        style={{ color: COLORS.black }}
                    >
                        {issue.field}{" "}
                        <span style={{ color: COLORS.gray }}>
                            · {issue.area}
                        </span>
                    </span>
                    <span className="text-sm" style={{ color: COLORS.gray }}>
                        {issue.missingCount} of {issue.totalCount}
                    </span>
                </button>
            ))}
        </div>
    );
}

// Segmented bar in the spirit of an "Employment Status" widget — same
// visual language, but split by data completeness instead of employment type.
function RecordStatusBar({ status }: { status: RecordStatusBreakdown }) {
    const segments = [
        {
            key: "complete",
            label: "Complete",
            data: status.complete,
            color: "#10B981",
        },
        {
            key: "needsReview",
            label: "Needs review",
            data: status.needsReview,
            color: "#F59E0B",
        },
        {
            key: "incomplete",
            label: "Incomplete",
            data: status.incomplete,
            color: COLORS.red,
        },
    ];
    return (
        <div>
            <div
                className="flex h-2.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "#F3F4F6" }}
            >
                {segments.map((s) => (
                    <div
                        key={s.key}
                        style={{
                            width: `${s.data.percent}%`,
                            backgroundColor: s.color,
                        }}
                    />
                ))}
            </div>
            <div className="flex justify-between mt-1.5">
                <span className="text-xs" style={{ color: COLORS.gray }}>
                    0%
                </span>
                <span className="text-xs" style={{ color: COLORS.gray }}>
                    100%
                </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
                {segments.map((s) => (
                    <div key={s.key} className="flex items-start gap-2">
                        <span
                            className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                            style={{ backgroundColor: s.color }}
                        />
                        <div>
                            <p
                                className="text-xs"
                                style={{ color: COLORS.gray }}
                            >
                                {s.label}
                            </p>
                            <p
                                className="text-sm font-semibold"
                                style={{ color: COLORS.black }}
                            >
                                {s.data.count}{" "}
                                <span
                                    className="font-normal"
                                    style={{ color: COLORS.gray }}
                                >
                                    ({s.data.percent}%)
                                </span>
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Same visual shape as a KPI trend chart, but since there's only one live
// snapshot (no historical data to plot a trend over time), it shows the
// distribution of employees across completeness bands instead — the
// "shape" of the data problem rather than a shape over time.
function CompletionDistributionChart({
    buckets,
}: {
    buckets: CompletionBucket[];
}) {
    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={COLORS.border}
                />
                <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: COLORS.gray }}
                    axisLine={{ stroke: COLORS.border }}
                    tickLine={false}
                />
                <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: COLORS.gray }}
                    axisLine={false}
                    tickLine={false}
                />
                <Tooltip
                    formatter={(value) => [
                        `${Array.isArray(value) ? value[0] : (value ?? 0)} employees`,
                        "",
                    ]}
                    contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        borderColor: COLORS.border,
                    }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={36}>
                    {buckets.map((b, i) => (
                        <Cell
                            key={i}
                            fill={
                                i === buckets.length - 1
                                    ? "#10B981"
                                    : gapColor(100 - (i * 20 + 10))
                            }
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// The most actionable piece of the page: real people, ranked by how many
// basic-info fields they're missing, in the spirit of the "List Employee"
// table — but built for triage instead of a general directory.
function AttentionTable({ employees }: { employees: AttentionEmployee[] }) {
    if (employees.length === 0) {
        return (
            <p className="text-sm" style={{ color: COLORS.gray }}>
                Every employee has complete basic info.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left" style={{ color: COLORS.gray }}>
                        <th className="font-medium px-2 pb-2">Name</th>
                        <th className="font-medium px-2 pb-2">Company ID</th>
                        <th className="font-medium px-2 pb-2">Department</th>
                        <th className="font-medium px-2 pb-2">Position</th>
                        <th className="font-medium px-2 pb-2">
                            Missing fields
                        </th>
                    </tr>
                </thead>
                <tbody
                    className="divide-y"
                    style={{ borderColor: COLORS.border }}
                >
                    {employees.map((e) => (
                        <tr key={e.companyID + e.fullName} className="transition-colors hover:bg-gray-50">
                            <td
                                className="px-2 py-2.5"
                                style={{ color: COLORS.black }}
                            >
                                {e.fullName}
                            </td>
                            <td
                                className="px-2 py-2.5"
                                style={{ color: COLORS.gray }}
                            >
                                {e.companyID}
                            </td>
                            <td
                                className="px-2 py-2.5"
                                style={{ color: COLORS.gray }}
                            >
                                {e.department}
                            </td>
                            <td
                                className="px-2 py-2.5"
                                style={{ color: COLORS.gray }}
                            >
                                {e.position}
                            </td>
                            <td className="px-2 py-2.5">
                                <span
                                    className="text-xs font-semibold rounded-full px-2 py-0.5"
                                    style={{
                                        backgroundColor: COLORS.pinkBg,
                                        color: gapColor(
                                            (e.missingCount / e.totalFields) *
                                                100,
                                        ),
                                    }}
                                    title={e.missingFields.join(", ")}
                                >
                                    {e.missingCount} of {e.totalFields}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GapBarChart({ data }: { data: FieldGap[] }) {
    const sorted = [...data].sort((a, b) => b.gapPercent - a.gapPercent);
    return (
        <ResponsiveContainer
            width="100%"
            height={Math.max(sorted.length * 34, 120)}
        >
            <BarChart
                data={sorted}
                layout="vertical"
                margin={{ left: 20, right: 20 }}
            >
                <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke={COLORS.border}
                />
                <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 12, fill: COLORS.gray }}
                />
                <YAxis
                    type="category"
                    dataKey="field"
                    width={120}
                    tick={{ fontSize: 12, fill: COLORS.black }}
                />
                <Tooltip
                    formatter={(_value, _name, props) => {
                        const d = props.payload as FieldGap;
                        return [
                            `${d.missingCount} of ${d.totalCount} missing`,
                            "",
                        ];
                    }}
                    contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        borderColor: COLORS.border,
                    }}
                />
                <Bar dataKey="gapPercent" radius={[0, 4, 4, 0]} barSize={16}>
                    {sorted.map((entry, index) => (
                        <Cell key={index} fill={gapColor(entry.gapPercent)} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function TabDetail({ tabKey, data }: { tabKey: string; data: DashboardData }) {
    if (tabKey === "basicInfo") {
        return <GapBarChart data={data.basicInfo.fieldCompletion} />;
    }

    if (["experience", "education", "certificates"].includes(tabKey)) {
        const tab = data.multiTabs[tabKey];
        return (
            <div className="space-y-4">
                <div>
                    <p
                        className="text-3xl font-semibold"
                        style={{ color: COLORS.black }}
                    >
                        {tab.coverage}%
                    </p>
                    <p className="text-xs mt-1" style={{ color: COLORS.gray }}>
                        {tab.totalEntries} total entries across all employees
                    </p>
                </div>
                <div>
                    <p
                        className="text-xs mb-4 px-3 py-2.5 rounded-lg"
                        style={{
                            backgroundColor: "#F9FAFB",
                            color: COLORS.gray,
                        }}
                    >
                        {tab.coverage}% of employees have added at least one
                        entry here. The remaining {100 - tab.coverage}% have
                        none — they don&apos;t appear in the chart below, since
                        there&apos;s nothing yet to check on an entry that
                        doesn&apos;t exist. This chart only covers the{" "}
                        {tab.totalEntries} entries that already exist.
                    </p>
                    {tab.totalEntries > 0 ? (
                        <GapBarChart data={tab.fieldCompletion} />
                    ) : (
                        <p className="text-sm" style={{ color: COLORS.gray }}>
                            No entries yet to evaluate.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (tabKey === "skills") {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.skills.map((cat) => (
                    <div
                        key={cat.category}
                        className="rounded-lg border p-4"
                        style={{ borderColor: COLORS.border }}
                    >
                        <p
                            className="text-sm font-medium mb-2"
                            style={{ color: COLORS.black }}
                        >
                            {cat.label}
                        </p>
                        <div className="flex items-baseline gap-2 mb-1">
                            <span
                                className="text-2xl font-semibold"
                                style={{ color: COLORS.black }}
                            >
                                {cat.coverage}%
                            </span>
                            <span
                                className="text-xs"
                                style={{ color: COLORS.gray }}
                            >
                                of employees have entries
                            </span>
                        </div>
                        <p className="text-sm" style={{ color: COLORS.gray }}>
                            Average proficiency:{" "}
                            <span
                                className="font-medium"
                                style={{ color: COLORS.black }}
                            >
                                {cat.avgProficiency !== null
                                    ? `${cat.avgProficiency}%`
                                    : "—"}
                            </span>
                        </p>
                    </div>
                ))}
            </div>
        );
    }

    if (tabKey === "performance") {
        return (
            <p className="text-sm" style={{ color: COLORS.gray }}>
                No data model defined yet for this tab.
            </p>
        );
    }

    return null;
}

function TabOverviewList({
    rows,
    expanded,
    onToggle,
    data,
}: {
    rows: DashboardData["tabOverview"];
    expanded: string;
    onToggle: (key: string) => void;
    data: DashboardData;
}) {
    return (
        <div className="divide-y" style={{ borderColor: COLORS.border }}>
            {rows.map((row) => {
                const isOpen = expanded === row.key;
                return (
                    <div key={row.key} id={`tab-row-${row.label}`}>
                        <button
                            onClick={() => onToggle(row.key)}
                            className="w-full flex items-center justify-between py-3.5 text-left transition-colors hover:bg-gray-50 px-2 -mx-2 rounded-md"
                            style={{
                                backgroundColor: isOpen
                                    ? "#FAFAFA"
                                    : "transparent",
                                borderLeft: isOpen
                                    ? `3px solid ${COLORS.red}`
                                    : "3px solid transparent",
                            }}
                        >
                            <span className="flex items-center gap-2">
                                <span
                                    className="text-xs transition-transform"
                                    style={{
                                        color: COLORS.gray,
                                        transform: isOpen
                                            ? "rotate(90deg)"
                                            : "rotate(0deg)",
                                    }}
                                >
                                    ▸
                                </span>
                                <span
                                    className="text-sm font-medium"
                                    style={{ color: COLORS.black }}
                                >
                                    {row.label}
                                </span>
                            </span>
                            <div className="flex items-center gap-3">
                                {row.overallGap !== null ? (
                                    <>
                                        <div
                                            className="w-28 h-1.5 rounded-full overflow-hidden"
                                            style={{
                                                backgroundColor: "#F3F4F6",
                                            }}
                                        >
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${100 - row.overallGap}%`,
                                                    backgroundColor: gapColor(
                                                        row.overallGap,
                                                    ),
                                                }}
                                            />
                                        </div>
                                        <span
                                            className="text-sm w-10 text-right"
                                            style={{ color: COLORS.gray }}
                                        >
                                            {100 - row.overallGap}%
                                        </span>
                                    </>
                                ) : (
                                    <span
                                        className="text-sm"
                                        style={{ color: COLORS.gray }}
                                    >
                                        —
                                    </span>
                                )}
                            </div>
                        </button>
                        {isOpen && (
                            <div className="pb-5 pt-1 px-2 -mx-2">
                                <TabDetail tabKey={row.key} data={data} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Turns a ReviewFlag's field ("email", or "experience[0].startDate") into
// something readable — see the model comment in prisma/schema.prisma for
// the format.
function humanizeReviewField(field: string): string {
    const spacer = (s: string) =>
        s
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/^./, (c) => c.toUpperCase())
            // "nationalId" -> "National Id" otherwise — schema camelCases
            // only the leading letter of "Id", unlike "companyID".
            .replace(/\bId\b/, "ID");
    const match = field.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
    if (!match) return spacer(field);
    const [, relation, index, subField] = match;
    const relationLabel =
        relation === "performanceReviews" ? "Performance review" : spacer(relation).replace(/s$/, "");
    return `${relationLabel} ${Number(index) + 1} — ${spacer(subField)}`;
}

// The batch importer never drops an invalid value — it writes it as-is and
// records why here, so admins fix real records instead of losing them.
function FlaggedFieldsList({ flags }: { flags: FlaggedField[] }) {
    const { authFetch } = useAuth();
    const router = useRouter();
    const [resolvingId, setResolvingId] = useState<number | null>(null);

    const resolve = async (id: number) => {
        setResolvingId(id);
        try {
            const res = await authFetch(`/api/review-flags/${id}`, { method: "PATCH" });
            if (res.ok) router.refresh();
        } finally {
            setResolvingId(null);
        }
    };

    if (flags.length === 0) {
        return (
            <p className="text-sm" style={{ color: COLORS.gray }}>
                No validation flags right now — nothing the batch importer had
                to guess at.
            </p>
        );
    }

    return (
        <div>
            {flags.map((flag) => (
                <div
                    key={flag.id}
                    className="flex items-center gap-3 py-2.5 border-b last:border-b-0"
                    style={{ borderColor: "#F3F4F6" }}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: COLORS.black }}>
                            {flag.employeeName}{" "}
                            <span style={{ color: COLORS.gray }}>
                                · {humanizeReviewField(flag.field)}
                            </span>
                        </p>
                        <p className="text-xs" style={{ color: "#B45309" }}>
                            {flag.reason} — currently &quot;{flag.rawValue}&quot;
                        </p>
                    </div>
                    <a
                        href={`/app/records?highlight=${flag.employeeId}`}
                        className="text-xs font-medium shrink-0 underline underline-offset-2 transition-colors hover:text-red-800"
                        style={{ color: COLORS.red }}
                    >
                        View record
                    </a>
                    <button
                        onClick={() => resolve(flag.id)}
                        disabled={resolvingId === flag.id}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0"
                        style={{ borderColor: COLORS.border, color: COLORS.black }}
                    >
                        {resolvingId === flag.id ? "…" : "Mark reviewed"}
                    </button>
                </div>
            ))}
        </div>
    );
}

export default function DashboardView({ data }: { data: DashboardData }) {
    const [expandedTab, setExpandedTab] = useState(() =>
        getDefaultTab(data.tabOverview),
    );

    const handleToggle = (key: string) => {
        setExpandedTab((current) => (current === key ? "" : key));
    };

    // Clicking a row in the Top Issues list opens the matching tab and
    // scrolls it into view, so the ranked list is actually navigable.
    const handleJumpToArea = (area: string) => {
        const row = data.tabOverview.find(
            (r) =>
                r.label === area || (area === "Skills" && r.key === "skills"),
        );
        if (!row) return;
        setExpandedTab(row.key);
        requestAnimationFrame(() => {
            document
                .getElementById(`tab-row-${row.label}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    };

    return (
        <div className="p-8 space-y-6">
            <div>
                <h1
                    className="text-xl font-semibold"
                    style={{ color: COLORS.black }}
                >
                    Records <span style={{ color: COLORS.red }}>Health</span>
                </h1>
                <p className="text-sm" style={{ color: COLORS.gray }}>
                    Data completeness across all employees — live from the
                    database
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total employees" value={data.totalEmployees} />
                <StatCard
                    label="Overall completion"
                    value={`${data.overallCompletion}%`}
                />
                <StatCard
                    label="Records needing review"
                    value={data.needsReviewCount}
                    accent
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <SectionCard
                        title="Completeness distribution"
                        subtitle="How many employees fall into each completeness band"
                    >
                        <CompletionDistributionChart
                            buckets={data.completionDistribution}
                        />
                    </SectionCard>
                </div>
                <SectionCard
                    title="Record status"
                    subtitle="Basic info completeness across all employees"
                >
                    <RecordStatusBar status={data.recordStatus} />
                </SectionCard>
            </div>

            <SectionCard
                title="Top issues"
                subtitle="Worst fields across every tab, ranked — click one to jump to it"
            >
                <TopIssuesList
                    issues={data.topIssues}
                    onJump={handleJumpToArea}
                />
            </SectionCard>

            <SectionCard
                title="Employees needing attention"
                subtitle="Ranked by number of missing basic-info fields"
            >
                <AttentionTable employees={data.attentionNeeded} />
            </SectionCard>

            <SectionCard
                title="Tab health overview"
                subtitle="Click a tab to expand field-level detail"
            >
                <TabOverviewList
                    rows={data.tabOverview}
                    expanded={expandedTab}
                    onToggle={handleToggle}
                    data={data}
                />
            </SectionCard>

            <SectionCard
                title="Flagged for review"
                subtitle="Fields the validator couldn't confidently accept or reject"
            >
                <FlaggedFieldsList flags={data.flaggedFields} />
            </SectionCard>
        </div>
    );
}
