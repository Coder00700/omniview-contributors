import test from "node:test";
import assert from "node:assert/strict";
import { uploadVideo } from "../src/b2-uploader.js";
const client = {
  auth: {
    getSession: async () => ({ data: { session: { access_token: "test" } } }),
  },
};
test("browser skips confirmed parts and awaits archive confirmation", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    calls.push([url, opts]);
    if (url === "/api/uploads")
      return Response.json({ complete: false, partSize: 3, parts: [1] });
    if (url.endsWith("/part"))
      return Response.json({ url: "https://b2.example/part2" });
    if (url.startsWith("https:")) return new Response(null, { status: 200 });
    return Response.json({ complete: true });
  });
  await uploadVideo(
    client,
    { id: "clip", gps: [] },
    new Blob(["abcdef"]),
    () => {},
  );
  assert.equal(calls.filter(([url]) => url.startsWith("https:")).length, 1);
  assert.equal(await calls[2][1].body.text(), "def");
  assert.equal(calls.at(-1)[0], "/api/uploads/clip/complete");
});
test("failed B2 part rejects without requesting completion", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(url);
    if (url.startsWith("https:")) return new Response(null, { status: 503 });
    if (url === "/api/uploads")
      return Response.json({ complete: false, partSize: 3, parts: [] });
    if (url.endsWith("/part"))
      return Response.json({ url: "https://b2.example/part" });
    return new Response(null, { status: 503 });
  });
  await assert.rejects(
    uploadVideo(client, { id: "clip" }, new Blob(["abc"]), () => {}),
    /Retry to resume/,
  );
  assert.equal(
    calls.some((url) => url.endsWith("/complete")),
    false,
  );
});
