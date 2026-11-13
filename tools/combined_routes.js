// Ordered route references share existing records without changing their geometry.
function normalizeCombinedRef(value) {
  const match = String(value || '')
    .trim()
    .match(/^(course|trail):([a-zA-Z0-9_-]{1,100})$/);
  return match ? match[1] + ':' + match[2] : null;
}
function combinedRouteRefs() {
  const raw = new URLSearchParams(location.search).get('routes');
  if (!raw) return [];
  const refs = raw.split(',').map(normalizeCombinedRef);
  return refs.every(Boolean) ? [...new Set(refs)] : [];
}
function combinedRouteViewUrl(refs) {
  const clean = [...new Set(refs.map(normalizeCombinedRef).filter(Boolean))];
  const u = new URL(
    '/',
    ['localhost', '127.0.0.1'].includes(location.hostname)
      ? location.origin
      : 'https://canoe.crowdbase.kr/'
  );
  u.searchParams.set('routes', clean.join(','));
  return u.toString();
}
function combinedRouteUrl(refs) {
  const url = new URL('/routes', WORKER_URL);
  url.searchParams.set(
    'routes',
    [...new Set(refs.map(normalizeCombinedRef).filter(Boolean))].join(',')
  );
  return url.toString();
}
function isCombinedTrail(id) {
  return combinedRouteRefs().includes('trail:' + String(id).replace(/^trail:/, ''));
}
const _combinedRouteLayer = L.layerGroup().addTo(map);
map.createPane('combinedRoutePane');
map.getPane('combinedRoutePane').style.zIndex = '500';
const _combinedStripeRenderer = L.svg({ pane: 'combinedRoutePane', padding: 0.4 });
const _combinedNameCache = new Map();
let _combinedRecords = [],
  _combinedErrors = [],
  _combinedSeq = 0,
  _combinedCtl = null,
  _combinedDraft = [];
