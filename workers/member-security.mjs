export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TERMS_VERSION = "2026-09-16";
export const PRIVACY_VERSION = "2026-09-30";
export const ONBOARDING_VERSION = 1;
const LEGEND_PREF_KEYS = [
  "protect", "wlz", "waterplay", "courses", "famous", "canoe", "obstacles",
  "roadview", "waterLevel", "damLevel", "cctv", "daiso", "hanaro",
];

export function normalizeLegendPrefs(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const key of LEGEND_PREF_KEYS) if (typeof source[key] === "boolean") out[key] = source[key];
  return out;
}

export function sessionExpiryIsValid(exp, nowSec) {
  exp = Number(exp); nowSec = Number(nowSec);
  return Number.isInteger(exp) && Number.isInteger(nowSec)
    && exp > nowSec && exp <= nowSec + SESSION_TTL_SECONDS + 300;
}

// A stored identifier alone never proves current membership.
export function memberRecordIsActive(member) {
  return !!member && member.status === "active";
}

export function memberProfile(member) {
  if (!memberRecordIsActive(member)) return null;
  // 이 필드가 없는 기존 회원은 신규 튜토리얼 대상이 아니다.
  const onboardingVersion = member.onboardingVersion == null
    ? ONBOARDING_VERSION : Math.max(0, Number(member.onboardingVersion) || 0);
  return {
    memberId: String(member.memberId || ""),
    nick: String(member.nick || ""),
    t: Number(member.joinedAt) || 0,
    mypageTourSeen: Number(member.mypageTourSeen) || 0,
    onboardingVersion,
    onboardingStatus: String(member.onboardingStatus || ""),
    legendPrefs: normalizeLegendPrefs(member.legendPrefs),
    consentAt: Number(member.consentAt) || 0,
    termsVersion: String(member.termsVersion || ""),
    privacyVersion: String(member.privacyVersion || ""),
  };
}

export function publicMemberSummary(member) {
  return {
    memberId: String(member.memberId || ""),
    nick: String(member.nick || ""),
    status: member.status === "active" ? "active" : "withdrawn",
    joinedAt: Number(member.joinedAt) || 0,
    lastAt: Number(member.lastAt) || 0,
    loginCount: Math.max(0, Number(member.loginCount) || 0),
    visitCount: Math.max(0, Number(member.visitCount) || 0),
    device: member.lastDevice === "mobile" ? "mobile" : "pc",
  };
}
