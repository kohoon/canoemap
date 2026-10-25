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
    response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Danyang underwater weir is named and positioned on the barrier at ${viewport.width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    const weir = await page.evaluate(() => {
      hideGate();
      map.setView([36.9267, 128.2917], 16);
      const id = staticWeirId({ nm: '단양수중보', lat: 36.9267, lng: 128.2917 });
      const obstacle = _obstacles[id];
      const icon = obstacle?._m?.getElement();
      return {
        count: Object.values(_obstacles).filter((item) => item.name === '단양수중보').length,
        latlng: obstacle?._m?.getLatLng(),
        label: icon?.textContent,
        visible: !!icon && getComputedStyle(map.getPane('obsPane')).display !== 'none',
      };
    });
    expect(weir.count).toBe(1);
    expect(weir.latlng.lat).toBeCloseTo(36.9267, 4);
    expect(weir.latlng.lng).toBeCloseTo(128.2917, 4);
    expect(weir.label).toContain('단양수중보');
    expect(weir.visible).toBe(true);
    await browser.close();
  });
}
