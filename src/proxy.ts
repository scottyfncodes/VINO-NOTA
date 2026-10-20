import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: sends visitors without a session cookie to sign-in.
 * Every page, action and route handler still validates the session server-side.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const url = new URL("/sign-in", request.url);
    if (request.nextUrl.pathname !== "/") url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/auth|sign-in|sign-up|forgot-password|reset-password|_next/static|_next/image|icons|favicon|apple-icon|icon|manifest.webmanifest|robots.txt).*)"],
};
