// app/api/auth/verify-code/route.ts

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Deliberately vague error message here — don't reveal WHETHER the
    // email exists at all. Saying "no account with that email" vs "wrong
    // code" gives an attacker useful information for free.
    if (!user || !user.verificationCode || !user.codeExpiresAt) {
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    // ---- Check the code matches ----
    if (user.verificationCode !== code) {
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    // ---- Check it hasn't expired ----
    // This is the "parking ticket" check from our earlier analogy —
    // correct code, but too late, still counts as invalid.
    if (user.codeExpiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    // ---- Build the two tokens ----
    // Access token: short-lived wristband, used on every request.
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Refresh token: long-lived renewal ticket, used only to get new
    // access tokens without logging in again.
    const refreshToken = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // We store a HASH of the refresh token, not the token itself — same
    // reason we hash passwords: if the database ever leaked, the raw
    // tokens shouldn't be sitting there in plain text.
    //
    // Note this uses a fast hash (sha256), NOT bcrypt like passwords.
    // Passwords need a SLOW hash because humans pick guessable passwords
    // and an attacker might try millions of common guesses. A refresh
    // token is already a long random string nobody could guess — the
    // hash here just protects against a raw database leak, so a fast
    // hash is the right tool, not overkill removed for no reason.
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // ---- Update the user: verified, code cleared, refresh token stored ----
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        codeExpiresAt: null,
        refreshTokenHash,
      },
    });

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Verify-code error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}