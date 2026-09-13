export const CAP = 500 * 1024 * 1024;
export const clock = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
export const size = (bytes) =>
  bytes < 1048576
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1048576).toFixed(1)} MB`;
export function alignmentReminder({ badSince, lastHint, now, bad }) {
  if (!bad) return { badSince: null, lastHint, show: false };
  const since = badSince ?? now;
  const show = now - since >= 25000 && now - lastHint >= 60000;
  return { badSince: since, lastHint: show ? now : lastHint, show };
}
export const canFit = (used, incoming, cap = CAP) => used + incoming <= cap;
