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

test('current-location mode follows live movement until the user drags the map', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    const watches = new Map();
    let nextId = 1;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(success, error, options) {
        const id = nextId++;
        watches.set(id, success);
        window.__geoOptions = options;
        return id;
      },
      clearWatch(id) {
        watches.delete(id);
        window.__geoCleared = id;
      },
      getCurrentPosition(success) {
        success({ coords: { latitude: 37.9000, longitude: 127.7300, accuracy: 12 }, timestamp: Date.now() });
      },
    }});
    window.__pushGeo = (latitude, longitude, accuracy) => {
      for (const callback of watches.values()) {
        callback({ coords: { latitude, longitude, accuracy }, timestamp: Date.now() });
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { document.querySelector('#gate').style.display = 'none'; });
  await page.locator('#locBtn').click();
  await expect(page.locator('#locBtn')).toHaveClass(/active/);
  await page.evaluate(() => window.__pushGeo(37.9000, 127.7300, 12));
  await expect.poll(() => page.evaluate(() => _locMarker && _locMarker.getLatLng().lat)).toBeCloseTo(37.9, 4);

  await page.evaluate(() => window.__pushGeo(37.9015, 127.7330, 8));
  await expect.poll(() => page.evaluate(() => _locMarker && _locMarker.getLatLng().lat)).toBeCloseTo(37.9015, 4);
  await expect.poll(() => page.evaluate(() => map.getCenter().lng)).toBeCloseTo(127.7330, 3);
  const state = await page.evaluate(() => ({
    watching: _locWatching,
    markerLng: _locMarker.getLatLng().lng,
    radius: _locCircle.getRadius(),
    pressed: document.querySelector('#locBtn').getAttribute('aria-pressed'),
  }));
  expect(state.watching).toBe(true);
  expect(state.markerLng).toBeCloseTo(127.7330, 4);
  expect(state.radius).toBe(8);
  expect(state.pressed).toBe('true');

  await page.evaluate(() => { map.fire('dragstart'); });
  await expect(page.locator('#locBtn')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => _locWatching)).toBe(false);
  expect(errors).toEqual([]);

  await context.close();
  await browser.close();
});

test('all generated map pages load the live-location code without JavaScript errors', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const route of ['/', '/map.html', '/tour/']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL + route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#map')).toBeVisible();
    expect(await page.evaluate(() => typeof locateMe === 'function' && typeof stopLocateFollow === 'function')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  }
  await browser.close();
});
