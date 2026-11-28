'use strict';
(() => {
  const dataUrl = new URL('japan-place-labels.json',document.currentScript.src);
  let dataPromise;
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent='.japan-place-label{pointer-events:none!important;background:none!important;border:0!important}.japan-place-label span{display:block;width:max-content;white-space:nowrap;font:600 12px/1.35 system-ui,sans-serif;color:#163f46;text-shadow:0 0 3px white,0 0 5px white,1px 1px 2px white,-1px -1px 2px white;transform:translate(-50%,-50%)}.japan-place-label.city span{color:#283c33;font-weight:750}.japan-place-label.mountain span{color:#6b402b}';
  document.head.append(style);
  window.installJapanPlaceLabels=function(map){
    const layer=L.layerGroup().addTo(map);let items=[],frame;
    if(!map.getPane('japanPlaceLabels'))map.createPane('japanPlaceLabels');
    map.getPane('japanPlaceLabels').style.zIndex='430';map.getPane('japanPlaceLabels').style.pointerEvents='none';
    function draw(){
      layer.clearLayers();const zoom=map.getZoom(),bounds=map.getBounds(),placed=[];
      if(zoom<5)return;
      const candidates=items.filter(p=>zoom>=p.minZoom&&bounds.contains([p.lat,p.lng]));
      candidates.sort((a,b)=>(zoom>=8?(a.kind==='water'?0:1)-(b.kind==='water'?0:1):0)||a.minZoom-b.minZoom);
      for(const p of candidates){
        const pos=map.latLngToContainerPoint([p.lat,p.lng]),label=`${p.ko}(${p.ja})`,width=Math.min(340,label.length*11+10);
        const rect={x:pos.x-width/2,y:pos.y-11,w:width,h:22};
        if(placed.some(q=>rect.x<q.x+q.w+8&&rect.x+rect.w+8>q.x&&rect.y<q.y+q.h+6&&rect.y+rect.h+6>q.y))continue;
        placed.push(rect);
        L.marker([p.lat,p.lng],{pane:'japanPlaceLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'japan-place-label '+p.kind,html:'<span>'+escape(label)+'</span>',iconSize:[1,1],iconAnchor:[0,0]})}).addTo(layer);
      }
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}
    map.on('moveend zoomend resize',schedule);
    if(!dataPromise)dataPromise=fetch(dataUrl).then(r=>{if(!r.ok)throw Error('labels');return r.json();});
    dataPromise.then(data=>{items=data.items;draw();}).catch(()=>{});
    map.attributionControl.addAttribution('<a href="https://www.geonames.org/" target="_blank" rel="noopener">주요 도시 © GeoNames</a>');
    return layer;
  };
})();
