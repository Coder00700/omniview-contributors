import express from "express";
import { Webhook } from "standardwebhooks";
import { createHash } from "node:crypto";

export function createSmsRouter({ env = process.env, send = fetch } = {}) {
  const router = express.Router();
  const delivered = new Map();
  const pending = new Map();
  router.post("/sms", express.raw({ type: "application/json", limit: "32kb" }), async (req, res) => {
    if (!env.SUPABASE_SMS_HOOK_SECRET || !env.SMS_GATE_USERNAME || !env.SMS_GATE_PASSWORD)
      return res.status(503).json({ error: { message: "SMS delivery is not configured" } });
    let payload;
    try {
      const secret = env.SUPABASE_SMS_HOOK_SECRET.replace(/^v1,whsec_/, "whsec_");
      payload = new Webhook(secret).verify(req.body, req.headers);
    } catch {
      return res.status(401).json({ error: { message: "Invalid hook signature" } });
    }
    const phone = "+" + String(payload.user?.phone || "").replace(/^\+/, "");
    const otp = String(payload.sms?.otp || "");
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !/^\d{6}$/.test(otp))
      return res.status(400).json({ error: { message: "Invalid SMS request" } });
    const now = Date.now();
    for (const [id, time] of delivered) if (now - time > 600000) delivered.delete(id);
    // SMSGate accepts message IDs up to 36 characters; retain 128 bits for retry identity.
    const id = createHash("sha256").update(req.headers["webhook-id"]).digest("hex").slice(0, 32);
    if (delivered.has(id)) return res.status(200).json({});
    try {
      if (!pending.has(id)) {
        const job = (async () => {
          const response = await send("https://api.sms-gate.app/3rdparty/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(env.SMS_GATE_USERNAME + ":" + env.SMS_GATE_PASSWORD).toString("base64") },
            body: JSON.stringify({ id, phoneNumbers: [phone], textMessage: { text: `Your OmniView verification code is ${otp}. Do not share this code.` }, ...(env.SMS_GATE_DEVICE_ID ? { deviceId: env.SMS_GATE_DEVICE_ID } : {}), ttl: 300 }),
            signal: AbortSignal.timeout(3500),
          });
          if (!response.ok) {
            console.error("SMS gateway rejected request", { status: response.status });
            throw Error("Gateway rejected request");
          }
          delivered.set(id, Date.now());
        })();
        pending.set(id, job);
      }
      await pending.get(id);
      res.status(200).json({});
    } catch {
      res.status(502).json({ error: { message: "SMS delivery unavailable. Please try again." } });
    } finally {
      pending.delete(id);
    }
  });
  return router;
}
