// app/app/employee/page.tsx
//
// Self-service view: an "employee"-role user's own record + a chatbot
// scoped to just that record. Gated the same way app/app/admin/page.tsx
// gates root — a non-employee (admin/root) who navigates here directly
// gets redirected to /app rather than shown an error page.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireCallerContextFromServerCookies } from "@/lib/requireAuth";
import EmployeeSelfServiceView from "@/components/employee/EmployeeSelfServiceView";

export const metadata: Metadata = { title: "My Profile" };

export default async function EmployeeSelfServicePage() {
  const caller = await requireCallerContextFromServerCookies();
  if (!caller) redirect("/login");
  if (caller.role !== "employee") redirect("/app");

  return <EmployeeSelfServiceView />;
}
