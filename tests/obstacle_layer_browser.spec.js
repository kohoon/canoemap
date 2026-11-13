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
const camp={id:'camp-near-food',lat:38.0039,lng:127.6573,type:'캠핑사이트',name:'인근 캠핑사이트',note:'테스트 장소'};
for(const mobile of [false,true])test(`walking route canvas preserves nearby marker selection ${mobile?'mobile':'desktop'}`,async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 const context=await browser.newContext({viewport:{width:mobile?390:1360,height:mobile?844:950},isMobile:mobile,hasTouch:mobile});
 await context.route('https://mycanoe-map.kohoon0140.workers.dev/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/obstacles'?[food]:[]}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!_obstacles['1789009218047']);
 await page.evaluate(camp=>{
  hideGate();_adminOk=true;renderObstacle(camp);
  focusWalkingTrail('trail:uljin-wangpicheon-botdorang');map.closePopup();
  map.setView([38.00351805695167,127.65645503997804],17,{animate:false});
 },camp);
 await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 for(const selector of ['.obs-food[aria-label="대추나무집"]','.obs-camp']){
  const icon=page.locator(selector);await expect(icon).toBeVisible();
  const hit=await icon.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});expect(hit).toBe(true);
  if(mobile)await icon.tap();else await icon.click();
  await expect(page.locator('.leaflet-popup-content')).toContainText(selector.includes('obs-food')?'대추나무집':'인근 캠핑사이트');
  await page.evaluate(()=>{map.closePopup();});await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 }
 // The path itself must remain clickable after moving it below markers.
 const point=await page.evaluate(()=>{
  focusWalkingTrail('trail:uljin-wangpicheon-botdorang');map.closePopup();
  const o=_obstacles['trail:uljin-wangpicheon-botdorang'];
  const lines=o.geometry.type==='LineString'?[o.geometry.coordinates]:o.geometry.coordinates;
  const line=lines.reduce((a,b)=>a.length>b.length?a:b),i=Math.floor(line.length/2);
  const a=line[i-1],b=line[i],p=map.latLngToContainerPoint([(a[1]+b[1])/2,(a[0]+b[0])/2]);return {x:p.x,y:p.y};
 });
 await expect(page.locator('.leaflet-popup')).toHaveCount(0);
 const container=await page.locator('#map').boundingBox();
 if(mobile)await page.touchscreen.tap(container.x+point.x,container.y+point.y);else await page.mouse.click(container.x+point.x,container.y+point.y);
 await expect(page.locator('.leaflet-popup-content')).toContainText('봇도랑길');
 expect(errors).toEqual([]);await browser.close();
});
