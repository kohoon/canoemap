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
    const types = { '.html': 'text/html; charset=utf-8', '.geojson': 'application/geo+json', '.json': 'application/json' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const width of [390, 1280]) {
  test(`administrative dong search and boundary work at ${width}px`, async () => {
    const browser = await chromium.launch(process.platform === 'darwin'
      ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
      : { headless: true });
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async () => {
      document.querySelector('#gate').style.display = 'none';
      const rows = await _hjdSearch('청운효자동');
      if (rows.length !== 1) return { rows };
      await highlightAdministrativeArea(rows[0]);
      return { rows, bounds: _adminAreaLayer && _adminAreaLayer.getBounds().isValid(),
        focus: document.querySelector('#adminFocusBar .admin-focus-name').textContent,
        sourceLink: document.querySelector('#adminFocusBar .admin-focus-source').getAttribute('href'),
        sourceVisible: !document.querySelector('#adminFocusBar .admin-focus-source').hidden,
        footer: document.querySelector('.leaflet-control-attribution').textContent };
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].adminLevel).toBe('HJD');
    expect(result.rows[0].sub).toContain('행정동');
    expect(result.bounds).toBe(true);
    expect(result.focus).toBe('서울특별시 종로구 청운효자동');
    expect(result.sourceLink).toBe('/admin_dong/ATTRIBUTION.md');
    expect(result.sourceVisible).toBe(true);
    expect(result.footer).not.toContain('행정동 경계');
    expect(errors).toEqual([]);
    await browser.close();
  });
}
