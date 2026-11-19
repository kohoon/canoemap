import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../paddling/subtitles.js',import.meta.url),'utf8');
const timers=new Map();let next=0,instance;
const data={videoId:'english',language:'ko',cues:[{start:1,end:2,text:'패들을 물에 넣으세요.'},{start:3,end:5,text:'상체를 회전하세요.'},{start:5,end:7,text:'샤프트를 수직으로 유지하세요.'}]};
const root={SCHOOL_SUBTITLE_TRACKS:{english:{version:'test'}},setTimeout,clearTimeout,setInterval:fn=>{timers.set(++next,fn);return next;},clearInterval:id=>timers.delete(id),YT:{Player:class {
  constructor(iframe,options){this.options=options;this.time=0;this.state=1;this.destroyed=false;instance=this;}
  getCurrentTime(){return this.time;} getPlayerState(){return this.state;}
  destroy(){this.destroyed=true;}
}}};
let fetchCount=0;
const c=vm.createContext({window:root,AbortController,fetch:async()=>{fetchCount++;return {ok:true,json:async()=>data};}});
vm.runInContext(source,c);const api=root.schoolSubtitles;
const cues=api.normalizeCues(data);assert.equal(api.cueAt(cues,.9),'');assert.equal(api.cueAt(cues,1),data.cues[0].text);assert.equal(api.cueAt(cues,2),'');assert.equal(api.cueAt(cues,3),data.cues[1].text);assert.equal(api.cueAt(cues,7),'');
assert.throws(()=>api.normalizeCues({...data,cues:[{start:2,end:1,text:'bad'}]}));assert.throws(()=>api.normalizeCues({...data,language:'en'}));
const box={hidden:true},text={textContent:''};
const stop=api.attach({},'english',box,text);assert.equal(box.hidden,false);await new Promise(setImmediate);
instance.options.events.onReady({target:instance});
function tick(time,state=1){instance.time=time;instance.state=state;for(const fn of timers.values())fn();}
tick(1.3);assert.equal(text.textContent,data.cues[0].text);
tick(3.4,2);assert.equal(text.textContent,data.cues[1].text,'Pause retains current cue');
tick(5.2);instance.options.events.onPlaybackRateChange();assert.equal(text.textContent,data.cues[2].text,'Rate changes follow actual media time');
tick(1.6,2);assert.equal(text.textContent,data.cues[0].text,'Seeking backwards while paused resynchronizes');
tick(2.5);assert.equal(text.textContent,'\u00a0','Silence does not retain old captions');
tick(6,0);assert.equal(text.textContent,'\u00a0','Ended video clears captions');
stop();assert(instance.destroyed);assert.equal(timers.size,0);assert.equal(box.hidden,true);assert.equal(text.textContent,'');
api.attach({},'korean-native',box,text)();assert.equal(fetchCount,1,'Native captions do not fetch a replacement');
const lateStop=api.attach({},'english',box,text);lateStop();await new Promise(setImmediate);assert.equal(box.hidden,true,'Closed videos cannot attach a late caption player');
console.log('Subtitle synchronization: absolute time, seeks, pause, rate, silence, native captions and close races: ok');
