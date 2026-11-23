'use strict';
(() => {
if (!window.L) { document.getElementById('summary').textContent='지도 라이브러리를 불러오지 못했습니다. 상단 CSV에서 좌표와 조사 내용을 확인해 주세요.'; return; }
const records = window.JAPAN_LAUNCH_DATA.records;
const permissionLabels = {allowed:'개인 반입 가능',conditional:'조건부 가능',unverified:'개인 반입 미확인',suspended:'운영·이용 중단',restricted:'해당 시설 반입 제한',guide_required:'입역 승인·가이드 필요'};
const coordinateLabels = {reported_water_access:'현장 발착 자료',imagery_water_access:'항공사진 물가 후보',recorded_trip_endpoint:'공개 GPS 기록 지점',facility_lead:'시설 위치 · 물가 미확인',reference_only:'수역 참고 · 발착점 미확인'};
const regions = {'北海道':'홋카이도','東北':'도호쿠','関東':'간토','甲信北陸':'고신·호쿠리쿠','東海':'도카이','近畿':'긴키','中国':'주고쿠','四国':'시코쿠','九州':'규슈','沖縄':'오키나와'};
const $ = id => document.getElementById(id);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isWaterside = site => ['reported_water_access','imagery_water_access','recorded_trip_endpoint'].includes(site.coordinate_type);
const hasWater = record => record.sites.some(isWaterside);
const hasLaunchLanding = site => site.launch_landing?.status === 'documented_conditional';
const siteBadge = site => hasLaunchLanding(site) ? '<span class="badge verified">런칭·랜딩 · 조건부</span>' : `<span class="badge">${coordinateLabels[site.coordinate_type]}</span>`;
function badgeClass(status) {
  if (['allowed','conditional'].includes(status)) return 'usable';
  if (['restricted','suspended'].includes(status)) return 'closed';
  return 'warning';
}
function markerColor(status) {
  if (['allowed','conditional'].includes(status)) return '#087f78';
  if (['restricted','suspended','guide_required'].includes(status)) return '#b35146';
  return '#b47b25';
}
const map = L.map('map', {zoomControl:false, maxZoom:20, scrollWheelZoom:true}).setView([36.4,137.6],5);
L.control.zoom({position:'bottomright'}).addTo(map);
const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxNativeZoom:18,maxZoom:20,attribution:'Tiles © Esri · imagery providers'}).addTo(map);
const photo = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {maxNativeZoom:18,maxZoom:20,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">일본 국토지리원(国土地理院) · 항공사진</a>'});
const normal = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {maxNativeZoom:18,maxZoom:20,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">일본 국토지리원(国土地理院) · 일반지도</a>'});
L.control.layers({'Esri 위성':esri,'일본 국토지리원 항공사진':photo,'일본 국토지리원 일반지도':normal},null,{position:'topright',collapsed:window.matchMedia('(max-width:760px)').matches}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
let selectedId = null;
let visibleRecords = records;
let markers = [];
let statusTimer;
function status(message) {
  clearTimeout(statusTimer);
  $('map-status').textContent = message;
  $('map-status').hidden = false;
  statusTimer = setTimeout(() => { $('map-status').hidden = true; },3500);
}
function icon(record, site, selected) {
  return L.divIcon({className:'launch-marker',iconSize:[28,28],iconAnchor:[14,14],html:`<span class="pin${isWaterside(site)?'':' reference'}${selected?' selected':''}" style="background:${isWaterside(site)?(hasLaunchLanding(site)?'#1766ab':markerColor(site.personal_boat || record.personal_boat)):'#71837b'}">${record.id}</span>`});
}
function drawMarkers() {
  markerLayer.clearLayers();
  markers = [];
  for (const record of visibleRecords) {
    for (const [index,site] of record.sites.entries()) {
      if ($('quality').value === 'launch_landing' && !hasLaunchLanding(site)) continue;
      const marker = L.marker([site.lat,site.lng],{icon:icon(record,site,record.id===selectedId),title:`${record.id} ${record.waterbody} · ${site.name}${hasLaunchLanding(site)?' · 런칭·랜딩(조건부)':''}`,keyboard:true});
      marker.bindTooltip(`${record.id} ${escapeHtml(record.waterbody)}<br>${escapeHtml(site.name)}${hasLaunchLanding(site)?'<br>런칭·랜딩 · 조건부':''}`);
      marker.on('click',() => selectRecord(record.id,index));
      marker.addTo(markerLayer);
      markers.push({record,site,marker,index});
    }
  }
}
function fitCurrent(sites = markers.map(item => item.site)) {
  const points = sites.map(site => [site.lat,site.lng]);
  if (!points.length) { status('이 조건에 해당하는 지도 좌표가 없습니다.'); return; }
  if (points.length === 1) map.setView(points[0],16);
  else map.fitBounds(points,{padding:[45,45],maxZoom:16});
}
function locationText(record) {
  if (!record.sites.length) return '발착 좌표 미확인';
  const confirmed = record.sites.filter(hasLaunchLanding).length;
  if (confirmed) return `런칭·랜딩 · 조건부 ${confirmed}곳`;
  const count = record.sites.filter(isWaterside).length;
  return count ? `물가 자료·후보 ${count}곳` : '시설·수역 참고 위치';
}
function applyFilters() {
  selectedId = null;
  $('detail').hidden = true;
  $('list-view').hidden = false;
  const query = $('query').value.trim().toLocaleLowerCase();
  const region = $('region').value;
  const permission = $('permission').value;
  const quality = $('quality').value;
  visibleRecords = records.filter(record => {
    const haystack = [record.id,record.waterbody,record.name_ko,record.permission_note,...record.sites.map(site=>site.name)].join(' ').toLocaleLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (region && record.region !== region) return false;
    if (permission === 'usable' && !['allowed','conditional'].includes(record.personal_boat)) return false;
    if (permission === 'unverified' && record.personal_boat !== 'unverified') return false;
    if (permission === 'restricted' && !['restricted','suspended','guide_required'].includes(record.personal_boat)) return false;
    if (quality === 'launch_landing' && !record.sites.some(hasLaunchLanding)) return false;
    if (quality === 'waterside' && !hasWater(record)) return false;
    if (quality === 'reference' && (!record.sites.length || hasWater(record))) return false;
    if (quality === 'unresolved' && record.sites.length) return false;
    return true;
  });
  $('result-count').textContent = `${visibleRecords.length} / ${records.length}`;
  $('results').innerHTML = visibleRecords.length ? visibleRecords.map(record => `<button type="button" class="record" data-record="${record.id}"><span class="number">${String(record.id).padStart(3,'0')}</span><span><span class="record-title">${escapeHtml(record.waterbody)}</span><span class="meta"><span class="badge ${badgeClass(record.personal_boat)}">${permissionLabels[record.personal_boat]}</span><span class="badge">${locationText(record)}</span></span><p>${escapeHtml(record.region_label || regions[record.region])}${record.name_ko?` · ${escapeHtml(record.name_ko)}`:''}</p></span></button>`).join('') : '<p class="empty">검색 조건에 맞는 수역이 없습니다.</p>';
  drawMarkers();
}
function urlFor(recordId) { const url = new URL(location.href); url.hash = `${$('quality').value === 'launch_landing' ? 'quality=launch_landing&' : ''}site=${recordId}`; return url.href; }
async function copy(text,success) {
  try { await navigator.clipboard.writeText(text); status(success); }
  catch { status('복사할 내용을 길게 눌러 선택해 주세요.'); }
}
function selectRecord(id,focusIndex=null) {
  const record = records.find(item=>item.id===Number(id));
  if (!record) return;
  selectedId = record.id;
  $('list-view').hidden = true;
  const detail = $('detail');
  detail.hidden = false;
  const siteHtml = record.sites.map((site,index) => `
    <section class="site">
      <h4>${escapeHtml(site.name)}</h4>
      ${siteBadge(site)}
      <div class="coord">${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}</div>
      ${hasLaunchLanding(site) ? `<p><strong>${escapeHtml(site.launch_landing.facility_type)}</strong> · 런칭 / 랜딩</p><p>${escapeHtml(site.launch_landing.trip_note)}</p><p><a href="${escapeHtml(site.launch_landing.source)}" target="_blank" rel="noopener noreferrer">공식 발착장 안내 ↗</a></p>` : ''}
      <p>${escapeHtml(site.access)}</p>
      <div class="actions">
        <button type="button" class="primary" data-focus="${index}">지도 확대</button>
        <button type="button" data-copy="${index}">좌표 복사</button>
        <a class="action" target="_blank" rel="noopener noreferrer"
           href="https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}">Google 지도 ↗</a>
      </div>
      ${site.imagery_checked?.length ? '<p>Esri·국토지리원 영상 대조. 촬영 시기·수위 차이로 실제 물가는 달라질 수 있습니다.</p>' : ''}
      <p><a href="${escapeHtml(site.coordinate_source)}" target="_blank" rel="noopener noreferrer">위치 근거 원문 ↗</a></p>
    </section>
  `).join('');
  const sourceHtml = record.sources.map(source => `
    <li><a target="_blank" rel="noopener noreferrer" href="${escapeHtml(source)}">
      ${escapeHtml(window.JAPAN_LAUNCH_DATA.source_titles[source] || new URL(source).hostname)} ↗
    </a></li>
  `).join('');
  const missingLocation = escapeHtml(record.location_issue || '공개 자료에서 실제 발착 좌표를 확정하지 못했습니다. 확인된 장소·규정 자료를 아래에 모았습니다.');
  detail.innerHTML = `
    <header>
      <button type="button" id="back">← 전체 목록</button>
      <button type="button" id="share-record">이 수역 링크 복사</button>
    </header>
    <p class="region-text">${escapeHtml(record.region_label || regions[record.region])} · ${String(record.id).padStart(3,'0')}</p>
    <h2>${escapeHtml(record.waterbody)}</h2>
    ${record.name_ko ? `<p class="region-text">${escapeHtml(record.name_ko)}</p>` : ''}
    <h3>개인 카누 반입</h3>
    <span class="badge ${badgeClass(record.personal_boat)}">${permissionLabels[record.personal_boat]}</span>
    <p class="permission-note">${escapeHtml(record.permission_note)}</p>
    <h3>런칭·랜딩 위치</h3>
    ${siteHtml || `<p class="location-alert">${missingLocation}</p>`}
    <h3>확인한 근거</h3>
    <ol class="source-links">${sourceHtml}</ol>
    <p class="date">공개 자료 확인 ${escapeHtml(record.checked_at || window.JAPAN_LAUNCH_DATA.date).replaceAll('-','.')} · 개인 카누 반입 조건은 안내한 시설·구역에 적용됩니다.</p>
  `;
  detail.closest('.sidebar').scrollTop = 0;
  $('back').onclick = () => { history.replaceState(null,'',location.pathname+location.search); applyFilters(); };
  $('share-record').onclick = () => copy(urlFor(record.id),'수역 링크를 복사했습니다.');
  detail.querySelectorAll('[data-focus]').forEach(button => { button.onclick = () => focusSite(record,Number(button.dataset.focus)); });
  detail.querySelectorAll('[data-copy]').forEach(button => { button.onclick = () => { const site=record.sites[Number(button.dataset.copy)]; copy(`${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}`,'좌표를 복사했습니다.'); }; });
  history.replaceState(null,'',urlFor(record.id));
  drawMarkers();
  if (focusIndex!==null) focusSite(record,focusIndex);
  else if (record.sites.length) fitCurrent(record.sites);
  else status('해당 수역의 발착 좌표는 추가 확인이 필요합니다.');
}
function focusSite(record,index) {
  const site=record.sites[index];
  map.setView([site.lat,site.lng],17);
  const item=markers.find(item=>item.record.id===record.id && item.index===index);
  if (item) item.marker.bindPopup(`<strong>${record.id} ${escapeHtml(record.waterbody)}</strong><p>${escapeHtml(site.name)}</p>${siteBadge(site)}${hasLaunchLanding(site)?`<p>${escapeHtml(site.launch_landing.facility_type)} · 런칭 / 랜딩</p>`:''}<p>${site.lat.toFixed(6)}, ${site.lng.toFixed(6)}</p>`).openPopup();
}
for (const [value,name] of Object.entries(regions)) { const option=new Option(`${name}(${value})`,value); $('region').add(option); }
for (const id of ['query','region','permission','quality']) $(id).addEventListener(id==='query'?'input':'change',applyFilters);
$('results').addEventListener('click',event=>{const button=event.target.closest('[data-record]');if(button)selectRecord(Number(button.dataset.record));});
$('overview').onclick = () => { selectedId=null;['query','region','permission','quality'].forEach(id => { $(id).value=''; });history.replaceState(null,'',location.pathname+location.search);applyFilters();fitCurrent(); };
const counts = window.JAPAN_LAUNCH_DATA.counts;
const launchLandingCount = records.reduce((n,r)=>n+r.sites.filter(hasLaunchLanding).length,0);
$('summary').textContent = `${records.length}개 수역 조사 · 공식 런칭·랜딩 ${launchLandingCount}곳(조건부) · 물가 자료·후보 ${counts.waterside_waterbodies}개 수역 · 시설·참고 ${counts.reference_waterbodies}개 · 좌표 미확인 ${counts.unresolved_waterbodies}개`;
const initialParams = new URLSearchParams(location.hash.slice(1));
if (initialParams.get('quality') === 'launch_landing') $('quality').value='launch_landing';
applyFilters();
const initialId = Number(initialParams.get('site'));
const initialPoint = initialParams.has('point') ? Number(initialParams.get('point')) : null;
const initialRecord = records.find(record => record.id === initialId);
const pointIndex = initialRecord && Number.isInteger(initialPoint) && initialPoint >= 0 && initialPoint < initialRecord.sites.length ? initialPoint : null;
if (initialId) selectRecord(initialId,pointIndex); else fitCurrent();
new ResizeObserver(()=>map.invalidateSize()).observe($('map'));
})();
