// app/api/auth/register/route.ts
//
// This file's LOCATION defines its URL: because it lives at
// app/api/auth/register/route.ts, Next.js automatically serves it at
// the URL path "/api/auth/register" — no separate router config needed,
// same idea as app/login/page.tsx becoming the "/login" page.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/mailer";
import { findUserByEmail, createUser, deleteUser } from "@/lib/users";
import { createBlankEmployeeForUser, deleteEmployee } from "@/lib/employees";
import { runInTransaction } from "@/lib/db";
import { isRootEmail } from "@/lib/rootAdmin";

// Generates a random 6-digit code, e.g. "482913".
// Math.random() gives a decimal like 0.4829134..., multiplying by
// 900000 and adding 100000 guarantees a 6-digit number every time
// (never starts with a 0, never has fewer than 6 digits).
function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST handler — this function specifically runs for POST requests
// to this route. Next.js looks for a function named exactly "POST"
// (or GET, PUT, DELETE, etc.) and wires it up automatically.
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // ---- Basic validation ----
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 } // 400 = "Bad Request" — the client sent something wrong
      );
    }

    // The root admin's email is env-configured, not signup-registered —
    // if someone tries to sign up using it, refuse rather than silently
    // create a pending row that could never be approved (root approving
    // themselves would be nonsense) and would collide with the root row
    // the next time env-seed ran.
    if (isRootEmail(email)) {
      return NextResponse.json(
        { error: "This email address is reserved. Please use a different one." },
        { status: 409 }
      );
    }

    // ---- Check if this email is already registered ----
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 } // 409 = "Conflict" — the resource already exists
      );
    }

    // ---- Hash the password before storing it ----
    // The "10" is the hashing "cost factor" — higher is slower but more
    // secure. 10 is the standard, sensible default for this.
    const passwordHash = await bcrypt.hash(password, 10);

    // ---- Generate the OTP code and its expiry ----
    const verificationCode = generateOtpCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // ---- Create the user AND their linked (blank) Employee record, then
    // send the email ----
    // Every fresh signup lands directly in the self-service Employee view
    // (see CLAUDE.md's onboarding notes) — no more "pending admin
    // approval" default. That view needs an Employee row to edit from
    // the start, so one is created here, in the same transaction as the
    // User row, linked via Employee.userId. better-sqlite3 transactions
    // are synchronous, so this can't be one db.transaction() wrapping an
    // awaited email send the way Prisma's $transaction could. Instead:
    // insert first, then send — if sendVerificationEmail throws (bad SMTP
    // creds, network blip, Gmail rate limit), manually delete both
    // just-created rows so a failed send doesn't leave a permanent,
    // half-created account behind (which would make every future
    // registration attempt with this email hit the "already exists" check
    // with no way to actually finish signing up).
    const created = runInTransaction(() => {
      const newUser = createUser({ email, passwordHash, verificationCode, codeExpiresAt });
      const employee = createBlankEmployeeForUser(newUser.id, newUser.email);
      return { user: newUser, employeeId: employee.id };
    });
    let user;
    try {
      await sendVerificationEmail(email, verificationCode);
      user = created.user;
    } catch (sendError) {
      deleteEmployee(created.employeeId);
      deleteUser(created.user.id);
      throw sendError;
    }

    // ---- Respond, matching their real API's response shape ----
    return NextResponse.json({
      status: "verification_required",
      email: user.email,
      ttl: 600, // 600 seconds = 10 minutes, matches codeExpiresAt above
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 } // 500 = "Internal Server Error" — something broke on our end
    );
  }
}