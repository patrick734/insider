import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "../db";

/** Applies db/migrations/*.sql in order, once each, inside a transaction per file. */
const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../db/migrations");

const db = sql();
await db`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await db`select name from schema_migrations`).map((r) => r.name as string));
for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  const text = await readFile(join(dir, file), "utf8");
  await db.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`insert into schema_migrations (name) values (${file})`;
  });
  console.log("applied", file);
}
await db.end();
