// lib/roles.ts
//
// User.role is stored as a plain TEXT column (see prisma/schema.prisma) —
// SQLite/Prisma have no enum here — so this union is the only thing giving
// call sites compile-time exhaustiveness instead of bare string literals.

export type Role = "employee" | "admin" | "root";
