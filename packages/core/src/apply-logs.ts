import { decodeEventLog, type Log } from "viem";
import { ADDRESSES } from "./chain";
import { keysAbi, roomAccessAbi, splitterAbi, splitterFactoryAbi } from "./abi";
import type { Sql } from "./db";
import type { RoomEvent } from "./channels";

const zero = "0x0000000000000000000000000000000000000000";
const lower = (a: string) => a.toLowerCase();

/** What applying a batch of logs changed: holders whose access may differ, and live trade ticks per room host. */
export type Applied = { touched: Set<string>; ticks: { roomHost: string; tick: RoomEvent }[] };

/**
 * Apply Insider contract logs (keys, room access, splitter factory and known splitters) to the database. Shared by the
 * indexer and the receipt endpoint, so a trade is recorded the moment its sender reports it and again, harmlessly,
 * when the indexer reaches it: every write is keyed by tx hash + log index or is an idempotent upsert.
 * Run inside a transaction; `timeOf` gives a block's time.
 */
export async function applyContractLogs(
  tx: Sql,
  batch: Log[],
  timeOf: (block: bigint) => Promise<Date>,
  out: Applied = { touched: new Set(), ticks: [] },
): Promise<Applied> {
  const { touched, ticks } = out;
  for (const log of [...batch].sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!)) {
    const addr = lower(log.address);
    const abi =
      addr === lower(ADDRESSES.keys)
        ? keysAbi
        : addr === lower(ADDRESSES.roomAccess)
          ? roomAccessAbi
          : addr === lower(ADDRESSES.splitterFactory)
            ? splitterFactoryAbi
            : splitterAbi;
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
        ticks.push({
          roomHost: subject,
          tick: {
            type: "trade",
            trade: {
              kind: "key",
              side: buy ? "buy" : "sell",
              trader,
              handle: (h?.handle as string) ?? null,
              amount: String(amount),
              ethWei: String(buy ? a.cost : a.proceeds),
              txHash: key.tx,
              at: at.toISOString(),
            },
          },
        });
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
  return out;
}
