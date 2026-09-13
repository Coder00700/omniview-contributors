import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true,
    ca: await readFile(
      new URL("../supabase/root-ca.crt", import.meta.url),
      "utf8",
    ),
  },
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  await client.query("begin");
  const user = randomUUID(),
    id = randomUUID();
  await client.query("insert into auth.users(id) values($1)", [user]);
  const first = await client.query(
    "select public.reserve_buffer_clip($1,$2,$3,$4) result",
    [id, user, `${user}/${id}/video`, { bytes: 500000000 }],
  );
  if (!first.rows[0].result.initialize) throw Error("Reservation failed");
  await client.query(
    `insert into public.contributions(id,user_id,name,created_at,duration,bytes,object_path) select id,$1::uuid,'transaction-only capacity test',now(),1,500000000,($1::uuid)::text||'/'||id::text||'/video' from (select gen_random_uuid() id from generate_series(1,18)) s`,
    [user],
  );
  const next = randomUUID();
  const full = await client.query(
    "select public.reserve_buffer_clip($1,$2,$3,$4) result",
    [next, user, `${user}/${next}/video`, { bytes: 1 }],
  );
  if (!full.rows[0].result.full) throw Error("Capacity guard failed");
  console.log(
    "Live SQL capacity guard verified: 9.5 GB reserved blocks further admission. Test records rolled back.",
  );
} catch (e) {
  console.error("Quota check failed: " + (e.code || e.name));
  process.exitCode = 1;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
