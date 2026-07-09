// app/api/auth/refresh/route.ts

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json(
        { error: "Refresh token is required." },
        { status: 400 }
      );
    }

    // ---- Step 1: verify the JWT signature and expiry ----
    // jwt.verify checks BOTH the cryptographic seal AND whether the
    // "exp" (expiry) has passed. If either check fails, it throws —
    // that's why this whole block is inside try/catch.
    let payload: { userId: number };
    try {
      payload = jwt.verify(refresh_token, JWT_SECRET) as { userId: number };
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired refresh token." },
        { status: 401 }
      );
    }

    // ---- Step 2: check it matches what WE have on record ----
    // This is the part a stateless JWT can't do alone — the signature
    // proves WE issued it at some point, but only checking our stored
    // hash tells us whether it's still the CURRENT one (i.e. hasn't
    // been rotated out or logged out already).
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.refreshTokenHash) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token." },
        { status: 401 }
      );
    }

    const submittedHash = crypto
      .createHash("sha256")
      .update(refresh_token)
      .digest("hex");

    if (submittedHash !== user.refreshTokenHash) {
      // This means either: they're using an old, already-rotated-out
      // token, or they logged out already (which clears the hash).
      return NextResponse.json(
        { error: "Invalid or expired refresh token." },
        { status: 401 }
      );
    }

    // ---- Step 3: issue a NEW pair (rotation) ----
    const newAccessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "15m" }
    );
    const newRefreshToken = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    const newRefreshTokenHash = crypto
      .createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    // Overwrite the stored hash — this is the actual "rotation" step.
    // The old refresh token's hash no longer matches anything on file,
    // so submitting it again from now on will fail Step 2 above.
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newRefreshTokenHash },
    });

    return NextResponse.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}