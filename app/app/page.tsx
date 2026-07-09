// app/app/page.tsx
//
// Notice: no "use client" at the top, and the function itself is `async`.
// This is a Server Component — it runs on the server, queries Prisma
// DIRECTLY (no fetch, no API route needed just to read data), and sends
// the finished HTML + data to the browser. DashboardView (a separate
// Client Component) only handles the interactive tab-switching on top.

import { getDashboardData } from "@/lib/employeeStats";
import DashboardView from "@/components/dashboard/DashboardView";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardView data={data} />;
}