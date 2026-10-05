import assert from 'node:assert/strict';
import { buildPreview, tripPreview } from '../diary/core.mjs';

const p1 = { lat: 37.94, lon: 127.82, time: 1000 };
const p2 = { lat: 37.941, lon: 127.821, time: 61000 };
const p3 = { lat: 37.945, lon: 127.825, time: 121000 };
const p4 = { lat: 37.946, lon: 127.826, time: 181000 };

const split = buildPreview([[p1, p2], [p3, p4]]);
assert.equal(split.lines.length, 2);
assert.equal(split.pointCount, 4);
assert.ok(split.distanceKm > .2 && split.distanceKm < .4);
assert.equal(split.elapsedSeconds, 180);
assert.ok(split.warnings.some((warning) => warning.includes('직선으로 이어')));

const noTime = buildPreview([[{ lat: 37.94, lon: 127.82, time: null }, { lat: 37.941, lon: 127.821, time: null }]]);
assert.equal(noTime.elapsedSeconds, null);
assert.ok(noTime.warnings.some((warning) => warning.includes('시각')));

const jump = buildPreview([[p1, { lat: 38.5, lon: 128.5, time: 2000 }, p4]]);
assert.ok(jump.lines.length > 1);
assert.ok(jump.warnings.some((warning) => warning.includes('비정상')));

const trip = tripPreview({
  title: '테스트 투어',
  start: 1000, end: 181000,
  track: [[p1.lat, p1.lon, p1.time], [p2.lat, p2.lon, p2.time], [p3.lat, p3.lon, p3.time], [p4.lat, p4.lon, p4.time]],
  breaks: [2], pauses: [{ start: 61000, end: 121000, type: 'manual' }],
  distKm: .3, courseName: '선택 코스', estimated: true,
});
assert.equal(trip.lines.length, 2);
assert.equal(trip.restSeconds, 60);
assert.equal(trip.courseName, '선택 코스');
assert.equal(trip.source, 'tour');
assert.equal(trip.elapsedSeconds, 180);
assert.ok(trip.warnings.some((warning) => warning.includes('추정')));

assert.throws(() => buildPreview([[{ lat: 100, lon: 127, time: 1 }, p2]]), /좌표/);
assert.throws(() => buildPreview([[p1]]), /2개/);
console.log('Canoeing diary preview core: ok');
