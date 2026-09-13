import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
export const CONFIRM_CLEANUP = "DELETE_DOWNLOADED_TEMPORARY_VIDEOS";
export const cleanupEligible = (c) =>
  !!(
    c.downloaded_at &&
    c.local_sha256 &&
    c.local_receipt &&
    c.b2_version_id &&
    !c.cloud_deleted_at &&
    c.storage_provider === "b2"
  );
export function adminBuffer({ admin, s3, env, sign }) {
  const router = Router();
  router.use((req, res, next) => {
    const expected = env.OMNIVIEW_ADMIN_TOKEN;
    const provided = req.headers.authorization?.replace(/^Bearer /, "") || "";
    if (
      !expected ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      return res.status(403).json({ error: "Admin authorization required." });
    if (!admin || !s3)
      return res
        .status(503)
        .json({ error: "Database or B2 connection is not configured." });
    next();
  });
  const run = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch {
      res
        .status(502)
        .json({
          error:
            "Buffer operation failed. Nothing is marked cleaned until B2 deletion is confirmed.",
        });
    }
  };
  async function all() {
    let result = [];
    for (let page = 0; ; page++) {
      const { data, error } = await admin
        .from("contributions")
        .select("*")
        .is("cloud_deleted_at", null)
        .order("id")
        .range(page * 500, page * 500 + 499);
      if (error) throw error;
      result.push(...data);
      if (data.length < 500) return result;
    }
  }
  const object = (c) => ({
    Bucket: env.B2_BUCKET,
    Key: c.object_path,
    VersionId: c.b2_version_id,
  });
  router.get(
    "/buffer",
    run(async (req, res) => {
      const list = await all();
      res.json({
        targetBytes: 10000000000,
        admissionLimitBytes: 9500000000,
        storedBytes: list.reduce((n, c) => n + Number(c.bytes), 0),
        clips: list.map((c) => ({
          id: c.id,
          bytes: c.bytes,
          downloaded: !!c.downloaded_at,
          cleanupEligible: cleanupEligible(c),
        })),
      });
    }),
  );
  router.get(
    "/downloads",
    run(async (req, res) => {
      const list = await all();
      res.json({
        clips: await Promise.all(
          list
            .filter((c) => !c.downloaded_at && c.storage_provider === "b2")
            .map(async (c) => {
              let version = c.b2_version_id;
              if (!version) {
                const h = await s3.send(
                  new HeadObjectCommand({
                    Bucket: env.B2_BUCKET,
                    Key: c.object_path,
                  }),
                );
                if (h.ContentLength !== Number(c.bytes) || !h.VersionId)
                  throw Error("Version required");
                version = h.VersionId;
                const { error } = await admin
                  .from("contributions")
                  .update({ b2_version_id: version })
                  .eq("id", c.id);
                if (error) throw error;
              }
              return {
                id: c.id,
                bytes: Number(c.bytes),
                versionId: version,
                metadata: c.metadata,
                url: await sign(
                  s3,
                  new GetObjectCommand({ ...object(c), VersionId: version, ResponseContentDisposition: `attachment; filename="${c.id}.${c.metadata?.mime?.includes("mp4") ? "mp4" : "webm"}"` }),
                  { expiresIn: 3600 },
                ),
              };
            }),
        ),
      });
    }),
  );
  router.post(
    "/downloads/:id/confirm",
    run(async (req, res) => {
      const { data: c, error } = await admin
        .from("contributions")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!c || c.cloud_deleted_at)
        return res.status(404).json({ error: "Active cloud clip not found." });
      const b = req.body;
      if (
        b.bytes !== Number(c.bytes) ||
        b.versionId !== c.b2_version_id ||
        !/^[a-f0-9]{64}$/.test(b.sha256 || "") ||
        typeof b.receipt !== "string" ||
        !b.receipt.length ||
        b.receipt.length > 500
      )
        return res
          .status(400)
          .json({
            error:
              "A matching version, byte count, SHA-256 and local receipt are required.",
          });
      const h = await s3.send(new HeadObjectCommand(object(c)));
      if (h.ContentLength !== Number(c.bytes)) throw Error();
      const { error: e } = await admin
        .from("contributions")
        .update({
          downloaded_at: new Date().toISOString(),
          local_sha256: b.sha256,
          local_receipt: b.receipt,
        })
        .eq("id", c.id);
      if (e) throw e;
      res.json({
        confirmed: true,
        cleanupAvailable: true,
        message:
          "Downloaded to local OmniView. An admin may now run cloud cleanup.",
      });
    }),
  );
  router.post(
    "/buffer/cleanup",
    run(async (req, res) => {
      const eligible = (await all()).filter(cleanupEligible);
      if (req.body.confirm !== CONFIRM_CLEANUP)
        return res.json({
          dryRun: true,
          clipIds: eligible.map((c) => c.id),
          count: eligible.length,
          bytes: eligible.reduce((n, c) => n + Number(c.bytes), 0),
          confirmation: CONFIRM_CLEANUP,
        });
      if (!Array.isArray(req.body.clipIds) || req.body.clipIds.length > 10000)
        return res
          .status(400)
          .json({ error: "Provide the clipIds from the cleanup preview." });
      const requested = new Set(req.body.clipIds);
      const deleted = [],
        failed = [];
      for (const c of eligible.filter((c) => requested.has(c.id))) {
        try {
          try {
            await s3.send(new DeleteObjectCommand(object(c)));
          } catch (e) {
            if (e.$metadata?.httpStatusCode !== 404) throw e;
          }
          const { error } = await admin
            .from("contributions")
            .update({ cloud_deleted_at: new Date().toISOString() })
            .eq("id", c.id);
          if (error) throw error;
          deleted.push(c.id);
        } catch {
          failed.push(c.id);
        }
      }
      res.json({
        deleted,
        failed,
        skipped: req.body.clipIds.filter(
          (id) => !eligible.some((c) => c.id === id),
        ),
      });
    }),
  );
  return router;
}
