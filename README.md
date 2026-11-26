# Insider

SocialFi for Base: rooms, receipts, keys. Insider has holder-gated coin rooms with live chat, access keys that share in the room's
fees, in-app swaps that pay the host, and verified on-chain PnL.

## Layout

```
contracts/          Foundry: RoomKeys, RoomAccess, SplitterFactory + RoomFeeSplitter (tests in contracts/test)
db/migrations/      Postgres schema, applied in order by `npm run migrate`
packages/core/      Shared code: chain config, ABIs, database, sessions, room access rules, chat rules
web/                Next.js app: every screen, desktop and mobile, plus the REST API (src/app/api)
services/realtime/  Room chat sockets (run as many as needed; Redis carries messages between them)
services/indexer/   Reads the contracts and room coins into Postgres; confirms swaps; rebuilds verified PnL
```

## How the pieces fit

- **Sign-in:** Privy (email, X, Farcaster or a wallet; embedded wallet for people without one). The wallet then signs
  a short message; the server checks it with viem, which covers plain wallets and smart wallets (ERC-1271 and ERC-6492)
  and sets an httpOnly session cookie.
- **Room access:** host, or at least one of the host's keys, or at least the host's threshold of the room's coin.
  Checked from indexed balances (with a direct `RoomAccess.canEnter` read as a fallback) when someone joins and again
  whenever their balance changes: the indexer publishes the change and the socket server drops them.
- **Chat:** browsers get a two-minute ticket from the web app and open a socket to the realtime service. Messages are
  checked (access, bans, mutes, slow mode, 5 per 10 seconds), stored in Postgres (partitioned by month) and fanned
  out through Redis. Hosts and mods can delete, mute, remove and set slow mode.
- **Keys (RoomKeys):** price `0.002 + 0.00015·s + 0.000002·min(s,40)²` ETH; 8% fee (4% host, 2% protocol, 2% holders); a flip
  fee from 4% down to 0 over 24 hours that goes to holders; creator's first key locked; 2-5 minute creator-only
  window; at most 5 keys and 10% of supply per buy; 30-minute sell cooldown. Holder rewards stream over 3 days, so
  buying right before a payout earns little. Fee changes are timelocked (2 days) and hard-capped (10%).
- **Swaps:** 0x Swap API quotes with a 1% integrator fee taken in ETH and sent to the host's splitter (a CREATE2 clone
  whose address is known before it's deployed). The splitter pays 60% to the host, streams 20% to the host's key
  holders and sends 20% to the treasury.
- **Builder Code:** every transaction carries the ERC-8021 suffix from `NEXT_PUBLIC_BUILDER_CODE`.

## Run it locally

Needs Node 22, Postgres 16 and Redis 7 (`docker compose up -d` starts both), and Foundry for the contracts.

```
cp .env.example web/.env.local      # then fill it in
npm install
npm run migrate
npm run seed                        # development data only
npm run dev                         # web on :3000
npm run realtime                    # chat sockets on :4001
npm run indexer                     # needs the contract addresses
```

Without `NEXT_PUBLIC_PRIVY_APP_ID`, set `DEV_LOGIN=1` to sign in as a seeded user (development only; refused in
production).

Contracts:

```
cd contracts
npm install                         # OpenZeppelin
forge test
forge script script/Deploy.s.sol --rpc-url https://sepolia.base.org --account <keystore> --broadcast
```

The script prints the three addresses for the env file. Set `START_BLOCK` to the deploy block.

## Mainnet

Deployed on Base mainnet (block 59,626,283):

