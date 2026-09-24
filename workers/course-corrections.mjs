const PAROHO_ID = "1789008958889";
const PAROHO_BAD_PREFIX = [
  [38.134919, 127.960026],
  [38.135913, 127.962804],
  [38.136949, 127.954275],
];
const PAROHO_PROJECTED_ENTRY = [38.13621984788721, 127.96027783626448];
const PAROHO_CORRECTED_KM = 19.86;
const PAROHO_PREVIEW_MIN_VERSION = Date.UTC(2026, 8, 24, 8, 30);

function samePoint(a, b) {
  return Array.isArray(a) && Math.abs(Number(a[0]) - b[0]) < 1e-7 && Math.abs(Number(a[1]) - b[1]) < 1e-7;
}

// 운영 중 확인된 단건 경로 오류를 공유 ID를 바꾸지 않고 감사 가능하게 교정한다.
// 원본의 잘못된 좌표 서명이 그대로일 때만 적용하므로 이후 관리자 수정은 덮어쓰지 않는다.
export function applyCourseCorrection(course) {
  if (!course || String(course.id) !== PAROHO_ID || !Array.isArray(course.coords)) return course;
  if (!PAROHO_BAD_PREFIX.every((point, index) => samePoint(course.coords[index], point))) return course;
  const coords = [course.coords[0], PAROHO_PROJECTED_ENTRY, ...course.coords.slice(2)];
  const segments = Array.isArray(course.segments)
    ? course.segments.map((segment, index) => index === 0 ? { ...segment, km: PAROHO_CORRECTED_KM } : segment)
    : course.segments;
  return { ...course, coords, km: PAROHO_CORRECTED_KM, segments, correctedAt: "2026-09-24" };
}

export function coursePreviewVersionIsCurrent(id, version) {
  if (String(id) !== "k" + PAROHO_ID) return true;
  return Number.parseInt(String(version || "0"), 36) >= PAROHO_PREVIEW_MIN_VERSION;
}
