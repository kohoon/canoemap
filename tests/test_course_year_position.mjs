import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = source.indexOf('function _wlYear(cd, cur){');
const end = source.indexOf('\nconst waterLevelLayer=', start);
assert.ok(start > 0 && end > start);
const rows = Array.from({ length: 100 }, (_, index) => ({ wl: String(index / 10) }));
const urls = [];
const context = { HRFCO_KEY: 'test', _wlYrCache: {}, Date, Math, isFinite, parseFloat,
  fetch: async url => { urls.push(url); return { json: async () => ({ content: rows }) }; } };
vm.runInNewContext(source.slice(start, end), context);
const html = await vm.runInNewContext('_wlYear("station", 4.95)', context);
assert.match(html, /최근 12개월 0\.00~9\.90m/);
assert.match(html, /변동폭의 50% 위치/);
assert.equal(urls.length, 1);
assert.match(urls[0], /\/waterlevel\/list\/1D\/station\//);
const above = await vm.runInNewContext('_wlYear("station", 10.5)', context);
assert.match(above, /현재 최근 최고 초과/);
assert.match(above, /변동폭의 106% 위치/);
assert.match(above, /최고보다 0\.60m 높음/);
assert.equal(urls.length, 1, '12개월 자료는 캐시해서 재사용해야 한다');
console.log('12-month course water-level position passed');
