import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyCourseCorrection, coursePreviewVersionIsCurrent } from '../workers/course-corrections.mjs';

const original = JSON.parse(readFileSync(new URL('./fixtures/course_cheongmi_original.json', import.meta.url), 'utf8'));
const snapshot = JSON.stringify(original);
const fixed = applyCourseCorrection(original);

assert.equal(fixed.id, original.id);
assert.equal(fixed.name, '청미천 - 여주 원부리 ~ 여주 도리');
assert.equal(fixed.km, 15.59);
assert.equal(fixed.coords.length, 86);
assert.deepEqual(fixed.coords, [...original.coords].reverse());
assert.deepEqual(fixed.coords[0], original.coords.at(-1));
assert.deepEqual(fixed.coords.at(-1), original.coords[0]);
assert.deepEqual(fixed.segments.map((segment) => segment.km), [...original.segments].reverse().map((segment) => segment.km));
assert.equal(fixed.segments[0].name, '출발~경유1');
assert.equal(fixed.segments.at(-1).name, '경유9~도착');
assert.deepEqual(applyCourseCorrection(fixed), fixed);
assert.equal(JSON.stringify(original), snapshot);
assert.deepEqual(applyCourseCorrection({ ...original, name: '다른 코스' }), { ...original, name: '다른 코스' });
assert.equal(coursePreviewVersionIsCurrent('k1789437978827', Date.UTC(2026, 9, 4).toString(36)), false);
assert.equal(coursePreviewVersionIsCurrent('k1789437978827', Date.UTC(2026, 9, 6).toString(36)), true);

console.log('Cheongmi course direction correction: ok');
