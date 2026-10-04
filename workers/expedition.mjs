// Verified official expedition display metadata. No geometry or distance changes.
export const EXPEDITIONS = Object.freeze({
  1:['남한강','탄금강천길'],2:['남한강','장회서창길'],3:['평창강','대상선암길'],
  4:['남한강','영월영춘길'],5:['금강','섬바위소이나루길'],6:['금강','연주장계길'],
  7:['금강','방우용화길'],8:['금강','천내구강길'],9:['금강','금정백지길'],
  10:['동강','문산삼옥길'],11:['북한강','구만오월길']
});
export function expeditionNumber(course, shareId){
  if(!course)return 0;
  const id=String(shareId||'');
  if(course.static||id&&id.charAt(0)!=='k')return /^[1-9]$/.test(id||String(course.id))?Number(id||course.id):0;
  if(String(course.owner||'')!=='admin')return 0;
  const match=String(course.name||'').match(/^엑스페디션\s*#\s*(\d+)(?!\d)/);
  const n=match?Number(match[1]):0;
  return EXPEDITIONS[n]?n:0;
}
export function normalizeExpedition(course, shareId){
  const n=expeditionNumber(course,shareId),meta=EXPEDITIONS[n];
  return meta?{...course,name:'엑스페디션 #'+n+' · '+meta[0]+' · '+meta[1]}:course;
}
