import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { ADDRESSES, CHAIN_ID, contractsDeployed, publicClient, splitterFactoryAbi, sql } from "@insider/core";
import { HttpError, requireMe } from "@/server/auth";
import { body, handle } from "@/server/http";
import { rateLimit } from "@/server/redis";

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

/**
 * A swap quote from the 0x Swap API (AllowanceHolder), with the integrator fee taken in ETH/WETH and sent to the
 * room host's fee splitter, so the host's and key holders' shares are settled on-chain.
 */
export const POST = handle(async (req: Request) => {
  const me = await requireMe();
  const key = process.env.ZEROX_API_KEY;
  if (!key) throw new HttpError(503, "In-app swaps open soon.");
  if (!(await rateLimit(`quote:${me.id}`, 30, 60))) throw new HttpError(429, "Too many quotes. Wait a minute.");
  const b = await body<{ room: string; side: "buy" | "sell"; amount: string }>(req);
  const [room] = await sql()`select r.id, r.coin_address, h.address as host from rooms r join users h on h.id = r.host_id where r.slug = ${b.room}`;
  if (!room?.coin_address) throw new HttpError(400, "This room has no coin linked.");
  if (!/^\d+$/.test(String(b.amount)) || BigInt(b.amount) === 0n) throw new HttpError(400, "Enter an amount.");
  const coin = room.coin_address as string;
  if (!isAddress(coin)) throw new HttpError(400, "Bad coin.");

  const feeRecipient = contractsDeployed()
    ? await publicClient().readContract({ address: ADDRESSES.splitterFactory, abi: splitterFactoryAbi, functionName: "predict", args: [room.host as `0x${string}`] })
    : null;
  const params = new URLSearchParams({
    chainId: String(CHAIN_ID),
    sellToken: b.side === "buy" ? ETH : coin,
    buyToken: b.side === "buy" ? coin : ETH,
    sellAmount: String(b.amount),
    taker: me.address,
    slippageBps: "100",
  });
  if (feeRecipient) {
    params.set("swapFeeRecipient", feeRecipient);
    params.set("swapFeeBps", process.env.SWAP_FEE_BPS || "100");
    // Take the fee on the ETH side so every room pot fills in ETH.
    params.set("swapFeeToken", b.side === "buy" ? ETH : ETH);
  }
  const r = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${params}`, {
    headers: { "0x-api-key": key, "0x-version": "v2" },
    signal: AbortSignal.timeout(10_000),
  });
  const q = await r.json().catch(() => null);
  if (!r.ok || !q?.transaction) throw new HttpError(502, q?.message ?? "No route for that swap right now.");
  return NextResponse.json({
    buyAmount: q.buyAmount,
    sellAmount: q.sellAmount,
    minBuyAmount: q.minBuyAmount,
    allowanceTarget: q.issues?.allowance?.spender ?? null,
    fee: q.fees?.integratorFee ?? null,
    tx: { to: q.transaction.to, data: q.transaction.data, value: q.transaction.value, gas: q.transaction.gas },
    roomId: String(room.id),
  });
});
