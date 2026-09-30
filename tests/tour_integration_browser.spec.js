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
