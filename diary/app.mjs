import { buildPreview, parseGpx, tripPreview, MAX_GPX_BYTES } from './core.mjs';
import { buildDiaryBackup, buildDiaryGpx } from './export.mjs';

const API = 'https://mycanoe-map.kohoon0140.workers.dev';
const $ = (id) => document.getElementById(id);
let map;
let routeLayers = [];
let fileEntries = [];
let fileLabel = '';
let isSample = false;
let selected = null;
let savedRecord = null;
let selectedTrip = null;
let availableCourses = [];
const params = new URLSearchParams(location.search);

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

function localDate(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function diaryHeaders() {
  const account = user();
  return account ? { 'Content-Type': 'application/json', 'X-User-Id': account.uid, 'X-Auth-Token': account.tok } : null;
}

async function diaryRequest(path, options = {}) {
  const headers = diaryHeaders();
  if (!headers) throw new Error('카카오 로그인 후 저장할 수 있습니다.');
  const response = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const messages = { relogin: '로그인이 만료되었습니다. 카누맵에서 다시 로그인해 주세요.', conflict: '다른 화면에서 수정되었습니다. 기록을 다시 열어 주세요.', 'too-large': '파일이 너무 큽니다.', 'bad-track': '백업의 이동 경로를 확인할 수 없습니다.', 'bad-archive': '지원하지 않는 카누맵 백업 형식입니다.', 'bad-date': '백업의 날짜를 확인할 수 없습니다.' };
    throw new Error(messages[result.error] || '다이어리 요청을 완료하지 못했습니다.');
  }
  return result;
}

function openEditor(info, record = null) {
  selected = info;
  savedRecord = record;
  selectedTrip = null;
  $('editor').hidden = !info;
  if (!info) return;
  $('editorTitle').textContent = record ? '비공개 다이어리 수정' : '비공개 다이어리 작성';
  $('editorSource').textContent = info.archiveSource === 'tour' ? '백업에서 가져온 별도 기록 · 원래 투어와는 연결되지 않음'
    : info.source === 'course' ? '선택한 코스를 참고해 작성 · 표시된 경로는 실제 GPS 이동 기록이 아님'
    : info.source === 'tour' ? '카누맵 투어 기록에서 가져옴'
    : info.source === 'gpx' ? 'GPX 이동 트랙에서 가져옴' : '경로 없이 남긴 기록';
  $('diaryTitle').value = record?.title || info.title || '카누잉 기록';
  $('diaryDate').value = record?.date || info.date || localDate();
  $('diaryLaunch').value = record?.launch || '';
  $('diaryLanding').value = record?.landing || '';
  $('diaryCompanions').value = (record?.companions || []).join(', ');
  $('diaryNotes').value = record?.notes || '';
  $('manualDistanceWrap').hidden = info.source !== 'manual';
  $('diaryDistance').value = info.source === 'manual' && record?.distanceKm != null ? String(record.distanceKm) : '';
  $('diaryDelete').hidden = !record;
  $('diaryExport').hidden = !record;
  $('diaryGpx').disabled = info.source === 'manual';
  $('diaryGpx').textContent = info.source === 'course' ? '코스 경로 GPX' : '이동 경로 GPX';
  $('saveStatus').textContent = '';
  $('exportStatus').textContent = '';
}

