const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
let server, baseURL;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, pathname.slice(1) || 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    const ext = path.extname(file);
    response.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

test('new notice appears immediately even if the GET endpoint still returns an old list', async () => {
  test.setTimeout(90000);
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.addInitScript(() => localStorage.setItem('mc_admin', 'local-notice-test-key'));
    let failWrite = false, writes = 0;
    await page.route('**/admincheck', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/notices', (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
      writes++;
      if (failWrite) return route.fulfill({ status: 403, body: 'forbidden' });
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true, notices: [
        { id: 1791900000000, title: body.title, body: body.body, t: Date.now(), replies: [] },
      ] } });
    });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => isAdmin())).toBe(true);
    await page.evaluate(() => { openNotices(); });
    await expect(page.locator('#ntTitle')).toBeVisible();
    await page.locator('#ntTitle').fill('새 공지');
    await page.locator('#ntBodyIn').fill('운영 안내');
    await page.locator('#ntSubmit').click();
    await expect(page.locator('.nt-item')).toContainText('새 공지');
    expect(writes).toBe(1);

    failWrite = true;
    await page.evaluate(() => { _adminOk = true; });
    await page.locator('#ntTitle').fill('실패한 공지');
    await page.locator('#ntBodyIn').fill('내용 유지');
    await page.locator('#ntSubmit').click();
    await expect.poll(() => writes).toBe(2);
    await expect(page.locator('#ntStatus')).toContainText('관리자 인증');
    await expect(page.locator('#ntTitle')).toHaveValue('실패한 공지');
    expect(writes).toBe(2);
    await page.evaluate(() => { _adminOk = false; });
    await page.locator('#ntSubmit').click();
    await expect(page.locator('#ntStatus')).toContainText('관리자 인증이 해제');
    expect(writes).toBe(2);
    await page.close();
  }
  await browser.close();
});
