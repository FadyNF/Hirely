// app/app/admin/page.tsx
//
// Root-only console: promote employees to admin + open support/issue
// submissions. Server Component that hard-checks the role via
// requireRootUserIdFromServerCookies — a plain admin/employee who guesses
// this URL gets redirected the same way a logged-out visitor would.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findEmployeeUsers } from "@/lib/users";
import { listSupportRequestsForAdmin } from "@/lib/supportRequests";
import { requireRootUserIdFromServerCookies } from "@/lib/requireAuth";
import AdminConsoleView, { type EmployeeUser, type SupportRequestSummary } from "@/components/admin/AdminConsoleView";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const rootId = await requireRootUserIdFromServerCookies();
  // Send non-roots to /app rather than /login — they're authenticated,
  // just not authorized. /login would loop right back here after the
  // AuthProvider hydrated, which is a worse UX than a plain redirect.
  if (!rootId) redirect("/app");

  const employeeUsers = findEmployeeUsers();
  const supportRequests = listSupportRequestsForAdmin();

  // Serialize Date -> ISO string for the Client Component boundary.
  const pending: EmployeeUser[] = employeeUsers.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    createdAtIso: u.createdAt.toISOString(),
  }));
  const requests: SupportRequestSummary[] = supportRequests.map((r) => ({
    id: r.id,
    type: r.type,
    subject: r.subject,
    message: r.message,
    status: r.status,
    rootReply: r.rootReply,
    submittedByEmail: r.submittedByEmail,
    submittedById: r.submittedById,
    createdAtIso: r.createdAt.toISOString(),
  }));

  return <AdminConsoleView pending={pending} requests={requests} />;
}
