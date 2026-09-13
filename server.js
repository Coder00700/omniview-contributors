import { postgresStore } from "./postgres-store.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createSmsRouter } from "./sms-hook.js";
import { createClient } from "@supabase/supabase-js";
import { createStorageRouter } from "./storage-routes.js";
const app = express();
app.disable("x-powered-by");
const origins = new Set(["https://localhost", "http://localhost", "capacitor://localhost", "http://localhost:3001", "http://localhost:5173", "https://omniview-contributors.onrender.com"]);
app.use(cors({ origin: (origin, done) => done(null, !origin || origins.has(origin)), allowedHeaders: ["Authorization", "Content-Type"], methods: ["GET", "POST", "OPTIONS"] }));
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));
app.use("/api/hooks", createSmsRouter());
app.use(express.json({ limit: "2mb" }));
const auth =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;
const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : process.env.DATABASE_URL
      ? postgresStore(process.env.DATABASE_URL)
      : null;
app.use("/api", createStorageRouter({ auth, admin }));
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
app.use(express.static("dist"));
app.get("/{*path}", (_req, res) =>
  res.sendFile(`${process.cwd()}/dist/index.html`),
);
app.listen(process.env.PORT || 3001, () =>
  console.log(
    `Contributors app server listening on ${process.env.PORT || 3001}`,
  ),
);
