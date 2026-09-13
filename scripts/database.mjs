import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
const ca = await readFile(
  new URL("../supabase/root-ca.crt", import.meta.url),
  "utf8",
);
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true, ca },
  connectionTimeoutMillis: 15000,
  statement_timeout: 20000,
  application_name: "omniview-contributors-setup",
});
try {
  await client.connect();
  if (["apply", "secure", "buffer"].includes(process.argv[2])) {
    const files =
      process.argv[2] === "buffer"
        ? ["temporary-buffer.sql"]
        : process.argv[2] === "secure"
          ? ["access.sql"]
          : ["schema.sql", "access.sql"];
    const sql = (
      await Promise.all(
        files.map((name) =>
          readFile(new URL(`../supabase/${name}`, import.meta.url), "utf8"),
        ),
      )
    ).join("\n");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log("App schema transaction committed.");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  const { rows } = await client.query(
    "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename",
  );
  console.log(JSON.stringify({ tables: rows }));
  const columns = await client.query(
    "select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('contributions','upload_sessions') order by table_name,ordinal_position",
  );
  console.log(JSON.stringify({ appColumns: columns.rows }));
  const policies = await client.query(
    "select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in ('contributions','upload_sessions')",
  );
  console.log(JSON.stringify({ appPolicies: policies.rows }));
  const grants = await client.query(
    "select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role') order by table_name,grantee,privilege_type",
  );
  console.log(JSON.stringify({ grants: grants.rows }));
} catch (e) {
  console.error(
    JSON.stringify({
      errorCode: e.code || e.name,
      message:
        "Database connection or schema operation failed. Credentials are not printed.",
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
