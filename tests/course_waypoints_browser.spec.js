const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');let server,base;
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>server&&await new Promise(resolve=>server.close(resolve)));

for(const mobile of [false,true])test('course detail waypoint add/remove '+(mobile?'mobile':'desktop'),async({browser})=>{
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  await page.route('**/comments?*',route=>route.fulfill({json:{admin:'',list:[]}}));
  await page.goto(base+'/index.html');
  const legacyLegs=await page.evaluate(()=>_wpLegs({km:6,coords:[[37,127],[37.03,127.03]],segments:[
    {km:2,end:[37.01,127.01]},{km:2,end:[37.02,127.02]},{km:2,end:[37.03,127.03]}]}));
  expect(legacyLegs).toHaveLength(3);
  expect(legacyLegs.map(x=>x.coords.at(-1))).toEqual([[37.01,127.01],[37.02,127.02],[37.03,127.03]]);
  await page.evaluate(()=>{
    hideGate();_adminOk=true;
    _courseByCid['9999']={id:'9999',static:true,name:'테스트 코스',km:5,coords:[[37,127],[37.02,127.02]],segments:[{name:'출발~도착',km:5,mode:'straight',end:[37.02,127.02]}]};
    openCourseComments('course_c9999',_courseByCid['9999'],'9999');
  });
  await page.getByRole('button',{name:'경유지 편집'}).click();
  await expect(page.locator('#courseModal')).toHaveClass(/open/);
  await expect(page.locator('.wp-list')).toContainText('도착지');
  await page.getByRole('button',{name:'이 구간에 경유지 추가'}).click();
  await expect(page.locator('#wpPickCancel')).toBeVisible();
  await page.evaluate(()=>map.fire('click',{latlng:L.latLng(37.01,127.01)}));
  await expect(page.locator('.wp-list')).toContainText('경유지 1');
  expect(await page.locator('#courseModal .pmodal').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'삭제'}).click();
  await expect(page.locator('.wp-list')).not.toContainText('경유지 1');
  await page.getByRole('button',{name:'이 구간에 경유지 추가'}).click();
  await page.evaluate(()=>map.fire('click',{latlng:L.latLng(37.01,127.01)}));
  await expect(page.locator('.wp-list')).toContainText('경유지 1');
  let saved;
  await page.route('**/course',route=>{
    if(route.request().method()==='POST'){saved=JSON.parse(route.request().postData());return route.fulfill({json:{ok:true}});}
    return route.continue();
  });
  await page.evaluate(()=>{_prepareCoursePreview=async()=>{};});
  await page.getByRole('button',{name:'변경 저장'}).click();
  await expect.poll(()=>saved).toBeTruthy();
  expect(saved.action).toBe('editstatic');
  expect(saved.segments).toHaveLength(2);
  expect(saved.coords).toHaveLength(3);
  await page.close();
});
