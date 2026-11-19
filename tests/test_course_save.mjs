import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
for (const file of ['index.html', 'map.html', 'tools/build_map.py']) {
  const source = fs.readFileSync(new URL(file, root), 'utf8');
  const start = source.indexOf('async function doSaveCourse(){');
  const end = source.indexOf('// Overpass 미러', start);
  assert.ok(start >= 0 && end > start, file);
  for (const mode of ['edit', 'editstatic', 'add']) {
    for (const admin of (mode === 'editstatic' ? [true] : [true, false])) {
      const calls = [];
      const msg = {style: {}, textContent: ''};
      const course = {id: 1794305259245, name: '초심자코스 낙동강 - 이나리강변유원지 ~ 시사단', km: 25.74, coords: [[36.8,128.8],[36.7,128.8]], segments: []};
      let closed = false, reloaded = false;
      const context = {
        getUser: () => ({uid: 'member', tok: 'member-token'}), isAdmin: () => admin,
        adminKey: () => 'test-only-key', _cmMode: mode, _cmCourse: {...course},
        _lastCourse: {...course}, _courseWaypointPromise: null,
        _cmCat: () => '기타', _cmNo: () => '', _cmColor: () => '#00897b', _cmCharacter: () => '',
        subcatColor: () => '#00897b', _joinCourse: (cat, no, desc) => desc,
        WORKER_URL: 'https://example.test',
        document: {getElementById: (id) => id === 'cmName' ? {value: '낙동강 - 이나리강변유원지 ~ 시사단'} : msg},
        fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return {ok: true, json: async () => ({course})}; },
        _prepareCoursePreview: async () => {}, gaEvent: () => {}, bumpCourseVersion: () => {},
        closeCourseModal: () => {closed = true;}, map: {closePopup() {}},
        location: {reload: () => {reloaded = true;}}, renderKVCourse: () => {},
      };
      vm.createContext(context);
      await vm.runInContext(source.slice(start, end) + '\ndoSaveCourse()', context);
      assert.equal(calls.length, 1, `${file} ${mode} admin=${admin}: ${msg.textContent}`);
      assert.equal(calls[0].name, '낙동강 - 이나리강변유원지 ~ 시사단');
      assert.equal(calls[0].km, course.km);
      assert.equal(calls[0].action, mode === 'editstatic' ? 'editstatic' : mode + (admin ? '' : 'user'));
      assert.ok(closed);
      assert.equal(reloaded, mode !== 'add');
      if (mode === 'add') assert.deepEqual(calls[0].coords, course.coords);
      else assert.equal(calls[0].coords, undefined, 'Category edits must preserve saved geometry');
    }
  }
}
console.log('Course saves passed: admin/member edits, static edits and new courses across both pages and generator.');
