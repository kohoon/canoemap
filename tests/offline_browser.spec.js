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

test('Japanese lake names appear only on the satellite map', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined' && JAPAN_LAKES.length > 0, null, { timeout: 10000 });
  await expect(page.locator('.cafecard')).toHaveCount(0);
  expect(await page.locator('#adminActions').evaluate((node) => getComputedStyle(node).display)).toBe('none');

  await page.evaluate(() => {
    document.querySelector('#gate').style.display = 'none';
    map.invalidateSize();
    if (map.hasLayer(baseOSM)) map.removeLayer(baseOSM);
    if (!map.hasLayer(baseSat)) baseSat.addTo(map);
    map.setView([35.262441, 136.079407], 8);
  });
  await page.waitForFunction(() => Math.abs(map.getCenter().lng - 136.079407) < 0.1
    && japanLakeLabels.getLayers().length > 0, null, { timeout: 10000 });
  const satellite = await page.evaluate(() => ({
      sourceCount: JAPAN_LAKES.length,
      visibleLabels: japanLakeLabels.getLayers().length,
      text: Array.from(document.querySelectorAll('.jp-lake-label span')).map((node) => node.textContent),
    }));
  expect(satellite.sourceCount).toBeGreaterThanOrEqual(70);
  expect(satellite.visibleLabels).toBeGreaterThan(0);
  expect(satellite.text).toContain('비와호');

  const general = await page.evaluate(() => {
    map.removeLayer(baseSat);
    baseOSM.addTo(map);
    _renderJapanLakeLabels();
    return japanLakeLabels.getLayers().length;
  });
  expect(general).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('candidate promotion persists in the unified place override', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('mc_user', JSON.stringify({ uid: 'admin-user', tok: 'current-test-token', nick: '관리자' }));
    localStorage.setItem('mc_admin', 'test-admin-key');
  });
  const writes = [];
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/admincheck')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (url.pathname.endsWith('/profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { nick: '관리자', mypageTourSeen: 1 } }) });
    } else if (url.pathname.endsWith('/launch-sites')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
        { id: 'candidate-test', name: '후보지 테스트', memo: '', lat: 36.3, lng: 127.8, cat: 'candidate', rv: false, rvline: null },
      ], truncated: false }) });
    } else if (url.pathname.endsWith('/placeover') && route.request().method() === 'POST') {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (url.pathname.endsWith('/admin-sheet-link')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: '' }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: url.searchParams.has('over') ? '{}' : '[]' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => isAdmin() && !!_placeMarkerById['candidate-test'], null, { timeout: 10000 });
  await page.evaluate(() => setPlaceKind('candidate-test', 'canoe', true));
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ id: 'candidate-test', cat: 'canoe' });
  const promoted = await page.evaluate(() => ({
    kind: _placeMarkerById['candidate-test'].cat,
    label: _placeMarkerById['candidate-test'].rec.cat,
    saved: _placeOver['candidate-test'].cat,
  }));
  expect(promoted).toEqual({ kind: 'canoe', label: '런칭/랜딩', saved: 'canoe' });

  await page.evaluate(() => {
    openPlaceModal(_placeMarkerById['candidate-test'].rec);
    editPlace();
    document.querySelector('#peName').value = '정식 런칭지';
    savePlaceEdit();
  });
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({ id: 'candidate-test', name: '정식 런칭지', cat: 'canoe' });

  await page.evaluate(() => {
    closePlaceModal();
    _lastCourse = { km: 1.2, coords: [[36.3, 127.8], [36.31, 127.81]], segments: [] };
    openCourseModal('add');
  });
  await expect(page.locator('#cmPalette .cm-color')).toHaveCount(24);
  const paletteLayout = await page.locator('#cmPalette').evaluate((node) => ({
    columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
    fits: node.scrollWidth <= node.clientWidth,
  }));
  expect(paletteLayout).toEqual({ columns: 6, fits: true });
  await page.locator('#cmPalette .cm-color[data-color="#c2185b"]').click();
  await expect(page.locator('#cmPalette .cm-color[data-color="#c2185b"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => _cmColor())).toBe('#c2185b');
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
      waveMarks: document.querySelectorAll('.river-wave-icon').length,
      label: document.querySelector('#riverFocusBar .river-focus-name').textContent,
    };
  });
  expect(state).toMatchObject({ features: 1, components: 1, coords: 213, highlightLayers: 3, label: '양양남대천' });
  expect(state.waveMarks).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('Illicheon shared view reaches the Seomgang confluence', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/?river=' + encodeURIComponent('일리천') + '&riverAt=37.45,127.89', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => _riverFeatures.length > 0 && document.querySelector('#riverFocusBar')?.classList.contains('on'), null, { timeout: 15000 });
  const state = await page.evaluate(() => {
    const confluence = [127.898118, 37.421672];
    const features = _riverFeatures.filter((feature) => feature.properties.name === '일리천');
    const seomgang = _riverFeatures.find((feature) => feature.properties.name === '섬강');
    const coords = features[0].geometry.coordinates;
    return {
      features: features.length,
      components: _riverComponents(features, '일리천').length,
      coords: coords.length,
      last: coords[coords.length - 1],
      seomgangSharesConfluence: seomgang.geometry.coordinates.some((point) => point[0] === confluence[0] && point[1] === confluence[1]),
      highlightLayers: _riverSearchFocus.getLayers().length,
      label: document.querySelector('#riverFocusBar .river-focus-name').textContent,
    };
  });
  expect(state).toEqual({
    features: 1,
    components: 1,
    coords: 83,
    last: [127.898118, 37.421672],
    seomgangSharesConfluence: true,
    highlightLayers: 3,
    label: '일리천',
  });
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('North-connected shared rivers include their North Korea sections', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cases = [
    { name: '북한강', riverAt: '38.1,127.8', coords: 843, maxLat: 38.83 },
    { name: '임진강', riverAt: '38.1,126.95', coords: 730, maxLat: 39.17 },
    { name: '한탄강', riverAt: '38.2,127.2', coords: 543, maxLat: 38.52 },
    { name: '수입천', riverAt: '38.2,127.95', coords: 213, maxLat: 38.38 },
  ];
  for (const item of cases) {
    await page.goto(baseURL + '/?river=' + encodeURIComponent(item.name) + '&riverAt=' + item.riverAt, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((name) => _riverFeatures.length > 0
      && document.querySelector('#riverFocusBar .river-focus-name')?.textContent === name, item.name, { timeout: 15000 });
    const state = await page.evaluate((name) => {
      const features = _riverFeatures.filter((feature) => feature.properties.name === name);
      const coords = features[0].geometry.coordinates;
      return {
        features: features.length,
        components: _riverComponents(features, name).length,
        coords: coords.length,
        maxLat: Math.max(...coords.map((point) => point[1])),
        highlightLayers: _riverSearchFocus.getLayers().length,
      };
    }, item.name);
    expect(state.features).toBe(1);
    expect(state.components).toBe(1);
    expect(state.coords).toBe(item.coords);
    expect(state.maxLat).toBeGreaterThan(item.maxLat);
    expect(state.highlightLayers).toBe(3);
  }
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('roadview layer toggle loads visible clickable locations', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'current-test-user', tok: 'current-test-token', nick: '테스트' })));
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { nick: '테스트', mypageTourSeen: 1 } }) });
    } else if (url.pathname.endsWith('/launch-sites')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [
        { id: 'rv-test', name: '로드뷰 테스트', memo: '', lat: 36.4, lng: 127.8, cat: 'canoe', rv: true, rvline: null },
        { id: 'no-rv-test', name: '로드뷰 없음', memo: '', lat: 36.41, lng: 127.81, cat: 'canoe', rv: false, rvline: null },
      ], truncated: false }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#gate')).toBeHidden({ timeout: 10000 });
  await page.waitForFunction(() => Object.keys(_roadviewPlaceIds).length === 1, null, { timeout: 10000 });
  await page.locator('.lc-title').click();
  const toggle = page.locator('.leaflet-control-layers-overlays label').filter({ hasText: '로드뷰 구간' });
  await toggle.click();
  await page.waitForFunction(() => map.hasLayer(roadviewLayer));
  await expect(page.locator('#hint')).toContainText('로드뷰 가능 장소 1곳 표시', { timeout: 10000 });
  const state = await page.evaluate(() => {
    const item = roadviewLayer.getLayers()[0];
    const children = item.getLayers();
    const dot = children.find((layer) => layer instanceof L.CircleMarker);
    return {
      locations: roadviewLayer.getLayers().length,
      line: children.some((layer) => layer instanceof L.Polyline && !(layer instanceof L.CircleMarker)),
      dot: !!dot,
      dotPixels: dot?._map ? dot._radius * 2 : 0,
      rendered: !!dot?._renderer?._container?.isConnected,
      visible: map.hasLayer(roadviewLayer),
    };
  });
  expect(state).toEqual({ locations: 1, line: true, dot: true, dotPixels: 10, rendered: true, visible: true });
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('explicit member registration requires both consents', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: '4936913088', tok: 'mc2.test', nick: '카카오닉', kakaoNick: '카카오닉' })));
  let registration = null;
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/profile') && route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, profile: null, registrationRequired: true, suggestedNick: '기존닉네임' }) });
    } else if (url.pathname.endsWith('/profile') && route.request().method() === 'POST') {
      registration = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, profile: { memberId: 'a1b2c3d4e5f60708', nick: registration.nick, t: Date.now(), mypageTourSeen: 1 } }) });
    } else if (url.pathname.endsWith('/launch-sites')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], truncated: false }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
  const page = await context.newPage();
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#nickModal')).toHaveClass(/open/);
  await expect(page.locator('#nickInput')).toHaveValue('기존닉네임');
  await page.locator('#nickOk').click();
  await expect(page.locator('#nickMsg')).toContainText('필수 동의 두 항목');
  await page.locator('#termsAgree').check();
  await page.locator('#privacyAgree').check();
  await page.locator('#nickOk').click();
  await expect(page.locator('#nickModal')).not.toHaveClass(/open/);
  expect(registration).toMatchObject({ nick: '기존닉네임', termsAgreed: true, privacyAgreed: true, dev: '모바일' });
  expect(JSON.stringify(registration)).toContain('4936913088'); // provider ID is transient request data only
  await context.close();
  await browser.close();
});

