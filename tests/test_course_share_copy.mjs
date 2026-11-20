import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const files=['index.html','map.html','tour/legacy.html','tools/build_map.py'];
const code=file=>{const s=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');return s.slice(s.indexOf('function _copyCourseLink('),s.indexOf('let _courseFocusCtl='));};
for(const f of files)assert.equal(code(f),code(files[0]),f);
const url='https://mycanoe-map.kohoon0140.workers.dev/c/k1792928342277?v=map2';
function setup({clipboard='ok',legacy=false}={}){
 const calls=[],alerts=[],prompts=[],boxes=[];let focusRestored=false;
 const doc={activeElement:{focus(){focusRestored=true;}},createElement(){const box={style:{},setAttribute(){},focus(){},select(){},setSelectionRange(a,b){assert.equal(a,0);assert.equal(b,url.length);},remove(){box.removed=true;}};boxes.push(box);return box;},body:{appendChild(box){calls.push('append');assert.equal(box.value,url);}},execCommand(command){calls.push('exec');assert.equal(command,'copy');if(legacy==='throw')throw Error('blocked');return legacy;}};
 const navigator={share(){throw Error('Sharing must actually copy, not open native share sheet');}};
 if(clipboard!=='absent')navigator.clipboard={writeText(text){calls.push('clipboard');assert.equal(text,url);if(clipboard==='throw')throw Error('blocked');return clipboard==='reject'?Promise.reject(Error('NotAllowedError')):Promise.resolve();}};
 const context=vm.createContext({navigator,document:doc,prompt:(label,value)=>prompts.push(value),alert:value=>alerts.push(value),courseShareUrl:id=>{assert.equal(id,'k1792928342277');return url;},_courseShareInfo:()=>({name:'소양호 종주',course:{}}),gaEvent:()=>calls.push('analytics'),_prepareCoursePreview:()=>calls.push('preview')});
 vm.runInContext(code(files[0]),context);
 return {calls,alerts,prompts,boxes,restored:()=>focusRestored,share:()=>vm.runInContext("shareCourse('k1792928342277')",context)};
}
{
 const c=setup();assert.equal(await c.share(),true);assert.equal(c.calls[0],'clipboard');assert.ok(c.calls.indexOf('clipboard')<c.calls.indexOf('preview'));assert.equal(c.alerts.length,1);assert.ok(c.alerts[0].includes(url));assert.equal(c.prompts.length,0);assert.equal(c.boxes.length,0);
}
for(const clipboard of ['absent','reject','throw']){
 const c=setup({clipboard,legacy:true});assert.equal(await c.share(),true);assert.equal(c.alerts.length,1);assert.equal(c.prompts.length,0);assert.ok(c.restored());assert.ok(c.boxes.every(x=>x.removed));
}
for(const legacy of [false,'throw']){
 const c=setup({clipboard:'reject',legacy});assert.equal(await c.share(),false);assert.deepEqual(c.prompts,[url]);assert.equal(c.alerts.length,0);assert.ok(c.restored());assert.ok(c.boxes.every(x=>x.removed));
}
console.log('Course URL copy: clipboard before preview, native share ignored, rejection/unsupported fallbacks, manual copy, and honest success notices: ok');
