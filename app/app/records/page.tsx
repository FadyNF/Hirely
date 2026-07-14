// app/app/records/page.tsx

import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireCallerContextFromServerCookies } from "@/lib/requireAuth";
import { getAllEmployees } from "@/lib/employees";
import RecordsView from "@/components/records/RecordsView";

export const metadata: Metadata = { title: "Records" };

export default async function RecordsPage() {
  // The REAL auth check — runs before any data is fetched. getAllEmployees()
  // returns every employee company-wide, so an employee-role caller must be
  // turned away here, before the fetch — not just redirected client-side
  // afterward (see app/app/layout.tsx's role effect).
  const caller = await requireCallerContextFromServerCookies();
  if (!caller) redirect("/login");
  if (caller.role === "employee") redirect("/app/employee");

  const employees = await getAllEmployees();

  // Strip createdAt (a Date object) before handing this to the Client
  // Component — only plain serializable data can cross that boundary.
  const serialized = employees.map(({ createdAt, ...rest }) => rest);

  // RecordsView reads ?highlight= via useSearchParams (to deep-link from the
  // Dashboard's "Flagged for review" list) — Next.js requires that behind a
  // Suspense boundary.
  return (
    <Suspense>
      <RecordsView employees={serialized} />
    </Suspense>
  );
}