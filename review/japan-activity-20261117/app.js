'use strict';
(() => {
  const data = window.JAPAN_ACTIVITY_DATA;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const mapUrl = id => `../japan-launch-20261117/#site=${id}`;
  const counts = data.counts;
  $('counts').textContent = `${counts.places}곳 · 활동 기록 ${counts.sources}건 — YouTube ${counts.platforms.YouTube} · Instagram ${counts.platforms.Instagram} · 웹 ${counts.platforms['웹']} / 기존 목록 연계 ${counts.existing_linked_places}곳 · 추가 장소 ${counts.additional_places}곳`;
  for (const id of ['verification-note','permission-note','facebook-note']) {
    $(id).textContent = data[id.replaceAll('-','_')];
  }
  const regionNames = ['홋카이도','도호쿠','간토','고신·호쿠리쿠','도카이','긴키','주고쿠','시코쿠','규슈','오키나와'];
  for (const name of regionNames) $('region').add(new Option(name,name));
  function renderSource(source) {
    const links = [`<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.platform)} 원문 ↗</a>`];
    if (source.mirror_url) links.push(`<a href="${escapeHtml(source.mirror_url)}" target="_blank" rel="noopener noreferrer">재게시 대조 자료 ↗</a>`);
    if (source.supporting_url) links.push(`<a href="${escapeHtml(source.supporting_url)}" target="_blank" rel="noopener noreferrer">단체 활동 안내 ↗</a>`);
    return `<article class="record">
      <h3>${escapeHtml(source.author || source.platform)}</h3>
      <p class="evidence">${escapeHtml(source.evidence)}</p>
      <p>활동 ${escapeHtml(source.activity_date || '일시 미상')}<br>게시 ${escapeHtml(source.published_date || '일시 미상')}</p>
      <p>${escapeHtml(source.verification)}</p>
      <div class="links">${links.join('')}</div>
    </article>`;
  }
  function render() {
    const query = $('query').value.trim().toLocaleLowerCase();
    const region = $('region').value;
    const platform = $('platform').value;
    const coverage = $('coverage').value;
    const matches = data.places.filter(place => {
      if (region && place.region !== region) return false;
      if (coverage === 'new' && place.existing_id) return false;
      if (coverage === 'linked' && !place.existing_id) return false;
      if (platform && !place.sources.some(source => source.platform === platform)) return false;
      const text = [place.place,place.region,place.prefecture,...place.sources.map(source => `${source.author} ${source.evidence}`)].join(' ').toLocaleLowerCase();
      return !query || text.includes(query);
    });
    $('result-count').textContent = `${matches.length} / ${data.places.length}곳`;
    $('empty').hidden = matches.length > 0;
    $('results').innerHTML = matches.map(place => {
      const sources = place.sources.filter(source => !platform || source.platform === platform);
      const media = [...new Set(sources.map(source => source.platform))];
      return `<tr>
        <td><button type="button" class="place-button" data-place="${place.key}" aria-expanded="false" aria-controls="detail-${place.key}">${escapeHtml(place.place)}</button></td>
        <td>${escapeHtml(place.region)}<span class="meta">${escapeHtml(place.prefecture)}</span></td>
        <td>${escapeHtml(place.water_type)}</td>
        <td><div class="tags">${media.map(name => `<span class="tag">${escapeHtml(name)}</span>`).join('')}</div><span class="meta">${sources.length}건 · 눌러서 보기</span></td>
        <td>${place.existing_id ? `<a href="${mapUrl(place.existing_id)}" target="_blank" rel="noopener noreferrer">기존 수역 #${place.existing_id} ↗</a>` : '<span class="meta">추가 수집 장소</span>'}</td>
      </tr>
      <tr class="detail-row" id="detail-${place.key}" hidden><td colspan="5"><div class="record-grid">${sources.map(renderSource).join('')}</div></td></tr>`;
    }).join('');
  }
  $('results').addEventListener('click', event => {
    const button = event.target.closest('[data-place]');
    if (!button) return;
    const row = $(`detail-${button.dataset.place}`);
    row.hidden = !row.hidden;
    button.setAttribute('aria-expanded', String(!row.hidden));
  });
  for (const id of ['query','region','platform','coverage']) $(id).addEventListener(id === 'query' ? 'input' : 'change',render);
  for (const id of ['pending','supplement']) {
    $(id).innerHTML = data[id].map(source => `<details><summary>${escapeHtml(source.place)} · ${escapeHtml(source.platform)}</summary>${renderSource(source)}</details>`).join('');
  }
  render();
})();
