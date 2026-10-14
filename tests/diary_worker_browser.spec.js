const { test, expect, chromium } = require('@playwright/test');
const { createHmac } = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

// Production Worker code, but a test-only member and an isolated in-memory KV.
// No request in this suite is allowed to reach the deployed Worker.
const root = path.resolve(__dirname, '..');
const secret = 'local-diary-test-only-key';
const uid = 'diarytest1';
let server, baseURL, worker;

class TestKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key)?.value ?? null; }
  async put(key, value, options = {}) { this.values.set(key, { value, metadata: options.metadata }); }
  async delete(key) { this.values.delete(key); }
  async list({ prefix = '', limit = 100, cursor } = {}) {
    const keys = [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
    const offset = Number(cursor || 0);
    const page = keys.slice(offset, offset + limit);
    return { keys: page.map((name) => ({ name, metadata: this.values.get(name).metadata })),
      list_complete: offset + limit >= keys.length, cursor: String(offset + limit) };
  }
}

function hmac(value) { return createHmac('sha256', secret).update(value).digest('hex'); }
function tokenFor(member) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `mc2.${exp}.${hmac(`mc2|${member}|${exp}`).slice(0, 32)}`;
}
async function fixture() {
  const kv = new TestKV();
  await kv.put(`member:${hmac(`member-key|${uid}`).slice(0, 32)}`,
    JSON.stringify({ status: 'active', nick: '테스터' }));
  const env = { ADMIN_KEY: secret, PLACES: kv, SITE_URL: `${baseURL}/` };
  return { kv, env, token: tokenFor(uid) };
}

