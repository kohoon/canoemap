import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../paddling/index.html',import.meta.url),'utf8');
const a=source.indexOf('const videos = {'),b=source.indexOf('const categoryMeta=',a);
const c=vm.createContext({window:{},location:{origin:'https://canoe.crowdbase.kr'},stopSchoolSubtitles:null,esc:s=>String(s),modalFrame:{innerHTML:''},modalTitle:{textContent:''},modal:{classList:{add(){},toggle(){}}},document:{body:{style:{}}},modalClose:{focus(){}}});
vm.runInContext(source.slice(a,b),c);
const r=source.indexOf('function videoHTML('),re=source.indexOf('function renderNav()',r);
vm.runInContext(source.slice(r,re),c);
const o=source.indexOf('function openVideo('),oe=source.indexOf('function closeVideo()',o);
vm.runInContext(source.slice(o,oe),c);
const starts={'전진 스트로크':59,'백 스트로크':211,'하프 스윕':253,'풀 스윕':253,'드로우':336,'프라이':419,'C 스트로크':511,'정지':589,'J 스트로크':634,'인디언 스트로크':691,'캐나디언 스트로크':729};
for(const [skill,start] of Object.entries(starts)){
 const html=vm.runInContext(`videoHTML('mycanoeStroke',${JSON.stringify(skill)})`,c);
 assert(html.includes(`data-start="${start}"`),skill);
 assert(html.includes(`&amp;t=${start}s`),skill+' external YouTube URL');
 c.openVideo('PQDLADzDI1s','강습',String(start));
 assert(c.modalFrame.innerHTML.includes(`autoplay=1&start=${start}&`),skill+' embedded playback');
}
const other=vm.runInContext("videoHTML('forward','전진 스트로크')",c);assert(other.includes('data-start="0"'));assert(!other.includes('&amp;t='));
for(const invalid of [undefined,'bad',-5,Infinity]){c.openVideo('test','test',invalid);assert(c.modalFrame.innerHTML.includes('start=0&'));}
assert(source.includes('s.videos.map(key=>videoHTML(key,s.name))'));
assert(source.includes('openVideo(btn.dataset.video,btn.dataset.title,btn.dataset.start)'));
console.log('11 MYCANOE skill offsets, iframe playback, external links and existing-video defaults: ok');
