import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./auth";

/** Wrap a route handler: HttpError becomes its status, anything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) {
        // Log refusals on sign-in and waitlist routes so a stuck sign-in shows up in `pm2 logs` (no tokens or bodies).
        const req = args[0] instanceof Request ? args[0] : null;
        const path = req ? new URL(req.url).pathname : "";
        if (/^\/api\/(auth|waitlist)\//.test(path)) console.warn(`[${e.status}] ${path}: ${e.message}`);
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error(e);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Bad request body.");
  }
}
