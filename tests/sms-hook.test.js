import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Webhook } from "standardwebhooks";
import { createSmsRouter } from "../sms-hook.js";
const secret = "whsec_" + Buffer.alloc(32, 7).toString("base64");
async function setup(t, send) {
  const app = express();
  app.use(createSmsRouter({ env: { SUPABASE_SMS_HOOK_SECRET: "v1," + secret, SMS_GATE_USERNAME: "test", SMS_GATE_PASSWORD: "test", SMS_GATE_DEVICE_ID: "device" }, send }));
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => server.close());
  return async (body, valid = true, id = "hook-1") => {
    const text = JSON.stringify(body), now = new Date();
    return fetch(`http://localhost:${server.address().port}/sms`, { method: "POST", headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(+now / 1000)), "webhook-signature": valid ? new Webhook(secret).sign(id, now, text) : "v1,bad" }, body: text });
  };
}
test("SMS hook rejects unsigned requests, sends only signed codes and deduplicates retries", async t => {
  const sent = [];
  const request = await setup(t, async (url, options) => { sent.push(JSON.parse(options.body)); return { ok: true }; });
  const body = { user: { phone: "919999999999" }, sms: { otp: "123456" } };
  assert.equal((await request(body, false)).status, 401);
  assert.equal(sent.length, 0);
  assert.equal((await request(body)).status, 200);
  assert.equal((await request(body)).status, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].phoneNumbers, ["+919999999999"]);
  assert.equal(sent[0].deviceId, "device");
  assert.ok(sent[0].id.length <= 36, "Gateway message ID must meet its API limit");
});
test("SMS hook reports failed gateway delivery and allows retry", async t => {
  let attempts = 0;
  const request = await setup(t, async () => ({ ok: ++attempts > 1 }));
  const body = { user: { phone: "+919999999999" }, sms: { otp: "123456" } };
  assert.equal((await request(body)).status, 502);
  assert.equal((await request(body)).status, 200);
  assert.equal((await request({ user: { phone: "invalid" }, sms: { otp: "123456" } }, true, "hook-2")).status, 400);
});
