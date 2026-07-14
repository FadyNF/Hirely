// app/api/auth/verify-code/route.ts

import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, updateUser } from "@/lib/users";
import { signTokenPair, setAuthCookies } from "@/lib/authTokens";

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required." },
        { status: 400 }
      );
    }

    const user = findUserByEmail(email);

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
    const { accessToken, refreshToken, refreshTokenHash } = signTokenPair(user.id, user.email);

    // ---- Update the user: verified, code cleared, refresh token stored ----
    updateUser(user.id, {
      emailVerified: true,
      verificationCode: null,
      codeExpiresAt: null,
      refreshTokenHash,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
    });
    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error) {
    console.error("Verify-code error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}