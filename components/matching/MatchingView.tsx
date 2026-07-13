"use client";

import { useState } from "react";
import { useAuth } from "@/context";

const COLORS = {
  red: "#DC2626",
  black: "#111111",
  gray: "#6B7280",
  border: "#E5E5E5",
  lightRed: "#FEE2E2",
};

interface MatchResult {
  employeeId: number;
  text: string;
  employee: {
    id: number;
    fullName: string;
    email: string | null;
    position: string | null;
    workLocation: string | null;
    nationality: string | null;
  } | null;
}

export default function MatchingView() {
  const { authFetch } = useAuth();
  const [jobDescription, setJobDescription] = useState("");
  const [topN, setTopN] = useState(10);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleMatch = async () => {
    if (!jobDescription.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);
    try {
      const res = await authFetch("/api/job-matching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobDescription: jobDescription.trim(),
          topN,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      setResults(data.results || []);
    } catch {
      setError("Network error — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: COLORS.black }}>
          Job Matching
        </h1>
        <p className="text-sm mt-1" style={{ color: COLORS.gray }}>
          Find the best employee matches for a job description using AI-powered
          hybrid search.
        </p>
      </div>

      <div
        className="rounded-xl border bg-white p-6 mb-6"
        style={{ borderColor: COLORS.border }}
      >
        <div className="mb-4">
          <label
            className="text-sm font-semibold"
            style={{ color: COLORS.black }}
          >
            Job Description
          </label>
        </div>

        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste a job description here — responsibilities, required skills, qualifications..."
          rows={6}
          className="w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none"
          style={{
            borderColor: COLORS.border,
            color: COLORS.black,
          }}
        />

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <label
              className="text-xs font-medium"
              style={{ color: COLORS.gray }}
            >
              Show top
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={topN}
              onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 10))}
              className="w-16 rounded-lg border px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2"
              style={{ borderColor: COLORS.border }}
            />
            <span className="text-xs" style={{ color: COLORS.gray }}>
              employees
            </span>
          </div>

          <button
            onClick={handleMatch}
            disabled={loading || !jobDescription.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:shadow-md disabled:opacity-50"
            style={{ background: COLORS.red }}
          >
            {loading ? "Matching..." : "Find Matches"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl border px-4 py-3 mb-6 text-sm"
          style={{
            borderColor: "#FCA5A5",
            background: COLORS.lightRed,
            color: "#991B1B",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div
            className="w-8 h-8 rounded-full border-2 border-gray-200 animate-spin"
            style={{ borderTopColor: COLORS.red }}
          />
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <div
          className="rounded-xl border bg-white p-8 text-center"
          style={{ borderColor: COLORS.border }}
        >
          <p className="text-sm" style={{ color: COLORS.gray }}>
            No matches found. Try adjusting the job description.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-4" style={{ color: COLORS.gray }}>
            {results.length} match{results.length === 1 ? "" : "es"} found
          </p>
          <div className="space-y-3">
            {results.map((match, idx) => {
              const emp = match.employee;
              return (
                <div
                  key={match.employeeId}
                  className="rounded-xl border bg-white p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                  style={{ borderColor: COLORS.border }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{
                        background: idx < 3 ? COLORS.lightRed : "#F3F4F6",
                        color: idx < 3 ? COLORS.red : COLORS.gray,
                      }}
                    >
                      {idx + 1}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className="font-semibold text-sm truncate"
                        style={{ color: COLORS.black }}
                      >
                        {emp?.fullName ?? `Employee #${match.employeeId}`}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {emp?.position && (
                          <span className="text-xs" style={{ color: COLORS.gray }}>
                            {emp.position}
                          </span>
                        )}
                        {emp?.workLocation && (
                          <span className="text-xs" style={{ color: COLORS.gray }}>
                            {emp.workLocation}
                          </span>
                        )}
                        {emp?.email && (
                          <span className="text-xs" style={{ color: COLORS.gray }}>
                            {emp.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {match.text && (
                    <p
                      className="text-xs mt-3 leading-relaxed line-clamp-2"
                      style={{ color: COLORS.gray }}
                    >
                      {match.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
