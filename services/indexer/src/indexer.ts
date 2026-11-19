import Redis from "ioredis";
import { decodeEventLog, erc20Abi, parseAbiItem, type Log } from "viem";
import {
  ACCESS_CHANNEL,
  ADDRESSES,
  contractsDeployed,
  env,
  keysAbi,
  publicClient,
  roomAccessAbi,
  roomChannel,
  splitterAbi,
  splitterFactoryAbi,
  sql,
  type RoomEvent,
} from "@insider/core";

/**
 * Reads Insider's contracts and the room coins' transfers into Postgres.
 *  - Waits CONFIRMATIONS blocks before reading, and every write is idempotent (keyed by tx hash + log index), so
 *    re-reading a range after a crash or a reorg never double-counts.
 *  - Coin balances are read from the chain (balanceOf at the batch's last block) for every holder a transfer touched,
 *    so they're absolute values, right even for holders from before we started tracking.
 *  - Every changed key or coin balance is published, so live rooms admit or drop people within seconds.
 */

const db = sql();
const client = publicClient();
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const CONFIRMATIONS = BigInt(env("CONFIRMATIONS", "3"));
const START = BigInt(env("START_BLOCK", "0"));
const MAX_RANGE = 2000n;
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const feesDistributedEvent = parseAbiItem("event FeesDistributed(address indexed host, uint256 hostAmount, uint256 holdersAmount, uint256 treasuryAmount)");
const zero = "0x0000000000000000000000000000000000000000";

const lower = (a: string) => a.toLowerCase();
const publish = (channel: string, e: unknown) => redis?.publish(channel, JSON.stringify(e)).catch(() => {});

async function cursor(name: string): Promise<bigint> {
  const [r] = await db`select block from indexer_cursors where name = ${name}`;
  return r ? BigInt(r.block as string) : START - 1n;
}

const blockTimes = new Map<bigint, Date>();
async function timeOf(n: bigint): Promise<Date> {
  if (!blockTimes.has(n)) {
    const b = await client.getBlock({ blockNumber: n });
    blockTimes.set(n, new Date(Number(b.timestamp) * 1000));
    if (blockTimes.size > 5000) blockTimes.clear();
  }
  return blockTimes.get(n)!;
}

/** getLogs over [from, to], halving the range when the RPC refuses it. */
async function logs(params: { address?: `0x${string}` | `0x${string}`[]; from: bigint; to: bigint; event?: typeof transferEvent | typeof feesDistributedEvent }): Promise<Log[]> {
  try {
    return await client.getLogs({ ...(params.address ? { address: params.address } : {}), fromBlock: params.from, toBlock: params.to, ...(params.event ? { event: params.event } : {}) } as never);
  } catch (e) {
    if (params.to - params.from < 5n) throw e;
    const mid = (params.from + params.to) / 2n;
    return [...(await logs({ ...params, to: mid })), ...(await logs({ ...params, from: mid + 1n }))];
  }
}

// ------------------------------------------------------------------ Insider contracts

async function roomOfHost(host: string): Promise<string | null> {
  const [r] = await db`select r.id from rooms r join users u on u.id = r.host_id where u.address = ${host} order by r.id limit 1`;
  return r ? String(r.id) : null;
}

