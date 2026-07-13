// app/app/admin/page.tsx
//
// Root-only console: pending admin signup requests + open support/issue
// submissions. Server Component that hard-checks the role via
// requireRootUserIdFromServerCookies — a plain admin who guesses this
// URL gets redirected the same way a logged-out visitor would.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRootUserIdFromServerCookies } from "@/lib/requireAuth";
import AdminConsoleView, { type PendingAdmin, type SupportRequestSummary } from "@/components/admin/AdminConsoleView";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const rootId = await requireRootUserIdFromServerCookies();
  // Send non-roots to /app rather than /login — they're authenticated,
  // just not authorized. /login would loop right back here after the
  // AuthProvider hydrated, which is a worse UX than a plain redirect.
  if (!rootId) redirect("/app");

  const [pendingUsers, supportRequests] = await Promise.all([
    prisma.user.findMany({
      where: { approved: false, role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, createdAt: true, emailVerified: true },
    }),
    prisma.supportRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        type: true,
        subject: true,
        message: true,
        status: true,
        submittedByEmail: true,
        submittedById: true,
        createdAt: true,
      },
    }),
  ]);

  // Serialize Date -> ISO string for the Client Component boundary.
  const pending: PendingAdmin[] = pendingUsers.map((u) => ({
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    createdAtIso: u.createdAt.toISOString(),
  }));
  const requests: SupportRequestSummary[] = supportRequests.map((r) => ({
    id: r.id,
    type: r.type,
    subject: r.subject,
    message: r.message,
    status: r.status,
    submittedByEmail: r.submittedByEmail,
    submittedById: r.submittedById,
    createdAtIso: r.createdAt.toISOString(),
  }));

  return <AdminConsoleView pending={pending} requests={requests} />;
}
