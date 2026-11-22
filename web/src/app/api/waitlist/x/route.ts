import { NextResponse } from "next/server";
import { sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { demoLoginEnabled } from "@/server/demo";
import { xFromPrivyToken } from "@/server/x";
import { waitlistMe } from "@/server/waitlist";

/**
 * Link your X account. Real sign-in: the Privy identity token proves which X account you linked. Demo: your sample
 * handle stands in for it. One waitlist seat per X account.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const { idToken } = await body<{ idToken?: string }>(req);
  let account: { id: string; username: string } | null;
  if (demoLoginEnabled()) account = { id: `demo:${me.id}`, username: me.handle ?? `user${me.id}` };
  else account = await xFromPrivyToken(idToken ?? "");
  if (!account && !idToken) throw new HttpError(400, "Couldn't get a sign-in token from Privy. Check that identity tokens are on in the Privy dashboard.");
  if (!account) throw new HttpError(400, "Your X account isn't linked to this sign-in. Tap Link X.");
  try {
    await sql()`update users set x_user_id = ${account.id}, x_handle = ${account.username} where id = ${me.id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new HttpError(409, "That X account is already on the waitlist.");
    throw e;
  }
  return NextResponse.json(await waitlistMe(me.id));
});
