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
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.geojson': 'application/geo+json', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('address popup checks and clears one parcel on demand', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.route('https://api.vworld.kr/**', async (route) => {
    const url = new URL(route.request().url());
    const callback = url.searchParams.get('callback');
    const data = url.pathname === '/req/data'
      ? { response: { result: { featureCollection: { features: [{
        properties: { pnu: '5111025027200670000' },
        geometry: { type: 'Polygon', coordinates: [[[127.71, 37.94], [127.72, 37.94], [127.72, 37.95], [127.71, 37.94]]] },
      }] } } } }
      : { ladfrlVOList: { ladfrlVOList: [{
        pnu: '5111025027200670000', posesnSeCode: '01', posesnSeCodeNm: '개인',
        lndcgrCodeNm: '전', lndpclAr: '1284', lastUpdtDt: '2026-08-31', ownerName: '노출 금지',
      }] } };
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `${callback}(${JSON.stringify(data)})` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    document.querySelector('#gate').style.display = 'none';
    vworldReverse = async () => ({ parcel: '강원특별자치도 춘천시 서면 오월리 51-2', road: '' });
    await showAddress(37.945, 127.715);
  });
  await expect(page.locator('#landOwnBtn')).toBeVisible();
  const popupBefore = await page.locator('.leaflet-popup.addr-popup').boundingBox();
  const handle = await page.locator('.addr-drag-handle').boundingBox();
  const dragY = 844 - (popupBefore.y + popupBefore.height) > 80 ? 65 : -65;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.locator('.addr-drag-handle').dispatchEvent('mousedown', { button: 0, clientX: start.x, clientY: start.y });
  await page.evaluate(({ start, dragY }) => {
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: start.x + 20, clientY: start.y + dragY }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: start.x + 20, clientY: start.y + dragY }));
  }, { start, dragY });
  const popupAfter = await page.locator('.leaflet-popup.addr-popup').boundingBox();
  expect(Math.hypot(popupAfter.x - popupBefore.x, popupAfter.y - popupBefore.y)).toBeGreaterThan(25);
  await page.evaluate(() => {
    const handle = document.querySelector('.addr-drag-handle'),r = handle.getBoundingClientRect();
    const make = (x, y) => new Touch({ identifier: 7, target: handle, clientX: x, clientY: y });
    const x = r.left + r.width / 2, y = r.top + r.height / 2, startTouch = make(x, y), moveTouch = make(x - 15, y - 45);
    handle.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [startTouch], changedTouches: [startTouch] }));
    document.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [moveTouch], changedTouches: [moveTouch] }));
    document.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [moveTouch] }));
  });
  const popupAfterTouch = await page.locator('.leaflet-popup.addr-popup').boundingBox();
  expect(Math.hypot(popupAfterTouch.x - popupAfter.x, popupAfterTouch.y - popupAfter.y)).toBeGreaterThan(25);
  await page.locator('#landOwnBtn').click();
  await expect(page.locator('#landOwnResult')).toContainText('사유지');
  await expect(page.locator('#landOwnResult')).toContainText('1,284㎡');
  expect(await page.evaluate(() => !!_landOwnershipLayer && map.hasLayer(_landOwnershipLayer))).toBe(true);
  await page.evaluate(() => map.closePopup());
  expect(await page.evaluate(() => _landOwnershipLayer === null)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});
