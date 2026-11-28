'use strict';
(() => {
  window.installNewZealandCoordinatePicker = function(map) {
    const container = map.getContainer(), cache = new Map();
    let sequence = 0, aborter, popup, hold, touch = null, suppressClickUntil = 0;
    function stopHold() { clearTimeout(hold); hold = null; touch = null; }
    function show(latlng) {
      const lat = Number(latlng.lat), lng = ((Number(latlng.lng)+180)%360+360)%360-180;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (popup && map.hasLayer(popup)) map.closePopup(popup);
      const id = ++sequence, coords = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (aborter) aborter.abort();
      aborter = new AbortController();
      const card = document.createElement('section');
      card.className = 'nz-coordinate-card';
      card.style.cssText = 'width:280px;max-width:calc(100vw - 85px);font:14px/1.5 system-ui,sans-serif;word-break:keep-all;overflow-wrap:anywhere';
      const title = document.createElement('strong'); title.textContent = '선택한 위치'; card.append(title);
      const coordinate = document.createElement('input'); coordinate.readOnly = true; coordinate.value = coords;
      coordinate.setAttribute('aria-label', '위도, 경도');
      coordinate.style.cssText = 'display:block;box-sizing:border-box;width:100%;padding:9px;margin:10px 0;border:1px solid #ccd8d4;border-radius:7px;font:inherit;color:#163e36;background:#f5f8f7';
      coordinate.addEventListener('click', () => coordinate.select()); card.append(coordinate);
      const address = document.createElement('p'); address.textContent = '주소를 확인하고 있습니다…'; card.append(address);
      const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; card.append(actions);
      const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
      let addressText = '';
      async function copy(text) {
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard');
          await navigator.clipboard.writeText(text); feedback.textContent = '복사했습니다.';
        } catch { window.prompt('아래 내용을 복사하세요', text); }
      }
      function button(label, run) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
        b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 12px;border:1px solid #b9cfca;border-radius:8px;background:#fff;color:#155d50;font:600 14px system-ui;cursor:pointer';
        b.addEventListener('click', run); actions.append(b); return b;
      }
      button('좌표 복사', () => copy(coords));
      const all = button('주소·좌표 복사', () => copy(`${addressText}\n${coords}`)); all.disabled = true;
      card.append(feedback);
      const source = document.createElement('small'); source.style.cssText = 'display:block;margin-top:8px;color:#64766e';
      source.append('주소는 인근 행정주소이며 지번과 다를 수 있습니다. ');
      const link = document.createElement('a'); link.href = 'https://www.esri.com/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '주소 © Esri'; source.append(link); card.append(source);
      L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
      popup = L.popup({maxWidth:320, minWidth:180, autoPanPadding:[20,20]}).setLatLng([lat,lng]).setContent(card).openOn(map);
      const currentPopup = popup, signal = aborter.signal;
      let timeout = setTimeout(() => { if (id === sequence) aborter.abort(); }, 10000);
      function present(value) {
        if (id !== sequence || !map.hasLayer(currentPopup)) return;
        addressText = value; address.textContent = '주소(영어·마오리어 원문): ' + value; all.disabled = false; currentPopup.update();
      }
      const key = coords;
      if (cache.has(key)) { clearTimeout(timeout); present(cache.get(key)); return; }
      const url = new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode');
      url.searchParams.set('location',`${lng},${lat}`); url.searchParams.set('f','json');
      url.searchParams.set('langCode','en');url.searchParams.set('forStorage','false');
      fetch(url,{signal}).then(r=>{if(!r.ok)throw Error('address');return r.json();})
        .then(data=>{
          const value=data.address && (data.address.LongLabel || data.address.Match_addr);
          if(!value)throw Error('no-address');
          cache.set(key,value);present(value);
        }).catch(()=>{
          if(id!==sequence || !map.hasLayer(currentPopup))return;
          address.textContent='주소를 확인하지 못했습니다. 좌표는 복사할 수 있습니다.';currentPopup.update();
        }).finally(()=>clearTimeout(timeout));
    }
    map.on('contextmenu', e => {
      stopHold();
      if (e.originalEvent) {
        if (e.originalEvent._nzCoordinateShown) return;
        e.originalEvent._nzCoordinateShown = true; L.DomEvent.preventDefault(e.originalEvent);
      }
      show(e.latlng);
    });
    container.addEventListener('contextmenu', e => {
      if (e._nzCoordinateShown || e.target.closest('.leaflet-popup, .leaflet-control')) return;
      e._nzCoordinateShown = true; e.preventDefault(); stopHold(); show(map.mouseEventToLatLng(e));
    });
    map.on('popupclose', e => {
      if (e.popup === popup) { ++sequence; if (aborter) aborter.abort(); }
    });
    // Movement or a second finger cancels long-press; ordinary panning and pinch zoom remain available.
    container.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || e.target.closest('.leaflet-popup, .leaflet-control')) return;
      if (!e.isPrimary || touch) { stopHold(); return; }
      touch = {id:e.pointerId,x:e.clientX,y:e.clientY};
      const point = map.mouseEventToLatLng(e);
      hold = setTimeout(() => { stopHold(); suppressClickUntil = Date.now()+900; show(point); },650);
    },{passive:true});
    container.addEventListener('pointermove', e => {
      if (touch && touch.id === e.pointerId && Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>10) stopHold();
    },{passive:true});
    for (const event of ['pointerup','pointercancel','pointerleave']) container.addEventListener(event,stopHold,{passive:true});
    container.addEventListener('click', e => {
      if (Date.now() < suppressClickUntil && !e.target.closest('.leaflet-popup')) { e.preventDefault(); e.stopImmediatePropagation(); }
    },true);
  };
})();
