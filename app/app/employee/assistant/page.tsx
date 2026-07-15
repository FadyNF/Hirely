// app/app/employee/assistant/page.tsx
//
// The scoped Assistant chat, as its own route sibling to /app/employee
// (My Profile) — see components/layout/Sidebar.tsx's employee nav. Same
// role gate as the profile page: a non-employee (admin/root) who
// navigates here directly gets redirected to /app.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCallerContextFromServerCookies } from "@/lib/requireAuth";
import EmployeeAssistantView from "@/components/employee/EmployeeAssistantView";

export const metadata: Metadata = { title: "Assistant" };

export default async function EmployeeAssistantPage() {
  const caller = await requireCallerContextFromServerCookies();
  if (!caller) redirect("/login");
  if (caller.role !== "employee") redirect("/app");

  return <EmployeeAssistantView />;
}
