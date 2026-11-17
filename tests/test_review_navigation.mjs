import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const listeners = new Map();
const writes = [];
let cacheOpens = 0;
const cache = {put:async (...args)=>writes.push(args),match:async()=>null};
const scope = {
  URL, Response, console,
  self:{location:{origin:'https://canoe.crowdbase.kr'},addEventListener:(name,callback)=>listeners.set(name,callback)},
  caches:{open:async()=>{cacheOpens++;return cache;}},
  fetch:async request=>new Response(new URL(request.url).pathname.startsWith('/review/')?'review page':'map shell')
};
vm.runInNewContext(fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8'),scope);
async function navigate(path){
  let response;
  listeners.get('fetch')({request:{method:'GET',mode:'navigate',url:'https://canoe.crowdbase.kr'+path},respondWith:value=>{response=value;}});
  return (await response).text();
}
assert.equal(await navigate('/review/omi-20261117/'),'review page');
assert.equal(cacheOpens,0);
assert.equal(writes.length,0);
assert.equal(await navigate('/'),'map shell');
assert.equal(writes.length,1);
assert.equal(writes[0][0],'./index.html');
console.log('Review navigation preserves the cached map shell: ok');