function _combinedTrailRef(id) {
  return 'trail:' + String(id).replace(/^trail:/, '');
}
function _combinedCourseRecord(id, course) {
  if (!course || !Array.isArray(course.coords) || course.coords.length < 2)
    throw new Error('코스를 찾을 수 없습니다');
  const geometry = {
    type: 'LineString',
    coordinates: course.coords.map(function (p) {
      return [Number(p[1]), Number(p[0])];
    })
  };
  if (
    geometry.coordinates.some(function (p) {
      return (
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 85
      );
    })
  )
    throw new Error('코스 좌표를 확인해 주세요');
  const land = course.travelMode === 'land',
    km = Number(course.km);
  return {
    ref: 'course:' + id,
    name: course.name || '코스',
    kind: land ? '육로' : '물길',
    km: Number.isFinite(km) && km > 0 ? km : _walkingDistance(geometry),
    geometry: geometry,
    color: land
      ? '#8d4e28'
      : validCourseColor(course.color) ||
        courseLineColor(courseSubcat(course.name), course.id || id)
  };
}
async function _resolveCombinedRef(ref) {
  const split = ref.indexOf(':'),
    kind = ref.slice(0, split),
    id = ref.slice(split + 1);
  if (kind === 'trail') {
    const o = _obstacles[id] || _obstacles['trail:' + id];
    if (!o || o.type !== '육로' || !o.geometry || o.del) throw new Error('육로를 찾을 수 없습니다');
    const seed = _walkingTrailSeeds[o.id],
      official = seed && JSON.stringify(seed.geometry) === JSON.stringify(o.geometry);
    return {
      ref: ref,
      name: o.name || '육로',
      kind: '육로',
      km: official ? seed.designatedDistanceKm : _walkingDistance(o.geometry),
      geometry: o.geometry,
      color: '#8d4e28'
    };
  }
  if (id.charAt(0) === 'k') {
    const response = await fetch(
      courseReadUrl('/courses?shared=' + encodeURIComponent(id.slice(1))),
      { signal: AbortSignal.timeout(20000) }
    );
    if (!response.ok) throw new Error('코스를 불러오지 못했습니다');
    const list = await response.json(),
      course = list.find(function (c) {
        return String(c.id) === id.slice(1);
      });
    return _combinedCourseRecord(id, course);
  }
  const feature = COURSES.features.find(function (f) {
    return String(f.properties.cid) === id;
  });
  if (!feature || _hiddenStaticCids.has(id)) throw new Error('코스를 찾을 수 없습니다');
  _applyCourseOver(feature);
  return _combinedCourseRecord(
    id,
    Object.assign({}, feature.properties, {
      coords: feature.geometry.coordinates.map(function (p) {
        return [p[1], p[0]];
      })
    })
  );
}
function _combinedLabel(record, index) {
  return (
    index + 1 + '. ' + record.kind + ' · ' + record.name + ' · ' + record.km.toFixed(2) + ' km'
  );
}
function _combinedPopupHtml() {
  const total = _combinedRecords.reduce(function (sum, r) {
    return sum + r.km;
  }, 0);
  const rows = _combinedRecords
    .map(function (record, index) {
      return '<div style="margin:7px 0">' + pmEsc(_combinedLabel(record, index)) + '</div>';
    })
    .join('');
  const errors = _combinedErrors
    .map(function (ref) {
      return (
        '<div style="color:#b54732">구간 ' +
        (combinedRouteRefs().indexOf(ref) + 1) +
        ' · 불러오기 실패</div>'
      );
    })
    .join('');
  return (
    '<b>전체 코스</b>' +
    rows +
    errors +
    '<div style="margin-top:10px;font-weight:700">구간 합계 ' +
    total.toFixed(2) +
    ' km</div>'
  );
}
function _showCombinedBar(text) {
  if (!_combinedCtl) {
    const Control = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const box = L.DomUtil.create('div', 'course-focus-bar on');
        box.id = 'combinedRouteBar';
        const title = L.DomUtil.create('span', 'course-focus-name', box);
        title.setAttribute('role', 'status');
        [
          [
            '구간',
            function () {
              openCombinedRoutes();
            }
          ],
          ['공유', shareCombinedRoutes],
          ['닫기', clearCombinedRoutes]
        ].forEach(function (item) {
          const b = L.DomUtil.create('button', 'course-focus-off', box);
          b.type = 'button';
          b.textContent = item[0];
          b.onclick = item[1];
        });
        L.DomEvent.disableClickPropagation(box);
        L.DomEvent.disableScrollPropagation(box);
        return box;
      }
    });
    _combinedCtl = new Control();
    map.addControl(_combinedCtl);
  }
  const bar = document.getElementById('combinedRouteBar');
  bar.querySelector('span').textContent = text;
  bar.classList.add('on');
}
async function showCombinedRoutes() {
  const refs = combinedRouteRefs();
  if (!refs.length) {
    if (new URLSearchParams(location.search).has('routes'))
      _showCombinedBar('공유 주소를 확인해 주세요');
    return;
  }
  const seq = ++_combinedSeq;
  _combinedRouteLayer.clearLayers();
  _combinedRecords = [];
  _combinedErrors = [];
  _showCombinedBar('전체 코스 불러오는 중…');
  _applyCourseFocus();
  Object.values(_obstacles)
    .filter(function (o) {
      return o.type === '육로' && isCombinedTrail(o.id);
    })
    .forEach(function (o) {
      walkingTrailLayer.removeLayer(o._m);
    });
  try {
    const prerequisites = [];
    if (
      refs.some(function (ref) {
        return ref.startsWith('trail:');
      })
    )
      prerequisites.push(loadObstacles(false));
    if (
      refs.some(function (ref) {
        return /^course:(?!k)/.test(ref);
      })
    ) {
      prerequisites.push(
        fetch(courseReadUrl('/course?over=1'))
          .then(function (r) {
            if (!r.ok) throw new Error();
            return r.json();
          })
          .then(function (over) {
            Object.assign(_courseOver, over);
          })
      );
      prerequisites.push(
        fetch(courseReadUrl('/course?hidden=1'))
          .then(function (r) {
            if (!r.ok) throw new Error();
            return r.json();
          })
          .then(function (ids) {
            ids.forEach(function (id) {
              _hiddenStaticCids.add(String(id));
            });
          })
      );
    }
    await Promise.all(prerequisites);
    const result = await Promise.allSettled(refs.map(_resolveCombinedRef));
    if (seq !== _combinedSeq) return;
    _combinedRecords = [];
    _combinedErrors = [];
    result.forEach(function (item, index) {
      if (item.status === 'fulfilled') _combinedRecords.push(item.value);
      else _combinedErrors.push(refs[index]);
    });
    _combinedRouteLayer.clearLayers();
    _combinedRecords.forEach(function (record, index) {
      L.geoJSON(record.geometry, {
        pane: 'combinedRoutePane',
        interactive: false,
        style: { color: '#fff', weight: 8, opacity: 0.9 }
      }).addTo(_combinedRouteLayer);
      const line = L.geoJSON(record.geometry, {
        pane: 'combinedRoutePane',
        style: {
          color: record.color,
          weight: 5,
          opacity: 1,
          dashArray: record.kind === '육로' ? '8 6' : null
        }
      }).addTo(_combinedRouteLayer);
      line.bindTooltip(pmEsc(_combinedLabel(record, index)), { sticky: true });
      line.bindPopup(_combinedPopupHtml, { maxWidth: 290 });
      if (record.kind === '물길')
        courseDirectionLayer(
          record.geometry.coordinates.map(function (p) {
            return [p[1], p[0]];
          })
        ).addTo(_combinedRouteLayer);
    });
    const waterRoutes = _combinedRecords
      .filter(function (r) {
        return r.kind === '물길';
      })
      .map(function (r) {
        return {
          id: r.ref,
          color: r.color,
          coords: r.geometry.coordinates.map(function (p) {
            return [p[1], p[0]];
          })
        };
      });
    (typeof _courseOverlapRuns === 'function' ? _courseOverlapRuns(waterRoutes) : []).forEach(
      function (run) {
        const unit = 13,
          pattern = unit + ' ' + unit * (run.colors.length - 1);
        run.colors.forEach(function (color, index) {
          L.polyline(run.coords, {
            renderer: _combinedStripeRenderer,
            color: color,
            weight: 5.5,
            opacity: 1,
            dashArray: pattern,
            dashOffset: String(-unit * index),
            lineCap: 'butt',
            interactive: false
          }).addTo(_combinedRouteLayer);
        });
      }
    );
    const total = _combinedRecords.reduce(function (sum, r) {
      return sum + r.km;
    }, 0);
    _showCombinedBar(
      (_combinedErrors.length ? _combinedRecords.length + '/' + refs.length : refs.length) +
        '구간 · ' +
        total.toFixed(2) +
        ' km'
    );
    const bounds = L.latLngBounds([]);
    _combinedRecords.forEach(function (record) {
      bounds.extend(L.geoJSON(record.geometry).getBounds());
    });
    if (bounds.isValid()) {
      const mobile = map.getSize().x < 600;
      map.fitBounds(bounds, {
        paddingTopLeft: [24, mobile ? 230 : 80],
        paddingBottomRight: [24, 100],
        maxZoom: 16,
        animate: false
      });
      if (
        _combinedRecords.some(function (r) {
          return r.ref.startsWith('course:');
        })
      )
        hideGate();
    }
    _applyCourseFocus();
  } catch (e) {
    if (seq === _combinedSeq) _showCombinedBar('코스를 불러오지 못했습니다');
  }
}
function clearCombinedRoutes() {
  ++_combinedSeq;
  _combinedRouteLayer.clearLayers();
  _courseFocusId = '';
  _courseFocusFound = false;
  _activeWalkingTrailId = '';
  _combinedRecords = [];
  _combinedErrors = [];
  const u = new URL(location.href);
  u.searchParams.delete('routes');
  history.replaceState(null, '', u.pathname + u.search + u.hash);
  const bar = document.getElementById('combinedRouteBar');
  if (bar) bar.classList.remove('on');
  Object.values(_obstacles)
    .filter(function (o) {
      return o.type === '육로';
    })
    .forEach(function (o) {
      renderObstacle(Object.assign({}, o));
    });
  _applyCourseFocus();
}
function shareCombinedRoutes() {
  const refs = combinedRouteRefs();
  if (!refs.length) return;
  const url = combinedRouteUrl(refs);
  if (navigator.share)
    navigator.share({ title: '카누맵 전체 코스', url: url }).catch(function (e) {
      if (e.name !== 'AbortError') prompt('전체 코스 URL 복사', url);
    });
  else if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard
      .writeText(url)
      .then(function () {
        _obToast('전체 코스 URL을 복사했습니다');
      })
      .catch(function () {
        prompt('전체 코스 URL 복사', url);
      });
  else prompt('전체 코스 URL 복사', url);
}
function _combinedChoices() {
  const choices = new Map();
  COURSES.features.forEach(function (f) {
    const id = String(f.properties.cid);
    if (!_hiddenStaticCids.has(id)) choices.set('course:' + id, f.properties.name || '코스');
  });
  Object.values(_kvCourses).forEach(function (c) {
    choices.set('course:k' + c.id, c.name || '코스');
  });
  Object.values(_obstacles)
    .filter(function (o) {
      return o.type === '육로' && !o.del;
    })
    .forEach(function (o) {
      choices.set(_combinedTrailRef(o.id), o.name || '육로');
    });
  _combinedNameCache.forEach(function (name, ref) {
    choices.set(ref, name);
  });
  _combinedRecords.forEach(function (r) {
    choices.set(r.ref, r.name);
  });
  return choices;
}
function _renderCombinedDraft() {
  const list = document.getElementById('combinedSelected'),
    choices = _combinedChoices();
  list.replaceChildren();
  _combinedDraft.forEach(function (ref, index) {
    const row = document.createElement('div');
    row.className = 'combined-row';
    const name = document.createElement('span');
    name.textContent =
      index +
      1 +
      '. ' +
      (ref.startsWith('trail:') ? '육로 · ' : '코스 · ') +
      (choices.get(ref) || (ref.startsWith('trail:') ? '공유 육로' : '공유 코스'));
    row.appendChild(name);
    [
      [
        '↑',
        '앞으로',
        index === 0,
        function () {
          [_combinedDraft[index - 1], _combinedDraft[index]] = [
            _combinedDraft[index],
            _combinedDraft[index - 1]
          ];
        }
      ],
      [
        '↓',
        '뒤로',
        index === _combinedDraft.length - 1,
        function () {
          [_combinedDraft[index + 1], _combinedDraft[index]] = [
            _combinedDraft[index],
            _combinedDraft[index + 1]
          ];
        }
      ],
      [
        '×',
        '제거',
        false,
        function () {
          _combinedDraft.splice(index, 1);
        }
      ]
    ].forEach(function (item) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item[0];
      b.setAttribute('aria-label', item[1] + ' ' + (index + 1) + '번 구간');
      b.disabled = item[2];
      b.onclick = function () {
        item[3]();
        _renderCombinedDraft();
      };
      row.appendChild(b);
    });
    list.appendChild(row);
  });
  const select = document.getElementById('combinedChoice');
  select.replaceChildren(new Option('추가할 코스·육로 선택', ''));
  choices.forEach(function (name, ref) {
    if (!_combinedDraft.includes(ref))
      select.add(new Option((ref.startsWith('trail:') ? '육로 · ' : '코스 · ') + name, ref));
  });
  document.getElementById('combinedShow').disabled = _combinedDraft.length < 2;
}
function addCombinedRef(ref) {
  const clean = normalizeCombinedRef(ref);
  if (clean && !_combinedDraft.includes(clean)) _combinedDraft.push(clean);
  _renderCombinedDraft();
}
async function addCombinedUrl() {
  const input = document.getElementById('combinedUrl'),
    msg = document.getElementById('combinedMsg');
  try {
    const match = input.value.trim().match(/https?:\/\/[\x21-\x7e]+/i);
    if (!match) throw new Error();
    const u = new URL(match[0]),
      refs = [];
    if (
      !['canoe.crowdbase.kr', 'mycanoe-map.kohoon0140.workers.dev'].includes(u.hostname) ||
      !['http:', 'https:'].includes(u.protocol)
    )
      throw new Error();
    const path = u.pathname.match(/^\/c\/([a-zA-Z0-9_-]+)\/?$/),
      course = u.searchParams.get('course'),
      trail = u.searchParams.get('trail');
    if (path || course) refs.push('course:' + (path ? path[1] : course));
    if (trail) refs.push('trail:' + trail.replace(/^trail:/, ''));
    if (u.searchParams.get('routes')) refs.push(...u.searchParams.get('routes').split(','));
    if (
      !refs.length ||
      refs.some(function (ref) {
        return !normalizeCombinedRef(ref);
      })
    )
      throw new Error();
    refs.forEach(addCombinedRef);
    input.value = '';
    msg.textContent = '구간을 확인하는 중…';
    const button = document.getElementById('combinedAdd');
    button.disabled = true;
    try {
      if (
        refs.some(function (ref) {
          return ref.startsWith('trail:');
        })
      )
        await loadObstacles(false);
      const result = await Promise.allSettled(refs.map(_resolveCombinedRef));
      result.forEach(function (item) {
        if (item.status === 'fulfilled') _combinedNameCache.set(item.value.ref, item.value.name);
      });
      _renderCombinedDraft();
      msg.textContent = result.some(function (item) {
        return item.status === 'rejected';
      })
        ? '일부 구간을 확인하지 못했습니다.'
        : '';
    } finally {
      button.disabled = false;
    }
  } catch (e) {
    msg.textContent = '카누맵 코스·육로 공유 URL을 확인해 주세요.';
  }
}
function openCombinedRoutes(seed) {
  closePlaceModal();
  map.closePopup();
  let modal = document.getElementById('combinedRoutesModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'combinedRoutesModal';
    modal.className = 'pmodal-wrap';
    modal.innerHTML =
      '<div class="pmodal-bg"></div><div class="pmodal" role="dialog" aria-modal="true" aria-labelledby="combinedTitle"><button type="button" class="pmodal-x" aria-label="코스 묶기 닫기">×</button><h3 id="combinedTitle">코스 묶기</h3><div id="combinedSelected"></div><label class="sg-label" for="combinedChoice">코스·육로 추가</label><select id="combinedChoice"></select><label class="sg-label" for="combinedUrl">공유 URL로 추가</label><div class="combined-input"><input id="combinedUrl" type="url" placeholder="카누맵 공유 URL"><button type="button" id="combinedAdd">추가</button></div><div id="combinedMsg" role="status"></div><button type="button" class="sg-submit" id="combinedShow">전체 코스 표시</button></div>';
    document.body.appendChild(modal);
    modal.querySelector('.pmodal-bg').onclick = modal.querySelector('.pmodal-x').onclick =
      function () {
        modal.classList.remove('open');
      };
    document.getElementById('combinedChoice').onchange = function () {
      addCombinedRef(this.value);
    };
    document.getElementById('combinedAdd').onclick = addCombinedUrl;
    document.getElementById('combinedShow').onclick = function () {
      const u = new URL(combinedRouteViewUrl(_combinedDraft));
      history.pushState(null, '', u.pathname + u.search);
      modal.classList.remove('open');
      showCombinedRoutes();
    };
  }
  _combinedDraft = combinedRouteRefs();
  if (seed && !_combinedDraft.includes(seed)) _combinedDraft.push(seed);
  _renderCombinedDraft();
  modal.classList.add('open');
}
document.addEventListener('keydown', function (e) {
  const modal = document.getElementById('combinedRoutesModal');
  if (e.key === 'Escape' && modal && modal.classList.contains('open'))
    modal.classList.remove('open');
});
window.addEventListener('popstate', function () {
  if (combinedRouteRefs().length) showCombinedRoutes();
  else {
    clearCombinedRoutes();
    focusCourseFromUrl();
    _trailUrlFocused = false;
    _focusWalkingTrailFromUrl();
  }
});
setTimeout(showCombinedRoutes, 0);