async function indexContracts(head: bigint) {
  let from = (await cursor("contracts")) + 1n;
  while (from <= head) {
    const to = from + MAX_RANGE - 1n < head ? from + MAX_RANGE - 1n : head;
    // Splitters are clones that can appear mid-range, so their FeesDistributed logs are fetched by event and kept
    // only if the emitter is a splitter the factory created (checked against the table, after this batch's creations).
    const [main, splits] = await Promise.all([
      logs({ address: [ADDRESSES.keys, ADDRESSES.roomAccess, ADDRESSES.splitterFactory], from, to }),
      logs({ event: feesDistributedEvent, from, to }),
    ]);
    const batch = [...main, ...splits];
    const touched = new Set<string>();
    const ticks: { roomHost: string; tick: RoomEvent }[] = [];

    await db.begin(async (tx) => {
      for (const log of batch.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!)) {
        const addr = lower(log.address);
        const abi = addr === lower(ADDRESSES.keys) ? keysAbi : addr === lower(ADDRESSES.roomAccess) ? roomAccessAbi : addr === lower(ADDRESSES.splitterFactory) ? splitterFactoryAbi : splitterAbi;
        if (abi === splitterAbi) {
          const [known] = await tx`select 1 from splitters where address = ${addr}`;
          if (!known) continue;
        }
        let ev;
        try {
          ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
        } catch {
          continue;
        }
        const a = ev.args;
        const at = await timeOf(log.blockNumber!);
        const key = { tx: log.transactionHash!, i: log.logIndex! };
        switch (ev.eventName) {
          case "MarketCreated":
            await tx`insert into key_markets (subject, coin, supply, created_block, created_at) values (${lower(a.subject as string)}, ${a.coin === zero ? null : lower(a.coin as string)}, 0, ${log.blockNumber!.toString()}, ${at}) on conflict do nothing`;
            break;
          case "CoinLinked":
            await tx`update key_markets set coin = ${a.coin === zero ? null : lower(a.coin as string)} where subject = ${lower(a.subject as string)}`;
            break;
          case "KeysBought":
          case "KeysSold": {
            const buy = ev.eventName === "KeysBought";
            const subject = lower(a.subject as string);
            const trader = lower((buy ? a.buyer : a.seller) as string);
            const amount = Number(a.amount);
            const ins = await tx`
              insert into key_trades (tx_hash, log_index, subject, trader, is_buy, amount, eth_wei, creator_fee, protocol_fee, room_fee, flip_fee, supply, block_number, block_time)
              values (${key.tx}, ${key.i}, ${subject}, ${trader}, ${buy}, ${amount}, ${String(buy ? a.cost : a.proceeds)}, ${String(a.creatorFee)}, ${String(a.protocolFee)},
                      ${String(a.roomFee)}, ${String(buy ? 0n : a.flipFee)}, ${Number(a.supply)}, ${log.blockNumber!.toString()}, ${at})
              on conflict do nothing returning tx_hash`;
            if (!ins.length) break; // already applied
            await tx`update key_markets set supply = ${Number(a.supply)} where subject = ${subject}`;
            await tx`
              insert into key_balances (subject, holder, balance) values (${subject}, ${trader}, ${buy ? amount : 0})
              on conflict (subject, holder) do update set balance = greatest(key_balances.balance + ${buy ? amount : -amount}, 0)`;
            if (trader !== subject) {
              const [s] = await tx`select id from users where address = ${subject}`;
              const [t] = await tx`select id from users where address = ${trader}`;
              if (s)
                await tx`insert into notifications (user_id, kind, actor_id, data) values (${s.id}, ${buy ? "key_bought" : "key_sold"}, ${t?.id ?? null},
                         ${tx.json({ amount, priceWei: String(buy ? a.cost : a.proceeds), earnedWei: String(a.creatorFee) })})`;
            }
            touched.add(trader);
            const [h] = await tx`select handle from users where address = ${trader}`;
            ticks.push({ roomHost: subject, tick: { type: "trade", trade: { kind: "key", side: buy ? "buy" : "sell", trader, handle: (h?.handle as string) ?? null, amount: String(amount), ethWei: String(buy ? a.cost : a.proceeds), txHash: key.tx, at: at.toISOString() } } });
            break;
          }
          case "RewardsDeposited":
            if (addr === lower(ADDRESSES.keys))
              await tx`insert into fee_events (tx_hash, log_index, host, kind, holders_amount, account, block_number, block_time)
                       values (${key.tx}, ${key.i}, ${lower(a.subject as string)}, 'deposit', ${String(a.amount)}, ${lower(a.from as string)}, ${log.blockNumber!.toString()}, ${at}) on conflict do nothing`;
            break;
          case "RewardsClaimed":
            await tx`insert into fee_events (tx_hash, log_index, host, kind, holders_amount, account, block_number, block_time)
                     values (${key.tx}, ${key.i}, ${lower(a.subject as string)}, 'claim', ${String(a.amount)}, ${lower(a.holder as string)}, ${log.blockNumber!.toString()}, ${at}) on conflict do nothing`;
            break;
          case "Withdrawn":
            await tx`insert into fee_events (tx_hash, log_index, host, kind, host_amount, account, block_number, block_time)
                     values (${key.tx}, ${key.i}, ${lower(a.account as string)}, 'withdraw', ${String(a.amount)}, ${lower(a.account as string)}, ${log.blockNumber!.toString()}, ${at}) on conflict do nothing`;
            break;
          case "GateUpdated": {
            const host = lower(a.host as string);
            const coin = a.coin === zero ? null : lower(a.coin as string);
            await tx`insert into gates (host, coin, threshold) values (${host}, ${coin}, ${String(a.threshold)})
                     on conflict (host) do update set coin = excluded.coin, threshold = excluded.threshold`;
            if (coin) await tx`insert into tracked_coins (coin, block) values (${coin}, ${(log.blockNumber! - 1n).toString()}) on conflict do nothing`;
            break;
          }
          case "SplitterCreated":
            await tx`insert into splitters (host, address) values (${lower(a.host as string)}, ${lower(a.splitter as string)}) on conflict do nothing`;
            break;
          case "FeesDistributed":
            await tx`insert into fee_events (tx_hash, log_index, host, kind, host_amount, holders_amount, treasury_amount, block_number, block_time)
                       values (${key.tx}, ${key.i}, ${lower(a.host as string)}, 'swap_split', ${String(a.hostAmount)}, ${String(a.holdersAmount)}, ${String(a.treasuryAmount)}, ${log.blockNumber!.toString()}, ${at})
                       on conflict do nothing`;
            break;
        }
      }
      await tx`insert into indexer_cursors (name, block) values ('contracts', ${to.toString()}) on conflict (name) do update set block = excluded.block`;
    });

    for (const t of ticks) {
      const room = await roomOfHost(t.roomHost);
      if (room) await publish(roomChannel(room), t.tick);
    }
    for (const holder of touched) await publish(ACCESS_CHANNEL, { holder });
    if (batch.length) console.log(`contracts ${from}-${to}: ${batch.length} logs`);
    from = to + 1n;
  }
}

