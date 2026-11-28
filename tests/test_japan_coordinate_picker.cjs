const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let file=path.resolve(root,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)}});});
   const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>console.error('PAGE ERROR',e.message));let mode='ok';const requests=[];
   await page.route('**/reverse-geocoder/LonLatToAddress?**',async route=>{
    const u=new URL(route.request().url());requests.push(u.searchParams.get('lat'));
    if(mode==='fail')return route.fulfill({status:503,body:'unavailable'});
    if(mode==='delay')await new Promise(r=>setTimeout(r,350));
    try{await route.fulfill({json:{results:{muniCd:'19365',lv01Nm:'中ノ倉'}}});}catch{}
   });
   for(const folder of ['japan-launch-20261117','japan-open-canoe-20261119']){
    console.log('Loading',folder,mobile);
    await page.goto(`http://127.0.0.1:${server.address().port}/review/${folder}/`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.L&&document.querySelector('.leaflet-container'));
    if(!mobile){
      const rect=await page.locator('#map').boundingBox();
      await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2,{button:'right'});
      await page.getByLabel('위도, 경도').waitFor();
      assert.match(await page.getByLabel('위도, 경도').inputValue(), /^-?\d+\.\d{6}, -?\d+\.\d{6}$/);
      await page.locator('.leaflet-popup-close-button').click();
      await page.locator('.japan-coordinate-card').waitFor({state:'detached'});
    }
    // Isolated picker map enables exact coordinates while the shipped map integration is checked below.
    assert.ok((await page.request.get(`http://127.0.0.1:${server.address().port}/review/${folder}/app.js`)).ok());
    await page.evaluate(()=>{
     const el=document.createElement('div');el.id='picker-test';el.style='position:fixed;inset:0;z-index:5000;background:#eee';document.body.append(el);
     window.testMap=L.map(el,{zoomAnimation:false,fadeAnimation:false,tapHold:false}).setView([35.47,138.57],14);
     installJapanCoordinatePicker(testMap);installJapanPlaceLabels(testMap);
    });
    await page.waitForFunction(()=>document.querySelectorAll('.japan-place-label').length>0);
    const labels=await page.locator('.japan-place-label').allTextContents();
    assert.ok(labels.every(s=>/[가-힣]+.*\(.+\)/.test(s)));
    const select=(lat,lng)=>page.evaluate(([lat,lng])=>testMap.fire('contextmenu',{latlng:L.latLng(lat,lng)}),[lat,lng]);
    await select(35.472470775,138.575330965);
    await page.getByText('주소(일본어 원문): 山梨県身延町中ノ倉',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('위도, 경도').inputValue(),'35.472471, 138.575331');
    await page.getByRole('button',{name:'주소·좌표 복사',exact:true}).click();
    assert.equal((await page.evaluate(()=>copied)).at(-1),'山梨県身延町中ノ倉\n35.472471, 138.575331');
    const bounds=await page.locator('.japan-coordinate-card').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=(mobile?390:1400));
    mode='delay';await select(35.46,138.58);await select(35.48,138.59);
    await page.getByText('주소(일본어 원문): 山梨県身延町中ノ倉',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('위도, 경도').inputValue(),'35.480000, 138.590000');
    mode='fail';await select(35.49,138.60);
    await page.getByText('주소를 확인하지 못했습니다. 좌표는 복사할 수 있습니다.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'좌표 복사',exact:true}).click();assert.equal((await page.evaluate(()=>copied)).at(-1),'35.490000, 138.600000');
    mode='ok';await page.evaluate(()=>testMap.closePopup());
    if(mobile){
     await page.locator('#picker-test').dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:200,clientY:400});
     await page.getByLabel('위도, 경도').waitFor();
     await page.locator('#picker-test').dispatchEvent('pointerup',{pointerType:'touch',isPrimary:true,pointerId:1});
    }
    await page.evaluate(()=>testMap.closePopup());
    if(mobile){
      await page.locator('#picker-test').dispatchEvent('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:2,clientX:100,clientY:400});
      await page.locator('#picker-test').dispatchEvent('pointermove',{pointerType:'touch',pointerId:2,clientX:150,clientY:400});
      await page.waitForTimeout(700);assert.equal(await page.locator('.japan-coordinate-card').count(),0);
    }
    if(!mobile&&folder==='japan-open-canoe-20261119'){
      await page.unroute('**/reverse-geocoder/LonLatToAddress?**');
      await select(35.47248,138.57534);
      await page.getByText('주소(일본어 원문): 山梨県身延町中ノ倉',{exact:true}).waitFor();
      console.log('Live GSI browser address lookup passed');
    }
    console.log(folder,mobile?'mobile':'desktop','copy/address/failure/stale-result checks passed');
   }
   await context.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