test('measurement labels show segment and cumulative distance at each endpoint', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined' && typeof startMeasure === 'function');
  const draft = await page.evaluate(async () => {
    document.querySelector('#gate').style.display = 'none';
    const points = [[38.191, 127.812], [38.1845, 127.831], [38.177, 127.85], [38.1665, 127.867]];
    map.fitBounds(L.latLngBounds(points), { padding: [55, 100] });
    measMode = 'straight';
    startMeasure();
    points.forEach((point) => _measPickPoint(L.latLng(point[0], point[1])));
    for (let i = 0; i < 50 && measSegs.length !== 3; i++) await new Promise((resolve) => setTimeout(resolve, 20));
    let cumulative = 0;
    const expected = measSegs.map((segment) => {
      cumulative += segment.km;
      return { segment: _fmtMeasKm(segment.km), cumulative: _fmtMeasKm(cumulative) };
    });
    const labelLayers = measDraft.getLayers().filter((layer) => layer.getElement?.()?.classList.contains('meas-seg-label'));
    const endpointDistances = labelLayers.map((layer, i) => {
      const coords = measSegs[i].coords;
      return map.distance(layer.getLatLng(), coords[coords.length - 1]);
    });
    return { expected, endpointDistances };
  });

  expect(draft.expected).toHaveLength(3);
  expect(draft.endpointDistances.every((distance) => distance < 0.5)).toBe(true);
  await expect(page.locator('.meas-seg-card')).toHaveCount(3);
  for (let i = 0; i < draft.expected.length; i++) {
    const label = page.locator('.meas-seg-card').nth(i);
    await expect(label.locator('.meas-seg-net')).toContainText(`${i + 1}구간 ${draft.expected[i].segment} km`);
    await expect(label.locator('.meas-seg-cum')).toContainText(`Σ 누적 ${draft.expected[i].cumulative} km`);
  }

  await page.evaluate(() => { finishMeasure(); map.closePopup(); });
  await expect(page.locator('.meas-seg-card')).toHaveCount(3);
  await expect(page.locator('.meas-pill')).toHaveCount(1);
  const separated = await page.evaluate(() => {
    const cards = document.querySelectorAll('.meas-seg-card');
    const card = cards[cards.length - 1].getBoundingClientRect();
    const pill = document.querySelector('.meas-pill').getBoundingClientRect();
    return pill.top >= card.bottom;
  });
  expect(separated).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('wide reservoir access routes around land instead of crossing it', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const rivers = { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { name: '테스트강', kind: 'river' },
    geometry: { type: 'LineString', coordinates: [[127.01, 37.02], [127.01, 36.99]] },
  }] };
  const ring = (points) => points.map(([lat, lon]) => ({ lat, lon }));
  const overpass = { elements: [{
    type: 'relation', id: 1, tags: { natural: 'water' }, members: [
      { role: 'outer', geometry: ring([[36.99, 126.995], [37.02, 126.995], [37.02, 127.015], [36.99, 127.015], [36.99, 126.995]]) },
      { role: 'inner', geometry: ring([[36.998, 127.003], [37.004, 127.003], [37.004, 127.008], [36.998, 127.008], [36.998, 127.003]]) },
      { role: 'inner', geometry: ring([[37.0095, 127.00955], [37.0105, 127.00955], [37.0105, 127.00985], [37.0095, 127.00985], [37.0095, 127.00955]]) },
    ],
  }] };
  await context.route(/\/rivers\.geojson(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rivers) });
  });
  await context.route(/https:\/\/[^/]*overpass[^/]*\/api\/interpreter/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(overpass) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof waterRoute === 'function');
  const result = await page.evaluate(async () => {
    const route = await waterRoute({ lat: 37.015, lng: 127.01 }, { lat: 37.0, lng: 127.0 });
    const short = await waterRoute({ lat: 37.012, lng: 127.01 }, { lat: 37.01, lng: 127.0093 });
    function crossesLand(coords, box) {
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1], b = coords[i];
        for (let step = 0; step <= 30; step++) {
          const t = step / 30, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (p[0] > box[0] && p[0] < box[2] && p[1] > box[1] && p[1] < box[3]) return true;
        }
      }
      return false;
    }
    return {
      source: route.source, km: route.km, coords: route.coords, access: route.access,
      crossesLand: crossesLand(route.coords, [36.998, 127.003, 37.004, 127.008]),
      short: { coords: short.coords, access: short.access, crossesLand: crossesLand(short.coords, [37.0095, 127.00955, 37.0105, 127.00985]) },
    };
  });
  expect(result.source).toBe('static-river-water');
  expect(result.access).toEqual([]);
  expect(result.crossesLand).toBe(false);
  expect(result.km).toBeGreaterThan(2.55);
  expect(result.coords.some((p) => p[0] > 37.004 || p[0] < 36.998)).toBe(true);
  expect(result.short.access).toEqual([]);
  expect(result.short.coords.length).toBeGreaterThan(3);
  expect(result.short.crossesLand).toBe(false);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('Chuncheonho route does not cross the Owol road and forest embankment', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const rivers = { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { name: '북한강', kind: 'river' },
    geometry: { type: 'LineString', coordinates: [[127.654, 37.978], [127.654, 37.987]] },
  }] };
  const ring = (points) => points.map(([lat, lon]) => ({ lat, lon }));
  const overpass = { elements: [{
    type: 'relation', id: 1, tags: { natural: 'water' }, members: [
      { role: 'outer', geometry: ring([[37.979, 127.643], [37.987, 127.643], [37.987, 127.655], [37.979, 127.655], [37.979, 127.643]]) },
    ],
  }] };
  await context.route(/\/rivers\.geojson(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rivers) });
  });
  await context.route(/https:\/\/[^/]*overpass[^/]*\/api\/interpreter/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(overpass) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof waterRoute === 'function');
  const result = await page.evaluate(() => waterRoute({ lat: 37.986, lng: 127.654 }, { lat: 37.983002, lng: 127.644284 }));
  expect(result.source).toBe('static-river-water');
  expect(result.access).toHaveLength(1);
  expect(result.coords[result.coords.length - 1][1]).toBeGreaterThan(127.653);
  expect(result.access[0][1]).toEqual([37.983002, 127.644284]);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('water route enters the nearest edge projection without an endpoint backtrack', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ring = (points) => points.map(([lat, lon]) => ({ lat, lon }));
  const overpass = { elements: [
    { type: 'relation', id: 1, tags: { natural: 'water' }, members: [
      { role: 'outer', geometry: ring([[36.997, 126.975], [37.003, 126.975], [37.003, 127.025], [36.997, 127.025], [36.997, 126.975]]) },
    ] },
    { type: 'way', id: 2, tags: { waterway: 'river', name: '투영강' }, geometry: ring([[37.0, 127.02], [37.0, 127.0], [37.0, 126.98]]) },
  ] };
  await context.route(/\/rivers\.geojson(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) });
  });
  await context.route(/https:\/\/[^/]*overpass[^/]*\/api\/interpreter/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(overpass) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof waterRoute === 'function');
  const result = await page.evaluate(() => waterRoute({ lat: 36.999, lng: 127.014 }, { lat: 37.0, lng: 126.98 }));
  expect(result.access).toEqual([]);
  expect(result.coords.length).toBeGreaterThanOrEqual(3);
  expect(result.coords[1][1]).toBeCloseTo(127.014, 3);
  expect(Math.max(...result.coords.slice(1).map((p) => p[1]))).toBeLessThan(127.015);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('campsites are visible only while administrator mode is active', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('mc_admin', 'test-admin-key'));
  const campsite = { id: 'camp-test', lat: 36.3, lng: 127.8, type: '캠핑사이트', name: '관리자 캠프', note: '관리자 전용', t: 1 };
  const publicFood = { id: 'food-test', lat: 36.301, lng: 127.801, type: '식당/카페', name: '공개 식당', note: '', t: 1 };
  let savedCampsite = null;
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/admincheck')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } else if (url.pathname.endsWith('/obstacles')) {
      const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      expect(body === null || body.action === 'list-admin').toBe(true);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([publicFood, campsite]) });
    } else if (url.pathname.endsWith('/obstacle') && route.request().method() === 'POST') {
      savedCampsite = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, obstacle: { id: 'camp-new', lat: 36.3, lng: 127.8, type: savedCampsite.type, name: savedCampsite.name, note: savedCampsite.note, t: 2 } }) });
    } else if (url.pathname.endsWith('/launch-sites')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], truncated: false }) });
    } else if (url.pathname.endsWith('/admin-sheet-link')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: '' }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => isAdmin() && !!_obstacles['camp-test']);
  await expect(page.locator('.obs-camp')).toHaveCount(1);
  await expect(page.locator('.obs-camp')).toHaveText('🏕️');
  expect(await page.evaluate(() => _localSearch('관리자 캠프').some((item) => item.o?.id === 'camp-test'))).toBe(false);

  await page.evaluate(() => openObsModal('add', { lat: 36.3, lng: 127.8 }));
  const campsiteButton = page.locator('#obBody .seg-b[data-ty="캠핑사이트"]');
  await expect(campsiteButton).toBeVisible();
  expect(await campsiteButton.evaluate((node) => getComputedStyle(node).gridColumnStart)).toBe('2');
  await campsiteButton.click();
  await expect(campsiteButton).toHaveClass(/on/);
  await expect(page.locator('#obNameRow')).toBeHidden();
  await page.locator('#obSave').click();
  await expect(page.locator('#obsModal')).not.toHaveClass(/open/);
  expect(savedCampsite.type).toBe('캠핑사이트');
  expect(savedCampsite.name).toBe('');
  await expect(page.locator('.obs-camp')).toHaveCount(2);

  await page.evaluate(() => _setAdmin(false));
  await page.waitForFunction(() => !_obstacles['camp-test']);
  await expect(page.locator('.obs-camp')).toHaveCount(0);
  expect(await page.evaluate(() => _localSearch('관리자 캠프').length)).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('plain refresh restores map center and zoom while share URLs take priority', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined');
  await page.evaluate(() => map.setView([37.123456, 128.54321], 14, { animate: false }));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('mc_map_view_v1') || 'null')?.zoom === 14);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined');
  const restored = await page.evaluate(() => ({ center: map.getCenter(), zoom: map.getZoom() }));
  expect(restored.zoom).toBe(14);
  // Leaflet rounds a restored center to the nearest mobile viewport pixel (about 2 m at z14).
  expect(Math.abs(restored.center.lat - 37.123456)).toBeLessThan(0.00003);
  expect(Math.abs(restored.center.lng - 128.54321)).toBeLessThan(0.00003);

  await page.goto(baseURL + '/?course=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined');
  expect(await page.evaluate(() => _initialMapView)).toBeNull();
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('historical imagery opens from the satellite legend row at the current map center', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const redPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGO8o6HBwMDAxAAGAA7uATD++YiCAAAAAElFTkSuQmCC', 'base64');
  const bluePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPUCLjDwMDAxAAGAA9mAVi5O1urAAAAAElFTkSuQmCC', 'base64');
  await context.route('https://server.arcgisonline.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: redPng });
  });
  await context.route('https://wayback.maptiles.arcgis.com/**', async (route) => {
    if (route.request().url().includes('GetCapabilities')) {
      const xml = '<?xml version="1.0"?><Capabilities><Contents>'
        + '<Layer><Title>Wayback 2024-02-01</Title><ResourceURL template="https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/123/{TileMatrix}/{TileRow}/{TileCol}"/></Layer>'
        + '<Layer><Title>Wayback 2023-01-01</Title><ResourceURL template="https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/456/{TileMatrix}/{TileRow}/{TileCol}"/></Layer>'
        + '</Contents></Capabilities>';
      await route.fulfill({ status: 200, contentType: 'application/xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: xml });
    } else {
      const png = route.request().url().includes('/tile/123/') ? redPng : bluePng;
      await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: png });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof map !== 'undefined' && !!document.querySelector('.wayback-open'));
  await page.evaluate(() => {
    document.getElementById('gate').style.display = 'none';
    map.setView([37.1234, 127.5678], 12, { animate: false });
    document.querySelector('.leaflet-control-layers').classList.remove('lc-collapsed');
  });

  const button = page.locator('.sat-base-row .wayback-open');
  await expect(button).toHaveText('🕘 과거');
  await button.click({ force: true, timeout: 5000 });
  await page.waitForFunction(() => !!_wbTarget && document.getElementById('waybackCtl').classList.contains('on'), null, { timeout: 5000 });
  const opened = await page.evaluate(() => ({
    lat: _wbTarget.lat,
    lng: _wbTarget.lng,
    label: document.getElementById('waybackName').textContent,
    satellite: map.hasLayer(baseSat),
    savedBase: localStorage.getItem('mc_basemap'),
    damStillHasButton: _damPopupHtml(DAMS[0], null).includes('과거 위성사진 보기'),
  }));
  expect(Math.abs(opened.lat - 37.1234)).toBeLessThan(0.0001);
  expect(Math.abs(opened.lng - 127.5678)).toBeLessThan(0.0001);
  expect(opened.label).toBe('현재 지도 중심 주변');
  expect(opened.satellite).toBe(true);
  expect(opened.savedBase).toBe('위성지도');
  expect(opened.damStillHasButton).toBe(false);
  await expect(page.locator('#waybackDate')).toBeEnabled({ timeout: 5000 });
  await expect(page.locator('#waybackDate')).toHaveValue('456');
  await expect(page.locator('#waybackDate option')).toHaveText('2023-01-01 배포 · 변화 확인');
  await expect(page.locator('#waybackNote')).toContainText('현재 화면 5개 지점');
  await expect(page.locator('#waybackNote')).toContainText('촬영일이 아닌 ESRI 배포일');
  const pixelThresholds = await page.evaluate(() => {
    const pixels = (count, diff, changed) => {
      const a = new Uint8ClampedArray(count * 4);
      const b = new Uint8ClampedArray(count * 4);
      for (let i = 0; i < count; i++) { a[i * 4 + 3] = 255; b[i * 4 + 3] = 255; }
      for (let i = 0; i < changed; i++) b[i * 4] = diff;
      return _wbPixelsMeaningful(a, b);
    };
    const snapshots = (changed) => {
      const a = Array.from({ length: 5 }, () => new Uint8ClampedArray(4000));
      const b = Array.from({ length: 5 }, () => new Uint8ClampedArray(4000));
      for (let i = 0; i < changed; i++) b[0][i * 4] = 15;
      return _wbSnapshotMeaningful(a, b);
    };
    return {
      identical: pixels(1000, 0, 0), tiny: pixels(1000, 15, 2),
      high: pixels(1000, 25, 5), medium: pixels(1000, 15, 100),
      oneTileMinor: snapshots(50), oneTileClear: snapshots(500),
    };
  });
  expect(pixelThresholds).toEqual({ identical: false, tiny: false, high: true, medium: true, oneTileMinor: false, oneTileClear: true });

  await page.locator('#waybackClose').click({ force: true });
  await page.waitForFunction(() => _wbTarget === null, null, { timeout: 5000 });
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('course name suggestion omits province and starts at city or county', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _shortCoursePlace === 'function');
  const names = await page.evaluate(() => ({
    chuncheon: _shortCoursePlace('', '강원특별자치도 춘천시 신북읍 신포리 1'),
    gokseong: _shortCoursePlace('', '전라남도 곡성군 석곡면 공북리 2'),
    suwon: _shortCoursePlace('', '경기도 수원시 영통구 이의동 3'),
    seoul: _shortCoursePlace('', '서울특별시 강남구 청담동 4'),
    labelled: _shortCoursePlace('강원특별자치도 춘천시 - 신포리(신북읍)', ''),
    labelledAddress: _shortCoursePlace('화천군 - 강원특별자치도 화천군 간동면 구만리 1395-1', ''),
    prefixedAddress: _shortCoursePlace('화천군 강원특별자치도 화천군 간동면 구만리 1393', ''),
    shortNamedPlace: _shortCoursePlace('춘천 오월리', ''),
  }));
  expect(names).toEqual({
    chuncheon: '춘천시 신북읍 신포리 1',
    gokseong: '곡성군 석곡면 공북리 2',
    suwon: '수원시 영통구 이의동 3',
    seoul: '서울특별시 강남구 청담동 4',
    labelled: '춘천시 신포리(신북읍)',
    labelledAddress: '화천군 간동면 구만리 1395-1',
    prefixedAddress: '화천군 간동면 구만리 1393',
    shortNamedPlace: '춘천 오월리',
  });
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('course share URL and preview image use the course-specific map card', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _drawCoursePreview === 'function' && typeof courseShareUrl === 'function');
  const preview = await page.evaluate(() => {
    const course = {
      name: '북한강 종주 #1 - 화천 평화의댐 오토캠핑장 ~ 화천 파로호유원지 선착장',
      km: 22.86,
      color: '#d500f9',
      coords: [[38.20519, 127.850647], [38.158603, 127.862341], [38.102075, 127.865463], [38.096304, 127.776642]],
    };
    const image = _drawCoursePreview(course, []);
    return { url: courseShareUrl('k1788763953491'), prefix: image.slice(0, 27), length: image.length };
  });
  expect(preview.url).toBe('https://mycanoe-map.kohoon0140.workers.dev/c/k1788763953491');
  expect(preview.prefix).toBe('data:image/jpeg;base64,/9j/');
  expect(preview.length).toBeGreaterThan(20000);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});

