const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');
const root = path.resolve(__dirname, '..');
const polygon = { type: 'Polygon', coordinates: [[[126.98,36.98],[127.02,36.98],[127.02,37.02],[126.98,37.02],[126.98,36.98]]] };
const line = { type: 'LineString', coordinates: [[126.99,37],[127.01,37]] };
const feature = (geometry, properties) => ({ type: 'Feature', geometry, properties });
let server, baseURL;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname.replace(/\/$/, '/index.html'));
    if (!file.startsWith(root + '/') || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'application/json');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => new Promise(resolve => server.close(resolve)));
async function openMap(mobile) {
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) });
  const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1360, height: mobile ? 844 : 950 }, isMobile: mobile, hasTouch: mobile });
  await context.route('**/*.geojson*', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const fixtures = {
      'protect_polygons.geojson': [feature(polygon, { s: '검증 보호구역' })],
      'wlz.geojson': [feature(polygon, { name: '검증 금지구역', target: '모든 수상레저기구' })],
      'rivers.geojson': [feature(line, { kind: 'river', name: '검증 하천' })],
      'roads.geojson': [feature(line, { kind: 'local', name: '검증 도로', ref: '1' })],
      'waterplay.geojson': [feature({ type: 'Point', coordinates: [127,37] }, { name: '검증 waterplay', management: '일반지역' })],
      'daiso_stores.geojson': [], 'hanaro_stores.geojson': []
    };
    if (!(name in fixtures)) return route.continue();
    return route.fulfill({ json: { type: 'FeatureCollection', features: fixtures[name] } });
  });
  await context.route('https://mycanoe-map.kohoon0140.workers.dev/**', route => {
    const url = new URL(route.request().url());
    return route.fulfill({ json: url.pathname === '/trip' ? { title: '검증 투어', track: [[37,126.99],[37,127],[37,127.01]], distKm: 1, durSec: 60 } : [] });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof renderKVCourse === 'function');
  await page.evaluate(() => {
    hideGate(); _adminOk = true; _courseFocusId = 'kaudit';
    _protectWanted = false; _wlzWanted = false;
    renderKVCourse({ id: 'audit', owner: 'admin', name: '레이어 검증 코스', km: 1, coords: [[37,126.99],[37,127.01]] });
    map.setView([37,127], 15, { animate: false });
  });
  return { browser, page, errors };
}
async function tapCenter(page, mobile) {
  await page.waitForTimeout(400);
  const point = await page.evaluate(() => { const p = map.latLngToContainerPoint([37,127]); return { x: p.x, y: p.y }; });
  const bounds = await page.locator('#map').boundingBox();
  if (mobile) await page.touchscreen.tap(bounds.x + point.x, bounds.y + point.y);
  else await page.mouse.click(bounds.x + point.x, bounds.y + point.y);
}
for (const mobile of [false, true]) {
  for (const overlay of ['regulations', 'admin geography', 'location accuracy', 'land ownership', 'tour history']) {
    test(`${overlay} preserves course selection ${mobile ? 'mobile' : 'desktop'}`, async () => {
      const { browser, page, errors } = await openMap(mobile);
      try {
        await page.evaluate(async ({ overlay, polygon }) => {
          if (overlay === 'regulations') {
            const layers = await Promise.all([_lazyLoadProtect(), _lazyLoadWlz()]);
            for (const layer of layers) { map.removeLayer(layer); layer.addTo(map); }
          }
          if (overlay === 'admin geography') {
            _riverAdminGroup.addTo(map); _roadAdminGroup.addTo(map);
            await Promise.all([_loadAdminRivers(), _loadAdminRoads()]);
          }
          if (overlay === 'location accuracy') {
            _ensureLocSurfaceData = () => Promise.resolve();
            _locWatching = true; _locHasFix = true; _locFollowView = false;
            map.fire('locationfound', { latlng: L.latLng(37,127), accuracy: 500 });
          }
          if (overlay === 'land ownership') {
            window._curAddr = { lat: 37, lng: 127 };
            const box = document.createElement('div');
            box.hidden = true; box.innerHTML = '<button id="landOwnBtn"></button><div id="landOwnResult"></div>'; document.body.appendChild(box);
            vworldJsonp = async url => url === '/req/data' ? { response: { result: { featureCollection: { features: [{ geometry: polygon, properties: { pnu: '1111111111111111111' } }] } } } } : { ladfrlVOList: { ladfrlVOList: [{ posesnSeCode: '01', posesnSeCodeNm: '개인' }] } };
            await checkLandOwnership();
            if (!_landOwnershipLayer) throw new Error("필지 강조면 생성 실패");
          }
          if (overlay === 'tour history') {
            setUser({ uid: 'audit', tok: 'fixture' }); await viewTrip('audit'); map.closePopup();
            if (!_viewLine || !_viewLine.getLayers().length) throw new Error('투어 경로 생성 실패');
          }
          map.setView([37,127], 15, { animate: false });
        }, { overlay, polygon });
        await tapCenter(page, mobile);
        await expect(page.locator('#pmTitle')).toContainText('레이어 검증 코스');
        if (overlay === 'regulations') {
          await page.evaluate(async () => {
            closePlaceModal(); map.removeLayer(allCoursesGroup);
            _riverAdminGroup.addTo(map); _roadAdminGroup.addTo(map);
            await Promise.all([_loadAdminRivers(), _loadAdminRoads()]);
            _protectWanted = true; _wlzWanted = true;
            map.setView([38,128], 10, { animate: false });
            map.setView([37,127], 15, { animate: false });
            _heavyZoomGate();
          });
          await tapCenter(page, mobile);
          await expect(page.locator('.leaflet-popup-content').last()).toContainText('검증 금지구역');
          await page.evaluate(() => { map.closePopup(); _wlzWanted = false; map.removeLayer(wlzLayer); });
          await expect(page.locator('.leaflet-popup')).toHaveCount(0);
          await tapCenter(page, mobile);
          await expect(page.locator('.leaflet-popup-content').last()).toContainText('검증 보호구역');
        }
        expect(errors).toEqual([]);
      } finally { await browser.close(); }
    });
  }
}
for (const mobile of [false, true]) {
  test(`point layers survive base changes, toggles and navigation ${mobile ? 'mobile' : 'desktop'}`, async () => {
    test.setTimeout(120000);
    const { browser, page, errors } = await openMap(mobile);
    try {
      await page.evaluate(async () => {
        const areas = await Promise.all([_lazyLoadProtect(), _lazyLoadWlz()]);
        areas.forEach(layer => layer.addTo(map));
        _riverAdminGroup.addTo(map); _roadAdminGroup.addTo(map);
        await Promise.all([_loadAdminRivers(), _loadAdminRoads()]);
        focusWalkingTrail('trail:uljin-wangpicheon-botdorang'); map.closePopup();
        L.polyline([[36.99,126.99],[37.01,127.01]], { pane: 'riverSearchPane', interactive: false }).addTo(_riverSearchFocus);
        L.polygon([[36.99,126.99],[37.01,126.99],[37.01,127.01]], { pane: 'adminAreaPane', interactive: false }).addTo(map);
        window.auditRoadviewClicks = 0;
        openRoadview = () => { window.auditRoadviewClicks++; };
        _wlGet = async () => null; _damGet = async () => null;
      });
      for (const base of ['osm', 'esri', 'vworld', 'offline']) {
        await page.evaluate(base => {
          [baseOSM, baseSat, offlineBase].forEach(layer => map.removeLayer(layer));
          if (base === 'osm') baseOSM.addTo(map);
          else if (base === 'offline') {
            const fc = { type: 'FeatureCollection', features: [] };
            _offlinePack = { bounds: { s: 36.9, w: 126.9, n: 37.1, e: 127.1 }, roads: fc, rivers: fc };
            _renderOfflinePack(_offlinePack); useOfflineMap(true);
          } else {
            setSatSource(base); baseSat.addTo(map);
            if (_satSrc !== base) throw new Error('위성지도 전환 실패');
          }
          map.setView([36.9,126.9], 10, { animate: false });
          map.setView([37,127], 15, { animate: false });
        }, base);
        for (const kind of ['canoe','spot','candidate','보','식당/카페','캠핑사이트','water','dam','cctv','daiso','hanaro','waterplay','roadview']) {
          await page.evaluate(() => { closePlaceModal(); map.closePopup(); });
          await expect(page.locator('.leaflet-popup')).toHaveCount(0);
          const expected = await page.evaluate(async kind => {
            const ll = [37,127];
            let marker, group, title = '검증 ' + kind;
            if (['canoe','spot','candidate'].includes(kind)) {
              group = kind === 'spot' ? famousLayer : canoeLayer;
              marker = makeMarker(ll, kind).addTo(group);
              _bindPlaceClick(marker, () => ({ name: title, lat: 37, lng: 127, cat: kind === 'spot' ? '명소' : '런칭/랜딩' }), title);
            } else if (['보','식당/카페','캠핑사이트'].includes(kind)) {
              renderObstacle({ id: 'audit-point', lat: 37, lng: 127, type: kind, name: title });
              marker = _obstacles['audit-point']._m; group = obstacleLayer;
            } else if (kind === 'water' || kind === 'dam') {
              group = kind === 'water' ? waterLevelLayer : damLevelLayer;
              marker = group._auditFirst || (group._auditFirst = group.getLayers()[0]); marker.setLatLng(ll); group.addLayer(marker);
              title = kind === 'water' ? WLSTN[0].nm : DAMS[0].lake;
            } else if (kind === 'cctv') {
              loadCctv(); group = cctvLayer; marker = group._auditFirst || (group._auditFirst = group.getLayers()[0]); marker.setLatLng(ll); group.addLayer(marker); title = CCTVS[0].nm;
            } else if (kind === 'daiso' || kind === 'hanaro') {
              const f = { type: 'Feature', geometry: { type: 'Point', coordinates: [127,37] }, properties: { name: title } };
              group = kind === 'daiso' ? daisoLayer : hanaroLayer;
              if (kind === 'daiso') { _daisoFeatures = [f]; _renderDaiso(); } else { _hanaroFeatures = [f]; _renderHanaro(); }
              marker = group.getLayers().at(-1);
            } else if (kind === 'waterplay') {
              group = await _lazyLoadWaterplay();
              marker = group._auditFirst || (group._auditFirst = group.getLayers()[0]); group.addLayer(marker);
            } else {
              group = roadviewLayer;
              _addRoadviewFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [127,37] }, properties: { id: 'audit-roadview-' + Date.now(), name: title, rv: true } });
              marker = group.getLayers().at(-1); title = '';
            }
            map.removeLayer(group); group.addTo(map);
            window.auditPoint = { marker, group };
            return title;
          }, kind);
          await tapCenter(page, mobile);
          if (['canoe','spot','candidate'].includes(kind)) await expect(page.locator('#pmTitle')).toContainText(expected);
          else if (kind === 'roadview') expect(await page.evaluate(() => window.auditRoadviewClicks)).toBeGreaterThan(0);
          else await expect(page.locator('.leaflet-popup-content').last()).toContainText(expected);
          await page.evaluate(() => {
            const { marker, group } = window.auditPoint;
            group.removeLayer(marker);
            if (group === obstacleLayer) delete _obstacles['audit-point'];
            if (group === roadviewLayer) group.clearLayers();
            if (group === daisoLayer) { _daisoFeatures = []; group.clearLayers(); }
            if (group === hanaroLayer) { _hanaroFeatures = []; group.clearLayers(); }
          });
        }
      }
      const interceptingCanvases = await page.evaluate(() => Array.from(document.querySelectorAll('.leaflet-pane canvas')).filter(canvas => getComputedStyle(canvas).pointerEvents !== 'none' && !canvas.parentElement.classList.contains('leaflet-overlay-pane')).map(canvas => canvas.parentElement.className));
      expect(interceptingCanvases).toEqual([]);
      expect(errors).toEqual([]);
    } finally { await browser.close(); }
  });
}
