// app/app/admin/support-requests/page.tsx
//
// Root-only: every support request, newest-open-first, paginated. Split
// out of the old single-page AdminConsoleView.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listSupportRequestsForAdmin } from "@/lib/supportRequests";
import { requireRootUserIdFromServerCookies } from "@/lib/requireAuth";
import AdminSubNav from "@/components/admin/AdminSubNav";
import SupportRequestsView, { type SupportRequestSummary } from "@/components/admin/SupportRequestsView";

export const metadata: Metadata = { title: "Support Requests" };

export default async function AdminSupportRequestsPage() {
  const rootId = await requireRootUserIdFromServerCookies();
  if (!rootId) redirect("/app");

  const supportRequests = listSupportRequestsForAdmin();
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
          <h2 className="text-lg font-semibold" style={{ color: "#111111" }}>Support requests</h2>
          <p className="text-sm mt-0.5" style={{ color: "#6B7280" }}>
            Issues and requests submitted from the app
          </p>
        </div>
        <SupportRequestsView requests={requests} />
      </div>
    </div>
  );
}