| Contract | Address |
|---|---|
| RoomKeys | [0x8e6Aa3707c2bE2F0472935c6bccB42222E15ADd2](https://basescan.org/address/0x8e6Aa3707c2bE2F0472935c6bccB42222E15ADd2) |
| RoomAccess | [0x892814990B94Acd528d951571EBE1f3A40E90706](https://basescan.org/address/0x892814990B94Acd528d951571EBE1f3A40E90706) |
| SplitterFactory | [0xD8a67860f648513D39B69292B3C4c09692889bC4](https://basescan.org/address/0xD8a67860f648513D39B69292B3C4c09692889bC4) |
| RoomFeeSplitter (template every room's splitter is cloned from) | [0x9766e822cE9EeD28fD10b1f4149cBE3476e9Fd30](https://basescan.org/address/0x9766e822cE9EeD28fD10b1f4149cBE3476e9Fd30) |

Owner `0x05f1d3984f32a9fcb2d019e78764a20bc57da13d`, treasury `0x982834a9fe99a801a99b7e15df624e8ad648a908`.
Source verified on Basescan and Sourcify. Details in `contracts/deployments/base.json`.

Contracts deploy straight to Base mainnet. They haven't had a third-party audit, so:

- Make `OWNER` a Safe multisig (the deploy script refuses to run on mainnet without `OWNER` and `TREASURY`).
- The owner can't touch user funds: it can only change fee splits (2-day timelock, hard-capped at 10%), the
  protocol fee recipient and the 2-5 minute creator window.
- Get an audit as soon as there's real value in key markets, and run a bug bounty after it.

## Renaming

The name lives in three env values: `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_DOMAIN` and
`NEXT_PUBLIC_BRAND_TAGLINE`. Change them and rebuild; nothing in the code mentions the name. The contracts use neutral
names (RoomKeys, RoomAccess, RoomFeeSplitter) so a rename never needs a redeploy. Internal identifiers (the `@insider`
package scope, cookie and token names) aren't shown to users.

## Demo server

`deploy/demo-setup.sh` puts the app online on an Ubuntu server that already runs Caddy, Node 22 and pm2, with sample
data and demo sign-in (a "DEMO" strip shows on every page; it switches itself off once a Privy App ID is set):

```
git clone https://github.com/patrick734/insider.git ~/insider
cd ~/insider && DOMAIN=insider.18-224-166-132.sslip.io bash deploy/demo-setup.sh
```

It installs Postgres and Redis if missing, writes `web/.env.local`, migrates, seeds, builds, starts `insider-web`
(port 3200) and `insider-realtime` (port 4101) under pm2 and adds the domain to Caddy. Run the same command again to
update. `*.sslip.io` names resolve to the IP inside them, so no DNS change is needed for a test address.

## Going live

`deploy/setup.sh` replaces the demo on the same server: its own database (`insider_live`, no sample data), real
sign-in through Privy, waitlist-first mode, the indexer and nightly backups.

```
cd ~/insider && git pull && bash deploy/setup.sh
```

It asks once for the Privy App ID, the project's X handle, admin wallet addresses, and optionally a Base RPC URL (needed for the chain indexer; the waitlist runs without it), an X
API bearer token (follow checks), a 0x API key and a Builder Code, and keeps the answers in `~/.insider-live.env`
(private; edit or delete a line to change it). Run the same command again after each `git pull` to update.

- **Waitlist-first** (`WAITLIST_MODE=1`): visitors see only `/waitlist`, share links, terms and privacy until an
  admin gives them access. Hosts already set up keep access.
- **Admin review** at `/admin/waitlist` (wallets in `ADMIN_ADDRESSES`): top 20 with invite counts, same-network
  clusters, pending follows; hold or clear a rank, give or remove app access.
- **Share links** `/s/CODE` show a preview card (`/api/og/CODE`: inviter, founder number, rank, spots left, code).
- **Health check** `/api/health` reports the database and Redis.
- **Backups** run at 03:17 into `~/insider-backups`, kept 14 days. Restore with
  `gunzip -c FILE.sql.gz | psql "$DATABASE_URL"`.

## Production notes

- Postgres behind a pooler (transaction mode), Redis managed, the web app, realtime and indexer as separate services.
- Several RPC URLs in `RPC_URLS` (comma-separated) for fallback.
- `ALLOWED_ORIGINS` on the realtime service, set to the site's origin.
- The indexer runs `ensure_partitions()` hourly so next month's message and notification partitions always exist.
