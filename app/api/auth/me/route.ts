// app/api/me/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/requireAuth";
import { findUserById } from "@/lib/users";

export async function GET(request: NextRequest) {
  try {
    const userId = requireUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "No token provided, or it's invalid/expired." },
        { status: 401 }
      );
    }

    // ---- Look up the current user data ----
    // We don't just trust what's IN the token for things like email —
    // we look it up fresh, in case anything about the account changed
    // since the token was issued.
    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
    });
  } catch (error) {
    console.error("Me error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}