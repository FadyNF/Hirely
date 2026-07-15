// app/app/admin/page.tsx
//
// Root-only console index: promote employees to admin. Server Component
// that hard-checks the role via requireRootUserIdFromServerCookies — a
// plain admin/employee who guesses this URL gets redirected the same way
// a logged-out visitor would. Split out of the old single-page
// AdminConsoleView into three routes (this one, /admins, /support-requests)
// so each list can be paginated independently instead of one long scroll.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findEmployeeUsers } from "@/lib/users";
import { requireRootUserIdFromServerCookies } from "@/lib/requireAuth";
import AdminSubNav from "@/components/admin/AdminSubNav";
import PromoteToAdminSection from "@/components/admin/PromoteToAdminSection";
import type { RoleUser } from "@/components/admin/UserRoleActionList";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const rootId = await requireRootUserIdFromServerCookies();
  // Send non-roots to /app rather than /login — they're authenticated,
  // just not authorized. /login would loop right back here after the
  // AuthProvider hydrated, which is a worse UX than a plain redirect.
  if (!rootId) redirect("/app");

  const employeeUsers = findEmployeeUsers();
  const users: RoleUser[] = employeeUsers.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    createdAtIso: u.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "#111111" }}>
          Admin <span style={{ color: "#DC2626" }}>Console</span>
        </h1>
        <p className="text-sm" style={{ color: "#6B7280" }}>
          Promote employees, manage admins, and respond to support requests
        </p>
      </div>
      <AdminSubNav />
      <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#E5E5E5" }}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold" style={{ color: "#111111" }}>Promote to admin</h2>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Every self-service employee account — pick who should also get admin access
          </p>
        </div>
        <PromoteToAdminSection users={users} />
      </div>
    </div>
  );
}
