import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Allow public share links (read-only review pages, no auth required)
  if (pathname.startsWith("/share/review/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySession(token);
  if (!session?.authenticated) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Roll session cookie (extend expiry)
  const response = NextResponse.next();
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/health|favicon\\.ico|manifest\\.json|sw\\.js|offline|favicon\\.png|apple-icon\\.png|web-app-manifest-192x192\\.png|web-app-manifest-512x512\\.png|icon1\\.png).*)",
  ],
};
