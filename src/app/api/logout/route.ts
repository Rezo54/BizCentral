import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });

  // 🔒 Clear your session cookie (adjust name if different)
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  return response;
}