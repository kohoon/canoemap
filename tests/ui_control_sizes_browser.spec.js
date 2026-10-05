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
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.geojson': 'application/geo+json' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const size of [
  { name: 'desktop', width: 1280, height: 800, min: 40, icon: 36 },
  { name: 'mobile', width: 390, height: 844, min: 44, icon: 44 },
  { name: 'narrow mobile', width: 320, height: 700, min: 44, icon: 44 },
]) {
  test(`${size.name} map controls have consistent hit targets without horizontal clipping`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, isMobile: size.width < 600, hasTouch: size.width < 600 });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => hideGate());
    for (const selector of ['#measBtnBox', '#locBtn', '#tourEntry', '#openChatLink', '#paddlingSchoolCtl', '#loginA']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box.height, selector).toBeGreaterThanOrEqual(size.min - 0.5);
      expect(box.x, selector).toBeGreaterThanOrEqual(-0.5);
      expect(box.x + box.width, selector).toBeLessThanOrEqual(size.width + 0.5);
    }
    for (const className of ['my-icon-btn', 'pmodal-x', 'cm-analysis-close']) {
      const iconSize = await page.evaluate((name) => {
        const button = document.createElement('button');
        button.className = name;
        button.textContent = '×';
        document.body.appendChild(button);
        const box = button.getBoundingClientRect();
        button.remove();
        return { width: box.width, height: box.height };
      }, className);
      expect(iconSize.width, className).toBeGreaterThanOrEqual(size.icon - 0.5);
      expect(iconSize.height, className).toBeGreaterThanOrEqual(size.icon - 0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await browser.close();
  });
}
