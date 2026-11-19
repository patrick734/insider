import { NextResponse } from "next/server";
import { getMe } from "@/server/auth";
import { unreadCounts } from "@/server/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getMe();
  return NextResponse.json(me ? await unreadCounts(me.id) : { notifications: 0, messages: 0 });
}
