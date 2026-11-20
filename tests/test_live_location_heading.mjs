import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files=['index.html','map.html','tools/build_map.py','tour/legacy.html'];
const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=s=>s.slice(s.indexOf('let _locHeading='),s.indexOf('function _locPointSegmentM'));
for(const file of files)assert.equal(extract(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8')),extract(source),file+' uses the same heading logic');
const distance=(a,b)=>Math.hypot((a.lat-b.lat)*111320,(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180));
function setup(){
 const style={};const marker={getElement:()=>({querySelector:()=>({style})})};
 const context=vm.createContext({map:{distance},L:{divIcon:x=>x},MODEL_Y_SVG:'car',WOODEN_CANOE_SVG:'canoe',PERSON_SVG:'person',_locMarker:marker});
 vm.runInContext(extract(source),context);
 return {style,run:code=>vm.runInContext(code,context),push:(fix)=>{context.fix=fix;vm.runInContext('_updateLocationHeading(fix);_applyLocationHeading()',context);},state:()=>vm.runInContext('({heading:_locHeading,rotation:_locRotation})',context)};
}
function fix(lat,lng,time,extra={}){return {latlng:{lat,lng},timestamp:time,accuracy:5,...extra};}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.05,`${actual} should be ${expected}`);
// GPS heading zero is a valid northbound course. All transport modes retain it.
{
 const c=setup();c.push(fix(37,127,1000,{heading:0,speed:2}));near(c.state().heading,0);
 for(const mode of ['car','canoe','person'])assert.match(c.run(`_locIcon('${mode}').html`),/rotate\(0.0deg\)/);
 for(const heading of [90,180,270]){c.push(fix(37,127,2000+heading,{heading,speed:2}));near(c.state().heading,heading);assert.equal(c.style.transform,`rotate(${heading.toFixed(1)}deg)`);}
}
// A heading-less browser derives true direction from fixes, in all four quadrants.
for(const [lat,lng,expected] of [[37.001,127,0],[37,127.001,90],[36.999,127,180],[37,126.999,270]]){
 const c=setup();c.push(fix(37,127,1000,{heading:null,speed:null}));c.push(fix(lat,lng,10000,{heading:null,speed:null}));near(c.state().heading,expected);
}
// Slow movement accumulates until it exceeds the accuracy-aware threshold.
{
 const c=setup();c.push(fix(37,127,1000));c.push(fix(37.00001,127,3000));assert.equal(c.state().heading,null);
 c.push(fix(37.00006,127,9000));near(c.state().heading,0);
}
// Null must not coerce to north; stationary jitter and bad fixes retain orientation.
{
 const c=setup();c.push(fix(37,127,1000,{heading:90,speed:2}));
 c.push(fix(37,127.00001,2000,{heading:null,speed:null}));near(c.state().heading,90);
 c.push(fix(37.0002,127,3000,{heading:180,speed:0}));near(c.state().heading,90);
 c.push(fix(37.01,127.01,4000,{heading:270,speed:3,accuracy:150}));near(c.state().heading,90);
 c.push(fix(37,127,5000,{heading:NaN,speed:NaN}));assert.ok(Number.isFinite(c.state().rotation));
}
// Reacquisition after a long gap starts a new baseline rather than inventing a course.
{
 const c=setup();c.push(fix(37,127,1000,{heading:90,speed:2}));
 c.push(fix(38,128,61000,{heading:null,speed:null}));near(c.state().heading,90);
 c.push(fix(38.001,128,70000,{heading:null,speed:null}));near(c.state().heading,0);
}
// Native headings cross north by the shortest turn; switching icons keeps rotation.
{
 const c=setup();c.push(fix(37,127,1000,{heading:359,speed:2}));c.push(fix(37,127,2000,{heading:1,speed:2}));near(c.state().rotation,361);
 for(const mode of ['car','canoe','person'])assert.match(c.run(`_locIcon('${mode}').html`),/rotate\(361.0deg\)/);
 c.push(fix(37,127,1500,{heading:180,speed:2}));near(c.state().rotation,361);
 c.run('_locMarker=null;_applyLocationHeading()'); // No marker yet / tracking stopped.
}
// The rendered callback updates the same marker and applies rotation after creation.
for(const file of files){
 const s=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert.ok(s.includes('_updateLocationHeading(e);_setLocationMode('));
 assert.ok(s.includes('  _applyLocationHeading();\n  _ensureLocSurfaceData'));
 assert.ok(s.includes('_locHeading=null;_locRotation=0;_locHeadingFix=null;map.stopLocate()'));
 assert.ok(!s.includes('animation:locbob'));
 assert.ok(s.includes('aria-label="위에서 본 보행자, 위쪽이 진행방향"'));
}
console.log('Live heading: GPS course, four directions, slow travel, stationary jitter, bad fixes, gaps, north crossing, and icon changes: ok');
