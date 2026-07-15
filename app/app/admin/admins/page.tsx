// app/app/admin/admins/page.tsx
//
// Root-only: every currently-promoted admin, with a Demote action.
// Symmetric counterpart to /app/admin's Promote list.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findAdminUsers } from "@/lib/users";
import { requireRootUserIdFromServerCookies } from "@/lib/requireAuth";
import AdminSubNav from "@/components/admin/AdminSubNav";
import AdminsSection from "@/components/admin/AdminsSection";
import type { RoleUser } from "@/components/admin/UserRoleActionList";

export const metadata: Metadata = { title: "Admins" };

export default async function AdminsPage() {
  const rootId = await requireRootUserIdFromServerCookies();
  if (!rootId) redirect("/app");

  const adminUsers = findAdminUsers();
  const users: RoleUser[] = adminUsers.map((u) => ({
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
          <h2 className="text-lg font-semibold" style={{ color: "#111111" }}>Admins</h2>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Every promoted admin — demote back to a plain employee account if access is no longer needed
          </p>
        </div>
        <AdminsSection users={users} />
      </div>
    </div>
  );
}
