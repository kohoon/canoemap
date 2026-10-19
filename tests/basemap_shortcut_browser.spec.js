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

test('M switches standard and satellite maps without intercepting typing', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  expect(await page.evaluate(() => map.hasLayer(baseOSM))).toBe(true);
  await page.keyboard.press('m');
  expect(await page.evaluate(() => map.hasLayer(baseSat) && !map.hasLayer(baseOSM))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('mc_basemap'))).toBe('위성지도');
  await page.keyboard.press('m');
  expect(await page.evaluate(() => map.hasLayer(baseOSM) && !map.hasLayer(baseSat))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('mc_basemap'))).toBe('일반지도');
  await page.locator('#srchQ').focus();
  await page.keyboard.type('m');
  expect(await page.evaluate(() => map.hasLayer(baseOSM))).toBe(true);
  await page.evaluate(() => {
    document.activeElement.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code: 'KeyM', repeat: true }));
  });
  expect(await page.evaluate(() => map.hasLayer(baseOSM))).toBe(true);
  expect(errors).toEqual([]);
  await browser.close();
});

test('E and V select their satellite sources without intercepting typing', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await page.keyboard.press('v');
  expect(await page.evaluate(() => ({
    satellite: map.hasLayer(baseSat), standard: map.hasLayer(baseOSM),
    source: _satSrc, storedSource: localStorage.getItem('mc_satsrc'),
    storedMap: localStorage.getItem('mc_basemap'), maxZoom: map.getMaxZoom(),
  }))).toEqual({ satellite: true, standard: false, source: 'vworld', storedSource: 'vworld', storedMap: '위성지도', maxZoom: 19 });
  await page.keyboard.press('e');
  expect(await page.evaluate(() => ({
    satellite: map.hasLayer(baseSat), source: _satSrc,
    storedSource: localStorage.getItem('mc_satsrc'), maxZoom: map.getMaxZoom(),
  }))).toEqual({ satellite: true, source: 'esri', storedSource: 'esri', maxZoom: 20 });
  await page.keyboard.press('m');
  await page.locator('#srchQ').focus();
  await page.keyboard.type('v');
  expect(await page.evaluate(() => map.hasLayer(baseOSM) && _satSrc === 'esri')).toBe(true);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('e');
  expect(await page.evaluate(() => map.hasLayer(baseSat) && _satSrc === 'esri')).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => map.hasLayer(baseSat) && _satSrc === 'esri')).toBe(true);
  expect(errors).toEqual([]);
  await browser.close();
});

test('Esri can overzoom two levels without requesting missing Korean z19–20 tiles', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => hideGate());
    await page.keyboard.press('e');
    const zoom = await page.evaluate(() => {
      map.setView([37.99, 127.65], 20, { animate: false });
      return {
        zoom: map.getZoom(), maxZoom: map.getMaxZoom(),
        nativeZoom: satImgEsri.options.maxNativeZoom,
        tileZoom: satImgEsri._getZoomForUrl(),
        labelMaxZoom: satLabels.options.maxZoom,
      };
    });
    expect(zoom).toEqual({ zoom: 20, maxZoom: 20, nativeZoom: 18, tileZoom: 18, labelMaxZoom: 20 });
    await page.keyboard.press('v');
    await expect.poll(() => page.evaluate(() => ({ zoom: map.getZoom(), maxZoom: map.getMaxZoom() }))).toEqual({ zoom: 19, maxZoom: 19 });
    expect(errors).toEqual([]);
    await page.close();
  }
  await browser.close();
});

test('shortcut hint does not crowd the mobile legend', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  expect(await page.locator('.lc-map-shortcut').isVisible()).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await browser.close();
});
