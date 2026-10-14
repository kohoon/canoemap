const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
let server;
let baseURL;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

async function browser() {
  return chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
}

test('map entry offers tour, GPX and manual without adding a crowded map button', async () => {
  const b = await browser();
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await b.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => hideGate());
    await page.locator('#tourEntry').click();
    await expect(page.locator('#diaryStartTour')).toBeVisible();
    await expect(page.locator('#diaryChooseCourse')).toBeVisible();
    await expect(page.locator('#diaryImportGpx')).toBeVisible();
    await expect(page.locator('#diaryWriteManual')).toBeVisible();
    const diaryLink = page.locator('.tm-diary-link');
    await expect(diaryLink).toBeVisible();
    await expect(diaryLink).toHaveAttribute('href', '/diary/');
    expect(await diaryLink.evaluate((element) => element.getBoundingClientRect().width >= 240)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }
  await b.close();
});

test('registered course can become a diary without claiming GPS tracking', async () => {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const course = { id: 1790000000001, owner: 'admin', name: '소양호 종주', km: 46,
    coords: [[37.9, 127.8], [37.901, 127.801], [37.902, 127.802]] };
  let saved;
  await page.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'member1', tok: 'secret', nick: '테스터' })));
  await page.route('**/mycanoe-map.kohoon0140.workers.dev/**', (route) => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === '/courses') return route.fulfill({ json: request.url().includes('diary-course=') ? [course]
      : [{ id: course.id, owner: course.owner, name: course.name, km: course.km, pointCount: course.coords.length }] });
    if (pathname === '/trips') return route.fulfill({ json: [] });
    if (pathname === '/diaries') return route.fulfill({ json: { items: saved ? [saved] : [], cursor: null } });
    if (pathname === '/diary' && request.method() === 'POST') {
      saved = { ...request.postDataJSON(), source: 'course', id: 'c_saved', rev: 1,
        courseName: course.name, lines: [course.coords.map((point) => [...point, null])], distanceKm: .3, visibility: 'private' };
      return route.fulfill({ status: 201, json: saved });
    }
    if (pathname === '/diary' && request.method() === 'GET') return route.fulfill({ json: saved });
    return route.fulfill({ status: 404, json: { error: 'not-found' } });
  });
  await page.goto(baseURL + '/diary/?start=course', { waitUntil: 'domcontentloaded' });
  await page.locator('#courseSearch').fill('소양');
  await page.locator('#courseList .tour-item').click();
  await expect(page.locator('#routeKind')).toContainText('계획 경로');
  await expect(page.locator('#warnings')).toContainText('실제');
  await page.locator('#diaryTitle').fill('소양호를 건넌 날');
  await page.locator('#diaryDate').fill('2026-10-12');
  await page.locator('#diarySave').click();
  await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
  expect(saved.courseId).toBe('k1790000000001');
  await page.locator('#diaryList .tour-item').click();
  await expect(page.locator('#diaryTitle')).toHaveValue('소양호를 건넌 날');
  await expect(page.locator('#diaryGpx')).toHaveText('코스 경로 GPX');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await b.close();
});

test('manual diary saves as private and remains editable on a phone', async () => {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'member1', tok: 'secret', nick: '테스터' })));
  await page.route('**/mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/diaries') return route.fulfill({ json: { items: [], cursor: null } });
    if (url.pathname === '/trips') return route.fulfill({ json: [] });
    if (url.pathname === '/diary' && request.method() === 'POST') {
      const body = request.postDataJSON();
      return route.fulfill({ status: 201, json: { ...body, id: 'm_test', rev: 1, distanceKm: null, visibility: 'private' } });
    }
    return route.fulfill({ status: 404, json: { error: 'not-found' } });
  });
  await page.goto(baseURL + '/diary/?start=manual', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('.read-only')).toContainText('본인만 볼 수 있습니다.');
  await expect(page.locator('body')).not.toContainText('공개·URL 공유는 아직 준비 중입니다.');
  await expect(page.locator('body')).not.toContainText('다음 단계에서');
  await page.locator('#diaryTitle').fill('춘천호의 오후');
  await page.locator('#diaryDate').fill('2026-10-12');
  await page.locator('#diaryNotes').fill('바람이 잔잔했다.');
  await page.locator('#diarySave').click();
  await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
  await expect(page.locator('#diaryDelete')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await b.close();
});

test('saved GPX diary downloads a private JSON backup and segmented GPX', async () => {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const record = { id: 'g_saved', source: 'gpx', title: '가을 물길', date: '2026-10-12',
    notes: '수위가 낮았다.', companions: ['친구'], visibility: 'private',
    lines: [[[37, 127, 1000], [37.001, 127.001, 2000]], [[37.002, 127.002, 3000], [37.003, 127.003, 4000]]], rev: 1 };
  await page.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'member1', tok: 'secret', nick: '테스터' })));
  await page.route('**/mycanoe-map.kohoon0140.workers.dev/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/diaries') return route.fulfill({ json: { items: [record], cursor: null } });
    if (pathname === '/diary') return route.fulfill({ json: record });
    if (pathname === '/trips') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  await page.goto(baseURL + '/diary/', { waitUntil: 'domcontentloaded' });
  await page.locator('#diaryList .tour-item').click();
  await expect(page.locator('#diaryExport')).toBeVisible();
  const backupDownload = page.waitForEvent('download');
  await page.locator('#diaryBackup').click();
  const backup = JSON.parse(fs.readFileSync(await (await backupDownload).path(), 'utf8'));
  expect(backup.record.notes).toBe('수위가 낮았다.');
  expect(backup.record.lines).toHaveLength(2);
  expect(backup.originalGpxIncluded).toBe(false);
  const gpxDownload = page.waitForEvent('download');
  await page.locator('#diaryGpx').click();
  const gpx = fs.readFileSync(await (await gpxDownload).path(), 'utf8');
  expect((gpx.match(/<trkseg>/g) || [])).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await b.close();
});

test('tour completion link connects and saves the selected trip automatically', async () => {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  let created = 0;
  const trip = { id: 'member1_trip', uid: 'member1', title: '한강 투어', start: Date.parse('2026-10-12T01:00:00Z'),
    end: Date.parse('2026-10-12T02:00:00Z'), track: [[37, 127, 1000], [37.001, 127.001, 2000]],
    distKm: .15, breaks: [], pauses: [] };
  await page.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'member1', tok: 'secret', nick: '테스터' })));
  await page.route('**/mycanoe-map.kohoon0140.workers.dev/**', (route) => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === '/trips') return route.fulfill({ json: [trip] });
    if (pathname === '/trip') return route.fulfill({ json: trip });
    if (pathname === '/diaries') return route.fulfill({ json: { items: [], cursor: null } });
    if (pathname === '/diary' && request.method() === 'GET') return route.fulfill({ status: 404, json: { error: 'not-found' } });
    if (pathname === '/diary' && request.method() === 'POST') {
      created++;
      return route.fulfill({ status: 201, json: { ...request.postDataJSON(), id: 't_member1_trip', source: 'tour', rev: 1 } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto(baseURL + '/diary/?trip=member1_trip', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#saveStatus')).toContainText('비공개로 저장했습니다.');
  expect(created).toBe(1);
  const pending = page.waitForEvent('download');
  await page.locator('#diaryBackup').click();
  const backup = JSON.parse(fs.readFileSync(await (await pending).path(), 'utf8'));
  expect(backup.tripSnapshot.track).toEqual(trip.track);
  await b.close();
});
