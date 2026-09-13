import "dotenv/config";
import { appendFile } from "node:fs/promises";
try {
  const r = await fetch(
    "https://api.backblazeb2.com/b2api/v3/b2_authorize_account",
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.B2_KEY_ID + ":" + process.env.B2_APPLICATION_KEY,
          ).toString("base64"),
      },
    },
  );
  if (!r.ok) throw Error("Authorization failed: " + r.status);
  const a = await r.json();
  const storage = a.apiInfo.storageApi;
  const list = await fetch(storage.apiUrl + "/b2api/v3/b2_list_buckets", {
    method: "POST",
    headers: {
      Authorization: a.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ accountId: a.accountId }),
  });
  if (!list.ok) throw Error("Bucket list failed: " + list.status);
  const { buckets } = await list.json();
  console.log(
    JSON.stringify({
      endpoint: storage.s3ApiUrl,
      buckets: buckets.map((b) => ({ name: b.bucketName, type: b.bucketType })),
    }),
  );
  if (process.argv.includes("--configure")) {
    const name = "omniview-contributors-jxceplhoofpojyolcsjz";
    let bucket = buckets.find((b) => b.bucketName === name);
    if (!bucket) {
      const created = await fetch(
        storage.apiUrl + "/b2api/v3/b2_create_bucket",
        {
          method: "POST",
          headers: {
            Authorization: a.authorizationToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accountId: a.accountId,
            bucketName: name,
            bucketType: "allPrivate",
            corsRules: [
              {
                corsRuleName: "contributors-local",
                allowedOrigins: [
                  "http://localhost:3001",
                  "http://localhost:5173",
                ],
                allowedOperations: ["s3_put", "s3_get", "s3_head"],
                allowedHeaders: ["content-type", "range"],
                exposeHeaders: ["ETag", "Content-Length", "Content-Range"],
                maxAgeSeconds: 3600,
              },
            ],
            lifecycleRules: [
              {
                fileNamePrefix: "",
                daysFromStartingToCancelingUnfinishedLargeFiles: 7,
              },
            ],
          }),
        },
      );
      if (!created.ok) throw Error("Bucket creation failed: " + created.status);
      bucket = await created.json();
    }
    if (bucket.bucketType !== "allPrivate")
      throw Error("Expected a private bucket");
    const region = new URL(storage.s3ApiUrl).hostname.split(".")[1];
    await appendFile(
      ".env",
      `\nB2_ENDPOINT=${storage.s3ApiUrl}\nB2_REGION=${region}\nB2_BUCKET=${bucket.bucketName}\n`,
    );
    console.log(
      "Private B2 buffer configured locally. No video files deleted.",
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
