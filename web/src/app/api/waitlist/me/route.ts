import { NextResponse } from "next/server";
import { requireMe } from "@/server/auth";
import { handle } from "@/server/http";
import { waitlistMe } from "@/server/waitlist";

export const dynamic = "force-dynamic";

export const GET = handle(async () => NextResponse.json(await waitlistMe((await requireMe()).id)));
