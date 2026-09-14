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
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.geojson': 'application/geo+json', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('course pack survives a mobile offline reload', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(baseURL + '/?course=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#gate')).toBeHidden({ timeout: 10000 });
  await page.locator('#offlineCtl').click();
  await expect(page.locator('#offlineModal')).toHaveClass(/open/);
  await page.locator('#offlineSave').click();
  await expect(page.locator('#offlineStatus')).toContainText('저장됨', { timeout: 45000 });
  await expect(page.locator('#offlineUse')).toBeEnabled();
  const stored = await page.evaluate(async () => {
    const requests = await (await caches.open(_offlinePack.cacheName)).keys();
    return {
      provider: _offlinePack.satellite.provider,
      tiles: _offlinePack.satellite.tiles,
      bytes: _offlinePack.satellite.bytes,
      cachedTiles: requests.filter((request) => request.url.includes('/World_Imagery/MapServer/tile/')).length,
      hasTileLayer: offlineBase.getLayers().some((layer) => layer instanceof L.TileLayer),
    };
  });
  expect(stored.provider).toBe('Esri World Imagery');
  expect(stored.tiles).toBeGreaterThan(0);
  expect(stored.cachedTiles).toBe(stored.tiles);
  expect(stored.bytes).toBeGreaterThan(0);
  expect(stored.hasTileLayer).toBe(true);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(page.locator('#offlineBanner')).toContainText('오프라인 지도 사용 중', { timeout: 10000 });
  await expect(page.locator('#courseFocusBar')).toHaveClass(/on/, { timeout: 10000 });
  expect(await page.evaluate(() => offlineBase.getLayers().some((layer) => layer instanceof L.TileLayer))).toBe(true);
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count(), { timeout: 10000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('tour offline control does not cover tracker actions', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/tour/?course=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#gate')).toBeHidden({ timeout: 10000 });
  const boxes = await page.evaluate(() => ({
    offline: document.querySelector('#offlineCtl').getBoundingClientRect().toJSON(),
    actions: document.querySelector('.trip-actions').getBoundingClientRect().toJSON(),
  }));
  const overlaps = boxes.offline.left < boxes.actions.right && boxes.offline.right > boxes.actions.left
    && boxes.offline.top < boxes.actions.bottom && boxes.offline.bottom > boxes.actions.top;
  expect(overlaps).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('Yangyang Namdaecheon shared view uses one connected river', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/?river=' + encodeURIComponent('양양남대천') + '&riverAt=38.05,128.64', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => _riverFeatures.length > 0 && document.querySelector('#riverFocusBar')?.classList.contains('on'), null, { timeout: 15000 });
  const state = await page.evaluate(() => {
    const features = _riverFeatures.filter((feature) => feature.properties.name === '양양남대천');
    return {
      features: features.length,
      components: _riverComponents(features, '양양남대천').length,
      coords: features[0].geometry.coordinates.length,
      highlightLayers: _riverSearchFocus.getLayers().length,
      label: document.querySelector('#riverFocusBar .river-focus-name').textContent,
    };
  });
  expect(state).toEqual({ features: 1, components: 1, coords: 213, highlightLayers: 2, label: '양양남대천' });
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});
