import { NextResponse } from "next/server";
import { HttpError, getMe, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { xFromPrivyToken } from "@/server/x";
import { linkX } from "@/server/x-link";

/**
 * Link the X account you signed in with (Privy's tokens prove which one) and bring its photo over.
 * `photo: true` replaces your current avatar with your X photo.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const { idToken, accessToken, photo } = await body<{ idToken?: string; accessToken?: string; photo?: boolean }>(req);
  const account = await xFromPrivyToken(idToken ?? "", accessToken);
  if (!account) throw new HttpError(400, "Couldn't confirm your X account. Sign in with X and try again.");
  await linkX(me.id, account, photo === true);
  return NextResponse.json({ me: await getMe() });
});
