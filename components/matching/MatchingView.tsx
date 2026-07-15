"use client";

import { useState } from "react";
import { useAuth } from "@/context";
import type { SerializedEmployee } from "@/lib/employees";
import EmployeeDetailModal from "@/components/shared/EmployeeDetailModal";

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
  matchScore: number;
  positives: string[];
  negatives: string[];
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

  // --- PDF upload state ---
  const [extracting, setExtracting] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // --- Candidate detail popup state (read-only — the same view-only modal
  // Records uses; a card click here never opens the editable form) ---
  const [detailEmployee, setDetailEmployee] = useState<SerializedEmployee | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const handleCardClick = async (employeeId: number) => {
    setDetailError(null);
    setDetailLoadingId(employeeId);
    try {
      const res = await authFetch(`/api/chatbot/employee/${employeeId}`);
      const data = await res.json();
      if (!res.ok) {
        setDetailError(data.error || "Could not load this employee's record.");
        return;
      }
      setDetailEmployee(data.employee);
    } catch {
      setDetailError("Network error while loading the record.");
    } finally {
      setDetailLoadingId(null);
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file again later
    if (!file) return;

    setPdfError(null);
    setExtracting(true);
    setPdfFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await authFetch("/api/job-matching/extract-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setPdfError(data.error || "Could not extract text from PDF.");
        return;
      }

      setJobDescription(data.text || "");
    } catch {
      setPdfError("Network error while extracting PDF.");
    } finally {
      setExtracting(false);
    }
  };

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
        {/* --- Label row + PDF upload button --- */}
        <div className="mb-4 flex items-center justify-between">
          <label
            className="text-sm font-semibold"
            style={{ color: COLORS.black }}
          >
            Job Description
          </label>

          <div className="flex items-center gap-2">
            <label
              className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
              style={{ borderColor: COLORS.border, color: COLORS.black }}
            >
              {extracting ? "Extracting..." : "Upload PDF"}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={extracting}
                onChange={handlePdfUpload}
              />
            </label>
            {pdfFileName && !extracting && (
              <span className="text-xs" style={{ color: COLORS.gray }}>
                {pdfFileName}
              </span>
            )}
          </div>
        </div>

        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste a job description here — responsibilities, required skills, qualifications... (or upload a PDF above)"
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
            disabled={loading || extracting || !jobDescription.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 hover:shadow-md disabled:opacity-50"
            style={{ background: COLORS.red }}
          >
            {loading ? "Matching..." : "Find Matches"}
          </button>
        </div>
      </div>

      {detailError && (
        <div
          className="rounded-xl border px-4 py-3 mb-6 text-sm"
          style={{
            borderColor: "#FCA5A5",
            background: COLORS.lightRed,
            color: "#991B1B",
          }}
        >
          {detailError}
        </div>
      )}

      {pdfError && (
        <div
          className="rounded-xl border px-4 py-3 mb-6 text-sm"
          style={{
            borderColor: "#FCA5A5",
            background: COLORS.lightRed,
            color: "#991B1B",
          }}
        >
          {pdfError}
        </div>
      )}

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
                  onClick={() => handleCardClick(match.employeeId)}
                  className="rounded-xl border bg-white p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
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
                      {detailLoadingId === match.employeeId ? (
                        <span
                          className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                          style={{ borderColor: idx < 3 ? COLORS.red : COLORS.gray, borderTopColor: "transparent" }}
                        />
                      ) : (
                        idx + 1
                      )}
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

                    {typeof match.matchScore === "number" && (
                      <div
                        className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          background: match.matchScore >= 60 ? "#DCFCE7" : match.matchScore >= 35 ? "#FEF9C3" : COLORS.lightRed,
                          color: match.matchScore >= 60 ? "#166534" : match.matchScore >= 35 ? "#854D0E" : "#991B1B",
                        }}
                      >
                        {match.matchScore}% match
                      </div>
                    )}
                  </div>

                  {match.text && (
                    <p
                      className="text-xs mt-3 leading-relaxed line-clamp-2"
                      style={{ color: COLORS.gray }}
                    >
                      {match.text}
                    </p>
                  )}

                  {((match.positives?.length ?? 0) > 0 || (match.negatives?.length ?? 0) > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {match.positives.map((p, i) => (
                        <span
                          key={`p-${i}`}
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={{ background: "#DCFCE7", color: "#166534" }}
                        >
                          + {p}
                        </span>
                      ))}
                      {match.negatives.map((n, i) => (
                        <span
                          key={`n-${i}`}
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={{ background: COLORS.lightRed, color: "#991B1B" }}
                        >
                          − {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detailEmployee && (
        <EmployeeDetailModal
          employee={detailEmployee}
          onClose={() => setDetailEmployee(null)}
        />
      )}
    </div>
  );
}
