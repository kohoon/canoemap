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
    const file = path.resolve(root, pathname.replace(/^\/+/, '') || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const width of [1280, 390]) {
  test(`each recent addition is announced once on ${width}px and a new place still opens`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const items = {
      courses: [{ id: 'k1790240949172', name: '엑스페디션 #11 · 북한강', km: 25.13, t: Date.now() - 10000 }],
      places: [{ id: 'u1790000000000', name: '새 런칭지', t: Date.now() - 20000 }],
    };
    const seen = new Set();
    await page.route('**/recent-additions', (route) => {
      if (route.request().method() === 'POST') {
        for (const id of route.request().postDataJSON().ids || []) seen.add(id);
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: {
        courses: items.courses.filter((item) => !seen.has('course:' + item.id)),
        places: items.places.filter((item) => !seen.has('place:' + item.id)),
      } });
    });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => { setUser({ uid: 'recent-browser-user', tok: 'test-token', nick: '테스트' }); _appProfile = { memberId: 'recent-browser-member' }; hideGate(); scheduleRecentAdditions(); });
    await expect(page.locator('#noticeModal')).toBeVisible();
    await expect(page.locator('#newsRecentTab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#recentBody .recent-item')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => seen.size).toBe(2);
    await page.locator('#newsNoticeTab').click();
    await expect(page.locator('#recentBody')).toBeHidden();
    await page.locator('#newsRecentTab').click();
    await expect(page.locator('#recentBody')).toBeVisible();
    await expect(page.locator('#recentBody .recent-item')).toHaveCount(0);
    await expect(page.locator('#recentBody')).toContainText('새로 추가된 항목이 없습니다');
    await page.evaluate(() => { closeNotices(); sessionStorage.removeItem('mc_recent_session_recent-browser-member'); scheduleRecentAdditions(); });
    await page.waitForTimeout(900);
    await expect(page.locator('#noticeModal')).toBeHidden();
    items.places.push({ id: 'u1790000000001', name: '나중에 추가된 런칭지', t: Date.now() });
    await page.locator('.noticebtn').click();
    await page.locator('#newsRecentTab').click();
    await expect(page.locator('#recentBody .recent-item')).toHaveCount(1);
    await page.locator('#recentBody [data-kind="place"]').click();
    await expect(page).toHaveURL(/place=u1790000000001/);
    expect(errors).toEqual([]);
    await browser.close();
  });
}