function showManual(record = null) {
  $('result').hidden = true;
  $('emptyState').hidden = false;
  $('emptyState').querySelector('h3').textContent = '기억하는 하루를 남겨보세요.';
  $('emptyState').querySelector('p').textContent = '경로 없이 날짜와 장소부터 기록할 수 있습니다. 거리와 시간은 기억나는 만큼만 입력하세요.';
  $('sourceBadge').textContent = '수기 기록';
  openEditor({ source: 'manual', archiveSource: record?.archiveSource, title: record?.title || '카누잉 기록', date: record?.date || localDate() }, record);
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
  $('sourceBadge').textContent = preview.source === 'course' ? '등록 코스 참고 기록'
    : preview.source === 'tour' ? '카누맵 투어 기록'
    : preview.source === 'sample' ? '가상 예시 경로' : '내 기기의 GPX 미리보기';
  $('routeKind').textContent = preview.kind === 'route' ? '계획 경로 · 실제 운항 아님'
    : preview.source === 'sample' ? '가상 이동 트랙' : '실제 이동 트랙';
  $('routeKind').classList.toggle('plan', preview.kind === 'route');
  document.querySelector('.map-key').classList.toggle('plan', preview.kind === 'route');
  $('mapKeyLabel').textContent = preview.kind === 'route' ? '계획 경로' : preview.source === 'sample' ? '가상 이동 트랙' : '이동 트랙';
  $('routeTitle').textContent = preview.title;
  $('routeDate').textContent = preview.source === 'course' ? '등록된 코스 경로 · 실제 운항 경로가 아닙니다'
    : preview.source === 'tour' ? '저장된 투어 기록 · 다이어리로 연결 가능'
    : preview.source === 'sample' ? '가상 예시 · 실제 운항 기록 아님' : 'GPX 이동 경로';
  $('distance').textContent = `${preview.distanceKm.toFixed(2)} km`;
  $('distance').previousElementSibling.textContent = preview.source === 'course' ? '코스 길이' : '이동 거리';
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
  if (preview.kind === 'route' && preview.source !== 'course') warnings.unshift('이 GPX는 계획 경로입니다. 실제 카누잉 완료 기록으로 표시하지 않습니다.');
  if (preview.source === 'course') warnings.unshift('코스 선은 참고 경로입니다. 실제로 이동한 위치·시간·휴식은 기록되지 않습니다.');
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
    if (isSample || entry.kind === 'route') openEditor(null);
    else openEditor({ source: 'gpx', title: preview.title, date: localDate(preview.startTime),
      lines: preview.lines.map((part) => part.map((point) => [point.lat, point.lon, point.time])) });
    setStatus('fileStatus', `${entry.kind === 'route' ? '계획 경로 · 저장 불가' : '이동 트랙 · 아래에서 비공개 저장 가능'} · ${preview.pointCount.toLocaleString('ko-KR')}개 점`);
  } catch (error) {
    setStatus('fileStatus', error.message || '경로를 표시할 수 없습니다.', true);
  }
}

async function onFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  fileEntries = [];
  isSample = false;
  openEditor(null);
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

async function onBackupChange(event) {
  const input = event.target, file = input.files?.[0];
  if (!file) return;
  try {
    if (!user()) throw new Error('카카오 로그인 후 백업을 가져올 수 있습니다.');
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 4 * 1024 * 1024) {
      throw new Error('4MB 이하의 .json 백업 파일을 선택해 주세요.');
    }
    const contents = await file.text();
    let archive;
    try { archive = JSON.parse(contents); } catch { throw new Error('JSON 파일을 읽을 수 없습니다.'); }
    if (archive?.format !== 'canoemap-diary-backup' || archive.version !== 1 || !archive.record?.id) {
      throw new Error('카누맵 다이어리 백업 형식이 아닙니다.');
    }
    const sourceNote = archive.record.source === 'tour' ? '투어 백업은 원본 투어와 분리된 이동 기록으로 복원됩니다. ' : '';
    if (!confirm(`${archive.record.title || '카누잉 기록'}을(를) 비공개 새 기록으로 가져올까요?\n${sourceNote}기존 기록은 덮어쓰지 않습니다.`)) {
      setStatus('backupStatus', '가져오기를 취소했습니다.');
      return;
    }
    setStatus('backupStatus', '백업을 검증하고 복원하는 중…');
    const record = await diaryRequest('/diary-import', { method: 'POST', body: contents });
    await loadSavedDiaries();
    await loadSavedDiary(record.id);
    setStatus('backupStatus', record.duplicate ? '이미 가져온 백업입니다. 저장된 기록을 열었습니다.' : '비공개 기록으로 복원했습니다.');
  } catch (error) {
    setStatus('backupStatus', error.message || '백업을 가져오지 못했습니다.', true);
  } finally { input.value = ''; }
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
    const authParams = new URLSearchParams({ uid: currentUser.uid, tok: currentUser.tok });
    const response = await fetch(`${API}/trips?${authParams}`, { cache: 'no-store' });
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
          const tripDetail = await detailResponse.json();
          const existingResponse = await fetch(`${API}/diary?id=${encodeURIComponent(`t_${trip.id}`)}`, { headers: diaryHeaders(), cache: 'no-store' });
          if (existingResponse.status !== 404 && !existingResponse.ok) throw new Error('연결된 다이어리를 확인하지 못했습니다.');
          const existing = existingResponse.ok ? await existingResponse.json() : null;
          showPreview(tripPreview(tripDetail));
          openEditor({ source: 'tour', tripId: trip.id, title: tripDetail.title,
            date: localDate(Number(tripDetail.start)) }, existing);
          selectedTrip = tripDetail;
          if (!existing) {
            $('diaryLaunch').value = tripDetail.launch?.addr || '';
            $('diaryLanding').value = tripDetail.landing?.addr || '';
          }
          setStatus('tourStatus', '기존 투어 원본은 그대로 두고 비공개 다이어리로 연결합니다.');
          $('entryWrap').hidden = true;
          if (params.get('trip') === String(trip.id) && !existing) await saveDiary();
        } catch (error) {
          setStatus('tourStatus', error.message || '투어 기록을 열지 못했습니다.', true);
        }
      });
      list.append(button);
      if (params.get('trip') === String(trip.id)) queueMicrotask(() => button.click());
    });
  } catch (error) {
    setStatus('tourStatus', error.message || '투어 목록을 불러오지 못했습니다.', true);
  }
}

