const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),folder='review/new-zealand-launch-20261128';
 const data=JSON.parse(fs.readFileSync(path.join(root,folder,'research.json')));
 assert.equal(data.records.length,24);assert.equal(data.courses.length,4);
 const sites=data.records.flatMap(r=>r.sites);assert.equal(sites.length,30);
 assert.equal(sites.filter(s=>s.coordinate_type==='imagery_water_access').length,4);
 assert.ok(data.courses.every(c=>c.geometry===null&&c.geometry_type==='endpoints_only'));
 assert.ok(sites.every(s=>s.lat<0&&s.lat>-48&&s.lng>166&&s.lng<179));
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,folder,'places.geojson'))).features.length,30);
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;const p=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.json')||p.endsWith('.geojson')?'application/json':p.endsWith('.css')?'text/css':'text/html');fs.createReadStream(p).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>copied.push(text)}});});
   const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/'+folder+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#results [data-record]').first().waitFor();assert.equal(await page.locator('#results [data-record]').count(),24);
   assert.equal(await page.locator('.launch-marker').count(),30);
   await page.locator('#results [data-record="13"]').click();await page.locator('#detail h2').waitFor();
   assert.ok((await page.locator('#detail h2').innerText()).includes('Moke Lake'));
   assert.equal(await page.locator('.launch-marker').count(),30,'Selecting one waterbody must keep all markers');
   await page.locator('[data-copy="1"]').click();assert.match((await page.evaluate(()=>copied)).at(-1),/^-[0-9.]+, [0-9.]+$/);
   assert.ok((await page.locator('#detail').innerText()).includes('물가'));
   await page.waitForTimeout(600);
   await page.locator('#detail').evaluate(el=>el.closest('.sidebar').scrollTop=0);
   fs.mkdirSync(path.join(root,'output/nz-map-test'),{recursive:true});
   await page.screenshot({path:path.join(root,'output/nz-map-test',mobile?'mobile.png':'desktop.png')});
   await page.locator('#back').click();await page.locator('#region').selectOption('North Island');assert.equal(await page.locator('#results [data-record]').count(),9);
   await page.locator('#region').selectOption('');await page.locator('#quality').selectOption('courses');assert.equal(await page.locator('#results [data-record]').count(),1);
   await page.locator('#results [data-record="1"]').click();await page.locator('[data-course="NZ02"]').click();assert.ok(page.url().endsWith('#course=NZ02'));
   assert.equal(await page.locator('.course-endpoint-label').count(),2);
   await page.goto(base+'/'+folder+'/#site=13',{waitUntil:'domcontentloaded'});await page.locator('#detail h2').waitFor();assert.ok((await page.locator('#detail h2').innerText()).includes('Moke'));assert.equal(await page.locator('.launch-marker').count(),30,'Shared link clears a previous course filter');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   // Exercise shipped right-click/long-press handlers, with deterministic geocoding.
   await page.route('**/World/GeocodeServer/reverseGeocode?**',route=>route.fulfill({json:{address:{LongLabel:'Moke Lake Road, Closeburn, Otago, NZL'}}}));
   const rect=await page.locator('#map').boundingBox();
   if(!mobile)await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2,{button:'right'});
   else{
    await page.locator('#map').dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2});
    await page.getByLabel('위도, 경도').waitFor();
    await page.locator('#map').dispatchEvent('pointerup',{pointerType:'touch',isPrimary:true,pointerId:1});
   }
   await page.getByText('주소(영어·마오리어 원문): Moke Lake Road, Closeburn, Otago, NZL',{exact:true}).waitFor();
   await page.getByRole('button',{name:'주소·좌표 복사',exact:true}).click();assert.ok((await page.evaluate(()=>copied)).at(-1).includes('Moke Lake Road'));
   await page.waitForTimeout(400);
   const box=await page.locator('.nz-coordinate-card').boundingBox();
   if(!(box.x>=0&&box.x+box.width<=(mobile?390:1440))){console.log('popup bounds',box);await page.screenshot({path:path.join(root,'output/nz-map-test/popup-overflow.png')});}
   assert.ok(box.x>=0&&box.x+box.width<=(mobile?390:1440));
   assert.deepEqual(errors,[]);
   console.log(mobile?'Mobile':'Desktop','24 waters/30 pins, filtering, persistent markers, deep links, copy, course endpoints and coordinate lookup passed');
   await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
