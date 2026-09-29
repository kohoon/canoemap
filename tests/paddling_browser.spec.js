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
    const relative = pathname === '/' ? 'index.html' : (pathname.replace(/^\/+/, '') + (pathname.endsWith('/') ? 'index.html' : ''));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('beavertail paddle anatomy stays visible on desktop and mobile', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/paddling/?skill=paddle-anatomy`, { waitUntil: 'domcontentloaded' });
    const figure = page.locator('.paddle-anatomy');
    await expect(figure).toBeVisible();
    const box = await figure.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const blade = figure.locator('svg > path.part').nth(2);
    await expect(blade).toHaveAttribute('d', /C414 136 440 130 469 118.*C626 106 653 119 660 142/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  }
  await browser.close();
});
