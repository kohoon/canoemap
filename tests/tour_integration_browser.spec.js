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
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.geojson': 'application/geo+json', '.png': 'image/png', '.txt': 'text/plain' };
    response.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function setup(viewport) {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  const context = await browser.newContext({ viewport, permissions: ['geolocation'], geolocation: { latitude: 37.89, longitude: 127.74, accuracy: 8 } });
  await context.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'tour-beta-member', tok: 'test-token', nick: '패들러' })));
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/profile') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { memberId: 'tour-beta-member', nick: '패들러', onboardingVersion: 1 } }) });
    } else if (url.pathname === '/trips' || url.pathname === '/course' || url.pathname === '/feed' || url.pathname === '/board') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: url.pathname === '/launch-sites' ? '{"items":[],"truncated":false}' : '[]' });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { browser, context, page, errors };
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`integrated tour opens and records GPS at ${viewport.width}px`, async () => {
    const { browser, context, page, errors } = await setup(viewport);
    try {
      await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
      await expect(page.locator('#tourEntry')).toBeVisible();
      await expect(page.locator('#tripbar')).toBeHidden();
      await page.locator('#tourEntry').click();
      await expect(page).toHaveURL(/tour=1/);
      await expect(page.locator('html')).toHaveClass(/tour-mode/, { timeout: 15000 });
      await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
      await expect(page.locator('#tripbar')).toBeVisible();
      await expect(page.locator('#tripStart')).toBeVisible();
      await page.locator('#tripStart').click();
      await expect(page.locator('#tmFree')).toBeVisible();
      await expect(page.locator('#tmFree')).toBeDisabled();
      await page.locator('#tmGpsAgree').check();
      await page.locator('#tmFree').click();
      await expect(page.locator('#tripbar')).toHaveClass(/rec/);
      await expect(page.locator('#tripGpsStatus')).toContainText('GPS 정상');
      await page.screenshot({ path: path.join(root, 'output', `tour-beta-${viewport.width}.png`) });
      await page.waitForTimeout(2500);
      await context.setGeolocation({ latitude: 37.8901, longitude: 127.7401, accuracy: 8 });
      await expect.poll(() => page.evaluate(() => _trk && _trk.track.length)).toBeGreaterThanOrEqual(2);
      await page.locator('#tripStart').click();
      await expect(page.locator('#tmBody')).toContainText('실측 km');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}

test('old tour address keeps unsent records available', async () => {
  const { browser, context, page, errors } = await setup({ width: 390, height: 844 });
  try {
    await context.addInitScript(() => localStorage.setItem('mc_trip_queue_v1', JSON.stringify([{ uid: 'tour-beta-member', clientId: 'pending' }])));
    await page.goto(baseURL + '/tour/index.html?course=k123', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#pending')).toBeVisible();
    await expect(page.locator('#go')).toHaveAttribute('href', /course=k123.*tour=1/);
    await expect(page.locator('a[href="./legacy.html"]')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`tour notices clear the bottom controls at ${viewport.width}px`, async () => {
    const { browser, context, page, errors } = await setup(viewport);
    try {
      await page.goto(baseURL + '/?tour=1', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
      const bounds = await page.evaluate(() => {
        document.getElementById('tripbar').classList.add('rec');
        toastMsg('GPS 위치를 다시 확인하고 있습니다. 잠시만 기다려 주세요.');
        const hint = document.getElementById('hint').getBoundingClientRect();
        const bar = document.getElementById('tripbar').getBoundingClientRect();
        return { hintTop: hint.top, hintBottom: hint.bottom, hintLeft: hint.left, hintRight: hint.right, barTop: bar.top, width: innerWidth };
      });
      expect(bounds.hintBottom).toBeLessThanOrEqual(bounds.barTop - 8);
      expect(bounds.hintTop).toBeGreaterThanOrEqual(0);
      expect(bounds.hintLeft).toBeGreaterThanOrEqual(0);
      expect(bounds.hintRight).toBeLessThanOrEqual(bounds.width);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}

test('long course hover labels stay within both horizontal map edges', async () => {
  const { browser, page, errors } = await setup({ width: 786, height: 522 });
  try {
    await page.goto(baseURL + '/?tour=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
    const bounds = await page.evaluate(() => {
      map.setView([37.9, 127.7], 14);
      const a = map.containerPointToLatLng([12, 160]);
      const b = map.containerPointToLatLng([774, 160]);
      renderKVCourse({ id: 'hover-edge-test', name: '엑스페디션#11 북한강 - 화천군 간동면 구만리 1393 ~ 춘천시 서면 오월리 163-2', km: 25.13, coords: [[a.lat, a.lng], [b.lat, b.lng]] });
      const hit = _kvCourseLayers['hover-edge-test'].ls[3];
      hit.addTo(map);
      return [a, b].map((point) => {
        hit.openTooltip(point);
        const rect = hit.getTooltip().getElement().getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, pane: hit.getTooltip().options.pane };
      });
    });
    for (const rect of bounds) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(786);
      expect(rect.width).toBeLessThanOrEqual(330);
      expect(rect.pane).toBe('courseTooltipPane');
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`launch and landing icons select exact tour endpoints at ${viewport.width}px`, async () => {
    const { browser, context, page, errors } = await setup(viewport);
    try {
      await page.goto(baseURL + '/?tour=1', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
      await page.evaluate(() => {
        const c = map.getCenter();
        map.setView(c, 14);
        const points = [[c.lat, c.lng - 0.001], [c.lat, c.lng + 0.001]];
        window._tourTestMarkers = points.map((point, index) => {
          const m = makeMarker(point, 'canoe');
          _bindPlaceClick(m, () => ({ lat: point[0], lng: point[1], name: `테스트 ${index + 1}`, cat: '런칭/랜딩' }), () => `테스트 ${index + 1}`);
          m.addTo(canoeLayer);
          m.getElement().dataset.tourTest = String(index);
          return m;
        });
        waterRoute = async (a, b) => ({ coords: [[a.lat, a.lng], [b.lat, b.lng]], km: 0.2 });
      });
      await page.locator('#tripStart').click();
      await page.locator('#tmGpsAgree').check();
      await page.locator('#tmPick').click();
      await page.locator('[data-tour-test="0"]').click();
      expect(await page.evaluate(() => _tourPick.points)).toEqual(await page.evaluate(() => {
        const p = _tourTestMarkers[0].getLatLng();
        return [{ lat: p.lat, lng: p.lng }];
      }));
      await expect(page.locator('#pmodal')).not.toHaveClass(/open/);
      await page.locator('[data-tour-test="1"]').click();
      await expect(page.locator('#tmPickedGo')).toBeVisible();
      expect(await page.evaluate(() => _tourPick.points)).toEqual(await page.evaluate(() => _tourTestMarkers.map(m => {
        const p = m.getLatLng(); return { lat: p.lat, lng: p.lng };
      })));
      await page.locator('#tmPickedGo').click();
      await expect(page.locator('#tripbar')).toHaveClass(/rec/);
      await expect(page.locator('#tripGpsStatus')).toContainText('GPS 정상');
      const tracking = await page.evaluate(() => ({
        points: _trk.track.length,
        marker: _trk.posMarker?.getLatLng(),
        center: map.getCenter(),
      }));
      expect(tracking.points).toBeGreaterThanOrEqual(1);
      expect(tracking.marker.lat).toBeCloseTo(37.89, 3);
      expect(tracking.center.lat).toBeCloseTo(37.89, 2);
      await page.waitForTimeout(2500);
      await context.setGeolocation({ latitude: 37.8901, longitude: 127.7401, accuracy: 8 });
      await expect.poll(() => page.evaluate(() => _trk.track.length)).toBeGreaterThanOrEqual(2);
      await page.evaluate(() => { map.fire('dragstart'); });
      expect(await page.evaluate(() => _trk.followView)).toBe(false);
      await page.locator('#tripRefresh').click();
      await expect.poll(() => page.evaluate(() => _trk.followView)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}

test('selected tour keeps its confirmation open when GPS permission fails', async () => {
  const { browser, page, errors } = await setup({ width: 390, height: 844 });
  try {
    await page.goto(baseURL + '/?tour=1', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#gate')).toBeHidden({ timeout: 15000 });
    await page.evaluate(() => {
      _tourConsentForStart = true;
      const coords = [[37.89, 127.74], [37.891, 127.741]];
      const p = {
        seq: ++_tourPickSeq, points: coords.map(([lat, lng]) => ({ lat, lng })),
        startMarker: L.circleMarker(coords[0]).addTo(map),
        endMarker: L.circleMarker(coords[1]).addTo(map),
        line: L.polyline(coords).addTo(map), busy: false, stage: 'routing',
      };
      _tourPick = p;
      _showTourPickConfirm(p, { coords, km: 0.2 });
      Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
        configurable: true,
        value: (_success, error) => error({ code: 1 }),
      });
    });
    await page.locator('#tmPickedGo').click();
    await expect(page.locator('#tmStartStatus')).toContainText('위치 권한이 거부되었습니다');
    await expect(page.locator('#tmodal')).toHaveClass(/open/);
    await expect(page.locator('#tmPickedGo')).toBeEnabled();
    expect(await page.evaluate(() => _trk)).toBeNull();
    expect(await page.evaluate(() => !!_tourPick?.line?._map)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
