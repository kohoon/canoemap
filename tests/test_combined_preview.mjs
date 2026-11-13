import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import worker from '../workers/auth-worker.js';
import { parseCombinedRefs, combinedPreviewVersion } from '../workers/combined-preview.mjs';

assert.deepEqual(parseCombinedRefs('trail:walk,course:k123456789,trail:walk'), ['trail:walk','course:k123456789']);
assert.equal(parseCombinedRefs('trail:../../etc'), null);
const courses = [{id:'1794541434388',name:'왕피천',km:10.74,color:'#bb2233',coords:[[36.940095,129.356415],[36.95,129.37],[36.970759,129.411289]]}];
const data = new Map([['courses',JSON.stringify(courses)]]);
const env = { SITE_URL:'https://canoe.crowdbase.kr/', PLACES:{get:async key=>data.get(key)||null} };
const realFetch=globalThis.fetch;
globalThis.fetch=async request=>{
  const path=new URL(typeof request==='string'?request:request.url).pathname.slice(1);
  try{return Response.json(JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8')));}
  catch{return new Response('not found',{status:404});}
};
try{
  const routes='trail:uljin-wangpicheon-botdorang,course:k1794541434388';
  const url='https://worker.example/routes?routes='+encodeURIComponent(routes);
  const htmlResponse=await worker.fetch(new Request(url),env,{});
  assert.equal(htmlResponse.status,200);
  const html=await htmlResponse.text();
  assert(html.includes('13.84km'));assert(html.includes('왕피천 봇도랑길'));
  assert(html.includes('image/png'));assert(html.includes('width="1200"')||html.includes('content="1200"'));
  const imageUrl=html.match(/property="og:image" content="([^"]+)"/)[1].replaceAll('&amp;','&');
  const image=await worker.fetch(new Request(imageUrl),env,{});
  assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');
  const bytes=new Uint8Array(await image.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer);assert.equal(view.getUint32(16),1200);assert.equal(view.getUint32(20),630);
  const idat=[];for(let i=8;i<bytes.length;){const n=view.getUint32(i),type=new TextDecoder().decode(bytes.slice(i+4,i+8));if(type==='IDAT')idat.push(bytes.slice(i+8,i+8+n));i+=n+12;}
  const pixels=new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  let land=0,water=0;for(let i=0;i<pixels.length-2;i++) {if(pixels[i]===141&&pixels[i+1]===78&&pixels[i+2]===40)land++;if(pixels[i]===187&&pixels[i+1]===34&&pixels[i+2]===51)water++;}
  assert(land>100);assert(water>100);
  writeFileSync('/tmp/combined-preview-test.png',bytes);
  const oldVersion=new URL(imageUrl).searchParams.get('v');
  courses[0].coords[1]=[36.955,129.38];data.set('courses',JSON.stringify(courses));
  const updated=await (await worker.fetch(new Request(url),env,{})).text();assert(!updated.includes('v='+oldVersion));
  const partial=await worker.fetch(new Request('https://worker.example/routes?routes=trail:uljin-wangpicheon-botdorang,course:kmissing'),env,{});
  assert.equal(partial.status,200);assert((await partial.text()).includes('1/2개 구간 표시'));
  data.set('obstacles',JSON.stringify([{id:'trail:uljin-wangpicheon-botdorang',type:'육로',del:true}]));
  assert.equal((await worker.fetch(new Request('https://worker.example/routes?routes=trail:uljin-wangpicheon-botdorang'),env,{})).status,404);
  assert.equal((await worker.fetch(new Request('https://worker.example/routes?routes=garbage'),env,{})).status,400);
  assert.notEqual(await combinedPreviewVersion([{lines:[[[1,2],[3,4]]]}]),await combinedPreviewVersion([{lines:[[[1,2],[3,5]]]}]));
}finally{globalThis.fetch=realFetch;}
console.log('combined route card, PNG, current geometry and missing references: ok');
