import { roomAccess } from "../access";
import { sql } from "../db";

/** Print who can enter each room right now (debugging aid): `tsx src/scripts/check-access.ts`. */
const db = sql();
for (const room of await db`select id, slug from rooms order by id`) {
  for (const u of await db`select id, handle from users order by id`) {
    const a = await roomAccess(db, String(room.id), String(u.id));
    console.log(`${room.slug} @${u.handle}: ${a.ok ? `in (${a.via})` : `out (${a.reason})`} keys=${a.keys} coin=${a.coinBalance} threshold=${a.threshold}`);
  }
}
await db.end();
