import { NextResponse } from "next/server";
import { isHash } from "viem";
import { publicClient, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { SITE } from "@/lib/config";

/** Record a tip after the wallet sent it. Checked against the chain here; the post's tip total only counts confirmed tips. */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const b = await body<{ txHash: string; postId?: string; articleId?: string }>(req);
  if (!isHash(b.txHash)) throw new HttpError(400, "Bad transaction hash.");
  const tx = await publicClient().getTransaction({ hash: b.txHash as `0x${string}` }).catch(() => null);
  if (!tx || tx.from.toLowerCase() !== me.address) throw new HttpError(400, "That transaction isn't from your wallet.");
  const receipt = await publicClient().getTransactionReceipt({ hash: b.txHash as `0x${string}` }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new HttpError(400, "That transaction hasn't landed.");
  const [to] = tx.to ? await sql()`select id from users where address = ${tx.to.toLowerCase()}` : [];
  if (!to) throw new HttpError(400, `Tips go to a ${SITE.name} account.`);
  const inserted = await sql()`
    insert into tips (tx_hash, from_id, to_id, post_id, article_id, amount_wei, status)
    values (${b.txHash.toLowerCase()}, ${me.id}, ${to.id}, ${b.postId ?? null}, ${b.articleId ?? null}, ${tx.value.toString()}, 'confirmed')
    on conflict do nothing returning tx_hash`;
  if (inserted.length) {
    if (b.postId) await sql()`update posts set tip_wei = tip_wei + ${tx.value.toString()} where id = ${b.postId} and user_id = ${to.id}`;
    if (b.articleId) await sql()`update articles set tip_wei = tip_wei + ${tx.value.toString()} where id = ${b.articleId} and user_id = ${to.id}`;
    await sql()`insert into notifications (user_id, kind, actor_id, data) values (${to.id}, 'tip', ${me.id}, ${sql().json({ amountWei: tx.value.toString(), postId: b.postId ?? null })})`;
  }
  return NextResponse.json({ ok: true });
});
