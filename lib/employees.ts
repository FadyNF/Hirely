// lib/employees.ts
//
// Single shared query for "every employee with all their related data."
// Both the Dashboard (for stats) and Records (for display) import this,
// instead of each writing their own slightly-different version of the
// same Prisma query.

import { prisma } from "./prisma";

export async function getAllEmployees() {
  return prisma.employee.findMany({
    include: {
      experience: true,
      education: true,
      certificates: true,
      skills: true,
      performanceReviews: true,
    },
    orderBy: { id: "asc" },
  });
}

// The full shape, including things like `createdAt` (a real Date object)
// that can't be passed directly from a Server Component to a Client
// Component — Next.js only allows plain serializable data across that
// boundary, the same way you can't put a live animal in an envelope.
export type EmployeeWithRelations = Awaited<ReturnType<typeof getAllEmployees>>[number];

// The version actually safe to hand to a Client Component: same shape,
// minus the one field (createdAt) that isn't serializable.
export type SerializedEmployee = Omit<EmployeeWithRelations, "createdAt">;