// ------------------------------------------------------------------ room coins

async function indexCoins(head: bigint) {
  // Every room coin is tracked from the block we first see it.
  await db`insert into tracked_coins (coin, block) select distinct coin_address, ${(head - 1n).toString()}::bigint from rooms where coin_address is not null on conflict do nothing`;
  for (const row of await db`select coin, block from tracked_coins`) {
    const coin = row.coin as `0x${string}`;
    let from = BigInt(row.block as string) + 1n;
    while (from <= head) {
      const to = from + MAX_RANGE - 1n < head ? from + MAX_RANGE - 1n : head;
      const batch = await logs({ address: coin, from, to, event: transferEvent });
      const holders = new Set<string>();
      for (const l of batch) {
        const { args } = decodeEventLog({ abi: [transferEvent], data: l.data, topics: l.topics });
        if (args.from !== zero) holders.add(lower(args.from));
        if (args.to !== zero) holders.add(lower(args.to));
      }
      // Absolute balances at the end of the batch, read in one multicall.
      const list = [...holders];
      const res = list.length ? await balancesAt(coin, list, to) : [];
      await db.begin(async (tx) => {
        for (let i = 0; i < list.length; i++) {
          const r = res[i];
          if (r.status !== "success") continue;
          await tx`insert into coin_balances (coin, holder, balance) values (${lower(coin)}, ${list[i]}, ${String(r.result ?? 0n)})
                   on conflict (coin, holder) do update set balance = excluded.balance`;
        }
        await tx`update tracked_coins set block = ${to.toString()}::bigint where coin = ${row.coin as string}`;
      });
      for (const h of list) await publish(ACCESS_CHANNEL, { holder: h, coin: lower(coin) });
      if (batch.length) console.log(`coin ${coin} ${from}-${to}: ${batch.length} transfers, ${list.length} holders`);
      from = to + 1n;
    }
  }
}

/** balanceOf for many holders at one block: one multicall where Multicall3 exists, else one call each. */
async function balancesAt(coin: `0x${string}`, holders: string[], block: bigint): Promise<{ status: "success" | "failure"; result?: bigint }[]> {
  const calls = holders.map((h) => ({ address: coin, abi: erc20Abi, functionName: "balanceOf" as const, args: [h as `0x${string}`] as const }));
  if (process.env.MULTICALL !== "0") {
    try {
      return (await client.multicall({ contracts: calls, blockNumber: block })) as { status: "success" | "failure"; result?: bigint }[];
    } catch {
      // Fall through to single calls.
    }
  }
  return Promise.all(
    calls.map((c) =>
      client
        .readContract({ ...c, blockNumber: block })
        .then((result) => ({ status: "success" as const, result }))
        .catch(() => ({ status: "failure" as const })),
    ),
  );
}

