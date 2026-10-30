import assert from 'node:assert/strict';
import worker from '../workers/auth-worker.js';

const store=new Map();
const env={ADMIN_KEY:'test-key',SITE_URL:'https://canoe.crowdbase.kr/',PLACES:{get:async key=>store.get(key)||null,put:async(key,value)=>store.set(key,value)}};
globalThis.caches={default:{delete:async()=>true}};
const ctx={waitUntil(){}};
const url='https://mycanoe-map.kohoon0140.workers.dev/course';
const send=body=>worker.fetch(new Request(url,{method:'POST',headers:{Origin:'https://canoe.crowdbase.kr','Content-Type':'application/json'},body:JSON.stringify(body)}),env,ctx);
const change={action:'editstatic',cid:'12',name:'테스트 코스',km:2.5,coords:[[37,127],[37.01,127.01],[37.02,127.02]],segments:[{name:'출발~용산리',waypointName:'용산리',km:1.25,mode:'water',end:[37.01,127.01]},{name:'용산리~도착',km:1.25,mode:'water',end:[37.02,127.02]}]};
assert.equal((await send(change)).status,403);
assert.equal((await send({...change,adminKey:'test-key',coords:[[999,127],[37,127]]})).status,400);
assert.equal((await send({...change,adminKey:'test-key'})).status,200);
const over=JSON.parse(store.get('course_over'));
assert.deepEqual(over['12'].coords,change.coords);
assert.deepEqual(over['12'].segments.map(x=>x.end),change.segments.map(x=>x.end));
assert.equal(over['12'].segments[0].waypointName,'용산리');
assert.equal(over['12'].km,2.5);
console.log('course waypoint worker regression: ok');
