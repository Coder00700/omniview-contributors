import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  adminBuffer,
  cleanupEligible,
  CONFIRM_CLEANUP,
} from "../admin-buffer.js";
const complete = {
  id: "downloaded",
  storage_provider: "b2",
  bytes: 12,
  object_path: "user/clip/video",
  downloaded_at: "2026-09-12",
  local_sha256: "a".repeat(64),
  local_receipt: "local/clip.webm",
  b2_version_id: "version-1",
  cloud_deleted_at: null,
};
test("cleanup requires durable receipt and exact B2 version", () => {
  assert.equal(cleanupEligible(complete), true);
  for (const patch of [
    { downloaded_at: null },
    { local_sha256: null },
    { b2_version_id: null },
    { cloud_deleted_at: "now" },
    { local_receipt: null },
  ])
    assert.equal(cleanupEligible({ ...complete, ...patch }), false);
});
async function setup(t, fail = false) {
  const rows = [
    { ...complete },
    { ...complete, id: "pending", downloaded_at: null },
  ];
  const calls = [];
  const admin = {
    from() {
      let id, update;
      const q = {
        select() {
          return q;
        },
        is() {
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        eq(_k, v) {
          id = v;
          return q;
        },
        update(v) {
          update = v;
          return q;
        },
        then(resolve) {
          if (update) {
            Object.assign(
              rows.find((c) => c.id === id),
              update,
            );
            return Promise.resolve({ error: null }).then(resolve);
          }
          return Promise.resolve({
            data: rows.filter((c) => !c.cloud_deleted_at),
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    adminBuffer({
      admin,
      s3: {
        async send(c) {
          calls.push(c);
          if (fail) throw Error("B2 unavailable");
          return {};
        },
      },
      env: { OMNIVIEW_ADMIN_TOKEN: "admin-token", B2_BUCKET: "private" },
      sign: async () => "",
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const request = async (body, token = "admin-token") => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/buffer/cleanup`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  return { rows, calls, request };
}
test("cleanup is admin-only, dry-run by default, and skips undownloaded clips", async (t) => {
  const { request, calls, rows } = await setup(t);
  assert.equal((await request({}, "user-token")).status, 403);
  const preview = await request({});
  assert.equal(preview.data.count, 1);
  assert.equal(calls.length, 0);
  const result = await request({
    confirm: CONFIRM_CLEANUP,
    clipIds: ["downloaded", "pending"],
  });
  assert.deepEqual(result.data.deleted, ["downloaded"]);
  assert.deepEqual(result.data.skipped, ["pending"]);
  assert.equal(calls[0].input.VersionId, "version-1");
  assert.equal(rows[1].cloud_deleted_at, null);
});
test("failed deletion never marks footage deleted", async (t) => {
  const { request, rows } = await setup(t, true);
  const r = await request({
    confirm: CONFIRM_CLEANUP,
    clipIds: ["downloaded"],
  });
  assert.deepEqual(r.data.failed, ["downloaded"]);
  assert.equal(rows[0].cloud_deleted_at, null);
});
