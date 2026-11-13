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
    response.writeHead(200, { 'Content-Type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});


const waterOne = {id:'9000000000001',name:'첫 물길',km:2,coords:[[36.94,129.36],[36.95,129.37],[36.96,129.38]]};
const waterTwo = {id:'9000000000002',name:'둘째 물길',km:3,coords:[[36.96,129.38],[36.97,129.39]]};
const land = {id:'9000000000003',type:'육로',name:'두번째 육로',lat:36.94,lng:129.36,geometry:{type:'MultiLineString',coordinates:[[[129.35,36.93],[129.36,36.94]],[[129.37,36.95],[129.38,36.96]]]}};
const cases=[
  ['water-water',['course:k9000000000001','course:k9000000000002'],['물길','물길']],
  ['land-water',['trail:uljin-wangpicheon-botdorang','course:k9000000000001'],['육로','물길']],
  ['land-land',['trail:uljin-wangpicheon-botdorang','trail:9000000000003'],['육로','육로']]
];
for(const width of [1360,390]){
  for(const [name,refs,kinds] of cases){
    test(`${name} ordered share at ${width}px`,async()=>{
      const browser=await chromium.launch(process.platform==='darwin'?{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{headless:true});
      const page=await browser.newPage({viewport:{width,height:width===390?844:950},isMobile:width===390,hasTouch:width===390});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/courses?shared=*',route=>{const id=new URL(route.request().url()).searchParams.get('shared');route.fulfill({json:[waterOne,waterTwo].filter(c=>c.id===id)});});
      await page.route('**/obstacles',route=>route.fulfill({json:[land]}));
      await page.addInitScript(()=>{localStorage.setItem('mc_map_view_v1',JSON.stringify({lat:37,lng:127,zoom:7}));Object.defineProperty(navigator,'share',{value:undefined});Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__shared=text;}}});});
      await page.goto(baseURL+'/?routes='+encodeURIComponent(refs.join(',')),{waitUntil:'domcontentloaded'});
      await expect(page.locator('#combinedRouteBar')).toContainText('2구간');
      await page.evaluate(()=>hideGate());
      expect(await page.evaluate(()=>_combinedRecords.map(r=>r.kind))).toEqual(kinds);
      expect(await page.evaluate(()=>_combinedRecords.map(r=>r.ref))).toEqual(refs);
      expect(await page.evaluate(()=>_combinedErrors)).toEqual([]);
      expect(await page.evaluate(()=>map.getCenter().lng)).toBeGreaterThan(129);
      await page.locator('#combinedRouteBar button').filter({hasText:'공유'}).click();
      const shared=await page.evaluate(()=>window.__shared);expect(new URL(shared).searchParams.get('routes')).toBe(refs.join(','));
      await page.locator('#combinedRouteBar button').filter({hasText:'구간'}).click();
      await expect(page.locator('#combinedRoutesModal')).toHaveClass(/open/);
      await expect(page.locator('.combined-row')).toHaveCount(2);
      await page.getByRole('button',{name:'앞으로 2번 구간',exact:true}).click();
      await page.getByRole('button',{name:'전체 코스 표시',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>_combinedRecords.map(r=>r.ref))).toEqual(refs.slice().reverse());
      await page.reload();await expect(page.locator('#combinedRouteBar')).toContainText('2구간');
      expect(await page.evaluate(()=>_combinedRecords.map(r=>r.ref))).toEqual(refs.slice().reverse());
      await page.evaluate(()=>hideGate());
      await page.locator('#combinedRouteBar button').filter({hasText:'닫기'}).click();
      expect(await page.evaluate(()=>new URL(location.href).searchParams.has('routes'))).toBe(false);
      expect(await page.evaluate(()=>_combinedRouteLayer.getLayers().length)).toBe(0);
      expect(errors).toEqual([]);await browser.close();
    });
  }
}

test('deleted trail and missing course remain explicit failed references',async()=>{
  const browser=await chromium.launch(process.platform==='darwin'?{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{headless:true});
  const page=await browser.newPage();
  await page.route('**/obstacles',r=>r.fulfill({json:[{id:'trail:uljin-wangpicheon-botdorang',type:'육로',del:true}]}));
  await page.route('**/courses?shared=*',r=>r.fulfill({json:[]}));
  const refs=['trail:uljin-wangpicheon-botdorang','course:kmissing'];
  await page.goto(baseURL+'/?routes='+encodeURIComponent(refs.join(',')),{waitUntil:'domcontentloaded'});
  await expect(page.locator('#combinedRouteBar')).toContainText('0/2구간');
  expect(await page.evaluate(()=>_combinedRecords)).toEqual([]);
  expect(await page.evaluate(()=>_combinedErrors)).toEqual(refs);
  expect(await page.evaluate(()=>combinedRouteRefs())).toEqual(refs);
  await browser.close();
});

test('course and walking detail buttons start a combined route with the current item',async()=>{
  const browser=await chromium.launch(process.platform==='darwin'?{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/obstacles',r=>r.fulfill({json:[]}));
  await page.route('**/courses?shared=*',r=>r.fulfill({json:[waterOne,waterTwo]}));
  await page.goto(baseURL+'/?trail=uljin-wangpicheon-botdorang',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof _trailUrlFocused!=='undefined'&&_trailUrlFocused);await page.evaluate(()=>hideGate());
  await page.getByRole('button',{name:'코스 묶기',exact:true}).click();
  expect(await page.evaluate(()=>_combinedDraft)).toEqual(['trail:uljin-wangpicheon-botdorang']);
  await page.getByRole('button',{name:'코스 묶기 닫기',exact:true}).click();
  await page.evaluate(c=>{renderKVCourse(c);openCourseComments('course_k'+c.id,c,'k'+c.id);},waterOne);
  await page.locator('#pmLinks').getByRole('button',{name:'코스 묶기',exact:true}).click();
  expect(await page.evaluate(()=>_combinedDraft)).toEqual(['course:k9000000000001']);
  await page.locator('#combinedUrl').fill('https://mycanoe-map.kohoon0140.workers.dev/c/k9000000000002\n🛶 코스명: 둘째 물길');
  await page.locator('#combinedAdd').click();
  expect(await page.evaluate(()=>_combinedDraft)).toEqual(['course:k9000000000001','course:k9000000000002']);
  await expect(page.locator('#combinedSelected')).toContainText('둘째 물길');
  await page.waitForTimeout(300);await page.screenshot({path:'/tmp/combined-routes-20261113/entry-composer.png'});
  expect(errors).toEqual([]);await browser.close();
});
