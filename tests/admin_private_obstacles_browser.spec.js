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
for(const mobile of [false,true])test(`private valley and shared lock badge ${mobile?'mobile':'desktop'}`,async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(()=>localStorage.setItem('mc_admin','test-admin-key'));
 let saved;
 const landmarks=[{id:'camp',type:'캠핑사이트',name:'비공개 캠프',lat:36.3,lng:127.8},{id:'valley',type:'계곡',name:'비공개 계곡',lat:36.302,lng:127.802},{id:'pass',type:'통과지점',name:'공개 통과지점',lat:36.304,lng:127.804}];
 await context.route('https://mycanoe-map.kohoon0140.workers.dev/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data=[];
  if(url.pathname.endsWith('/admincheck'))data={ok:true};
  else if(url.pathname.endsWith('/obstacles'))data=req.method()==='POST'?landmarks:landmarks.filter(x=>x.type==='통과지점');
  else if(url.pathname.endsWith('/obstacle')){saved=req.postDataJSON();data={ok:true,obstacle:{...saved,id:'new-valley'}};}
  else if(url.pathname.endsWith('/launch-sites'))data={items:[],truncated:false};
  else if(url.pathname.endsWith('/admin-sheet-link'))data={ok:true,url:''};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(baseURL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>isAdmin()&&!!_obstacles.valley);
 await page.evaluate(()=>{hideGate();map.setView([36.302,127.802],15,{animate:false});});
 await expect(page.locator('.obs-valley .obs-private-lock')).toHaveCount(1);
 await expect(page.locator('.obs-camp .obs-private-lock')).toHaveCount(1);
 expect(await page.evaluate(()=>_localSearch('비공개 계곡')[0].label)).toContain('🔒 관리자 전용');
 await page.locator('.obs-valley').click();
 await expect(page.locator('.leaflet-popup .admin-only-badge')).toHaveText('🔒 관리자 전용');
 await page.evaluate(()=>{map.closePopup();openObsModal('add',{lat:36.302,lng:127.802});});
 const button=page.locator('#obBody [data-ty="계곡"]');
 await expect(button.locator('.admin-only-badge')).toHaveText('🔒 관리자 전용');
 await expect(page.locator('#obBody [data-ty="캠핑사이트"] .admin-only-badge')).toBeVisible();
 await button.click();await page.locator('#obName').fill('테스트 계곡');
 const dimensions=await page.locator('#obBody .seg').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
 expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
 await page.screenshot({animations:'disabled',path:`/tmp/canoemap-private-obstacles-${mobile?'mobile':'desktop'}.png`});
 await page.locator('#obSave').click();await expect(page.locator('#obsModal')).not.toHaveClass(/open/);
 expect(saved.type).toBe('계곡');expect(saved.name).toBe('테스트 계곡');
 await page.evaluate(()=>_setAdmin(false));
 await expect(page.locator('.obs-valley')).toHaveCount(0);await expect(page.locator('.obs-camp')).toHaveCount(0);
 expect(await page.evaluate(()=>_localSearch('비공개 계곡').length)).toBe(0);
 await expect(page.locator('.obs-pass')).toHaveCount(1);expect(errors).toEqual([]);
 await context.close();await browser.close();
});
