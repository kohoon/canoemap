import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import worker from '../workers/auth-worker.js';
import {decodeMapPng} from '../workers/map-preview-background.mjs';
const store=new Map([
 ['courses',JSON.stringify([{id:1794305259245,name:'낙동강 코스',km:25.74,coords:[[36.8,128.8],[36.81,128.82]]}])],
 ['launch_sites_v1',JSON.stringify([{id:'launch1',name:'강변 <런칭>',lat:36.8,lng:128.8,cat:'런칭/랜딩'},{id:'secret',name:'후보',lat:36.81,lng:128.81,cat:'candidate'}])]
]);
const env={SITE_URL:'https://canoe.crowdbase.kr/',PLACES:{get:async key=>store.get(key)||null}};
const get=path=>worker.fetch(new Request('https://worker.example'+path),env,{});
const realFetch=globalThis.fetch;
let backgroundCalls=0;
globalThis.fetch=async input=>{
 const url=String(input);
 if(url.includes('arcgisonline.com')) {backgroundCalls++;return new Response('outage',{status:503});}
 return Response.json({features:[]});
};
try{
 const head=await worker.fetch(new Request('https://worker.example/c/k1794305259245',{method:'HEAD'}),env,{});assert.equal(head.status,200);assert.equal(head.headers.get('Content-Type'),'text/html; charset=utf-8');
 const page=await get('/c/k1794305259245'); assert.equal(page.status,200);
 const html=await page.text(); assert(html.includes('/course-map/k1794305259245.png'));assert(!html.includes('http-equiv="refresh"'));
 const imageUrl=html.match(/property="og:image" content="([^"]+)"/)[1].replaceAll('&amp;','&');
 const image=await get(new URL(imageUrl).pathname);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');
 const bytes=new Uint8Array(await image.arrayBuffer());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(bytes.buffer).getUint32(16),1200);
 assert.equal(backgroundCalls,1,'Server requests map background without browser uploads');
 const place=await get('/p/launch1');assert.equal(place.status,200);const ph=await place.text();assert(ph.includes('강변 &lt;런칭&gt;'));assert(ph.includes('/place-map/launch1.png'));assert(ph.includes('place=launch1'));
 assert.equal((await get('/place-map/launch1.png')).status,200);
 assert.equal((await get('/p/secret')).status,404);assert.equal((await get('/place-map/secret.png')).status,404);
 const oldImage=ph.match(/property="og:image" content="([^"]+)"/)[1];
 store.set('placeover',JSON.stringify({launch1:{lat:36.9}}));assert(!(await (await get('/p/launch1')).text()).includes(oldImage));
 store.set('placeover',JSON.stringify({launch1:{del:true}}));assert.equal((await get('/place-map/launch1.png')).status,404);
 store.set('courses','[]');assert.equal((await get('/course-map/k1794305259245.png')).status,404);
 // All five PNG row filters must reconstruct identical RGB pixels.
 const rows=Buffer.from([0,10,20,30,1,10,10,10,2,0,0,0,3,5,5,5,4,0,0,0]);
 const header=Buffer.alloc(33);header[0]=137;header[1]=80;header.writeUInt32BE(13,8);header.write('IHDR',12);header.writeUInt32BE(1,16);header.writeUInt32BE(5,20);header[24]=8;header[25]=2;
 const idat=deflateSync(rows), chunk=Buffer.alloc(idat.length+12);chunk.writeUInt32BE(idat.length);chunk.write('IDAT',4);idat.copy(chunk,8);
 const decoded=await decodeMapPng(Buffer.concat([header,chunk]),1,5);assert.deepEqual([...decoded.pixels],[10,20,30,10,10,10,10,10,10,10,10,10,10,10,10]);
 // Optional local full-resolution map sample exercises actual provider PNG filters and alignment.
 if(process.env.MAP_PREVIEW_FIXTURE){
  globalThis.fetch=async input=>String(input).includes('arcgisonline.com')?new Response(readFileSync(process.env.MAP_PREVIEW_FIXTURE)):Response.json({features:[]});
  store.set('placeover','{}');const rendered=new Uint8Array(await (await get('/place-map/launch1.png')).arrayBuffer());writeFileSync('/tmp/launch-map-preview.png',rendered);
  const bg=await decodeMapPng(readFileSync(process.env.MAP_PREVIEW_FIXTURE),1120,562),result=await decodeMapPng(rendered,1200,630);
  assert.deepEqual([...result.pixels.slice((24*1200+40)*3,(24*1200+40)*3+3)],[...bg.pixels.slice(0,3)],'Satellite pixels must be composited, not silently replaced by a plain background');
 }
}finally{globalThis.fetch=realFetch;}
console.log('Public place/course cards, upload-free PNGs, privacy, geometry invalidation, provider outage and PNG filters: ok');
