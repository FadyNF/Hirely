// app/app/page.tsx
//
// Notice: no "use client" at the top, and the function itself is `async`.
// This is a Server Component — it runs on the server, queries Prisma
// DIRECTLY (no fetch, no API route needed just to read data), and sends
// the finished HTML + data to the browser. DashboardView (a separate
// Client Component) only handles the interactive tab-switching on top.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUserIdFromServerCookies } from "@/lib/requireAuth";
import { getDashboardData } from "@/lib/employeeStats";
import DashboardView from "@/components/dashboard/DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // The REAL auth check — this runs before any data is fetched, unlike
  // the client-side redirect in app/app/layout.tsx, which only fires
  // after this page's data has already been rendered and sent.
  const userId = await requireUserIdFromServerCookies();
  if (!userId) redirect("/login");

  const data = await getDashboardData();
  return <DashboardView data={data} />;
}