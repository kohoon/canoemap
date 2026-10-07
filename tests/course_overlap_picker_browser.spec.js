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
  test(`overlapping courses can be selected on ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      hideGate();
      setUser({ uid: 'picker-admin', tok: 'test-token', nick: '운영자' });
      _adminOk = true;
      map.setView([37.01, 127.01], 13);
      const coords = [[37, 127], [37.02, 127.02]];
      renderKVCourse({ id: 1810000000001, name: '테스트 A 코스', owner: 'admin', km: 3, coords });
      renderKVCourse({ id: 1810000000002, name: '테스트 B 코스', owner: 'admin', km: 3, coords });
      _kvCourseLayers[1810000000002].ls[3].fire('click', { latlng: L.latLng(37.01, 127.01) });
    });
    await expect(page.locator('.course-picker-item')).toHaveCount(2);
    await expect(page.locator('.course-picker h3')).toHaveText('겹친 코스 2개 · 선택해 주세요');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '테스트 A 코스 상세보기' }).click();
    await expect(page.locator('#pmodal')).toBeVisible();
    await expect(page.locator('#pmTitle')).toHaveText('테스트 A 코스');
    await page.evaluate(() => {
      closePlaceModal();
      renderKVCourse({ id: 1810000000003, name: '단독 코스', owner: 'admin', km: 1, coords: [[37.025, 127.025], [37.03, 127.03]] });
      _kvCourseLayers[1810000000003].ls[3].fire('click', { latlng: L.latLng(37.027, 127.027) });
    });
    await expect(page.locator('.course-picker')).toHaveCount(0);
    await expect(page.locator('#pmTitle')).toHaveText('단독 코스');
    expect(errors).toEqual([]);
    await browser.close();
  });
}
