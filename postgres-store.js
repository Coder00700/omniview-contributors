import pg from "pg";
import { readFileSync } from "node:fs";
const tables = new Set(["contributions", "upload_sessions"]);
const identifier = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name))
    throw Error("Invalid database identifier");
  return '"' + name + '"';
};
export function postgresStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        new URL("./supabase/root-ca.crt", import.meta.url),
        "utf8",
      ),
    },
    max: 5,
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
  });
  return {
    async rpc(name, args) {
      try {
        if (name !== "reserve_buffer_clip") throw Error("Unknown function");
        const r = await pool.query(
          "select public.reserve_buffer_clip($1,$2,$3,$4) as result",
          [args.p_id, args.p_user, args.p_path, args.p_clip],
        );
        return { data: r.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table) {
      if (!tables.has(table)) throw Error("Unknown table");
      let mode = "select",
        fields = "*",
        values,
        filters = [],
        sort = "",
        max = 1000,
        offset = 0,
        single = false;
      const q = {
        select(s = "*") {
          fields = s === "*" ? "*" : s.split(",").map(identifier).join(",");
          return q;
        },
        eq(k, v) {
          filters.push([k, "=", v]);
          return q;
        },
        is(k, v) {
          if (v !== null) throw Error("Only null supported");
          filters.push([k, "is null"]);
          return q;
        },
        not(k, op, v) {
          if (op !== "is" || v !== null) throw Error("Unsupported filter");
          filters.push([k, "is not null"]);
          return q;
        },
        order(k, { ascending = true } = {}) {
          sort = ` order by ${identifier(k)} ${ascending ? "asc" : "desc"}`;
          return q;
        },
        range(a, b) {
          offset = a;
          max = b - a + 1;
          return q;
        },
        limit(n) {
          max = n;
          return q;
        },
        maybeSingle() {
          single = true;
          max = 1;
          return q;
        },
        insert(v) {
          mode = "insert";
          values = v;
          return q;
        },
        update(v) {
          mode = "update";
          values = v;
          return q;
        },
        delete() {
          mode = "delete";
          return q;
        },
        then(resolve, reject) {
          return (async () => {
            try {
              const params = [];
              const add = (v) => {
                params.push(v);
                return "$" + params.length;
              };
              const target = "public." + identifier(table);
              let sql;
              if (mode === "insert") {
                const cols = Object.keys(values);
                sql = `insert into ${target} (${cols.map(identifier)}) values (${cols.map((k) => add(values[k]))}) returning *`;
              } else {
                const assignment =
                  mode === "update"
                    ? Object.keys(values)
                        .map((k) => `${identifier(k)}=${add(values[k])}`)
                        .join(",")
                    : "";
                const where = filters.length
                  ? " where " +
                    filters
                      .map(
                        ([k, op, v]) =>
                          identifier(k) +
                          " " +
                          op +
                          (op === "=" ? " " + add(v) : ""),
                      )
                      .join(" and ")
                  : "";
                sql =
                  mode === "select"
                    ? `select ${fields} from ${target}${where}${sort} limit ${add(max)} offset ${add(offset)}`
                    : mode === "update"
                      ? `update ${target} set ${assignment}${where} returning *`
                      : `delete from ${target}${where} returning *`;
              }
              const r = await pool.query(sql, params);
              return { data: single ? r.rows[0] || null : r.rows, error: null };
            } catch (error) {
              return { data: null, error };
            }
          })().then(resolve, reject);
        },
      };
      return q;
    },
  };
}
