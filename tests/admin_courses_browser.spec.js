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
