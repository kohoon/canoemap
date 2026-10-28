const { test, expect, chromium, webkit } = require('@playwright/test');
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

test('roadview close stays reachable on phone, short viewport, landscape, and PC', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 390, height: 480 },
      { width: 844, height: 390 },
      { width: 1280, height: 800 },
    ]) {
      const page = await browser.newPage({ viewport, isMobile: viewport.width === 390, hasTouch: viewport.width === 390 });
      await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        hideGate();
        const modal = document.querySelector('#rvModal');
        modal.classList.add('open');
        modal.querySelector('.rv-pmodal').scrollTop = 9999;
      });
      const box = await page.locator('#rvModal .rv-head .pmodal-x').boundingBox();
      expect(box, JSON.stringify(viewport)).not.toBeNull();
      expect(box.y, JSON.stringify(viewport)).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.height + 1);
      expect(box.x + box.width, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.width + 1);
      await page.getByRole('button', { name: '로드뷰 닫기' }).click();
      await expect(page.locator('#rvModal')).not.toHaveClass(/open/);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('roadview close stays reachable in mobile WebKit', async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      hideGate();
      const modal = document.querySelector('#rvModal');
      modal.classList.add('open');
      modal.querySelector('.rv-pmodal').scrollTop = 9999;
    });
    const close = page.getByRole('button', { name: '로드뷰 닫기' });
    const box = await close.boundingBox();
    expect(box).not.toBeNull();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(668);
    await close.click();
    await expect(page.locator('#rvModal')).not.toHaveClass(/open/);
  } finally {
    await browser.close();
  }
});
