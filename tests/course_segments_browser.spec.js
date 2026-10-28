const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'..');
let server,base;

test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>server&&await new Promise(resolve=>server.close(resolve)));

for(const mobile of [false,true])test('저장된 코스 구간 거리 '+(mobile?'모바일':'PC'),async({browser})=>{
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  await page.route('**/comments?*',route=>route.fulfill({json:{admin:'',list:[]}}));
  await page.goto(base+'/index.html');
  await page.evaluate(()=>{
    hideGate();
    openCourseComments('course_k42',{id:42,owner:'admin',name:'테스트 코스',km:6.6,
      coords:[[37.9,127.8],[38.1,128.1]],
      segments:[{name:'출발~경유1',km:1.2,mode:'water'},{name:'경유1~경유2',km:2.35,mode:'water'},{name:'경유2~도착',km:3.05,mode:'straight'}]},'k42');
  });
  const section=page.locator('.course-segments');
  await expect(section).toBeVisible();
  await expect(section.locator('tbody tr')).toHaveCount(3);
  await expect(section.locator('tbody tr')).toHaveText([
    '출발~경유11.20 km1.20 km',
    '경유1~경유22.35 km3.55 km',
    '경유2~도착3.05 km6.60 km'
  ]);
  expect(await section.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.evaluate(()=>openCourseComments('course_k43',{id:43,owner:'admin',name:'구간 데이터 없는 코스',km:6.6},'k43'));
  await expect(page.locator('.course-segments')).toHaveCount(0);
  await page.close();
});
