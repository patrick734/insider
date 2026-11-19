import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sql } from "@insider/core";
import { BaseChip, Main, PageHeader } from "@/components/page";
import { Rail } from "@/components/rail";
import { WalletClient } from "@/components/wallet-client";
import { getMe } from "@/server/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallet" };

const TABS = [
  ["tokens", "Tokens"],
  ["keys", "Keys"],
  ["rooms", "Rooms"],
  ["activity", "Activity"],
] as const;

export default async function Wallet({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/");
  const key = (await searchParams).tab;
  const tab = (TABS.find(([k]) => k === key)?.[0] ?? "tokens") as (typeof TABS)[number][0];
  const db = sql();
  const [coins, keys, earned, activity] = await Promise.all([
    db`select c.address, c.symbol, c.name, c.decimals, b.balance::text from coin_balances b join coins c on c.address = b.coin where b.holder = ${me.address} and b.balance > 0 order by c.symbol`,
    db`
      select kb.subject, kb.balance, u.handle, u.name, u.avatar_url, km.supply
      from key_balances kb left join users u on u.address = kb.subject left join key_markets km on km.subject = kb.subject
      where kb.holder = ${me.address} and kb.balance > 0 order by kb.balance desc`,
    db`
      select
        coalesce((select sum(creator_fee) from key_trades where subject = ${me.address} and block_time > now() - interval '30 days'), 0)::text as key_fees,
        coalesce((select sum(host_amount) from fee_events where host = ${me.address} and kind = 'swap_split' and block_time > now() - interval '30 days'), 0)::text as room_fees,
        coalesce((select sum(amount_wei) from tips where to_id = ${me.id} and status = 'confirmed' and created_at > now() - interval '30 days'), 0)::text as tips,
        coalesce((select sum(amount_wei) from tips where to_id = ${me.id} and status = 'confirmed' and created_at > now() - interval '7 days'), 0)
          + coalesce((select sum(creator_fee) from key_trades where subject = ${me.address} and block_time > now() - interval '7 days'), 0)
          + coalesce((select sum(host_amount) from fee_events where host = ${me.address} and kind = 'swap_split' and block_time > now() - interval '7 days'), 0) as week`,
    db`
      (select 'key' as kind, kt.tx_hash, kt.is_buy, kt.amount::text as amount, kt.eth_wei::text as wei, kt.block_time as at, s.handle as other
         from key_trades kt left join users s on s.address = kt.subject where kt.trader = ${me.address} order by kt.block_time desc limit 30)
      union all
      (select 'swap', sw.tx_hash, sw.side = 'buy', sw.token_amount::text, sw.eth_wei::text, sw.created_at, c.symbol
         from swaps sw left join coins c on c.address = sw.coin where sw.user_id = ${me.id} order by sw.created_at desc limit 30)
      union all
      (select 'tip', t.tx_hash, false, null, t.amount_wei::text, t.created_at, u.handle
         from tips t join users u on u.id = case when t.from_id = ${me.id} then t.to_id else t.from_id end
         where t.from_id = ${me.id} or t.to_id = ${me.id} order by t.created_at desc limit 30)
      order by at desc limit 50`,
  ]);
  return (
    <>
      <Main>
        <PageHeader title="Wallet" right={<BaseChip />} />
        <WalletClient
          tab={tab}
          tabs={TABS.map(([k, label]) => ({ label, href: `/wallet?tab=${k}`, selected: k === tab }))}
          address={me.address}
          earned={{ keyFees: String(earned[0].key_fees), roomFees: String(earned[0].room_fees), tips: String(earned[0].tips), week: String(earned[0].week) }}
          coins={coins.map((c) => ({ address: c.address as string, symbol: c.symbol as string, name: c.name as string, decimals: Number(c.decimals), balance: String(c.balance) }))}
          keys={keys.map((k) => ({ subject: k.subject as string, balance: Number(k.balance), handle: (k.handle as string) ?? null, name: (k.name as string) ?? null, supply: Number(k.supply ?? 0) }))}
          activity={activity.map((a) => ({
            kind: a.kind as string,
            txHash: a.tx_hash as string,
            buy: Boolean(a.is_buy),
            amount: (a.amount as string) ?? null,
            wei: (a.wei as string) ?? "0",
            at: (a.at as Date).toISOString(),
            other: (a.other as string) ?? null,
          }))}
        />
      </Main>
      <Rail />
    </>
  );
}
