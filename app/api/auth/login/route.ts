// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signTokenPair, setAuthCookies } from "@/lib/authTokens";
import { sendVerificationEmail } from "@/lib/mailer";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Deliberately identical error for "no such user" and "wrong password" —
    // same reasoning as before: don't let a login form confirm which emails
    // are registered on your system to anyone probing it.
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 } // 401 = "Unauthorized" — this is a bad-credentials status
      );
    }

    // ---- Check the password ----
    // bcrypt.compare re-hashes the submitted password using the same
    // scrambling process, and checks if the RESULT matches what's stored —
    // it never "unscrambles" the stored hash, because that's not possible
    // by design. This is the whole point of hashing: one-way only.
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    // ---- Check if they've actually verified their email ----
    // Correct password, but never finished the OTP step — send them back
    // to verification instead of letting them in. This matches the real
    // product's exact response shape from AuthContext.tsx.
    if (!user.emailVerified) {
      // Generate a FRESH code, since any old one may have already expired
      // (exactly the trap you hit testing verify-code a minute ago).
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: { verificationCode, codeExpiresAt },
      });

      // Same email the register/resend-code routes send — the DB now
      // holds a fresh code, so the user needs it actually delivered,
      // not just generated.
      await sendVerificationEmail(user.email, verificationCode);

      return NextResponse.json({
        status: "verification_required",
        email: user.email,
        ttl: 600,
      });
    }

    // ---- All checks passed — issue tokens, same as verify-code did ----
    const { accessToken, refreshToken, refreshTokenHash } = signTokenPair(user.id, user.email);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    });
    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}