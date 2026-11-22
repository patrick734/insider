#!/usr/bin/env bash
# Puts the app online on an Ubuntu server that already runs Caddy, Node 22 and pm2 (like the Elypad VPS), with demo
# data and demo sign-in. Safe to run again: it only creates what's missing, then pulls, builds and restarts.
#
#   DOMAIN=insider.family ALIASES=www.insider.family bash deploy/demo-setup.sh
#
# DOMAIN can be any hostname pointing at this server. *.sslip.io names resolve to the IP inside them, so they work
# without DNS changes, and Caddy gets an HTTPS certificate for them.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=insider.18-224-166-132.sslip.io}"
APP="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PORT="${WEB_PORT:-3200}"
RT_PORT="${RT_PORT:-4101}"
REDIS_DB="${REDIS_DB:-3}"

echo "== Postgres and Redis"
if ! command -v psql >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq postgresql; fi
if ! command -v redis-server >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq redis-server; fi
sudo systemctl enable --now postgresql >/dev/null
sudo systemctl enable --now redis-server >/dev/null

PASS_FILE="$HOME/.insider-db-pass"
[ -f "$PASS_FILE" ] || (umask 077 && openssl rand -hex 16 > "$PASS_FILE")
DB_PASS="$(cat "$PASS_FILE")"
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname = 'insider'" | grep -q 1; then
  sudo -u postgres psql -qc "create role insider login password '$DB_PASS'"
fi
if ! sudo -u postgres psql -tAc "select 1 from pg_database where datname = 'insider'" | grep -q 1; then
  sudo -u postgres createdb -O insider insider
fi

echo "== Environment (web/.env.local)"
SECRET_FILE="$HOME/.insider-session-secret"
[ -f "$SECRET_FILE" ] || (umask 077 && openssl rand -hex 32 > "$SECRET_FILE")
umask 077
cat > "$APP/web/.env.local" <<ENV
DATABASE_URL=postgres://insider:$DB_PASS@127.0.0.1:5432/insider
REDIS_URL=redis://127.0.0.1:6379/$REDIS_DB
SESSION_SECRET=$(cat "$SECRET_FILE")
NEXT_PUBLIC_CHAIN_ID=8453
RPC_URLS=${RPC_URLS:-https://mainnet.base.org}
NEXT_PUBLIC_RPC_URL=${PUBLIC_RPC_URL:-https://mainnet.base.org}
NEXT_PUBLIC_KEYS_ADDRESS=0x8e6Aa3707c2bE2F0472935c6bccB42222E15ADd2
NEXT_PUBLIC_ROOM_ACCESS_ADDRESS=0x892814990B94Acd528d951571EBE1f3A40E90706
NEXT_PUBLIC_SPLITTER_FACTORY_ADDRESS=0xD8a67860f648513D39B69292B3C4c09692889bC4
START_BLOCK=59626283
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_REALTIME_URL=wss://$DOMAIN
ALLOWED_ORIGINS=https://$DOMAIN
WEB_PORT=$WEB_PORT
REALTIME_PORT=$RT_PORT
UPLOAD_DIR=$HOME/insider-uploads
DEMO_LOGIN=1
ENV
umask 022

echo "== Install, migrate, sample data, build"
cd "$APP"
npm ci --no-audit --no-fund
set -a; . "$APP/web/.env.local"; set +a
(cd packages/core && npx tsx src/scripts/migrate.ts && npx tsx src/scripts/seed.ts && npx tsx src/scripts/seed-members.ts)
(cd web && npm run build)

echo "== Start with pm2"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "== Caddy"
# A fresh Caddy install ships a catch-all welcome page on :80; set it aside so it doesn't swallow this site's traffic.
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
# Extra names (e.g. ALIASES=www.insider.family) redirect to DOMAIN.
for alias in ${ALIASES:-}; do
  if ! sudo grep -q "^$alias {" /etc/caddy/Caddyfile; then
    sudo tee -a /etc/caddy/Caddyfile >/dev/null <<CADDY

$alias {
	redir https://$DOMAIN{uri} permanent
}
CADDY
  fi
done
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
sudo systemctl reload caddy

echo
echo "Done: https://$DOMAIN (first load can take a few seconds while Caddy gets the certificate)"
