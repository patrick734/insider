import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { joinWaitlist, waitlistMe } from "@/server/waitlist";

/** Join the waitlist; credits the link you arrived through (it counts once you're verified). */
export const POST = handle(async () => {
  const me = await requireMe();
  const ref = (await cookies()).get("insider_ref")?.value ?? null;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  await joinWaitlist(me.id, ref, ip);
  return NextResponse.json(await waitlistMe(me.id));
});
