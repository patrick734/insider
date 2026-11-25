/**
 * pm2 settings for the website, the chat sockets and (once switched on) the indexer.
 *
 *   pm2 start deploy/ecosystem.config.cjs && pm2 save
 *
 * Every app reads web/.env.local (one env file for the whole stack). pm2 runs node directly, not npm, so stop and
 * restart reach the real processes.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const envFile = path.join(root, "web/.env.local");
const env = {};
for (const line of fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split("\n") : []) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
const WEB_PORT = env.WEB_PORT || "3200";
// npm workspaces hoist next to the root node_modules; resolve it from the web app.
const nextBin = require.resolve("next/dist/bin/next", { paths: [path.join(root, "web")] });

const apps = [
  {
    name: "insider-web",
    cwd: path.join(root, "web"),
    script: "node",
    args: `${nextBin} start -p ${WEB_PORT} -H 127.0.0.1`,
    interpreter: "none",
    env: { ...env, NODE_ENV: "production" },
    max_memory_restart: "1G",
    restart_delay: 3000,
  },
  {
    name: "insider-realtime",
    cwd: path.join(root, "services/realtime"),
    script: "node",
    args: "--import tsx src/server.ts",
    interpreter: "none",
    env: { ...env, NODE_ENV: "production" },
    max_memory_restart: "512M",
    restart_delay: 3000,
  },
];

// The indexer reads the contracts and room coins on Base. It runs on the public endpoint too (polling more slowly);
// a paid RPC in RPC_URLS is better at scale. INDEXER=1 in the env file runs it.
if (env.INDEXER === "1") {
  apps.push({
    name: "insider-indexer",
    cwd: path.join(root, "services/indexer"),
    script: "node",
    args: "--import tsx src/indexer.ts",
    interpreter: "none",
    env: { ...env, NODE_ENV: "production" },
    max_memory_restart: "512M",
    restart_delay: 5000,
  });
}

module.exports = { apps };