// ------------------------------------------------------------------ swaps and PnL

/** Confirm swaps the app recorded, then rebuild verified PnL for the people whose swaps changed. */
async function confirmSwaps() {
  const pending = await db`select s.tx_hash, s.user_id, u.address from swaps s join users u on u.id = s.user_id where s.status = 'pending' and s.created_at < now() - interval '10 seconds' limit 100`;
  const users = new Set<string>();
  for (const s of pending) {
    const r = await client.getTransactionReceipt({ hash: s.tx_hash as `0x${string}` }).catch(() => null);
    if (!r) {
      await db`update swaps set status = 'failed' where tx_hash = ${s.tx_hash as string} and created_at < now() - interval '1 hour'`;
      continue;
    }
    const ok = r.status === "success" && lower(r.from) === s.address;
    await db`update swaps set status = ${ok ? "confirmed" : "failed"} where tx_hash = ${s.tx_hash as string}`;
    if (ok) users.add(String(s.user_id));
  }
  for (const u of users) await rebuildPnl(u);
}

/** Realized PnL per coin by average cost: each sell earns its ETH minus the average cost of the tokens sold. */
export async function rebuildPnl(userId: string) {
  for (const [period, since] of [["7d", "7 days"], ["30d", "30 days"], ["all", "100 years"]] as const) {
    const swaps = await db`select coin, side, eth_wei, token_amount, created_at from swaps where user_id = ${userId} and status = 'confirmed' order by created_at`;
    const book = new Map<string, { tokens: bigint; cost: bigint }>();
    const cutoff = Date.now() - (period === "7d" ? 7 : period === "30d" ? 30 : 36500) * 86_400_000;
    let pnl = 0n;
    let trades = 0;
    let wins = 0;
    let best: { coin: string; pct: number } | null = null;
    for (const s of swaps) {
      const b = book.get(s.coin as string) ?? { tokens: 0n, cost: 0n };
      const eth = BigInt(String(s.eth_wei));
      const tok = BigInt(String(s.token_amount));
      if (s.side === "buy") {
        b.tokens += tok;
        b.cost += eth;
      } else if (b.tokens > 0n) {
        const sold = tok > b.tokens ? b.tokens : tok;
        const basis = (b.cost * sold) / b.tokens;
        if (new Date(s.created_at as string).getTime() >= cutoff) {
          const gain = eth - basis;
          pnl += gain;
          trades++;
          if (gain > 0n) wins++;
          const p = basis > 0n ? Number((gain * 10_000n) / basis) / 100 : 0;
          if (!best || p > best.pct) best = { coin: s.coin as string, pct: p };
        }
        b.tokens -= sold;
        b.cost -= basis;
      }
      book.set(s.coin as string, b);
    }
    const [sym] = best ? await db`select symbol from coins where address = ${best.coin}` : [];
    await db`
      insert into pnl_stats (user_id, period, pnl_wei, win_rate, trades, best_coin, best_pct, updated_at)
      values (${userId}, ${period}, ${pnl.toString()}, ${trades ? wins / trades : 0}, ${trades}, ${(sym?.symbol as string) ?? null}, ${best?.pct ?? null}, now())
      on conflict (user_id, period) do update set pnl_wei = excluded.pnl_wei, win_rate = excluded.win_rate, trades = excluded.trades,
        best_coin = excluded.best_coin, best_pct = excluded.best_pct, updated_at = now()`;
  }
}

// ------------------------------------------------------------------ loop

async function tick() {
  const latest = await client.getBlockNumber();
  const head = latest - CONFIRMATIONS;
  if (contractsDeployed()) await indexContracts(head);
  await indexCoins(head);
  await confirmSwaps();
  if (Date.now() - lastPartitions > 3_600_000) {
    await db`select ensure_partitions(2)`;
    lastPartitions = Date.now();
  }
}
let lastPartitions = 0;

const INTERVAL = Number(env("INDEX_INTERVAL_MS", "2000"));
console.log(`indexer: chain ${client.chain?.id}, contracts ${contractsDeployed() ? ADDRESSES.keys : "not deployed"}, from block ${START}`);
for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error("tick failed", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, INTERVAL));
}
