const open = new Promise((resolve, reject) => {
  const r = indexedDB.open("omniview-contributors", 3);
  r.onupgradeneeded = () => {
    if (!r.result.objectStoreNames.contains("clips"))
      r.result.createObjectStore("clips", { keyPath: "id" });
    const cursor = r.transaction.objectStore("clips").openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        const value = c.value;
        delete value.plate;
        delete value.vehicleVerified;
        c.update(value);
        c.continue();
      }
    };
    const store = r.result.objectStoreNames.contains("chunks")
      ? r.transaction.objectStore("chunks")
      : r.result.createObjectStore("chunks", { keyPath: "key" });
    if (!store.indexNames.contains("clipId")) store.createIndex("clipId", "id");
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function transaction(store, mode, fn) {
  const db = await open;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Local save interrupted"));
  });
}
export const putClip = (clip) =>
  transaction("clips", "readwrite", (s) => s.put(clip));
export const allClips = (owner) =>
  transaction("clips", "readonly", (s) => s.getAll()).then((a) =>
    a.filter((c) => c.owner === owner).sort((a, b) => b.created - a.created),
  );
export const totalBytes = () =>
  transaction("clips", "readonly", (s) => s.getAll()).then((a) =>
    a.reduce((sum, c) => sum + (c.status === "uploaded" ? 0 : c.bytes || 0), 0),
  );
export const putChunk = (id, n, blob) =>
  transaction("chunks", "readwrite", (s) =>
    s.put({ key: `${id}:${n}`, id, n, blob }),
  );
export const chunks = (id) =>
  transaction("chunks", "readonly", (s) => s.index("clipId").getAll(id)).then(
    (a) => a.sort((a, b) => a.n - b.n),
  );
export async function clearChunks(id) {
  const list = await chunks(id);
  for (const c of list)
    await transaction("chunks", "readwrite", (s) => s.delete(c.key));
}
export async function deleteClip(id) {
  await clearChunks(id);
  await transaction("clips", "readwrite", (s) => s.delete(id));
}
