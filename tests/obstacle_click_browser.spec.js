const {test,expect,chromium}=require('@playwright/test');
const fs=require('fs'),http=require('http'),path=require('path');
const root=path.resolve(__dirname,'..');let server,baseURL;
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  const file=path.resolve(root,name==='/'?'index.html':name.slice(1));
  if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
  const type=file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':'application/json';
  res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));baseURL=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(r=>server.close(r));});
const food={id:'1789009218047',lat:38.00351805695167,lng:127.65645503997804,type:'식당/카페',name:'대추나무집',note:'',kakaoUrl:'https://place.map.kakao.com/287167335'};
for(const mobile of [false,true])test(`registered restaurant selects at icon edges ${mobile?'mobile':'desktop'}`,async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 const context=await browser.newContext({viewport:{width:mobile?390:1360,height:mobile?844:950},isMobile:mobile,hasTouch:mobile});
 await context.route('https://mycanoe-map.kohoon0140.workers.dev/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/obstacles'?[food]:[]}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!_obstacles['1789009218047']);
 await page.evaluate(()=>{window.__addressLookups=0;const originalAddress=showAddress;showAddress=function(...args){window.__addressLookups++;return originalAddress(...args);};hideGate();map.setView([38.00351805695167,127.65645503997804],16,{animate:false});});
 const icon=page.locator('.obs-food[aria-label="대추나무집"]');
 const box=await icon.boundingBox();expect(box.width).toBe(34);expect(box.height).toBe(34);
 const marker=icon.locator('..'),area=await marker.boundingBox();expect(area.width).toBe(44);expect(area.height).toBe(44);
 expect(Math.abs((area.x+22)-(box.x+17))).toBeLessThan(1);expect(Math.abs((area.y+22)-(box.y+17))).toBeLessThan(1);
 for(const dx of [-20,0,20]){
  await page.evaluate(()=>{map.closePopup();});await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  // Beyond the visible 17px radius, inside the marker's 22px hit target.
  const b=await icon.boundingBox(),point={x:b.x+17+dx,y:b.y+17};
  if(mobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await expect(page.locator('.leaflet-popup-content')).toContainText('대추나무집');
  await expect(page.locator('.leaflet-popup a[href="https://place.map.kakao.com/287167335"]')).toBeVisible();
  await expect(page.locator('.leaflet-popup a').filter({hasText:'수정'})).toHaveCount(0);
 }
 expect(await page.evaluate(()=>window.__addressLookups)).toBe(0);
 if(!mobile){await page.evaluate(()=>{map.closePopup();});await marker.focus();await page.keyboard.press('Enter');await expect(page.locator('.leaflet-popup-content')).toContainText('대추나무집');}
 await page.evaluate(()=>{map.closePopup();_adminOk=true;_refreshObsPopups();});
 await icon.click();await page.locator('.leaflet-popup a').filter({hasText:'수정'}).click();
 await expect(page.locator('#obsModal')).toHaveClass(/open/);await expect(page.locator('#obName')).toHaveValue('대추나무집');
 expect(await page.evaluate(()=>[_obstacles['1789009218047'].lat,_obstacles['1789009218047'].lng])).toEqual([food.lat,food.lng]);
 await page.screenshot({path:`/tmp/obstacle-click-20261113/after-${mobile}.png`});expect(errors).toEqual([]);await browser.close();
});
