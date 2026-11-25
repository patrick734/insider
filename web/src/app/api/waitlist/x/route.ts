import { NextResponse } from "next/server";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { demoLoginEnabled } from "@/server/demo";
import { xFromPrivyToken, type XAccount } from "@/server/x";
import { linkX } from "@/server/x-link";
import { waitlistMe } from "@/server/waitlist";

/**
 * Link your X account. Real sign-in: the Privy identity token proves which X account you linked. Demo: your sample
 * handle stands in for it. One waitlist seat per X account.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const { idToken, accessToken } = await body<{ idToken?: string; accessToken?: string }>(req);
  let account: XAccount | null;
  if (demoLoginEnabled()) account = { id: `demo:${me.id}`, username: me.handle ?? `user${me.id}`, picture: null };
  else account = await xFromPrivyToken(idToken ?? "", accessToken);
  if (!account && !idToken && !process.env.PRIVY_APP_SECRET)
    throw new HttpError(400, "Couldn't get a sign-in token from Privy. Check that identity tokens are on in the Privy dashboard.");
  if (!account) throw new HttpError(400, "Your X account isn't linked to this sign-in. Tap Link X.");
  await linkX(me.id, account);
  return NextResponse.json(await waitlistMe(me.id));
});
