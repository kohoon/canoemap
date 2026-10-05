const PAROHO_ID = "1789008958889";
const PAROHO_BAD_PREFIX = [
  [38.134919, 127.960026],
  [38.135913, 127.962804],
  [38.136949, 127.954275],
];
const PAROHO_PROJECTED_ENTRY = [38.13621984788721, 127.96027783626448];
const PAROHO_CORRECTED_KM = 19.86;
const PAROHO_PREVIEW_MIN_VERSION = Date.UTC(2026, 8, 24, 8, 30);
const CHUNCHEONHO_ID = "1790240949172";
const CHUNCHEONHO_BAD_SUFFIX = [
  [37.979605, 127.651905],
  [37.980214, 127.647506],
  [37.983002, 127.644284],
];
const CHUNCHEONHO_CORRECTED_KM = 24.61;
const CHUNCHEONHO_PREVIEW_MIN_VERSION = Date.UTC(2026, 8, 24, 9, 25);
const BONGYANG_ID = "1783312681276";
const BONGYANG_NAME = "조양강+동강 - 봉양운치길(1박2일)";
const BONGYANG_BAD_START = [37.273182, 128.603961];
const BONGYANG_BAD_END = [37.374795, 128.661318];
const BONGYANG_PREVIEW_MIN_VERSION = Date.UTC(2026, 9, 5, 8, 15);
const CHEONGMI_ID = "1789437978827";
const CHEONGMI_BAD_NAME = "청미천 - 여주 도리 ~ 여주 원부리";
const CHEONGMI_CORRECTED_NAME = "청미천 - 여주 원부리 ~ 여주 도리";
const CHEONGMI_BAD_START = [37.225698, 127.726579];
const CHEONGMI_BAD_END = [37.161783, 127.633426];
const CHEONGMI_PREVIEW_MIN_VERSION = Date.UTC(2026, 9, 5, 8, 30);

function samePoint(a, b) {
  return Array.isArray(a) && Math.abs(Number(a[0]) - b[0]) < 1e-7 && Math.abs(Number(a[1]) - b[1]) < 1e-7;
}

// 운영 중 확인된 단건 경로 오류를 공유 ID를 바꾸지 않고 감사 가능하게 교정한다.
// 원본의 잘못된 좌표 서명이 그대로일 때만 적용하므로 이후 관리자 수정은 덮어쓰지 않는다.
export function applyCourseCorrection(course) {
  if (!course || !Array.isArray(course.coords)) return course;
  if (String(course.id) === PAROHO_ID && PAROHO_BAD_PREFIX.every((point, index) => samePoint(course.coords[index], point))) {
    const coords = [course.coords[0], PAROHO_PROJECTED_ENTRY, ...course.coords.slice(2)];
    const segments = Array.isArray(course.segments)
      ? course.segments.map((segment, index) => index === 0 ? { ...segment, km: PAROHO_CORRECTED_KM } : segment)
      : course.segments;
    return { ...course, coords, km: PAROHO_CORRECTED_KM, segments, correctedAt: "2026-09-24" };
  }
  if (String(course.id) === CHUNCHEONHO_ID && CHUNCHEONHO_BAD_SUFFIX.every((point, index) => samePoint(course.coords[course.coords.length - 3 + index], point))) {
    const coords = course.coords.slice(0, -2);
    const segments = Array.isArray(course.segments)
      ? course.segments.map((segment, index) => index === course.segments.length - 1 ? { ...segment, km: 6.34 } : segment)
      : course.segments;
    return { ...course, coords, km: CHUNCHEONHO_CORRECTED_KM, segments, correctedAt: "2026-09-24" };
  }
  if (String(course.id) === BONGYANG_ID && course.name === BONGYANG_NAME && course.coords.length === 157
    && samePoint(course.coords[0], BONGYANG_BAD_START) && samePoint(course.coords[course.coords.length - 1], BONGYANG_BAD_END)) {
    return { ...course, coords: [...course.coords].reverse(), correctedAt: "2026-10-05" };
  }
  if (String(course.id) === CHEONGMI_ID && course.name === CHEONGMI_BAD_NAME && course.coords.length === 86
    && samePoint(course.coords[0], CHEONGMI_BAD_START) && samePoint(course.coords[course.coords.length - 1], CHEONGMI_BAD_END)) {
    const segments = Array.isArray(course.segments) && course.segments.length === 10
      ? [...course.segments].reverse().map((segment, index) => ({ ...segment,
        name: index === 0 ? "출발~경유1" : index === 9 ? "경유9~도착" : `경유${index}~경유${index + 1}` }))
      : course.segments;
    return { ...course, name: CHEONGMI_CORRECTED_NAME, coords: [...course.coords].reverse(), segments, correctedAt: "2026-10-05" };
  }
  return course;
}

export function coursePreviewVersionIsCurrent(id, version) {
  const key=String(id),stamp=Number.parseInt(String(version || "0"),36);
  if(key==="k"+PAROHO_ID)return stamp>=PAROHO_PREVIEW_MIN_VERSION;
  if(key==="k"+CHUNCHEONHO_ID)return stamp>=CHUNCHEONHO_PREVIEW_MIN_VERSION;
  if(key==="k"+BONGYANG_ID)return stamp>=BONGYANG_PREVIEW_MIN_VERSION;
  if(key==="k"+CHEONGMI_ID)return stamp>=CHEONGMI_PREVIEW_MIN_VERSION;
  return true;
}
