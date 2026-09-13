export async function storageRequest(client, path, body) {
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session) throw Error("Please sign in again.");
  const origin = globalThis.Capacitor?.isNativePlatform?.() ? "https://omniview-contributors.onrender.com" : "";
  const r = await fetch(`${origin}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Video storage request failed.");
  return data;
}
export async function uploadVideo(client, clip, blob, onProgress) {
  const state = await storageRequest(client, "/uploads", {
    id: clip.id,
    name: clip.name,
    bytes: blob.size,
    duration: clip.duration,
    created: clip.created,
    mime: clip.mime,
    gps: clip.gps || [],
    timing: clip.timing,
  });
  if (state.complete) {
    onProgress(100);
    return;
  }
  const size = state.partSize,
    done = new Set(state.parts);
  const count = Math.ceil(blob.size / size);
  let sent = state.parts.reduce(
    (n, p) => n + Math.min(size, blob.size - (p - 1) * size),
    0,
  );
  onProgress(Math.floor((sent / blob.size) * 100));
  for (let part = 1; part <= count; part++) {
    if (done.has(part)) continue;
    const chunk = blob.slice((part - 1) * size, part * size);
    const { url } = await storageRequest(client, `/uploads/${clip.id}/part`, {
      partNumber: part,
    });
    const response = await fetch(url, { method: "PUT", body: chunk });
    if (!response.ok)
      throw Error(
        "A video part could not upload. Retry to resume from confirmed parts.",
      );
    sent += chunk.size;
    onProgress(Math.floor((sent / blob.size) * 100));
  }
  const result = await storageRequest(
    client,
    `/uploads/${clip.id}/complete`,
    {},
  );
  if (!result.complete) throw Error("The server has not confirmed this clip.");
}
