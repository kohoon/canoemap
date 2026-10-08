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
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const width of [1280, 390]) {
  test(`Escape closes roadview before other overlays at ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      hideGate();
      document.getElementById('rvModal').classList.add('open');
      document.body.classList.add('legend-open');
      _rvOpenedFromUrl = true;
      history.replaceState(null, '', '?view=roadview&rvAt=38.1,127.0');
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('#rvModal')).not.toHaveClass(/open/);
    expect(new URL(page.url()).searchParams.has('view')).toBe(false);
    expect(await page.evaluate(() => document.body.classList.contains('legend-open'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.body.classList.contains('legend-open'))).toBe(false);
    await browser.close();
  });
}
