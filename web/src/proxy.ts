import { NextResponse, type NextRequest } from "next/server";

/** Passes the page path to the app so the layout can apply waitlist-first mode (it checks access in the database). */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