test('short measure links load the stored path and legacy links still decode', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const path = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/measure-share')) {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        expect(body.path).toBe(path);
        expect(body.km).toBe(10.13);
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, id: 'm0123456789abcdefabcd' }) });
      } else {
        expect(url.searchParams.get('id')).toBe('m0123456789abcdefabcd');
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, path, km: 10.13 }) });
      }
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(baseURL + '/?measure=m0123456789abcdefabcd', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.leaflet-popup-content')?.textContent.includes('10.13km'));
  expect(await page.evaluate(() => measDone.getLayers().some((group) => group.getLayers
    && group.getLayers().some((layer) => layer instanceof L.Polyline)))).toBe(true);
  const prepared = await page.evaluate(async ({ encoded }) => {
    localStorage.setItem('mc_user', JSON.stringify({ uid: '123', tok: 'test-token' }));
    const data = { coords: _decMeasure(encoded), km: 10.13 };
    _lastMeasureShare = data;
    await _prepareMeasureShare(data);
    return _lastMeasureShortUrl;
  }, { encoded: path });
  expect(prepared).toBe(baseURL + '/?measure=m0123456789abcdefabcd');
  expect(errors).toEqual([]);

  await context.unroute('https://mycanoe-map.kohoon0140.workers.dev/**');
  await page.goto(baseURL + '/?measure=' + encodeURIComponent(path) + '&km=10.13', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.leaflet-popup-content')?.textContent.includes('10.13km'));
  expect(await page.evaluate(() => measDone.getLayers().some((group) => group.getLayers
    && group.getLayers().some((layer) => layer instanceof L.Polyline)))).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
  await browser.close();
});
