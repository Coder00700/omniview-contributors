import { adminBuffer } from "./admin-buffer.js";
import { Router } from "express";
import {
  S3Client,
  CreateMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export const PART_SIZE = 8 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateClip(c) {
  if (
    !c ||
    !uuid.test(c.id) ||
    typeof c.name !== "string" ||
    c.name.length < 1 ||
    c.name.length > 120 ||
    !Number.isInteger(c.bytes) ||
    c.bytes < 1 ||
    c.bytes > 524288000 ||
    !Number.isFinite(c.duration) ||
    c.duration < 0 ||
    c.duration > 305 ||
    !Number.isFinite(c.created) ||
    !Number.isFinite(new Date(c.created).getTime()) ||
    !/^video\/(webm|mp4)(;codecs=[a-z0-9., -]+)?$/i.test(c.mime)
  )
    throw Error("Invalid clip details.");
  if (
    !Array.isArray(c.gps) ||
    c.gps.length > 20000 ||
    c.gps.some(
      (p) =>
        !Number.isFinite(p.lat) ||
        Math.abs(p.lat) > 90 ||
        !Number.isFinite(p.lng) ||
        Math.abs(p.lng) > 180 ||
        !Number.isFinite(p.timestamp) ||
        !Number.isFinite(p.accuracy) ||
        p.accuracy < 0,
    )
  )
    throw Error("Invalid location track.");
  return {
    id: c.id,
    name: c.name,
    bytes: c.bytes,
    duration: c.duration,
    created: c.created,
    mime: c.mime,
    gps: c.gps.map(
      ({ lat, lng, timestamp, accuracy, heading, speed, relativeMs }) => ({
        lat,
        lng,
        timestamp,
        accuracy,
        heading,
        speed,
        relativeMs,
      }),
    ),
    timing: String(c.timing || "Approximate browser alignment").slice(0, 300),
  };
}
export function validateParts(parts, bytes) {
  const count = Math.ceil(bytes / PART_SIZE);
  if (
    parts.length !== count ||
    parts.some(
      (p, i) =>
        p.PartNumber !== i + 1 ||
        !p.ETag ||
        p.Size !== Math.min(PART_SIZE, bytes - i * PART_SIZE),
    )
  )
    throw Error(
      "Some video parts are missing or have the wrong size. Retry the upload.",
    );
  return parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
}
export function createStorageRouter({
  auth,
  admin,
  env = process.env,
  s3: injected,
  sign = getSignedUrl,
}) {
  const router = Router();
  const configured =
    env.B2_ENDPOINT &&
    env.B2_REGION &&
    env.B2_BUCKET &&
    env.B2_KEY_ID &&
    env.B2_APPLICATION_KEY;
  const s3 =
    injected ||
    (configured
      ? new S3Client({
          endpoint: env.B2_ENDPOINT,
          region: env.B2_REGION,
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.B2_KEY_ID,
            secretAccessKey: env.B2_APPLICATION_KEY,
          },
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
        })
      : null);
  router.use("/admin", adminBuffer({ admin, s3, env, sign }));
  router.use(async (req, res, next) => {
    try {
      if (!auth || !admin)
        return res.status(503).json({
          error:
            "Supabase server authentication and database access are not configured.",
        });
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) return res.status(401).json({ error: "Please sign in." });
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user)
        return res.status(401).json({ error: "Please sign in again." });
      req.userId = data.user.id;
      next();
    } catch {
      res
        .status(503)
        .json({ error: "Authentication is temporarily unavailable." });
    }
  });
  const run = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(e.status || 502).json({
        error:
          e.publicMessage ||
          "Video storage is temporarily unavailable. Your local clip is retained; please retry.",
      });
    }
  };
  const needB2 = () => {
    if (!s3) {
      const e = Error();
      e.status = 503;
      e.publicMessage =
        "Backblaze B2 is not configured. Your local footage is retained.";
      throw e;
    }
  };
  async function row(table, id, user) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq("id", id)
      .eq("user_id", user)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function session(req) {
    if (!uuid.test(req.params.id)) {
      const e = Error();
      e.status = 400;
      throw e;
    }
    const r = await row("upload_sessions", req.params.id, req.userId);
    if (!r) {
      const e = Error();
      e.status = 404;
      e.publicMessage = "Upload session not found. Start the upload again.";
      throw e;
    }
    return r;
  }
  const args = (r) => ({
    Bucket: env.B2_BUCKET,
    Key: r.object_path,
    UploadId: r.upload_id,
  });
  async function list(r) {
    const result = await s3.send(new ListPartsCommand(args(r)));
    return result.Parts || [];
  }
  async function isStored(r) {
    try {
      const h = await s3.send(
        new HeadObjectCommand({ Bucket: env.B2_BUCKET, Key: r.object_path }),
      );
      return (
        h.ContentLength === r.clip.bytes && h.Metadata?.["clip-id"] === r.id
      );
    } catch (e) {
      if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound")
        return false;
      throw e;
    }
  }
  async function finalize(r) {
    const c = r.clip;
    const stored = await s3.send(
      new HeadObjectCommand({ Bucket: env.B2_BUCKET, Key: r.object_path }),
    );
    if (!stored.VersionId) throw Error("B2 object version missing");
    const { error } = await admin.from("contributions").insert({
      id: r.id,
      user_id: r.user_id,
      name: c.name,
      created_at: new Date(c.created).toISOString(),
      duration: c.duration,
      bytes: c.bytes,
      object_path: r.object_path,
      storage_provider: "b2",
      b2_version_id: stored.VersionId,
      metadata: { gps: c.gps, timing: c.timing, mime: c.mime },
    });
    if (error) throw error;
    await admin
      .from("upload_sessions")
      .delete()
      .eq("id", r.id)
      .eq("user_id", r.user_id);
  }
  router.post(
    "/uploads",
    run(async (req, res) => {
      needB2();
      let clip;
      try {
        clip = validateClip(req.body);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      const done = await row("contributions", clip.id, req.userId);
      if (done) return res.json({ complete: true });
      let r = await row("upload_sessions", clip.id, req.userId);
      if (r && (r.clip.bytes !== clip.bytes || r.clip.mime !== clip.mime))
        return res.status(409).json({
          error: "This clip no longer matches the saved upload session.",
        });
      if (!r || !r.upload_id) {
        const key = `${req.userId}/${clip.id}/video`;
        const { data: reservation, error: reservationError } = await admin.rpc(
          "reserve_buffer_clip",
          { p_id: clip.id, p_user: req.userId, p_path: key, p_clip: clip },
        );
        if (reservationError) throw reservationError;
        if (reservation.full)
          return res
            .status(507)
            .json({
              error:
                "The temporary cloud buffer is full. Your clip remains on this device until an admin downloads and clears space.",
            });
        r = reservation;
        if (!r.upload_id && !r.initialize)
          return res
            .status(409)
            .json({
              error: "This upload is being initialized. Retry shortly.",
            });
        if (!r.upload_id) {
          const result = await s3.send(
            new CreateMultipartUploadCommand({
              Bucket: env.B2_BUCKET,
              Key: key,
              ContentType: clip.mime,
              Metadata: { "clip-id": clip.id },
            }),
          );
          r.upload_id = result.UploadId;
          const { error } = await admin
            .from("upload_sessions")
            .update({ upload_id: r.upload_id })
            .eq("id", clip.id)
            .eq("user_id", req.userId);
          if (error) {
            await s3
              .send(new AbortMultipartUploadCommand(args(r)))
              .catch(() => {});
            throw error;
          }
        }
      }
      if (await isStored(r)) {
        await finalize(r);
        return res.json({ complete: true });
      }
      let parts;
      try {
        parts = await list(r);
      } catch (e) {
        if (e.name === "NoSuchUpload") {
          await admin
            .from("upload_sessions")
            .delete()
            .eq("id", r.id)
            .eq("user_id", req.userId);
          return res.status(409).json({
            error:
              "The incomplete upload expired. Retry to start a fresh upload.",
          });
        }
        throw e;
      }
      res.json({
        complete: false,
        partSize: PART_SIZE,
        parts: parts
          .filter(
            (p) =>
              p.Size ===
              Math.min(PART_SIZE, clip.bytes - (p.PartNumber - 1) * PART_SIZE),
          )
          .map((p) => p.PartNumber),
      });
    }),
  );
  router.post(
    "/uploads/:id/part",
    run(async (req, res) => {
      needB2();
      const r = await session(req);
      if (!r.upload_id)
        return res
          .status(409)
          .json({ error: "Upload initialization is pending." });
      const part = req.body.partNumber;
      if (
        !Number.isInteger(part) ||
        part < 1 ||
        part > Math.ceil(r.clip.bytes / PART_SIZE)
      )
        return res.status(400).json({ error: "Invalid video part." });
      const url = await sign(
        s3,
        new UploadPartCommand({
          ...args(r),
          PartNumber: part,
          ContentLength: Math.min(
            PART_SIZE,
            r.clip.bytes - (part - 1) * PART_SIZE,
          ),
        }),
        { expiresIn: 600 },
      );
      res.json({ url });
    }),
  );
  router.post(
    "/uploads/:id/complete",
    run(async (req, res) => {
      needB2();
      const done = await row("contributions", req.params.id, req.userId);
      if (done) return res.json({ complete: true });
      const r = await session(req);
      if (!(await isStored(r))) {
        const parts = await list(r);
        let verified;
        try {
          verified = validateParts(parts, r.clip.bytes);
        } catch (e) {
          return res.status(409).json({ error: e.message });
        }
        await s3.send(
          new CompleteMultipartUploadCommand({
            ...args(r),
            MultipartUpload: { Parts: verified },
          }),
        );
        if (!(await isStored(r))) throw Error("Object verification failed");
      }
      await finalize(r);
      res.json({ complete: true });
    }),
  );
  router.get(
    "/footage/:id/playback",
    run(async (req, res) => {
      if (!uuid.test(req.params.id))
        return res.status(400).json({ error: "Invalid clip." });
      const c = await row("contributions", req.params.id, req.userId);
      if (!c) return res.status(404).json({ error: "Clip not found." });
      if (c.cloud_deleted_at)
        return res
          .status(410)
          .json({
            error:
              "Transferred to local OmniView. The temporary cloud copy was removed.",
          });
      if (c.storage_provider === "supabase") {
        const { data, error } = await admin.storage
          .from("footage")
          .createSignedUrl(c.object_path, 3600);
        if (error) throw error;
        return res.json({ url: data.signedUrl });
      }
      needB2();
      res.json({
        url: await sign(
          s3,
          new GetObjectCommand({ Bucket: env.B2_BUCKET, Key: c.object_path }),
          { expiresIn: 3600 },
        ),
      });
    }),
  );
  return router;
}
