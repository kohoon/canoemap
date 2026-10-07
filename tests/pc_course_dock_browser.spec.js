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
  await expect(page.locator('#pmodal')).toBeVisible();
  await page.evaluate(() => closePlaceModal());
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

test('B layout offers an admin-only BunburyPick category and keeps older course names', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    hideGate();
    setUser({ uid: 'test-admin', tok: 'test-token', nick: '운영자' });
    _adminOk = true;
    _lastCourse = { km: 1.2, coords: [[37, 127], [37.01, 127.01]], segments: [] };
    openCourseModal('add');
  });
  await page.locator('#cmBody [data-cat="번버리Pick"]').click();
  await expect(page.locator('#cmNoRow')).toBeHidden();
  await page.locator('#cmName').fill('춘천호');
  await expect(page.locator('#cmPrev')).toHaveText('번버리Pick 춘천호');
  await page.locator('#cmBody [data-character="water"][data-value="flowing"]').click();
  await page.locator('#cmBody [data-character="travel"][data-value="downriver"]').click();
  await expect(page.locator('#cmBody [data-character="water"][data-value="flowing"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cmBody [data-character="travel"][data-value="downriver"]')).toHaveAttribute('aria-pressed', 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#cmBody .seg').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    closeCourseModal();
    renderKVCourse({ id: '1790000000900', owner: 'admin', name: '번버리 픽 춘천호', waterType: 'flowing', travelMode: 'downriver', km: 1.2, coords: [[37, 127], [37.01, 127.01]] });
    _adminOk = false;
    _pcDockRender();
  });
  await expect(page.locator('#pcDock [data-filter="bunbury"]')).toHaveText('번버리Pick');
  await expect(page.locator('#pcDock [data-filter="bunbury"]')).toBeVisible();
  await page.locator('#pcDock [data-filter="bunbury"]').click();
  await expect(page.locator('#pcCourseList .pc-course-item')).toHaveCount(1);
  await expect(page.locator('#pcCourseList .pc-course-item')).toContainText('번버리Pick 춘천호');
  await expect(page.locator('#pcCourseList .pc-course-item')).toContainText('유수 · ↘ 다운리버');
  await expect(page.locator('#pcCourseList .course-character-icon')).toHaveText('〰');
  await page.evaluate(() => openCourseModal('add'));
  await expect(page.locator('#cmBody [data-cat="번버리Pick"]')).toHaveCount(0);
  await browser.close();
});

test('courses without a water character show no placeholder icon or metadata', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    hideGate();
    renderKVCourse({ id: '1790000000901', owner: 'admin', name: '분류 전 코스', km: 1.2, coords: [[37, 127], [37.01, 127.01]] });
    _pcDockSelect('k1790000000901', false);
  });
  const item = page.locator('#pcCourseList [data-course="k1790000000901"]');
  await expect(item.locator('.course-character-icon')).toHaveCount(0);
  await expect(item.locator('small')).toHaveText('공개 코스 · 1.20 km');
  await expect(page.locator('#pcCourseDetail .course-character-icon')).toHaveCount(0);
  await expect(page.locator('#pcCourseDetail .course-character-meta')).toHaveCount(0);
  await page.locator('#pcCourseDetail [data-action="detail"]').click();
  await expect(page.locator('#pmTitle')).toHaveText('분류 전 코스');
  await expect(page.locator('#pmLinks .course-character-meta')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#pmTitle')).toHaveText('분류 전 코스');
  await expect(page.locator('#pmLinks .course-character-meta')).toHaveCount(0);
  await browser.close();
});

test('clicking a course line on the PC map opens its full detail', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { hideGate(); courseCmt('c', '1', true); });
  await expect(page.locator('#pmodal')).toBeVisible();
  await expect(page.locator('#pcCourseDetail strong')).toContainText('엑스페디션');
  await browser.close();
});

