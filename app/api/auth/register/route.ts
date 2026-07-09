// app/api/auth/register/route.ts
//
// This file's LOCATION defines its URL: because it lives at
// app/api/auth/register/route.ts, Next.js automatically serves it at
// the URL path "/api/auth/register" — no separate router config needed,
// same idea as app/login/page.tsx becoming the "/login" page.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
// ^ This path matches the "output" setting we saw in schema.prisma
//   (generator client { output = "../lib/generated/prisma" }).
//   Prisma writes its generated code there instead of node_modules,
//   so we import it from that exact location.

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

    // ---- Check if this email is already registered ----
    const existingUser = await prisma.user.findUnique({ where: { email } });
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

    // ---- Create the user in the database ----
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        verificationCode,
        codeExpiresAt,
      },
    });

    // ---- Send the email with the code via Gmail SMTP ----
    await sendVerificationEmail(email, verificationCode);

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