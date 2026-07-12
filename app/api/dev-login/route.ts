// TEMPORARY — verification-only route. Delete after use.
import { NextResponse } from "next/server";
import { signTokenPair, setAuthCookies } from "@/lib/authTokens";

export async function GET() {
  const { accessToken, refreshToken } = signTokenPair(13, "fadynf05@gmail.com");
  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, accessToken, refreshToken);
  return res;
}
