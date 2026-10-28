const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
let server,base;

test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>server&&await new Promise(resolve=>server.close(resolve)));

for(const mobile of [false,true])test('소양호 종주 스티커와 참가자 '+(mobile?'모바일':'PC'),async({browser})=>{
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  await page.route('**/comments?*',route=>route.fulfill({json:{admin:'',list:[]}}));
  await page.goto(base+'/index.html');
  await page.evaluate(()=>{
    hideGate();
    openCourseComments('course_k1792928342277',{id:1792928342277,owner:'admin',name:'번버리Pick 소양호 종주 - 춘천 소양강댐 선착장 ~ 인제 관대리',km:45.2,coords:[[37.9,127.8],[38.1,128.1]]},'k1792928342277');
  });
  const sticker=page.locator('.expedition-sticker img');
  await expect(sticker).toHaveAttribute('src','/assets/expedition/soyang_lake_traverse_2026.png');
  await expect.poll(()=>sticker.evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
  await expect(page.locator('.expedition-nickname')).toHaveText(['요트맨','토끼사냥꾼','번버리']);
  await expect(page.locator('.expedition-date time')).toHaveText(['2026. 10. 22.','10. 24.']);
  expect(await page.locator('.expedition-detail').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.evaluate(()=>openCourseComments('course_k124',{id:124,owner:'member',name:'소양호 종주',km:46},'k124'));
  await expect(page.locator('.expedition-detail')).toHaveCount(0);
  await page.evaluate(()=>openCourseComments('course_k125',{id:125,owner:'admin',name:'소양호 종주',km:46},'k125'));
  await expect(page.locator('.expedition-detail')).toHaveCount(0);
  await page.close();
});
