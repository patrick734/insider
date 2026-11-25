import { NextResponse } from "next/server";
import { ACCESS_CHANNEL, applyContractLogs, publicClient, roomChannel, sql, type Sql } from "@insider/core";
import { HttpError } from "@/server/auth";
import { body, handle } from "@/server/http";
import { publish, rateLimit } from "@/server/redis";

/**
 * Record a transaction the moment it lands: the app sends the hash after any key trade, claim or room setting, and
 * the server reads that receipt from Base and applies its Insider contract events (the same code the indexer runs).
 * Only events emitted by our contracts (and splitters our factory made) count, and every write is keyed by tx hash +
 * log index, so the indexer reaching the same block later changes nothing.
 */
export const POST = handle(async (req: Request) => {
  const { txHash } = await body<{ txHash: string }>(req);
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new HttpError(400, "Bad transaction hash.");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`chaintx:${ip}`, 60, 60))) throw new HttpError(429, "Too many requests. Wait a minute.");

  const client = publicClient();
  // The sender already waited for the receipt, but the server's RPC can lag a block behind: retry briefly.
  let receipt = null;
  for (let i = 0; i < 6 && !receipt; i++) {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
    if (!receipt) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!receipt) throw new HttpError(404, "That transaction isn't on Base yet. It'll show up shortly.");
  if (receipt.status !== "success") return NextResponse.json({ ok: true, applied: 0 });

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const at = new Date(Number(block.timestamp) * 1000);
  const db = sql();
  let applied = { touched: new Set<string>(), ticks: [] as Awaited<ReturnType<typeof applyContractLogs>>["ticks"] };
  await db.begin(async (tx) => {
    applied = await applyContractLogs(tx as unknown as Sql, receipt.logs, async () => at);
  });

  for (const t of applied.ticks) {
    const [r] = await db`select r.id from rooms r join users u on u.id = r.host_id where u.address = ${t.roomHost} order by r.id limit 1`;
    if (r) await publish(roomChannel(String(r.id)), t.tick);
  }
  for (const holder of applied.touched) await publish(ACCESS_CHANNEL, { holder });
  return NextResponse.json({ ok: true, applied: applied.ticks.length });
});
