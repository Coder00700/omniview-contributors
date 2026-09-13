// Coverage screening is not proof of sensor-level synchronization.
export function locationQuality(points, duration) {
  const good = points.filter(p => Number.isFinite(p.relativeMs) && p.relativeMs >= 0 && p.relativeMs <= duration * 1000 && p.accuracy <= 20).sort((a,b) => a.relativeMs - b.relativeMs);
  const times = [0, ...good.map(p => p.relativeMs), duration * 1000];
  const maxGapMs = Math.max(0, ...times.slice(1).map((t,i) => t - times[i]));
  return { usable: good.length >= 2 && maxGapMs <= 3000, acceptedFixes: good.length, totalFixes: points.length, maxGapMs, accuracyThresholdM: 20, maxAllowedGapMs: 3000, synchronization: 'approximate' };
}
