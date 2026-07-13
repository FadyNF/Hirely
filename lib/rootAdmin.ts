// lib/rootAdmin.ts
//
// The root admin — the one account that can approve/decline pending admin
// signups and triage support requests — is configured entirely through env
// vars (ADMIN_EMAIL, ADMIN_PASS) rather than seeded, so that
// changing those two values on the server is enough to rotate credentials
// without touching the DB. There's exactly one root at a time (whichever
// email is currently in the env), and no way to promote a regular admin
// through the UI — that would defeat the point of having a hardcoded root.

import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

// Returns true if this email matches the root env config. Used both to
// decide whether to seed on login and to short-circuit "existing account?"
// checks in the register route — the root can't sign up through the UI.
export function isRootEmail(email: string): boolean {
  const rootEmail = process.env.ADMIN_EMAIL;
  if (!rootEmail) return false;
  return normalizeEmail(email) === normalizeEmail(rootEmail);
}

// Idempotently makes sure the DB has a row matching the env-configured
// root admin — creates it if missing, resets password/role/approved on
// every call so env-var changes take effect on the next login attempt
// (no server restart or seed script needed). Safe to call every login;
// bcrypt.hash is the only real cost.
//
// Called from /api/auth/login BEFORE the credential check, so the
// credential check itself compares against the freshly-hashed env
// password and doesn't need any special-casing.
export async function ensureRootAdminFromEnv(): Promise<void> {
  const rootEmail = process.env.ADMIN_EMAIL;
  const rootPassword = process.env.ADMIN_PASS;
  if (!rootEmail || !rootPassword) return; // no env config, no root — every user is a regular admin

  const email = normalizeEmail(rootEmail);
  const passwordHash = await bcrypt.hash(rootPassword, 10);
  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "root",
      approved: true,
      emailVerified: true,
    },
    create: {
      email,
      passwordHash,
      role: "root",
      approved: true,
      // The root is a bootstrap identity, not a real signup flow — no OTP
      // to verify against, so it's emailVerified from the start.
      emailVerified: true,
    },
  });
}
