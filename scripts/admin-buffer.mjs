import "dotenv/config";
import { mkdir, open, rename, unlink, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const base = process.env.OMNIVIEW_SERVER_URL || "http://localhost:3001";
async function api(path, body) {
  const r = await fetch(base + "/api/admin" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + process.env.OMNIVIEW_ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Admin request failed");
  return data;
}
async function download(c, directory) {
  if (!/^[a-f0-9-]{36}$/.test(c.id)) throw Error("Invalid recording ID");
  const ext = c.metadata?.mime?.includes("mp4") ? "mp4" : "webm";
  const final = join(directory, c.id + "." + ext);
  const temp = final + "." + randomUUID() + ".partial";
  const response = await fetch(c.url);
  if (!response.ok || !response.body) throw Error("Download failed");
  const handle = await open(temp, "wx");
  const hash = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > c.bytes) throw Error("Unexpected download size");
      hash.update(chunk);
      let written = 0;
      while (written < chunk.length) {
        const r = await handle.write(chunk, written, chunk.length - written);
        written += r.bytesWritten;
      }
    }
    if (bytes !== c.bytes) throw Error("Incomplete download");
    await handle.sync();
    await handle.close();
    const sha256 = hash.digest("hex");
    await rename(temp, final);
    const metadataPath = join(directory, c.id + ".json");
    const metadata = await open(metadataPath, "w");
    try {
      await metadata.writeFile(
        JSON.stringify(
          {
            id: c.id,
            bytes,
            sha256,
            versionId: c.versionId,
            metadata: c.metadata,
          },
          null,
          2,
        ),
      );
      await metadata.sync();
    } finally {
      await metadata.close();
    }
    await api("/downloads/" + c.id + "/confirm", {
      bytes,
      sha256,
      versionId: c.versionId,
      receipt: final,
    });
  } catch (e) {
    await handle.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw e;
  }
}
try {
  if (!process.env.OMNIVIEW_ADMIN_TOKEN)
    throw Error("Set OMNIVIEW_ADMIN_TOKEN in the admin environment.");
  const mode = process.argv[2] || "status";
  if (mode === "status")
    console.log(JSON.stringify(await api("/buffer"), null, 2));
  else if (mode === "download") {
    const at = process.argv.indexOf("--directory");
    if (at < 0 || !process.argv[at + 1])
      throw Error(
        "Specify --directory with your local OmniView intake folder.",
      );
    const directory = resolve(process.argv[at + 1]);
    await mkdir(directory, { recursive: true });
    const { clips } = await api("/downloads");
    let count = 0;
    for (const c of clips) {
      await download(c, directory);
      console.log("Saved and confirmed " + c.id);
      count++;
    }
    console.log(
      `${count} clips saved to local OmniView. Cloud copies remain. Review the saved files, then approve cleanup with: node scripts/admin-buffer.mjs cleanup --confirm`,
    );
  } else if (mode === "cleanup") {
    const preview = await api("/buffer/cleanup", {});
    console.log(
      `Eligible: ${preview.count} downloaded clips, ${preview.bytes} bytes.`,
    );
    if (process.argv.includes("--confirm")) {
      for (let i = 0; i < preview.clipIds.length; i += 1000)
        console.log(
          JSON.stringify(
            await api("/buffer/cleanup", {
              confirm: preview.confirmation,
              clipIds: preview.clipIds.slice(i, i + 1000),
            }),
            null,
            2,
          ),
        );
    } else
      console.log(
        "Preview only. Add --confirm to delete only these confirmed downloaded cloud copies.",
      );
  } else
    throw Error(
      "Use status, download --directory PATH, or cleanup [--confirm].",
    );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