function showCourse(course, record = null) {
  const coords = Array.isArray(record?.lines) ? record.lines[0]?.map((point) => [point[0], point[1]]) : course?.coords;
  const parts = [Array.isArray(coords) ? coords.map((point) => ({ lat: Number(point[0]), lon: Number(point[1]), time: null })) : []];
  const title = record?.courseName || course?.name || record?.title || '등록 코스';
  const preview = buildPreview(parts, { source: 'course', kind: 'route', title });
  preview.courseName = title;
  showPreview(preview);
  openEditor({ source: 'course', courseId: record?.courseId || `k${course.id}`, courseName: title,
    title: record?.title || title, date: record?.date || localDate() }, record);
  $('entryWrap').hidden = true;
}

function renderCourses() {
  const list = $('courseList');
  list.replaceChildren();
  const account = user();
  const query = $('courseSearch').value.trim().toLocaleLowerCase();
  const matched = availableCourses.filter((course) => !query || String(course.name || '').toLocaleLowerCase().includes(query));
  for (const course of matched.slice(0, 50)) {
    const button = document.createElement('button');
    button.className = 'tour-item';
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = course.name || '등록 코스';
    const meta = document.createElement('small');
    meta.textContent = `${String(course.owner) === account?.uid ? '내 코스' : '운영자 코스'}${Number(course.km) > 0 ? ` · ${Number(course.km).toFixed(1)} km` : ''}`;
    button.append(title, meta);
    button.addEventListener('click', async () => {
      document.querySelectorAll('#courseList .tour-item').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      setStatus('courseStatus', '선택한 코스를 불러오는 중…');
      try {
        const params = new URLSearchParams({ 'diary-course': `k${course.id}`, uid: account.uid, tok: account.tok });
        const response = await fetch(`${API}/courses?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('선택한 코스를 열 수 없습니다.');
        const rows = await response.json();
        if (!Array.isArray(rows) || !rows[0]) throw new Error('코스를 찾을 수 없습니다. 목록을 새로고침해 주세요.');
        showCourse(rows[0]); setStatus('courseStatus', '다녀온 날짜와 실제 경험을 적어 저장하세요.');
        $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) { setStatus('courseStatus', error.message || '코스를 표시할 수 없습니다.', true); }
    });
    list.append(button);
  }
  if (!matched.length && availableCourses.length) setStatus('courseStatus', '검색 결과가 없습니다.');
  else if (matched.length) setStatus('courseStatus', `${matched.length}개 코스${matched.length > 50 ? ' · 검색어로 좁혀 주세요' : ''}`);
}

async function loadCourses() {
  const account = user();
  if (!account) { setStatus('courseStatus', '카카오 로그인 후 등록 코스를 고를 수 있습니다.'); return; }
  try {
    const query = new URLSearchParams({ selectable: '1', uid: account.uid, tok: account.tok });
    const response = await fetch(`${API}/courses?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('코스 목록을 불러오지 못했습니다.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('코스 목록 형식이 올바르지 않습니다.');
    availableCourses = rows.filter((course) => Number(course.pointCount) >= 2)
      .sort((a, b) => Number(String(b.owner) === account.uid) - Number(String(a.owner) === account.uid) || String(a.name).localeCompare(String(b.name), 'ko'));
    renderCourses();
    if (!availableCourses.length) setStatus('courseStatus', '선택할 수 있는 등록 코스가 없습니다.');
  } catch (error) { setStatus('courseStatus', error.message || '코스 목록을 불러오지 못했습니다.', true); }
}

async function loadSavedDiaries() {
  if (!user()) {
    setStatus('diaryStatus', '카카오 로그인 후 다이어리를 저장하고 다시 볼 수 있습니다.');
    $('diaryList').replaceChildren();
    return;
  }
  try {
    const list = $('diaryList');
    list.replaceChildren();
    let cursor = null, count = 0;
    do {
      const result = await diaryRequest(`/diaries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const item of result.items || []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tour-item';
        const title = document.createElement('strong');
        title.textContent = item.title || '카누잉 기록';
        const meta = document.createElement('small');
        meta.textContent = `${item.date || '날짜 없음'} · ${item.archiveSource === 'tour' ? '투어 백업' : item.source === 'course' ? '등록 코스 참고' : item.source === 'manual' ? '수기' : item.source === 'gpx' ? 'GPX' : '투어'}${item.distanceKm != null ? ` · ${Number(item.distanceKm).toFixed(2)} km` : ''}`;
        button.append(title, meta);
        button.addEventListener('click', () => loadSavedDiary(item.id));
        list.append(button);
        count++;
      }
      cursor = result.cursor;
    } while (cursor && count < 200);
    setStatus('diaryStatus', count ? `${count}개 비공개 기록 · 선택해 다시 열기` : '아직 저장한 다이어리가 없습니다.');
  } catch (error) {
    setStatus('diaryStatus', error.message, true);
  }
}

async function loadSavedDiary(id) {
  try {
    setStatus('diaryStatus', '기록을 여는 중…');
    const record = await diaryRequest(`/diary?id=${encodeURIComponent(id)}`);
    if (record.source === 'manual') showManual(record);
    else if (record.source === 'course') showCourse(null, record);
    else if (record.source === 'gpx') {
      const parts = record.lines.map((part) => part.map((point) => ({ lat: point[0], lon: point[1], time: point[2] })));
      showPreview(buildPreview(parts, { source: 'gpx', kind: 'track', title: record.title }));
      openEditor({ source: 'gpx', archiveSource: record.archiveSource, lines: record.lines, title: record.title, date: record.date }, record);
    } else {
      const account = user();
      const query = new URLSearchParams({ id: record.tripId, viewer: account.uid, tok: account.tok });
      const response = await fetch(`${API}/trip?${query}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('연결된 투어 원본을 열지 못했습니다.');
      const tripDetail = await response.json();
      showPreview(tripPreview(tripDetail));
      openEditor({ source: 'tour', tripId: record.tripId, title: record.title, date: record.date }, record);
      selectedTrip = tripDetail;
    }
    setStatus('diaryStatus', '비공개 기록을 열었습니다.');
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus('diaryStatus', error.message, true);
  }
}

async function saveDiary() {
  if (!selected) return;
  const title = $('diaryTitle').value.trim(), date = $('diaryDate').value;
  if (!title || !date) { $('saveStatus').textContent = '제목과 날짜를 입력해 주세요.'; return; }
  const distance = $('diaryDistance').value.trim();
  const body = {
    source: selected.source, tripId: selected.tripId,
    courseId: selected.courseId, courseName: selected.courseName,
    lines: selected.source === 'gpx' && !savedRecord ? selected.lines : undefined,
    diaryId: savedRecord?.id, rev: savedRecord?.rev,
    title, date, launch: $('diaryLaunch').value.trim(), landing: $('diaryLanding').value.trim(),
    companions: $('diaryCompanions').value.split(',').map((name) => name.trim()).filter(Boolean),
    notes: $('diaryNotes').value.trim(),
    userDistanceKm: selected.source === 'manual' && distance ? Number(distance) : null,
  };
  const button = $('diarySave');
  button.disabled = true;
  $('saveStatus').textContent = '비공개로 저장하는 중…';
  try {
    const record = await diaryRequest('/diary', { method: 'POST', body: JSON.stringify(body) });
    savedRecord = record;
    $('editorTitle').textContent = '비공개 다이어리 수정';
    $('diaryDelete').hidden = false;
    $('diaryExport').hidden = false;
    $('diaryGpx').disabled = record.source === 'manual';
    $('saveStatus').textContent = record.duplicate ? '이미 저장한 기록을 열었습니다.' : '비공개로 저장했습니다.';
    await loadSavedDiaries();
  } catch (error) {
    $('saveStatus').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deleteDiary() {
  if (!savedRecord || !confirm('이 다이어리를 삭제할까요? 연결된 투어 원본은 그대로 남습니다.')) return;
  const button = $('diaryDelete');
  button.disabled = true;
  $('saveStatus').textContent = '삭제하는 중…';
  try {
    await diaryRequest(`/diary?id=${encodeURIComponent(savedRecord.id)}`, { method: 'DELETE' });
    openEditor(null);
    $('result').hidden = true;
    $('emptyState').hidden = false;
    $('sourceBadge').textContent = '기록을 선택해 주세요';
    await loadSavedDiaries();
    setStatus('diaryStatus', '비공개 다이어리를 삭제했습니다.');
  } catch (error) {
    $('saveStatus').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function downloadDiaryFile(contents, type, extension) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `canoemap-diary-${savedRecord.date}-${savedRecord.id}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function exportDiary(kind) {
  if (!savedRecord) return;
  try {
    if (kind === 'backup') {
      const backup = buildDiaryBackup(savedRecord, selectedTrip);
      downloadDiaryFile(`${JSON.stringify(backup, null, 2)}\n`, 'application/json;charset=utf-8', 'json');
      $('exportStatus').textContent = '개인 백업을 내려받았습니다.';
    } else {
      downloadDiaryFile(buildDiaryGpx(savedRecord, selectedTrip), 'application/gpx+xml;charset=utf-8', 'gpx');
      $('exportStatus').textContent = savedRecord.source === 'course' ? '참고 코스 GPX를 내려받았습니다.' : '이동 경로 GPX를 내려받았습니다.';
    }
  } catch (error) {
    $('exportStatus').textContent = error.message || '파일을 만들지 못했습니다.';
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
$('backupFile').addEventListener('change', onBackupChange);
$('entrySelect').addEventListener('change', (event) => showFileEntry(Number(event.target.value)));
$('courseSearch').addEventListener('input', renderCourses);
$('sampleButton').addEventListener('click', loadSample);
$('newManual').addEventListener('click', () => { showManual(); $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('diarySave').addEventListener('click', saveDiary);
$('diaryDelete').addEventListener('click', deleteDiary);
$('diaryBackup').addEventListener('click', () => exportDiary('backup'));
$('diaryGpx').addEventListener('click', () => exportDiary('gpx'));
loadSavedDiaries();
loadTours();
loadCourses();
if (params.get('start') === 'manual') queueMicrotask(() => $('newManual').click());
if (params.get('start') === 'gpx') queueMicrotask(() => $('gpxFile').closest('.source-group')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
if (params.get('start') === 'course') queueMicrotask(() => $('courseSource').scrollIntoView({ behavior: 'smooth', block: 'start' }));
