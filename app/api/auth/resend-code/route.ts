// app/api/auth/resend-code/route.ts
//
// Same job as the code-generation step inside /register, just triggerable
// again for a user who's already mid-verification (didn't get the email,
// let the code expire, etc). Reuses the exact same OTP mechanics.

import { NextRequest, NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/mailer";
import { findUserByEmail, updateUser } from "@/lib/users";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const user = findUserByEmail(email);

    // Don't reveal whether the account exists — same reasoning as
    // verify-code's vague error messages.
    if (!user) {
      return NextResponse.json({ error: "Unable to resend code." }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: "This account is already verified." },
        { status: 400 }
      );
    }

    const verificationCode = generateOtpCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    updateUser(user.id, { verificationCode, codeExpiresAt });

    await sendVerificationEmail(email, verificationCode);

    return NextResponse.json({ status: "sent", ttl: 600 });
  } catch (error) {
    console.error("Resend-code error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}