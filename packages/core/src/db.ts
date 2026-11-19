import postgres from "postgres";
import { env } from "./env";

export type Sql = postgres.Sql<Record<string, unknown>>;

const g = globalThis as unknown as { __insiderSql?: Sql };

/**
 * One pooled connection set per process. In production DATABASE_URL points at a pooler (PgBouncer / Supavisor in
 * transaction mode), so prepared statements are off.
 */
export function sql(): Sql {
  if (!g.__insiderSql) {
    g.__insiderSql = postgres(env("DATABASE_URL"), {
      max: Number(process.env.DB_POOL_MAX || 10),
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
      types: { bigint: postgres.BigInt },
      transform: { undefined: null },
    }) as unknown as Sql;
  }
  return g.__insiderSql;
}
