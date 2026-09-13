import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const object = {
  Bucket: process.env.B2_BUCKET,
  Key: "_connection-check/" + randomUUID(),
};
let version;
try {
  const r = await s3.send(
    new PutObjectCommand({
      ...object,
      Body: "OmniView temporary buffer check",
    }),
  );
  version = r.VersionId;
  if (!version) throw Error("MissingVersion");
  const read = await s3.send(
    new GetObjectCommand({ ...object, VersionId: version }),
  );
  if (
    (await read.Body.transformToString()) !== "OmniView temporary buffer check"
  )
    throw Error("ReadMismatch");
  await s3.send(new DeleteObjectCommand({ ...object, VersionId: version }));
  try {
    await s3.send(new HeadObjectCommand({ ...object, VersionId: version }));
    throw Error("DeletionNotConfirmed");
  } catch (e) {
    if (e.$metadata?.httpStatusCode !== 404) throw e;
  }
  version = null;
  console.log(
    "B2 private buffer read/write/version-delete verified. Temporary test object removed.",
  );
} catch (e) {
  console.error("B2 test failed: " + e.name);
  process.exitCode = 1;
} finally {
  if (version)
    await s3
      .send(new DeleteObjectCommand({ ...object, VersionId: version }))
      .catch(() => {});
}