test('course connection method is a labeled, persistent two-choice control on PC and mobile', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await page.locator('#measBtnBox').click();
  await expect(page.locator('#measModeBtn')).toContainText('코스 연결 방식');
  await expect(page.locator('#measModeBtn [data-mode="water"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#measModeBtn [data-mode="straight"]').click();
  await expect(page.locator('#measModeBtn [data-mode="straight"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#measModeBtn [data-mode="water"]')).toHaveAttribute('aria-pressed', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#measModeBtn')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await page.locator('#measBtnBox').click();
  await expect(page.locator('#measModeBtn [data-mode="straight"]')).toHaveAttribute('aria-pressed', 'true');
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

test('PC course panel collapses, restores map width, and remembers the choice', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await expect(page.locator('#pcDock')).toBeVisible();
  await page.locator('#pcDockClose').click();
  await expect(page.locator('#pcDock')).toBeHidden();
  await expect(page.locator('#pcDockToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await page.locator('#map').boundingBox()).x).toBe(0);
  expect((await page.locator('#map').boundingBox()).width).toBe(1280);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => hideGate());
  await expect(page.locator('#pcDock')).toBeHidden();
  await page.locator('#pcDockToggle').click();
  await expect(page.locator('#pcDock')).toBeVisible();
  await expect(page.locator('#pcDockToggle')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await page.locator('#map').boundingBox()).x).toBe(296);
  await page.locator('#pcDockClose').click();
  await page.evaluate(() => _pcDockSelect('c1', true));
  await expect(page.locator('#pcDock')).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator('#pcAuthSlot').boundingBox()).x + (await page.locator('#pcAuthSlot').boundingBox()).width).toBeLessThanOrEqual(1024);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#pcTopbar')).toBeHidden();
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

test('member place suggestion enters review instead of publishing immediately', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let submitted;
  await page.route('**/suggest', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 's1000000000000abcdef12', status: 'pending' }) });
  });
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    hideGate();
    setUser({ uid: 'test-member', tok: 'test-token', nick: '카누인' });
    window._curAddr = { lat: 37.9, lng: 127.7, name: '강원도 춘천시' };
    suggestPlace();
  });
  await page.locator('#sgSeg [data-v="landmark"]').click();
  await expect(page.locator('#sgTypeRow')).toBeVisible();
  await page.locator('#sgName').fill('작은 여울');
  await page.locator('#sgType').selectOption('여울');
  await page.locator('#sgText').fill('우안으로 통과');
  await page.locator('#sgSave').click();
  await expect(page.locator('#sgMsg')).toContainText('관리자 확인 전에는 지도에 표시되지 않습니다');
  expect(submitted).toMatchObject({ kind: 'landmark', type: '여울', name: '작은 여울', lat: 37.9, lng: 127.7 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await browser.close();
});

test('dedicated admin page reviews a suggestion and stays usable on mobile', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let reviewed;
  await page.route('**/admincheck', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.route('**/suggest', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'list') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 's1000000000000abcdef12', status: 'pending', kind: 'landing', type: '', name: '테스트 랜딩지', addr: '춘천시', text: '진입로 확인', lat: 37.9, lng: 127.7, nick: '제안자', t: Date.now() }], cursor: '' }) });
    reviewed = body;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, item: { id: body.suggestionId, status: 'approved', kind: body.kind, name: body.name, lat: 37.9, lng: 127.7, review: { at: Date.now(), note: '' } } }) });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseURL + '/admin/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#adminKey').fill('test-admin-key');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#list .card')).toHaveCount(1);
  await expect(page.locator('.location-check')).toContainText('37.900000, 127.700000');
  await expect(page.locator('.location-check a')).toHaveAttribute('href', baseURL + '/?pin=37.900000,127.700000');
  await page.locator('[data-field="name"]').fill('확인된 랜딩지');
  await page.locator('[data-action="approve"]').click();
  await expect(page.locator('#listMsg')).toContainText('승인했습니다');
  expect(reviewed).toMatchObject({ action: 'approve', name: '확인된 랜딩지', kind: 'landing' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('header')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await browser.close();
});

test('suggestion location link centers the map and marks the exact clicked point', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL + '/?pin=37.900000,127.700000', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.review-location-pin')).toBeVisible();
  await expect(page.locator('.review-location-tip')).toContainText('37.900000, 127.700000');
  expect(await page.evaluate(() => ({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() })))
    .toMatchObject({ lat: 37.9, lng: 127.7, zoom: 17 });
  expect(errors).toEqual([]);
  await browser.close();
});
