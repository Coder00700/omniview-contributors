import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createStorageRouter,
  validateClip,
  validateParts,
  PART_SIZE,
} from "../storage-routes.js";
const id = "c01b5d17-e7a8-43e8-ab3d-1d77c3e9fd80";
const clip = {
  id,
  name: "Road clip",
  bytes: PART_SIZE + 10,
  duration: 180,
  created: Date.now(),
  mime: "video/webm",
  gps: [{ lat: 19, lng: 72, timestamp: Date.now(), accuracy: 5 }],
};
test("reject malformed metadata and discard untrusted owner/verification fields", () => {
  assert.equal(
    validateClip({ ...clip, user_id: "other", ignoredField: true }).user_id,
    undefined,
  );
  for (const patch of [
    { bytes: 0 },
    { bytes: 524288001 },
    { duration: 400 },
    { id: "../other" },
    { mime: "text/html" },
    { gps: [{ lat: 100, lng: 10, timestamp: 0, accuracy: 3 }] },
  ])
    assert.throws(() => validateClip({ ...clip, ...patch }));
});
test("completion requires exact B2 part count, order, lengths and ETags", () => {
  const p = [
    { PartNumber: 1, Size: PART_SIZE, ETag: "a" },
    { PartNumber: 2, Size: 10, ETag: "b" },
  ];
  assert.equal(validateParts(p, clip.bytes).length, 2);
  assert.throws(() => validateParts(p.slice(0, 1), clip.bytes));
  assert.throws(() => validateParts([...p].reverse(), clip.bytes));
  assert.throws(() => validateParts([{ ...p[0], Size: 2 }, p[1]], clip.bytes));
});
function database(initial = {}) {
  const data = { contributions: [], upload_sessions: [], ...initial };
  let fail = false;
  return {
    data,
    set failWrites(v) {
      fail = v;
    },
    from(table) {
      let filters = [];
      let op = "read";
      let value;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        maybeSingle: async () => ({
          data:
            data[table].find((r) => filters.every(([k, v]) => r[k] === v)) ||
            null,
        }),
        insert(v) {
          op = "insert";
          value = v;
          return q;
        },
        delete() {
          op = "delete";
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              if (op === "insert") {
                if (fail && table === "contributions")
                  return { error: Error("Database unavailable") };
                if (data[table].some((r) => r.id === value.id))
                  return { error: Error("Conflict") };
                data[table].push(value);
              }
              if (op === "delete")
                data[table] = data[table].filter(
                  (r) => !filters.every(([k, v]) => r[k] === v),
                );
              return { error: null };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
  };
}
async function setup(t, { db = database(), stored = false, parts = [] } = {}) {
  const calls = [];
  let exists = stored;
  const s3 = {
    async send(cmd) {
      calls.push(cmd);
      switch (cmd.constructor.name) {
        case "HeadObjectCommand":
          if (!exists) throw Object.assign(Error(), { name: "NotFound" });
          return {
            ContentLength: clip.bytes,
            Metadata: { "clip-id": id },
            VersionId: "test-version",
          };
        case "ListPartsCommand":
          return { Parts: parts };
        case "CreateMultipartUploadCommand":
          return { UploadId: "test-upload" };
        case "CompleteMultipartUploadCommand":
          exists = true;
          return {};
        default:
          return {};
      }
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createStorageRouter({
      auth: {
        auth: {
          getUser: async (token) =>
            token === "valid"
              ? { data: { user: { id: "user-a" } } }
              : { data: { user: null }, error: Error() },
        },
      },
      admin: db,
      s3,
      env: { B2_BUCKET: "private-test" },
      sign: async (_s, cmd) => {
        calls.push(cmd);
        return "https://example.invalid/signed";
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const request = async (path, body, token = "valid") => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  return { request, calls, db };
}
test("unauthenticated callers and cross-account playback/parts receive no signed URL", async (t) => {
  const db = database({
    contributions: [{ id, user_id: "user-b", object_path: "user-b/video" }],
    upload_sessions: [{ id, user_id: "user-b" }],
  });
  const { request, calls } = await setup(t, { db });
  assert.equal((await request("/uploads", clip, "bad")).status, 401);
  assert.equal((await request(`/footage/${id}/playback`)).status, 404);
  assert.equal(
    (await request(`/uploads/${id}/part`, { partNumber: 1 })).status,
    404,
  );
  assert.equal(calls.length, 0);
});
test("resume discovers B2 parts and signs only valid account-owned part numbers", async (t) => {
  const r = {
    id,
    user_id: "user-a",
    object_path: `user-a/${id}/video`,
    upload_id: "test",
    clip,
  };
  const { request, calls } = await setup(t, {
    db: database({ upload_sessions: [r] }),
    parts: [{ PartNumber: 1, Size: PART_SIZE, ETag: "a" }],
  });
  assert.deepEqual((await request("/uploads", clip)).data.parts, [1]);
  assert.equal(
    (await request(`/uploads/${id}/part`, { partNumber: 3 })).status,
    400,
  );
  assert.equal(
    (await request(`/uploads/${id}/part`, { partNumber: 2 })).status,
    200,
  );
  const signed = calls.find((c) => c.constructor.name === "UploadPartCommand");
  assert.equal(signed.input.ContentLength, 10);
  assert.equal(signed.input.Key, r.object_path);
});
test("database failure after B2 completion is recoverable without reuploading", async (t) => {
  const r = {
    id,
    user_id: "user-a",
    object_path: `user-a/${id}/video`,
    upload_id: "test",
    clip,
  };
  const db = database({ upload_sessions: [r] });
  const { request, calls } = await setup(t, {
    db,
    parts: [
      { PartNumber: 1, Size: PART_SIZE, ETag: "a" },
      { PartNumber: 2, Size: 10, ETag: "b" },
    ],
  });
  db.failWrites = true;
  assert.equal((await request(`/uploads/${id}/complete`, {})).status, 502);
  assert.equal(db.data.contributions.length, 0);
  assert.equal(db.data.upload_sessions.length, 1);
  db.failWrites = false;
  assert.equal((await request("/uploads", clip)).data.complete, true);
  assert.equal(db.data.contributions[0].storage_provider, "b2");
  assert.deepEqual(db.data.contributions[0].metadata.gps, clip.gps);
  assert.equal(db.data.upload_sessions.length, 0);
  assert.equal(
    calls.filter((c) => c.constructor.name === "CompleteMultipartUploadCommand")
      .length,
    1,
  );
});
