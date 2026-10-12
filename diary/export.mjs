export const DIARY_BACKUP_FORMAT = 'canoemap-diary-backup';
export const DIARY_BACKUP_VERSION = 1;

function text(value) { return String(value ?? ''); }
function xml(value) {
  return text(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}
function validPoint(point) {
  return Array.isArray(point) && point.length >= 2
    && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
    && Math.abs(Number(point[0])) <= 90 && Math.abs(Number(point[1])) <= 180;
}
function routeLines(record, trip) {
  if (record.source === 'gpx') return record.lines || [];
  if (record.source !== 'tour' || !trip) return [];
  const points = Array.isArray(trip.track) ? trip.track : [];
  const breaks = new Set((trip.breaks || []).map(Number));
  const lines = [];
  let line = [];
  points.forEach((point, index) => {
    if (breaks.has(index) && line.length) { lines.push(line); line = []; }
    line.push(point);
  });
  if (line.length) lines.push(line);
  return lines;
}

export function buildDiaryBackup(record, trip = null, exportedAt = new Date().toISOString()) {
  if (!record || !['tour', 'gpx', 'manual'].includes(record.source) || !record.id) throw new Error('저장된 다이어리를 먼저 선택해 주세요.');
  if (record.source === 'tour' && !trip) throw new Error('연결된 투어 원본을 불러오지 못해 백업할 수 없습니다.');
  const tripSnapshot = trip ? {
    id: trip.id, title: trip.title, start: trip.start, end: trip.end, durSec: trip.durSec,
    restSec: trip.restSec, pauses: trip.pauses, distKm: trip.distKm, track: trip.track,
    breaks: trip.breaks, launch: trip.launch, landing: trip.landing,
    estimated: trip.estimated, estimatedTrack: trip.estimatedTrack,
    courseId: trip.courseId, courseName: trip.courseName, courseProgress: trip.courseProgress,
    recordVersion: trip.recordVersion,
  } : null;
  return {
    format: DIARY_BACKUP_FORMAT, version: DIARY_BACKUP_VERSION, exportedAt,
    originalGpxIncluded: false,
    record: structuredClone(record),
    tripSnapshot,
  };
}

export function buildDiaryGpx(record, trip = null) {
  if (!record || record.source === 'manual') throw new Error('경로가 없는 수기 기록은 GPX로 내려받을 수 없습니다.');
  const lines = routeLines(record, trip);
  const count = lines.reduce((sum, line) => sum + line.length, 0);
  if (count < 2 || count > 20000 || lines.length > 200 || lines.some((line) => !Array.isArray(line) || line.some((point) => !validPoint(point)))) {
    throw new Error('내보낼 수 있는 이동 경로가 없습니다.');
  }
  const segments = lines.filter((line) => line.length).map((line) => {
    const points = line.map((point) => {
      const time = point[2] == null ? null : Number(point[2]);
      const timeXml = Number.isFinite(time) && time > 0 && time <= 8640000000000000
        ? `<time>${new Date(time).toISOString()}</time>` : '';
      return `<trkpt lat="${Number(point[0])}" lon="${Number(point[1])}">${timeXml}</trkpt>`;
    }).join('');
    return `<trkseg>${points}</trkseg>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="CanoeMap Diary" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(record.title || '카누잉 기록')}</name>${segments}</trk></gpx>\n`;
}
