# Insider

The clubhouse for every coin on Base: holder-gated coin rooms with live chat, access keys that share in the room's
fees, in-app swaps that pay the host, and verified on-chain PnL.

## Layout

```
contracts/          Foundry: InsiderKeys, RoomAccess, SplitterFactory + RoomFeeSplitter (tests in contracts/test)
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
- **Keys:** price `0.002 + 0.00015·s + 0.000002·min(s,40)²` ETH; 8% fee (4% host, 2% protocol, 2% holders); a flip
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

## Before mainnet keys

The plan's rule stands: keys stay on testnet until a third-party audit of InsiderKeys, RoomAccess and the splitter,
and a re-test of the fixes. Coin-gated rooms, chat and swaps don't depend on the key contracts and can go live first.

## Production notes

- Postgres behind a pooler (transaction mode), Redis managed, the web app, realtime and indexer as separate services.
- Several RPC URLs in `RPC_URLS` (comma-separated) for fallback.
- `ALLOWED_ORIGINS` on the realtime service, set to the site's origin.
- The indexer runs `ensure_partitions()` hourly so next month's message and notification partitions always exist.
