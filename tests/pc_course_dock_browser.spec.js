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

test('approved B layout keeps course list and selected detail in one PC panel', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await expect(page.locator('#pcDock')).toBeVisible();
  await expect(page.locator('#pcTopbar')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('#srchQ').closest('#pcTopbar') !== null)).toBe(true);
  expect(await page.evaluate(() => document.querySelector('#measBtnBox').closest('#pcDock') !== null)).toBe(true);
  const mapBox = await page.locator('#map').boundingBox();
  expect(mapBox.x).toBeGreaterThanOrEqual(295);
  expect(mapBox.y).toBeGreaterThanOrEqual(63);
  const first = page.locator('#pcCourseList .pc-course-item').first();
  await expect(first).toBeVisible();
  const name = await first.locator('b').innerText();
  await first.click();
  await expect(page.locator('#pcCourseDetail strong')).toHaveText(name);
  await expect(page.locator('#pmodal')).not.toBeVisible();
  await page.locator('#pcCourseDetail [data-action="detail"]').click();
  await expect(page.locator('#pmodal')).toBeVisible();
  await page.evaluate(() => closePlaceModal());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#pcDock')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('pc-dock-ready'))).toBe(false);
  expect(await page.evaluate(() => document.querySelector('#srchQ').closest('.leaflet-top') !== null)).toBe(true);
  expect(await page.locator('#openChatLink').count()).toBe(1);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#pcDock')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('pc-dock-ready'))).toBe(true);
  expect(await page.evaluate(() => document.querySelector('#srchQ').closest('#pcTopbar') !== null)).toBe(true);
  expect(errors).toEqual([]);
  await browser.close();
});

test('tour mode keeps the existing full-map layout', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/?tour=1', { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => document.documentElement.classList.contains('pc-dock-ready'))).toBe(false);
  await expect(page.locator('#pcDock')).toBeHidden();
  const mapBox = await page.locator('#map').boundingBox();
  expect(mapBox.x).toBe(0);
  expect(mapBox.width).toBe(1280);
  await browser.close();
});

test('one official expedition round appears once when static and registered courses overlap', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    hideGate();
    const original = _courseByCid['3'];
    renderKVCourse({ id: '1790000000003', owner: 'admin', name: '엑스페디션#3 (평창강)', km: original.km, coords: original.coords });
  });
  await expect.poll(() => page.locator('#pcCourseList .pc-course-item').filter({ hasText: '엑스페디션 #3' }).count()).toBe(1);
  const roundThree = page.locator('#pcCourseList .pc-course-item').filter({ hasText: '엑스페디션 #3' });
  await expect(roundThree).toHaveAttribute('data-course', 'k1790000000003');
  const routeVisibility = await page.evaluate(() => {
    setUser({ uid: 'test-member', tok: 'test-token' });
    _applyCourseFocus();
    return {
      staticVisible: _staticCidLayers['3'].some(({ grp, l }) => grp.hasLayer(l)),
      registeredVisible: _kvCourseLayers['1790000000003'].ls.some((l) => _kvCourseLayers['1790000000003'].grp.hasLayer(l)),
    };
  });
  expect(routeVisibility).toEqual({ staticVisible: false, registeredVisible: true });
  await page.evaluate(() => courseCmt('c', '3'));
  await expect(page.locator('#pmodal')).toBeVisible();
  await browser.close();
});
