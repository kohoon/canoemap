export const MEASURE_SHARE_MAX_PATH_LENGTH = 120000;
export const MEASURE_SHARE_MAX_POINTS = 6000;

export function measurePathPointCount(value) {
  const path = String(value || "");
  if (path.length < 4 || path.length > MEASURE_SHARE_MAX_PATH_LENGTH) return 0;
  let index = 0, lat = 0, lng = 0, count = 0;
  function nextDelta() {
    let result = 0, shift = 0, groups = 0;
    while (index < path.length) {
      const code = path.charCodeAt(index++) - 63;
      if (code < 0 || code > 63 || groups++ > 6) throw new Error("invalid-polyline");
      result |= (code & 31) << shift;
      if (code < 32) return (result & 1) ? ~(result >> 1) : (result >> 1);
      shift += 5;
    }
    throw new Error("truncated-polyline");
  }
  try {
    while (index < path.length) {
      lat += nextDelta(); lng += nextDelta(); count++;
      if (count > MEASURE_SHARE_MAX_POINTS || Math.abs(lat) > 9000000 || Math.abs(lng) > 18000000) return 0;
    }
  } catch (e) { return 0; }
  return count >= 2 ? count : 0;
}

export function normalizeMeasureShare(value) {
  const path = String((value && value.path) || "");
  const km = Math.round(Number(value && value.km) * 100) / 100;
  const points = measurePathPointCount(path);
  if (!points || !Number.isFinite(km) || km <= 0 || km > 5000) return null;
  return { v: 1, path, km, points };
}

export async function measureShareId(record) {
  const input = "v1\n" + Number(record.km).toFixed(2) + "\n" + record.path;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "m" + hex.slice(0, 20);
}
