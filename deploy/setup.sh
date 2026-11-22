#!/usr/bin/env bash
# Live setup (no demo): its own database (insider_live), real sign-in through Privy, waitlist-first mode, the indexer,
# and nightly database backups. Asks for each setting once and keeps the answers in ~/.insider-live.env (private).
# Run it again any time to update: it pulls nothing itself, so run `git pull` first.
#
#   cd ~/insider && git pull && bash deploy/setup.sh
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$HOME/.insider-live.env"
WEB_PORT="${WEB_PORT:-3200}"
RT_PORT="${RT_PORT:-4101}"
REDIS_DB="${REDIS_DB:-4}"
DB_NAME="${DB_NAME:-insider_live}"

touch "$CONF" && chmod 600 "$CONF"
# shellcheck disable=SC1090
. "$CONF"

ask() { # ask VAR "Question" default secret
  local var=$1 q=$2 def=${3:-} secret=${4:-}
  if [ -n "${!var:-}" ]; then return; fi
  local v
  if [ -n "$secret" ]; then read -rsp "$q: " v; echo; else read -rp "$q${def:+ [$def]}: " v; fi
  v=${v:-$def}
  printf -v "$var" '%s' "$v"
  printf '%s=%q\n' "$var" "$v" >> "$CONF"
}

echo "== Settings (saved in $CONF; edit or delete a line there to change it)"
ask DOMAIN "Domain" "insider.family"
ask PRIVY_APP_ID "Privy App ID" "cmwrox1vk01mb0hjqixvfsfiy"
ask X_HANDLE "Project X handle (without @)" "insiderfamily"
ask ADMIN_ADDRESSES "Admin wallet address(es), comma-separated" "0x05f1d3984f32a9fcb2d019e78764a20bc57da13d"
ask BASE_RPC_URL "Base RPC URL (Alchemy/QuickNode; kept private; Enter to skip for now)" "" secret
ask X_BEARER_TOKEN "X API bearer token for follow checks (Enter to skip)" "" secret
ask ZEROX_API_KEY "0x API key for swaps (Enter to skip)" "" secret
ask BUILDER_CODE "Base Builder Code (Enter to skip)" ""
[ -n "$PRIVY_APP_ID" ] || { echo "A Privy App ID is required."; exit 1; }
INDEXER=1
if [ -z "$BASE_RPC_URL" ]; then
  INDEXER=0
  echo "No RPC URL yet: the waitlist works, the chain indexer stays off. Run this again later and it will ask for the RPC URL again."
fi

echo "== Postgres and Redis"
if ! command -v psql >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq postgresql; fi
if ! command -v redis-server >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq redis-server; fi
sudo systemctl enable --now postgresql >/dev/null
sudo systemctl enable --now redis-server >/dev/null
PASS_FILE="$HOME/.insider-db-pass"
[ -f "$PASS_FILE" ] || (umask 077 && openssl rand -hex 16 > "$PASS_FILE")
DB_PASS="$(cat "$PASS_FILE")"
cd /tmp
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname = 'insider'" | grep -q 1; then
  sudo -u postgres psql -qc "create role insider login password '$DB_PASS'"
fi
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname = '$DB_NAME'" | grep -q 1; then
  sudo -u postgres createdb -O insider "$DB_NAME"
fi
cd "$APP"

echo "== Environment (web/.env.local)"
SECRET_FILE="$HOME/.insider-session-secret"
[ -f "$SECRET_FILE" ] || (umask 077 && openssl rand -hex 32 > "$SECRET_FILE")
umask 077
cat > "$APP/web/.env.local" <<ENV
DATABASE_URL=postgres://insider:$DB_PASS@127.0.0.1:5432/$DB_NAME
REDIS_URL=redis://127.0.0.1:6379/$REDIS_DB
SESSION_SECRET=$(cat "$SECRET_FILE")
NEXT_PUBLIC_CHAIN_ID=8453
RPC_URLS=${BASE_RPC_URL:+$BASE_RPC_URL,}https://mainnet.base.org
NEXT_PUBLIC_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_KEYS_ADDRESS=0x8e6Aa3707c2bE2F0472935c6bccB42222E15ADd2
NEXT_PUBLIC_ROOM_ACCESS_ADDRESS=0x892814990B94Acd528d951571EBE1f3A40E90706
NEXT_PUBLIC_SPLITTER_FACTORY_ADDRESS=0xD8a67860f648513D39B69292B3C4c09692889bC4
START_BLOCK=59626283
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_BRAND_DOMAIN=$DOMAIN
NEXT_PUBLIC_REALTIME_URL=wss://$DOMAIN
NEXT_PUBLIC_PRIVY_APP_ID=$PRIVY_APP_ID
NEXT_PUBLIC_PROJECT_X_HANDLE=$X_HANDLE
NEXT_PUBLIC_BUILDER_CODE=$BUILDER_CODE
X_BEARER_TOKEN=$X_BEARER_TOKEN
ZEROX_API_KEY=$ZEROX_API_KEY
ADMIN_ADDRESSES=$ADMIN_ADDRESSES
ALLOWED_ORIGINS=https://$DOMAIN
WEB_PORT=$WEB_PORT
REALTIME_PORT=$RT_PORT
UPLOAD_DIR=$HOME/insider-uploads-live
WAITLIST_MODE=1
INDEXER=$INDEXER
ENV
umask 022

echo "== Install, migrate, build"
npm ci --no-audit --no-fund
set -a; . "$APP/web/.env.local"; set +a
(cd packages/core && npx tsx src/scripts/migrate.ts)
(cd web && npm run build)

echo "== Start with pm2 (replaces the demo processes)"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "== Caddy"
if sudo grep -q "/usr/share/caddy" /etc/caddy/Caddyfile; then
  sudo mv /etc/caddy/Caddyfile /etc/caddy/Caddyfile.default.bak
  sudo touch /etc/caddy/Caddyfile
fi
if ! sudo grep -q "^$DOMAIN {" /etc/caddy/Caddyfile; then
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<CADDY

$DOMAIN {
	encode zstd gzip
	handle /ws* {
		reverse_proxy 127.0.0.1:$RT_PORT
	}
	handle {
		reverse_proxy 127.0.0.1:$WEB_PORT
	}
}
CADDY
fi
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl reload caddy

echo "== Nightly backups (03:17, kept 14 days in ~/insider-backups)"
mkdir -p "$HOME/insider-backups"
( crontab -l 2>/dev/null | grep -v "# insider-backup" ; echo "17 3 * * * DB_NAME=$DB_NAME bash $APP/deploy/backup.sh >> $HOME/insider-backups/backup.log 2>&1 # insider-backup" ) | crontab -

echo
echo "Live: https://$DOMAIN  (health check: https://$DOMAIN/api/health)"
echo "Admin review queue: https://$DOMAIN/admin/waitlist (sign in with an admin wallet)"
