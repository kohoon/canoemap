export const ACCESS_HISTORY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const MAX_MEMBER_EVENTS = 1000;
const TYPES = new Set(["login", "visit", "paddling_visit"]);

export function accessDay(at) {
  return new Date(Number(at) + KST_MS).toISOString().slice(0, 10);
}

export function accessDayWindow(day, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return null;
  const dayUtc = Date.parse(day + "T00:00:00Z");
  if (!Number.isFinite(dayUtc) || new Date(dayUtc).toISOString().slice(0, 10) !== day) return null;
  const start = dayUtc - KST_MS;
  const todayStart = Date.parse(accessDay(now) + "T00:00:00Z") - KST_MS;
  if (start > todayStart || start < todayStart - ACCESS_HISTORY_DAYS * DAY_MS) return null;
  return { start, end: start + DAY_MS, today: accessDay(now), oldest: accessDay(todayStart - ACCESS_HISTORY_DAYS * DAY_MS) };
}

export function appendMemberAccess(member, at, type, device) {
  const existing = Array.isArray(member.accessHistory) ? member.accessHistory : [];
  const cutoff = at - ACCESS_HISTORY_DAYS * DAY_MS;
  member.accessHistory = existing.filter((event) => Number.isFinite(Number(event.at))
    && Number(event.at) >= cutoff && Number(event.at) <= at && TYPES.has(event.type))
    .slice(-(MAX_MEMBER_EVENTS - 1));
  member.accessHistory.push({ at, type: TYPES.has(type) ? type : "visit", device: device === "mobile" ? "mobile" : "pc" });
  return member;
}

export function dailyMemberAccess(members, window) {
  const rows = [];
  for (const member of members) {
    for (const event of Array.isArray(member.accessHistory) ? member.accessHistory : []) {
      const at = Number(event.at);
      if (!Number.isFinite(at) || at < window.start || at >= window.end || !TYPES.has(event.type)) continue;
      rows.push({ at, type: event.type, device: event.device === "mobile" ? "mobile" : "pc",
        memberId: String(member.memberId || ""), nick: String(member.nick || "") });
    }
  }
  rows.sort((a, b) => b.at - a.at || a.memberId.localeCompare(b.memberId));
  return rows;
}
