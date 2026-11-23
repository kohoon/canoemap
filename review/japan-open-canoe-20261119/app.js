'use strict';
(() => {
  const $ = id => document.getElementById(id);
  if (!window.L) {
    $('summary').textContent = '지도 연결을 확인해 주세요. 상단 CSV에서 조사 좌표를 볼 수 있습니다.';
    return;
  }
  const data = window.JAPAN_OPEN_CANOE_DATA;
  const providers = new Map(data.providers.map(item => [item.id, item]));
  const points = new Map(data.points.map(item => [item.id, item]));
  const records = new Map(data.records.map(item => [item.id, item]));
  const qualityNames = {
    official_site_imagery:'공식 발착 시설 · 호안 추정', reported_access:'현장 발착 자료 · 영상 대조',
    official_area:'공식 도착 권역 · 호안 미확정', imagery_inferred:'영상 호안 후보 · 업체 사용 미확정',
    meeting_only:'집결 시설 권역', field_only:'수역 참고 · 발착 미확정'
  };
  const roleNames = {launch:'런칭', landing:'랜딩', both:'런칭·랜딩', meeting:'집결', field:'수역 참고'};
  const statusNames = {published:'공식 프로그램 확인', suspended:'갈수로 접수 중단', needs_confirmation:'현재 오픈 카누 제공 확인 필요', endpoints_unresolved:'발착 좌표 미공개'};
  const colorNames = {launch:'#087f78', landing:'#c96d25', both:'#4265b0', meeting:'#7d8981', field:'#7d8981'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let selected = null;
  let visible = data.records;
  let markers = new Map();
  let geometries = new Map();
  let timer;
  const map = L.map('map', {zoomControl:false,maxZoom:20,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([38.4,139.8],5);
  L.control.zoom({position:'bottomright'}).addTo(map);
  // Leaflet's zero-width tooltip pane must not determine the content width.
  map.on('tooltipopen', ({tooltip}) => {
    const el=tooltip.getElement();
    if (!el || tooltip.options.permanent) return;
    el.classList.add('map-hover-tooltip');
    el.style.maxWidth=`${Math.max(1,Math.min(360,map.getSize().x-16))}px`;
    el.style.marginLeft='0px';
    tooltip.options.direction='top';tooltip.options.offset=L.point(0,-12);tooltip.update();
    const bounds=map.getContainer().getBoundingClientRect();
    let rect=el.getBoundingClientRect();
    if (rect.top < bounds.top+8) {
      tooltip.options.direction='bottom';tooltip.options.offset=L.point(0,12);tooltip.update();
      rect=el.getBoundingClientRect();
    }
    const shift=Math.max(bounds.left+8,Math.min(rect.left,bounds.right-8-rect.width))-rect.left;
    el.style.marginLeft=`${shift}px`;
    el.style.setProperty('--tooltip-arrow-shift',`${-shift}px`);
  });

  const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxNativeZoom:18,maxZoom:20,attribution:'Tiles © Esri · imagery providers'}).addTo(map);
  const photo = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {maxNativeZoom:18,maxZoom:20,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">일본 국토지리원(国土地理院) 항공사진</a>'});
  const standard = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {maxNativeZoom:18,maxZoom:20,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html">일본 국토지리원(国土地理院) 일반지도</a>'});
  L.control.layers({'Esri 위성':esri,'일본 국토지리원 항공사진':photo,'일본 국토지리원 일반지도':standard},null,{position:'topright',collapsed:true}).addTo(map);
  map.attributionControl.addAttribution('물줄기 참고선 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap 기여자 · ODbL</a>');
  const routeLayer = L.layerGroup().addTo(map);
  const pointLayer = L.layerGroup().addTo(map);
  const focusLayer = L.featureGroup().addTo(map);
  function notify(message) {
    clearTimeout(timer);
    $('map-status').textContent = message;
    $('map-status').hidden = false;
    timer = setTimeout(() => { $('map-status').hidden = true; }, 4000);
  }
  function icon(point, active) {
    const reference = ['meeting_only','field_only','official_area'].includes(point.quality);
    return L.divIcon({className:'',iconSize:[32,32],iconAnchor:[16,16],html:`<span class="point-icon${reference?' reference':''}${active?' selected':''}" style="background:${colorNames[point.role]}">${esc(point.id)}</span>`});
  }
  function referenceStatus(record) {
    return record.status === 'needs_confirmation' || record.status === 'endpoints_unresolved' || !record.points.some(id => ['official_site_imagery','reported_access'].includes(points.get(id).quality));
  }
  function pointPopup(point) {
    const courses = point.courses.filter(id => visible.some(record => record.id === id));
    return `<strong>${esc(point.id)} · ${esc(point.name)}</strong><p>${esc(roleNames[point.role])} · ${esc(qualityNames[point.quality])}</p><p>${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}<br>위치 오차 반경 약 ${point.uncertainty_m}m</p><p>${esc(point.note)}</p>${courses.map(id => `<button type="button" data-map-course="${id}">${id} 상세보기</button>`).join('')}`;
  }
  function style(record) {
    const active = record.id === selected;
    return {color:record.status==='suspended'?'#b55350':providers.get(record.provider).color,weight:active ? 6 : 3,opacity:active ? 0.95 : 0.55,dashArray:'8 6',fillOpacity:active ? 0.15 : 0.06};
  }
  function drawMap() {
    routeLayer.clearLayers();
    pointLayer.clearLayers();
    geometries = new Map();
    markers = new Map();
    for (const record of visible) {
      if (!record.geometry) continue;
      const layer = L.geoJSON(record.geometry,{style:()=>style(record)}).addTo(routeLayer);
      layer.bindTooltip(`${record.id} · ${esc(record.name)}<br>재구성 참고 경로·수역`);
      layer.on('click',() => select(record.id));
      geometries.set(record.id,layer);
    }
    const visiblePoints = new Set(visible.flatMap(record => record.points));
    const selectedPoints = new Set(records.get(selected)?.points || []);
    for (const id of visiblePoints) {
      const point = points.get(id);
      const marker = L.marker([point.lat,point.lng],{icon:icon(point,selectedPoints.has(id)),title:`${id} ${point.name}`,zIndexOffset:selectedPoints.has(id)?500:0}).addTo(pointLayer);
      marker.bindTooltip(`${esc(id)} · ${esc(point.name)}<br>${esc(qualityNames[point.quality])}`);
      marker.bindPopup(pointPopup(point),{maxWidth:330,maxHeight:220});
      markers.set(id,marker);
    }
  }
  function fitRecords(list) {
    const bounds = L.latLngBounds([]);
    for (const record of list) {
      for (const id of record.points) {
        const point = points.get(id);
        bounds.extend([point.lat,point.lng]);
      }
      const layer = geometries.get(record.id);
      if (layer) bounds.extend(layer.getBounds());
    }
    if (bounds.isValid()) {
      map.stop();
      map.fitBounds(bounds,{padding:[35,35],maxZoom:list.length===1?14:8,animate:false});
    }
  }
  function listHtml(record) {
    const provider = providers.get(record.provider);
    return `<button type="button" class="record${selected===record.id?' active':''}" data-course="${record.id}" aria-pressed="${selected===record.id}"><span class="number">${record.id}</span><span><span class="record-title">${esc(record.name)}</span><span class="record-meta">${esc(provider.name)}<br>${esc(record.duration)} · ${esc(record.distance)}</span><span class="badges"><span class="badge">${esc(record.kind)}</span><span class="badge ${record.status==='suspended'?'closed':referenceStatus(record)?'warn':''}">${esc(statusNames[record.status])}</span></span></span></button>`;
  }
  function renderList() {
    $('results').innerHTML = visible.length ? visible.map(listHtml).join('') : '<p class="empty">검색 조건에 해당하는 투어가 없습니다.</p>';
    $('count').textContent = `${visible.length} / ${data.records.length}`;
  }
  function applyFilters() {
    selected = null;
    $('detail').hidden = true;
    focusLayer.clearLayers();
    const query = $('query').value.trim().toLowerCase();
    const provider = $('provider').value;
    const status = $('status').value;
    visible = data.records.filter(record => {
      const operator = providers.get(record.provider);
      const text = [record.id,record.name,record.course,operator.name,...operator.people,...record.points.map(id=>points.get(id).name)].join(' ').toLowerCase();
      if (query && !text.includes(query)) return false;
      if (provider && record.provider !== provider) return false;
      if (status==='located' && referenceStatus(record)) return false;
      if (status==='unresolved' && !referenceStatus(record)) return false;
      if (status==='suspended' && record.status!=='suspended') return false;
      return true;
    });
    renderList();
    drawMap();
    history.replaceState(null,'',location.pathname+location.search);
  }
  async function copy(value) {
    try { await navigator.clipboard.writeText(value); notify('복사했습니다.'); }
    catch { notify(`복사할 내용 ${value}`); }
  }
  function focusPoint(id) {
    const point = points.get(id);
    focusLayer.clearLayers();
    L.circle([point.lat,point.lng],{radius:point.uncertainty_m,color:'#e3a719',weight:2,fillOpacity:.07,interactive:false}).addTo(focusLayer);
    map.stop();
    map.fitBounds(focusLayer.getBounds(),{padding:[45,45],maxZoom:18,animate:false});
    markers.get(id)?.openPopup();
  }
  function select(id, scroll = true) {
    const record = records.get(id);
    if (!record) return;
    if (!visible.some(item => item.id === id)) {
      for (const field of ['query','provider','status']) $(field).value='';
      visible=data.records;
    }
    selected = id;
    const provider = providers.get(record.provider);
    focusLayer.clearLayers();
    renderList();
    drawMap();
    fitRecords([record]);
    const detail = $('detail');
    detail.hidden = false;
    detail.innerHTML = `<div class="detail-actions"><button type="button" id="back-list">목록으로</button><button type="button" id="share-course">이 투어 링크 복사</button></div>
      <p class="selected-caption">${record.id} · ${esc(provider.region)}</p><h2>${esc(record.name)}</h2>
      <div class="course-path">${esc(record.course)}</div><p>${esc(record.duration)} · ${esc(record.distance)}</p>
      <span class="badge ${record.status==='suspended'?'closed':referenceStatus(record)?'warn':''}">${esc(statusNames[record.status])}</span>
      <p class="notice">${esc(record.note)}</p><p>${esc(record.geometry_note)}</p>
      <h3>운영자</h3><p><strong>${esc(provider.name)}</strong>${provider.people.length?`<br>${provider.people.map(esc).join(' · ')}`:''}<br>${esc(provider.note)}</p>
      <div class="social"><a class="action" href="${esc(provider.website)}" target="_blank" rel="noopener">공식 홈페이지 ↗</a>${provider.instagram?`<a class="action" href="${esc(provider.instagram)}" target="_blank" rel="noopener">인스타그램 ↗</a>`:''}${provider.facebook?`<a class="action" href="${esc(provider.facebook)}" target="_blank" rel="noopener">페이스북 ↗</a>`:''}</div>
      <h3>발착·집결 위치</h3>${record.points.map(pointId=>{
        const point=points.get(pointId);
        return `<section class="point-card"><h4>${point.id} · ${esc(point.name)}</h4><span class="badge ${['official_area','imagery_inferred','meeting_only','field_only'].includes(point.quality)?'warn':''}">${esc(roleNames[point.role])} · ${esc(qualityNames[point.quality])}</span><div class="coord">${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}</div><p>${esc(point.note)}</p><p>위치 오차 반경 약 ${point.uncertainty_m}m${point.imagery_checked.length?' · Esri·국토지리원 대조':''}</p><div class="actions"><button type="button" data-focus="${point.id}">지도 확대</button><button type="button" data-copy="${point.id}">좌표 복사</button><a class="action" href="${esc(point.source)}" target="_blank" rel="noopener">위치 근거 ↗</a></div></section>`;
      }).join('')}
      <h3>공식 프로그램·조사 근거</h3><ol class="source-list">${record.sources.map((url,index)=>`<li><a href="${esc(url)}" target="_blank" rel="noopener">${index===0?'공식 프로그램 안내':new URL(url).hostname+' · 확인 자료'} ↗</a></li>`).join('')}</ol><p class="date">공개 자료 확인 ${record.checked_at} · 물줄기 기반 경로 © OpenStreetMap 기여자, ODbL 1.0</p>`;
    $('back-list').onclick=()=>{
      selected=null;detail.hidden=true;focusLayer.clearLayers();renderList();drawMap();
      history.replaceState(null,'',location.pathname+location.search);
      $('results').scrollIntoView({block:'start'});
    };
    $('share-course').onclick=()=>copy(new URL(`#course=${id}`,location.href).href);
    detail.querySelectorAll('[data-focus]').forEach(button=>{button.onclick=()=>focusPoint(button.dataset.focus);});
    detail.querySelectorAll('[data-copy]').forEach(button=>{button.onclick=()=>{
      const point=points.get(button.dataset.copy);copy(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
    };});
    history.replaceState(null,'',`#course=${id}`);
    if (scroll) detail.scrollIntoView({block:'start'});
  }
  $('map').addEventListener('click',event=>{
    const button=event.target.closest('[data-map-course]');
    if (button) select(button.dataset.mapCourse);
  });
  $('results').addEventListener('click',event=>{
    const button=event.target.closest('[data-course]');
    if (button) select(button.dataset.course);
  });
  for (const provider of data.providers) $('provider').add(new Option(provider.name,provider.id));
  for (const id of ['query','provider','status']) $(id).addEventListener(id==='query'?'input':'change',applyFilters);
  $('overview').onclick=()=>{
    for (const id of ['query','provider','status']) $(id).value='';
    applyFilters();fitRecords(visible);document.querySelector('.sidebar').scrollTop=0;
  };
  const initialId = new URLSearchParams(location.hash.slice(1)).get('course');
  $('summary').textContent=`운영자 ${data.providers.length}곳 · 대표 프로그램 ${data.records.length}건 · 발착·집결·참고 위치 ${data.points.length}곳`;
  renderList();drawMap();fitRecords(visible);
  if (initialId && records.has(initialId)) select(initialId);
  window.addEventListener('hashchange',()=>{
    const id=new URLSearchParams(location.hash.slice(1)).get('course');
    if (id && records.has(id)) select(id);
    else applyFilters();
  });
  new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
})();
