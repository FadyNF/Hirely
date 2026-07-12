// app/app/records/page.tsx

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUserIdFromServerCookies } from "@/lib/requireAuth";
import { getAllEmployees } from "@/lib/employees";
import RecordsView from "@/components/records/RecordsView";

export default async function RecordsPage() {
  // The REAL auth check — runs before any data is fetched.
  const userId = await requireUserIdFromServerCookies();
  if (!userId) redirect("/login");

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