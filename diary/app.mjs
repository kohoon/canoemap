import { buildPreview, parseGpx, tripPreview, MAX_GPX_BYTES } from './core.mjs';

const API = 'https://mycanoe-map.kohoon0140.workers.dev';
const $ = (id) => document.getElementById(id);
let map;
let routeLayers = [];
let fileEntries = [];
let fileLabel = '';
let isSample = false;

function user() {
  try {
    const value = JSON.parse(localStorage.getItem('mc_user') || 'null');
    return value?.uid && value?.tok ? value : null;
  } catch { return null; }
}

function setStatus(id, message, error = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('error', error);
}

function fmtDate(timestamp) {
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
    : '기록 없음';
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return '확인 불가';
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
}

function resetMap() {
  routeLayers.forEach((layer) => map?.removeLayer(layer));
  routeLayers = [];
}

function drawRoute(preview) {
  if (!window.L) {
    $('routeMap').textContent = '지도를 불러오지 못했습니다. 경로 요약은 아래에서 확인할 수 있습니다.';
    return;
  }
  if (!map) {
    map = L.map('routeMap', { scrollWheelZoom: false, worldCopyJump: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
  }
  resetMap();
  const bounds = [];
  for (const line of preview.lines) {
    const latLngs = line.map((point) => [point.lat, point.lon]);
    bounds.push(...latLngs);
    if (latLngs.length >= 2) routeLayers.push(L.polyline(latLngs, {
      color: preview.kind === 'route' ? '#b56b24' : '#ef6b39',
      weight: 5, opacity: .95, dashArray: preview.kind === 'route' ? '8 7' : null,
      lineCap: 'round', lineJoin: 'round',
    }).addTo(map));
  }
  const first = preview.lines[0]?.[0];
  const lastLine = preview.lines.at(-1);
  const last = lastLine?.at(-1);
  if (first) routeLayers.push(L.circleMarker([first.lat, first.lon], {
    radius: 8, color: '#fff', weight: 3, fillColor: '#0aa77b', fillOpacity: 1,
  }).bindTooltip('출발').addTo(map));
  if (last) routeLayers.push(L.circleMarker([last.lat, last.lon], {
    radius: 8, color: '#fff', weight: 3, fillColor: '#e95355', fillOpacity: 1,
  }).bindTooltip('도착').addTo(map));
  map.invalidateSize();
  map.fitBounds(L.latLngBounds(bounds).pad(.14), { maxZoom: 15 });
}

function showPreview(preview) {
  $('emptyState').hidden = true;
  $('result').hidden = false;
  $('sourceBadge').textContent = preview.source === 'tour' ? '카누맵 투어 기록'
    : preview.source === 'sample' ? '가상 예시 경로' : '내 기기의 GPX 미리보기';
  $('routeKind').textContent = preview.kind === 'route' ? '계획 경로 · 실제 운항 아님'
    : preview.source === 'sample' ? '가상 이동 트랙' : '실제 이동 트랙';
  $('routeKind').classList.toggle('plan', preview.kind === 'route');
  $('mapKeyLabel').textContent = preview.kind === 'route' ? '계획 경로' : preview.source === 'sample' ? '가상 이동 트랙' : '이동 트랙';
  $('routeTitle').textContent = preview.title;
  $('routeDate').textContent = preview.source === 'tour' ? '저장된 투어 기록 · 읽기 전용'
    : preview.source === 'sample' ? '가상 예시 · 실제 운항 기록 아님' : 'GPX 파일 · 아직 저장되지 않음';
  $('distance').textContent = `${preview.distanceKm.toFixed(2)} km`;
  $('elapsed').textContent = fmtDuration(preview.elapsedSeconds);
  $('pointCount').textContent = `${preview.pointCount.toLocaleString('ko-KR')}개`;
  $('startTime').textContent = fmtDate(preview.startTime);
  $('endTime').textContent = fmtDate(preview.endTime);
  $('segmentCount').textContent = `${preview.lines.length}개`;
  $('restTime').textContent = preview.source === 'tour' && preview.restSeconds > 0
    ? fmtDuration(preview.restSeconds)
    : '기록 없음';
  $('courseName').textContent = preview.courseName || '연결되지 않음';
  const warningBox = $('warnings');
  warningBox.replaceChildren();
  const warnings = [...preview.warnings];
  if (preview.source === 'sample') warnings.unshift('화면 확인용 가상 경로입니다. 실제 카누잉·안전 판단에 사용하지 마세요.');
  if (preview.kind === 'route') warnings.unshift('이 GPX는 계획 경로입니다. 실제 카누잉 완료 기록으로 표시하지 않습니다.');
  if (preview.source === 'tour' && preview.savedDistanceKm !== null
    && Math.abs(preview.savedDistanceKm - preview.distanceKm) > .1) {
    warnings.push(`저장된 거리 ${preview.savedDistanceKm.toFixed(2)} km와 미리보기 재계산 거리가 다릅니다. 원본은 변경하지 않았습니다.`);
  }
  warningBox.hidden = warnings.length === 0;
  warnings.forEach((warning) => {
    const p = document.createElement('p');
    p.textContent = warning;
    warningBox.append(p);
  });
  drawRoute(preview);
}

function showFileEntry(index) {
  const entry = fileEntries[index];
  if (!entry) return;
  try {
    const preview = buildPreview(entry.parts, {
      title: entry.label || fileLabel,
      source: isSample ? 'sample' : 'gpx', kind: entry.kind,
    });
    showPreview(preview);
    setStatus('fileStatus', `${entry.kind === 'route' ? '계획 경로' : '이동 트랙'} · ${preview.pointCount.toLocaleString('ko-KR')}개 점 · 서버 저장 없음`);
  } catch (error) {
    setStatus('fileStatus', error.message || '경로를 표시할 수 없습니다.', true);
  }
}

async function onFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  fileEntries = [];
  isSample = false;
  $('entryWrap').hidden = true;
  $('fileName').textContent = file.name;
  if (!file.name.toLowerCase().endsWith('.gpx') || file.size > MAX_GPX_BYTES) {
    setStatus('fileStatus', '5MB 이하의 .gpx 파일을 선택해 주세요.', true);
    return;
  }
  setStatus('fileStatus', '파일을 기기에서 읽는 중…');
  try {
    const text = await file.text();
    fileEntries = parseGpx(text);
    fileLabel = file.name.replace(/\.gpx$/i, '');
    const select = $('entrySelect');
    select.replaceChildren();
    fileEntries.forEach((entry, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${entry.kind === 'route' ? '계획 경로' : '이동 트랙'} · ${entry.label}`;
      select.append(option);
    });
    $('entryWrap').hidden = fileEntries.length === 1;
    document.querySelectorAll('.tour-item').forEach((item) => item.classList.remove('selected'));
    showFileEntry(0);
  } catch (error) {
    setStatus('fileStatus', error.message || 'GPX 파일을 읽지 못했습니다.', true);
  }
}

async function loadTours() {
  const currentUser = user();
  if (!currentUser) {
    $('tourStatus').replaceChildren();
    $('tourStatus').append('카누맵에 로그인하면 내 투어 기록을 불러올 수 있습니다. ');
    const link = document.createElement('a');
    link.href = '../';
    link.textContent = '로그인하러 가기 ↗';
    link.className = 'sample-button';
    $('tourStatus').append(link);
    return;
  }
  try {
    const params = new URLSearchParams({ uid: currentUser.uid, tok: currentUser.tok });
    const response = await fetch(`${API}/trips?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('투어 목록을 불러오지 못했습니다.');
    const trips = await response.json();
    if (!Array.isArray(trips)) throw new Error('투어 목록 형식이 올바르지 않습니다.');
    setStatus('tourStatus', trips.length ? `${trips.length}개 기록 중 하나를 선택하세요.` : '저장된 투어 기록이 없습니다. GPX로 먼저 미리볼 수 있습니다.');
    const list = $('tourList');
    list.replaceChildren();
    trips.slice(0, 30).forEach((trip) => {
      const button = document.createElement('button');
      button.className = 'tour-item';
      button.type = 'button';
      const title = document.createElement('strong');
      title.textContent = trip.title || '카누잉';
      const meta = document.createElement('small');
      meta.textContent = `${fmtDate(Number(trip.start))} · ${Number(trip.distKm || 0).toFixed(1)} km`;
      button.append(title, meta);
      button.addEventListener('click', async () => {
        document.querySelectorAll('.tour-item').forEach((item) => item.classList.remove('selected'));
        button.classList.add('selected');
        setStatus('tourStatus', '선택한 기록을 불러오는 중…');
        try {
          const query = new URLSearchParams({ id: trip.id, viewer: currentUser.uid, tok: currentUser.tok });
          const detailResponse = await fetch(`${API}/trip?${query}`, { cache: 'no-store' });
          if (!detailResponse.ok) throw new Error('투어 기록을 열 수 없습니다. 다시 로그인해 주세요.');
          showPreview(tripPreview(await detailResponse.json()));
          setStatus('tourStatus', '읽기 전용 미리보기 · 원본 기록은 변경되지 않습니다.');
          $('entryWrap').hidden = true;
        } catch (error) {
          setStatus('tourStatus', error.message || '투어 기록을 열지 못했습니다.', true);
        }
      });
      list.append(button);
    });
  } catch (error) {
    setStatus('tourStatus', error.message || '투어 목록을 불러오지 못했습니다.', true);
  }
}

async function loadSample() {
  try {
    const response = await fetch('./sample-track.gpx');
    if (!response.ok) throw new Error('예시 파일을 열지 못했습니다.');
    fileEntries = parseGpx(await response.text());
    isSample = true;
    fileLabel = '가상 예시 경로';
    $('fileName').textContent = '가상 예시 · 실제 운항 기록 아님';
    const select = $('entrySelect');
    select.replaceChildren();
    fileEntries.forEach((entry, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${entry.kind === 'route' ? '계획 경로' : '이동 트랙'} · ${entry.label}`;
      select.append(option);
    });
    $('entryWrap').hidden = fileEntries.length === 1;
    showFileEntry(0);
    setStatus('fileStatus', '가상 예시 경로입니다. 실제 코스·수위 판단에 사용하지 마세요.');
  } catch (error) {
    setStatus('fileStatus', error.message || '예시 경로를 열지 못했습니다.', true);
  }
}

$('gpxFile').addEventListener('change', onFileChange);
$('entrySelect').addEventListener('change', (event) => showFileEntry(Number(event.target.value)));
$('sampleButton').addEventListener('click', loadSample);
loadTours();
