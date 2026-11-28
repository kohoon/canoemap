'use strict';
(() => {
  const dataUrl = new URL('new-zealand-place-labels.json?v=20261128-2',document.currentScript.src);
  const gazetteerUrl = new URL('new-zealand-gazetteer.json?v=20261128-2',document.currentScript.src);
  let dataPromise;
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent='.nz-place-label{pointer-events:none!important;background:none!important;border:0!important}.nz-place-label span{display:block;width:max-content;white-space:nowrap;font:600 12px/1.35 system-ui,sans-serif;color:#163f46;text-shadow:0 0 3px white,0 0 5px white,1px 1px 2px white,-1px -1px 2px white;transform:translate(-50%,-50%)}.nz-place-label.city span{color:#283c33;font-weight:750}.nz-place-label.mountain span{color:#6b402b}';
  document.head.append(style);
  window.installNewZealandPlaceLabels=function(map){
    const layer=L.layerGroup().addTo(map);let items=[],frame;
    if(!map.getPane('nzPlaceLabels'))map.createPane('nzPlaceLabels');
    map.getPane('nzPlaceLabels').style.zIndex='430';map.getPane('nzPlaceLabels').style.pointerEvents='none';
    function draw(){
      layer.clearLayers();const zoom=map.getZoom(),bounds=map.getBounds(),placed=[];
      if(zoom<5)return;
      const limit=map.getSize().x<760?80:160;
      const candidates=items.filter(p=>zoom>=p.minZoom&&bounds.contains([p.lat,p.lng]));
      candidates.sort((a,b)=>(a.imported?1:0)-(b.imported?1:0)||(zoom>=8?(a.kind==='water'?0:1)-(b.kind==='water'?0:1):0)||a.minZoom-b.minZoom);
      for(const p of candidates){
        if(placed.length>=limit)break;
        const pos=map.latLngToContainerPoint([p.lat,p.lng]),label=p.ko?`${p.ko}(${p.original})`:p.original,width=Math.min(340,label.length*11+10);
        const rect={x:pos.x-width/2,y:pos.y-11,w:width,h:22};
        if(placed.some(q=>rect.x<q.x+q.w+8&&rect.x+rect.w+8>q.x&&rect.y<q.y+q.h+6&&rect.y+rect.h+6>q.y))continue;
        placed.push(rect);
        L.marker([p.lat,p.lng],{pane:'nzPlaceLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'nz-place-label '+p.kind+(p.imported?' imported':''),html:'<span>'+escape(label)+'</span>',iconSize:[1,1],iconAnchor:[0,0]})}).addTo(layer);
      }
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}
    map.on('moveend zoomend resize',schedule);
    if(!dataPromise)dataPromise=Promise.allSettled([dataUrl,gazetteerUrl].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('labels');return r.json();})));
    dataPromise.then(results=>{
      const curated=results[0].status==='fulfilled'?results[0].value.items:[];
      const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
      const imported=results[1].status==='fulfilled'?results[1].value.items:[];
      const names=new Map();for(const q of curated){const key=norm(q.original);names.set(key,[...(names.get(key)||[]),q]);}
      items=curated.concat(imported.filter(p=>!(names.get(norm(p.original))||[]).some(q=>Math.abs(q.lat-p.lat)<0.15&&Math.abs(q.lng-p.lng)<0.15)).map(p=>({...p,imported:true})));
      draw();
      if(results.some(r=>r.status==='rejected')){
        const el=document.getElementById('map-status');if(el){el.textContent='일부 지명 자료를 불러오지 못했습니다. 새로고침해 주세요.';el.hidden=false;}
      }
    });
    map.attributionControl.addAttribution('<a href="https://www.geonames.org/" target="_blank" rel="noopener">주요 도시 © GeoNames</a> · <a href="https://gazetteer.linz.govt.nz/" target="_blank" rel="noopener">지명 © LINZ / NZGB · CC BY 4.0</a>');
    return layer;
  };
})();
