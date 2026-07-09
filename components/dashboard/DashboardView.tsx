'use client';

// components/dashboard/DashboardView.tsx
//
// This is the ONLY client-side piece of the dashboard — it only exists
// because tab-switching needs useState (interactivity Server Components
// can't do). Every number it displays was already computed server-side
// in lib/employeeStats.ts and handed to this component as props; this
// file does zero data-fetching or math of its own.

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import type { DashboardData, FieldGap } from '@/lib/employeeStats';

const COLORS = {
  red: '#DC2626',
  black: '#111111',
  gray: '#6B7280',
  pinkBg: '#FEE2E2',
  border: '#E5E5E5',
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

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: COLORS.border }}>
      <p className="text-sm mb-1.5" style={{ color: COLORS.gray }}>{label}</p>
      <p className="text-3xl font-semibold" style={{ color: accent ? COLORS.red : COLORS.black }}>{value}</p>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-6" style={{ borderColor: COLORS.border }}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.black }}>{title}</h2>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: COLORS.gray }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function GapBarChart({ data }: { data: FieldGap[] }) {
  const sorted = [...data].sort((a, b) => b.gapPercent - a.gapPercent);
  return (
    <ResponsiveContainer width="100%" height={Math.max(sorted.length * 34, 120)}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.border} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12, fill: COLORS.gray }} />
        <YAxis type="category" dataKey="field" width={120} tick={{ fontSize: 12, fill: COLORS.black }} />
        <Tooltip formatter={(value) => [`${value}% missing`, '']} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: COLORS.border }} />
        <Bar dataKey="gapPercent" radius={[0, 4, 4, 0]} barSize={16}>
          {sorted.map((entry, index) => (
            <Cell key={index} fill={gapColor(entry.gapPercent)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TabOverviewList({
  rows, selected, onSelect,
}: {
  rows: DashboardData['tabOverview'];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="divide-y" style={{ borderColor: COLORS.border }}>
      {rows.map((row) => (
        <button
          key={row.key}
          onClick={() => onSelect(row.key)}
          className="w-full flex items-center justify-between py-3.5 text-left transition-colors hover:bg-gray-50 px-2 -mx-2 rounded-md"
          style={{
            backgroundColor: selected === row.key ? '#FAFAFA' : 'transparent',
            borderLeft: selected === row.key ? `3px solid ${COLORS.red}` : '3px solid transparent',
          }}
        >
          <span className="text-sm font-medium" style={{ color: COLORS.black }}>{row.label}</span>
          <div className="flex items-center gap-3">
            {row.overallGap !== null ? (
              <>
                <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#F3F4F6' }}>
                  <div className="h-full rounded-full" style={{ width: `${100 - row.overallGap}%`, backgroundColor: gapColor(row.overallGap) }} />
                </div>
                <span className="text-sm w-10 text-right" style={{ color: COLORS.gray }}>{100 - row.overallGap}%</span>
              </>
            ) : (
              <span className="text-sm" style={{ color: COLORS.gray }}>—</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function DashboardView({ data }: { data: DashboardData }) {
  const [selectedTab, setSelectedTab] = useState('basicInfo');

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: COLORS.black }}>
          Records <span style={{ color: COLORS.red }}>Health</span>
        </h1>
        <p className="text-sm" style={{ color: COLORS.gray }}>
          Data completeness across all employees — live from the database
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total employees" value={data.totalEmployees} />
        <StatCard label="Overall completion" value={`${data.overallCompletion}%`} />
        <StatCard label="Records needing review" value={data.needsReviewCount} accent />
      </div>

      <SectionCard title="Tab health overview" subtitle="Click a tab to see field-level detail">
        <TabOverviewList rows={data.tabOverview} selected={selectedTab} onSelect={setSelectedTab} />
      </SectionCard>

      {selectedTab === 'basicInfo' && (
        <SectionCard title="Missing data by field" subtitle="Percentage of employees missing each attribute">
          <GapBarChart data={data.basicInfo.fieldCompletion} />
        </SectionCard>
      )}

      {['experience', 'education', 'certificates'].includes(selectedTab) && (
        <div className="space-y-4">
          <SectionCard title={`${data.tabOverview.find((r) => r.key === selectedTab)?.label} coverage`}>
            <p className="text-3xl font-semibold" style={{ color: COLORS.black }}>
              {data.multiTabs[selectedTab].coverage}%
            </p>
            <p className="text-xs mt-1" style={{ color: COLORS.gray }}>
              {data.multiTabs[selectedTab].totalEntries} total entries across all employees
            </p>
          </SectionCard>
          <SectionCard title="Field completeness within existing entries" subtitle="Optional fields excluded">
            {/* This note exists because coverage % and field-completeness %
                answer two unrelated questions, and showing them stacked
                without explanation reads as a contradiction otherwise:
                coverage asks "how many employees have ANY entry at all,"
                while the chart below only asks "of entries that DO exist,
                are they filled in." An employee with zero entries isn't
                counted as "missing fields" here — there's no entry to
                check in the first place. */}
            <p className="text-xs mb-4 px-3 py-2.5 rounded-lg" style={{ backgroundColor: '#F9FAFB', color: COLORS.gray }}>
              {data.multiTabs[selectedTab].coverage}% of employees have added at least one entry here.
              The remaining {100 - data.multiTabs[selectedTab].coverage}% have none — they don&apos;t
              appear in the chart below, since there&apos;s nothing yet to check on an entry that
              doesn&apos;t exist. This chart only covers the {data.multiTabs[selectedTab].totalEntries}{' '}
              entries that already exist.
            </p>
            {data.multiTabs[selectedTab].totalEntries > 0 ? (
              <GapBarChart data={data.multiTabs[selectedTab].fieldCompletion} />
            ) : (
              <p className="text-sm" style={{ color: COLORS.gray }}>No entries yet to evaluate.</p>
            )}
          </SectionCard>
        </div>
      )}

      {selectedTab === 'skills' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.skills.map((cat) => (
            <SectionCard key={cat.category} title={cat.label} subtitle="Coverage and average proficiency">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl font-semibold" style={{ color: COLORS.black }}>{cat.coverage}%</span>
                <span className="text-sm" style={{ color: COLORS.gray }}>of employees have entries</span>
              </div>
              <p className="text-sm" style={{ color: COLORS.gray }}>
                Average proficiency:{' '}
                <span className="font-medium" style={{ color: COLORS.black }}>
                  {cat.avgProficiency !== null ? `${cat.avgProficiency}%` : '—'}
                </span>
              </p>
            </SectionCard>
          ))}
        </div>
      )}

      {selectedTab === 'performance' && (
        <SectionCard title="Performance" subtitle="Manager-assigned ratings and reviews">
          <p className="text-sm" style={{ color: COLORS.gray }}>
            No data model defined yet for this tab.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Flagged for review" subtitle="Fields the validator couldn't confidently accept or reject">
        <p className="text-sm" style={{ color: COLORS.gray }}>
          No validation flags yet — this fills in once the chatbot begins reviewing entries.
        </p>
      </SectionCard>
    </div>
  );
}