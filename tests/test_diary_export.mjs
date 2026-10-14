import assert from 'node:assert/strict';
import { buildDiaryBackup, buildDiaryGpx, DIARY_BACKUP_FORMAT } from '../diary/export.mjs';

const record = {
  id: 't_member1_trip', source: 'tour', tripId: 'member1_trip', visibility: 'private',
  title: '한탄강 & <주상절리>', date: '2026-10-12', notes: '낮은 수위',
  companions: ['친구'], distanceKm: 3.2, lines: [], rev: 1,
};
const trip = {
  id: 'member1_trip', uid: 'private-member-id', nick: '비공개 닉네임', title: '투어',
  track: [[38, 127, 1000], [38.01, 127.01, 2000], [38.02, 127.02, 3000]],
  breaks: [2], pauses: [{ start: 1000, end: 2000, type: 'manual' }], restSec: 1,
};
const backup = buildDiaryBackup(record, trip, '2026-10-12T00:00:00.000Z');
assert.equal(backup.format, DIARY_BACKUP_FORMAT);
assert.equal(backup.record.notes, '낮은 수위');
assert.equal(backup.tripSnapshot.track.length, 3);
assert.equal(backup.tripSnapshot.restSec, 1);
assert.equal(backup.tripSnapshot.uid, undefined);
assert.equal(backup.tripSnapshot.nick, undefined);
assert.equal(backup.originalGpxIncluded, false);
assert.equal(record.notes, '낮은 수위');

const gpx = buildDiaryGpx(record, trip);
assert.equal((gpx.match(/<trkseg>/g) || []).length, 2);
assert.equal((gpx.match(/<trkpt /g) || []).length, 3);
assert.match(gpx, /한탄강 &amp; &lt;주상절리&gt;/);
assert.match(gpx, /1970-01-01T00:00:01\.000Z/);
assert.doesNotMatch(gpx, /private-member-id|비공개 닉네임/);

const imported = { id: 'g_track', source: 'gpx', title: 'GPX 기록', date: '2026-10-12',
  lines: [[[37, 127, null], [37.01, 127.01, null]], [[37.02, 127.02, null], [37.03, 127.03, null]]] };
assert.equal((buildDiaryGpx(imported).match(/<trkseg>/g) || []).length, 2);
assert.equal(buildDiaryBackup(imported).record.lines.length, 2);
const course = { id: 'c_saved', source: 'course', title: '소양호를 건넌 날', courseName: '소양호 종주',
  date: '2026-10-12', lines: [[[37, 127, null], [37.01, 127.01, null]]] };
const courseGpx = buildDiaryGpx(course);
assert.match(courseGpx, /<rte>/);
assert.equal((courseGpx.match(/<rtept /g) || []).length, 2);
assert.doesNotMatch(courseGpx, /<trk>|<trkpt/);
assert.equal(buildDiaryBackup(course).record.courseName, '소양호 종주');
assert.throws(() => buildDiaryGpx({ id: 'm_1', source: 'manual' }), /경로가 없는/);
assert.throws(() => buildDiaryBackup(record), /투어 원본/);
console.log('Diary backup and GPX export: ok');