test.beforeAll(async () => {
  const imported = await import('../workers/auth-worker.js');
  worker = imported.default?.fetch ? imported.default : imported.default?.default;
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found'); return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.svg': 'image/svg+xml', '.gpx': 'application/gpx+xml' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

async function pageWithWorker(browser, state) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await page.addInitScript(({ uid: member, token }) => {
    localStorage.setItem('mc_user', JSON.stringify({ uid: member, tok: token, nick: '테스터' }));
  }, { uid, token: state.token });
  await page.route('**/mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const original = route.request();
    const headers = new Headers(original.headers());
    headers.set('Origin', baseURL);
    const response = await worker.fetch(new Request(original.url(), {
      method: original.method(), headers,
      body: ['GET', 'HEAD'].includes(original.method()) ? undefined : original.postData() || undefined,
    }), state.env, { waitUntil() {} });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return page;
}

async function launch() {
  return chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
}

test('real Worker auth and isolated KV: create, reload, edit, export and delete on mobile', async () => {
  const state = await fixture(), browser = await launch();
  try {
    const page = await pageWithWorker(browser, state);
    await page.goto(`${baseURL}/diary/?start=manual`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#diaryTitle').fill('테스트 물길');
    await page.locator('#diaryDate').fill('2026-10-12');
    await page.locator('#diaryNotes').fill('운영 데이터와 완전히 분리된 기록');
    await page.locator('#diarySave').click();
    await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
    const recordKey = [...state.kv.values.keys()].find((key) => key.startsWith(`diary-v1:${uid}:`));
    expect(recordKey).toBeTruthy();
    expect(JSON.parse(await state.kv.get(recordKey)).notes).toBe('운영 데이터와 완전히 분리된 기록');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#diaryList .tour-item')).toHaveCount(1);
    await page.locator('#diaryList .tour-item').click();
    await expect(page.locator('#diaryNotes')).toHaveValue('운영 데이터와 완전히 분리된 기록');
    await page.locator('#diaryNotes').fill('수정된 기록');
    await page.locator('#diarySave').click();
    await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
    expect(JSON.parse(await state.kv.get(recordKey)).rev).toBe(2);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#diaryBackup').click();
    const backup = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf8'));
    expect(backup.record.notes).toBe('수정된 기록');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#diaryDelete').click();
    await expect(page.locator('#diaryStatus')).toContainText('삭제했습니다.');
    expect(await state.kv.get(recordKey)).toBeNull();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#backupFile').setInputFiles({
      name: 'my-diary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator('#backupStatus')).toContainText('비공개 기록으로 복원했습니다.');
    await expect(page.locator('#diaryNotes')).toHaveValue('수정된 기록');
    await expect(page.locator('#diaryList .tour-item')).toHaveCount(1);
    const importedKey = [...state.kv.values.keys()].find((key) => key.startsWith(`diary-v1:${uid}:a_`));
    expect(importedKey).toBeTruthy();
    expect(JSON.parse(await state.kv.get(importedKey)).visibility).toBe('private');
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#backupFile').setInputFiles({
      name: 'my-diary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(page.locator('#backupStatus')).toContainText('이미 가져온 백업입니다.');
    await expect(page.locator('#diaryList .tour-item')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await browser.close(); }
});

test('invalid or another member token cannot read a private diary', async () => {
  const state = await fixture();
  const headers = { 'X-User-Id': uid, 'X-Auth-Token': state.token, Origin: baseURL };
  const create = await worker.fetch(new Request('https://test.invalid/diary', {
    method: 'POST', headers, body: JSON.stringify({ source: 'manual', title: '비공개', date: '2026-10-12' }),
  }), state.env, { waitUntil() {} });
  expect(create.status).toBe(201);
  const { id } = await create.json();
  for (const unauthorized of [
    { 'X-User-Id': uid, 'X-Auth-Token': 'invalid' },
    { 'X-User-Id': 'othermember', 'X-Auth-Token': tokenFor('othermember') },
  ]) {
    const read = await worker.fetch(new Request(`https://test.invalid/diary?id=${id}`, {
      headers: { ...unauthorized, Origin: baseURL },
    }), state.env, { waitUntil() {} });
    expect(read.status).toBe(401);
  }
});

test('registered course selection uses a small authenticated list and saves a reference route', async () => {
  const state = await fixture(), browser = await launch();
  await state.kv.put('courses', JSON.stringify([
    { id: 1790000000001, owner: 'admin', name: '소양호 종주', km: 46,
      coords: [[37.9, 127.8], [37.901, 127.801], [37.902, 127.802]] },
    { id: 1790000000002, owner: 'anothermember', name: '타인 코스', km: 1,
      coords: [[37.9, 127.8], [37.901, 127.801]] },
  ]));
  try {
    const page = await pageWithWorker(browser, state);
    await page.goto(`${baseURL}/diary/?start=course`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#courseList .tour-item')).toHaveCount(1);
    await page.locator('#courseList .tour-item').click();
    await expect(page.locator('#routeKind')).toContainText('실제 운항 아님');
    await page.locator('#diaryDate').fill('2026-10-12');
    await page.locator('#diarySave').click();
    await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
    const recordKey = [...state.kv.values.keys()].find((key) => key.startsWith(`diary-v1:${uid}:c_`));
    const record = JSON.parse(await state.kv.get(recordKey));
    expect(record.source).toBe('course');
    expect(record.courseName).toBe('소양호 종주');
    expect(record.startTime).toBe(null);
    expect(record.lines[0]).toHaveLength(3);
    const pending = page.waitForEvent('download');
    await page.locator('#diaryGpx').click();
    const output = fs.readFileSync(await (await pending).path(), 'utf8');
    expect(output).toContain('<rte>');
    expect(output).not.toContain('<trk>');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await browser.close(); }
});

test('GPX with two track segments saves without bridging the gap on desktop', async () => {
  const state = await fixture(), browser = await launch();
  try {
    const page = await pageWithWorker(browser, state);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseURL}/diary/?start=gpx`, { waitUntil: 'domcontentloaded' });
    await page.locator('#gpxFile').setInputFiles(path.join(root, 'diary/sample-track.gpx'));
    await expect(page.locator('#fileStatus')).toContainText('이동 트랙');
    await expect(page.locator('#editor')).toBeVisible();
    await page.locator('#diarySave').click();
    await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
    const recordKey = [...state.kv.values.keys()].find((key) => key.startsWith(`diary-v1:${uid}:`));
    const record = JSON.parse(await state.kv.get(recordKey));
    expect(record.source).toBe('gpx');
    expect(record.lines).toHaveLength(2);
    expect(record.pointCount).toBe(12);
    expect(record.startTime).toBe(Date.parse('2026-10-01T00:00:00Z'));
    const pending = page.waitForEvent('download');
    await page.locator('#diaryGpx').click();
    const output = fs.readFileSync(await (await pending).path(), 'utf8');
    expect((output.match(/<trkseg>/g) || [])).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await browser.close(); }
});

test('tour JSON backup restores as a standalone private track with its gaps', async () => {
  const state = await fixture(), browser = await launch();
  try {
    const page = await pageWithWorker(browser, state);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${baseURL}/diary/`, { waitUntil: 'domcontentloaded' });
    const archive = {
      format: 'canoemap-diary-backup', version: 1,
      record: { id: 't_sampletour', source: 'tour', tripId: 'sampletour', createdAt: Date.now(),
        title: '투어 백업', date: '2026-10-12', notes: '두 물길 구간', visibility: 'public' },
      tripSnapshot: { id: 'sampletour', track: [
        [37, 127, 1000], [37.001, 127.001, 2000],
        [37.1, 127.1, 3000], [37.101, 127.101, 4000],
      ], breaks: [2] },
    };
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#backupFile').setInputFiles({
      name: 'tour-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)),
    });
    await expect(page.locator('#backupStatus')).toContainText('비공개 기록으로 복원했습니다.');
    await expect(page.locator('#editorSource')).toContainText('원래 투어와는 연결되지 않음');
    const recordKey = [...state.kv.values.keys()].find((key) => key.startsWith(`diary-v1:${uid}:a_`));
    const record = JSON.parse(await state.kv.get(recordKey));
    expect(record.visibility).toBe('private');
    expect(record.archiveSource).toBe('tour');
    expect(record.lines).toHaveLength(2);
    const pending = page.waitForEvent('download');
    await page.locator('#diaryGpx').click();
    const output = fs.readFileSync(await (await pending).path(), 'utf8');
    expect((output.match(/<trkseg>/g) || [])).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await browser.close(); }
});
