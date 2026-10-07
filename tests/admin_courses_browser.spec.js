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
    const file = path.resolve(root, pathname.replace(/^\/+/, '') || 'index.html', pathname.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end('not found');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

for (const width of [1280, 390]) {
  test(`admin can review member course inventory on ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/admincheck', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/suggest', (route) => route.fulfill({ json: { ok: true, items: [], cursor: '' } }));
    await page.route('**/admin-courses', (route) => {
      const body = route.request().postDataJSON();
      const all = [
        { id: '1810000000002', name: '번버리 코스', nickname: '번버리', ownerId: 'abc123', role: 'member', km: 5, createdAt: 1810000000002, updatedAt: 1810000000002 },
        { id: '1810000000003', name: '다른 회원 코스', nickname: '다른 회원', ownerId: 'def456', role: 'member', km: 7, createdAt: 1810000000003, updatedAt: 1810000000003 },
      ];
      const rows = all.filter((item) => !body.q || item.name.includes(body.q) || item.nickname.includes(body.q));
      route.fulfill({ json: { ok: true, summary: { total: 3, admin: 1, member: 2, memberOwners: 2, unknown: 0 },
        owners: [{ nickname: '번버리', ownerId: 'abc123', count: 1 }, { nickname: '다른 회원', ownerId: 'def456', count: 1 }],
        matched: rows.length, items: body.scope === 'admin' ? [] : rows, nextOffset: null } });
    });
    await page.goto(baseURL + '/admin/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#adminNav')).toBeHidden();
    await page.locator('#adminKey').fill('test-key');
    await page.locator('#loginBtn').click();
    await expect(page.locator('#adminNav')).toBeVisible();
    await page.locator('[data-admin-tab="courses"]').click();
    await expect(page.locator('#coursePanel')).toBeVisible();
    await expect(page.locator('#courseSummary')).toContainText('2');
    await expect(page.locator('#courseList .course-card')).toHaveCount(2);
    await expect(page.locator('#courseList .course-card').first().locator('.course-url')).toHaveAttribute('href', `${baseURL}/?course=k1810000000002&detail=1`);
    await expect(page.locator('#courseList .course-card').first().locator('.course-url')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#courseList .course-card').nth(1).locator('.course-url')).toHaveAttribute('href', `${baseURL}/?course=k1810000000003&detail=1`);
    await page.locator('#courseSearch').fill('다른 회원');
    await page.locator('#courseSearchBtn').click();
    await expect(page.locator('#courseList .course-card')).toHaveCount(1);
    await expect(page.locator('#courseList')).toContainText('다른 회원 코스');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-admin-tab="review"]').click();
    await page.locator('#logoutBtn').click();
    await expect(page.locator('#courseList .course-card')).toHaveCount(0);
    await expect(page.locator('#adminNav')).toBeHidden();
    expect(errors).toEqual([]);
    await browser.close();
  });
}

for (const width of [1280, 390]) {
  test(`only Bunbury Expedition 12 can be transferred on ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    let submitted = null;
    let transferred = false;
    page.on('dialog', (dialog) => dialog.accept());
    await page.route('**/admincheck', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/suggest', (route) => route.fulfill({ json: { ok: true, items: [], cursor: '' } }));
    await page.route('**/admin-courses', (route) => route.fulfill({ json: {
      ok: true, summary: { total: 2, admin: transferred ? 1 : 0, member: transferred ? 1 : 2, memberOwners: 1, unknown: 0 },
      owners: [{ ownerId: 'aaaaaaaaaaaaaaaa', nickname: '번버리', count: transferred ? 1 : 2 }],
      matched: transferred ? 1 : 2, nextOffset: null,
      items: [
        { id: '1810000000021', name: '엑스페디션#12 · 소양호', nickname: '번버리', ownerId: 'aaaaaaaaaaaaaaaa', role: transferred ? 'admin' : 'member', km: 12 },
        { id: '1810000000022', name: '번버리의 다른 코스', nickname: '번버리', ownerId: 'aaaaaaaaaaaaaaaa', role: 'member', km: 5 },
      ].filter((item) => !transferred || item.role === 'member'),
    } }));
    await page.route('**/course', (route) => {
      submitted = route.request().postDataJSON();
      transferred = true;
      route.fulfill({ json: { ok: true, courseId: submitted.courseId, count: 1 } });
    });
    await page.goto(baseURL + '/admin/', { waitUntil: 'domcontentloaded' });
    await page.locator('#adminKey').fill('test-key');
    await page.locator('#loginBtn').click();
    await page.locator('[data-admin-tab="courses"]').click();
    await expect(page.locator('[data-transfer-course]')).toHaveCount(1);
    await page.locator('[data-transfer-course]').click();
    await expect(page.locator('#courseMsg')).toContainText('한 건을 관리자로 이관했습니다');
    expect(submitted).toMatchObject({ action: 'transfer-expedition12', courseId: '1810000000021', ownerId: 'aaaaaaaaaaaaaaaa', expectedName: '엑스페디션#12 · 소양호' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await browser.close();
  });
}

for (const width of [1280, 390]) {
  test(`admin can inspect recent member access on ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/admincheck', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/suggest', (route) => route.fulfill({ json: { ok: true, items: [], cursor: '' } }));
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(today + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    await page.route('**/admin-access', (route) => {
      const body = route.request().postDataJSON();
      expect(body.key).toBe('test-key');
      const rows = body.day === today ? [
        { memberId: 'member-1', nick: '첫 번째', at: Date.now() - 1000, type: 'login', device: 'pc' },
        { memberId: 'member-2', nick: '두 번째', at: Date.now() - 60000, type: 'paddling_visit', device: 'mobile' },
      ] : [{ memberId: 'member-3', nick: '어제 회원', at: Date.now() - 86400000, type: 'visit', device: 'mobile' }];
      route.fulfill({ json: { ok: true, day: body.day, today, oldest: '2026-09-07', total: rows.length, items: rows, nextOffset: null } });
    });
    await page.route('**/admin-sheet-link', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ json: { ok: true, url: 'https://docs.google.com/spreadsheets/d/example/edit' } });
    });
    await page.goto(baseURL + '/admin/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#accessPanel')).toBeHidden();
    await page.locator('#adminKey').fill('test-key');
    await page.locator('#loginBtn').click();
    await page.locator('[data-admin-tab="access"]').click();
    await expect(page.locator('#accessList .access-row')).toHaveCount(2);
    await expect(page.locator('#accessList .access-row').first()).toContainText('첫 번째');
    await expect(page.locator('#accessList')).toContainText('패들링 스쿨 방문');
    await expect(page.locator('#accessDay')).toHaveValue(today);
    await expect(page.locator('#accessNext')).toBeDisabled();
    await page.locator('#accessPrev').click();
    await expect(page.locator('#accessDay')).toHaveValue(yesterday);
    await expect(page.locator('#accessList')).toContainText('어제 회원');
    await expect(page.locator('#accessList')).not.toContainText('첫 번째');
    await expect(page.locator('#accessSheet')).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/example/edit');
    await page.locator('#accessNext').click();
    await expect(page.locator('#accessList .access-row')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-admin-tab="review"]').click();
    await page.locator('#logoutBtn').click();
    await expect(page.locator('#accessList .access-row')).toHaveCount(0);
    await expect(page.locator('#accessPanel')).toBeHidden();
    expect(errors).toEqual([]);
    await browser.close();
  });
}
