const { test, expect, chromium } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
let server;
let baseURL;

async function signInMock(page) {
  await page.addInitScript(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'test-member', nick: '테스트', tok: 'valid-token' })));
  await page.route('**/paddling-state**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, favorites: [], recent: [], progress: {} }) }));
  await page.route('**/log', route => route.fulfill({ status: 200, body: 'ok' }));
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : (pathname.replace(/^\/+/, '') + (pathname.endsWith('/') ? 'index.html' : ''));
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test('beavertail paddle anatomy stays visible on desktop and mobile', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    await signInMock(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/paddling/?skill=paddle-anatomy`, { waitUntil: 'domcontentloaded' });
    const figure = page.locator('.paddle-anatomy');
    await expect(figure).toBeVisible();
    const box = await figure.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const blade = figure.locator('svg > path.part').nth(2);
    await expect(blade).toHaveAttribute('d', /C414 136 440 130 469 118.*C626 106 653 119 660 142/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  }
  await browser.close();
});

test('learning paths and on-water practice card work on desktop and mobile', async () => {
  const browser = await chromium.launch(process.platform === 'darwin'
    ? { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
    : { headless: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
    const page = await context.newPage();
    await signInMock(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/paddling/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.path-card')).toHaveCount(6);
    if (viewport.width < 500) {
      await expect(page.locator('.mobile-dock')).toBeVisible();
      const visual = await page.locator('.school-visual').boundingBox();
      expect(visual.width).toBeGreaterThanOrEqual(viewport.width - 32);
      const pathCard = await page.locator('.path-card').first().boundingBox();
      expect(pathCard.width).toBeGreaterThanOrEqual(280);
      expect(await page.locator('.paths').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      expect(await page.locator('.topbar').evaluate((element) => getComputedStyle(element).position)).toBe('static');
    }
    await page.locator('[data-path-skill="canoe-safety-equipment"]').first().click();
    await expect(page.locator('#skillModal')).toHaveClass(/open/);
    await page.locator('#detailQuick').click();
    await expect(page.locator('#quickMode')).toHaveClass(/open/);
    await expect(page.locator('.quick-cue')).toHaveCount(3);
    await page.locator('[data-quick-state="doing"]').click();
    await expect(page.locator('[data-quick-state="doing"]')).toHaveClass(/active/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
  }
  await browser.close();
});

test('anonymous and invalid sessions cannot open school or glossary', async ({ page }) => {
  await page.goto(`${baseURL}/paddling/?skill=j-stroke`);
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('#gateAction')).toHaveText('카카오 로그인');
  await expect(page.locator('#skillModal')).toBeHidden();
  await expect(page.locator('.layout')).toBeHidden();
  await page.goto(`${baseURL}/paddling/glossary/`);
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('.layout')).toBeHidden();
  await page.evaluate(() => localStorage.setItem('mc_user', JSON.stringify({ uid: 'fake', tok: 'fake' })));
  await page.route('**/paddling-state**', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
  await page.reload();
  await expect(page.locator('#gateAction')).toHaveText('카누맵에서 로그인·회원가입');
  await expect(page.locator('.layout')).toBeHidden();
});

test('Kakao callback and existing map session unlock both pages', async ({ page }) => {
  await page.route('**/paddling-state**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"favorites":[],"recent":[],"progress":{}}' }));
  await page.route('**/log', route => route.fulfill({ status: 200, body: 'ok' }));
  await page.goto(`${baseURL}/paddling/#login=test-member&nick=%ED%85%8C%EC%8A%A4%ED%8A%B8&tok=valid-token`);
  await expect(page.locator('.school-visual')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('mc_user'))).toContain('test-member');
  await page.goto(`${baseURL}/paddling/glossary/`);
  await expect(page.locator('.layout')).toBeVisible();
  await expect(page.locator('.term').first()).toBeVisible();
});

test('logging out in another same-origin tab locks an open school page', async ({ context, page }) => {
  await signInMock(page);
  await page.goto(`${baseURL}/paddling/`);
  await expect(page.locator('.school-visual')).toBeVisible();
  const mapTab = await context.newPage();
  await mapTab.goto(baseURL);
  await mapTab.evaluate(() => localStorage.removeItem('mc_user'));
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.locator('.layout')).toBeHidden();
});
