(function (root) {
  'use strict';
  function normalizeCues(data) {
    if (!data || data.language !== 'ko' || !Array.isArray(data.cues)) throw Error('invalid-track');
    let previous = -1;
    return data.cues.map(function (cue) {
      const start = Number(cue.start), end = Number(cue.end), text = String(cue.text || '').trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < previous || end <= start || start < 0 || !text || text.length > 600) throw Error('invalid-cue');
      previous = start;
      return { start: start, end: end, text: text };
    });
  }
  function cueAt(cues, seconds) {
    if (!Number.isFinite(seconds)) return '';
    let left = 0, right = cues.length - 1, candidate = -1;
    while (left <= right) {
      const mid = (left + right) >>> 1;
      if (cues[mid].start <= seconds) { candidate = mid; left = mid + 1; }
      else right = mid - 1;
    }
    return candidate >= 0 && seconds < cues[candidate].end ? cues[candidate].text : '';
  }
  let apiPromise;
  function youtubeAPI() {
    if (root.YT && root.YT.Player) return Promise.resolve(root.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      let settled = false;
      const old = root.onYouTubeIframeAPIReady;
      const timer = root.setTimeout(function () { if (!settled) { settled = true; apiPromise = null; reject(Error('player-timeout')); } }, 12000);
      root.onYouTubeIframeAPIReady = function () {
        if (typeof old === 'function') old();
        if (!settled) { settled = true; root.clearTimeout(timer); resolve(root.YT); }
      };
      if (!root.document.querySelector('script[data-school-youtube-api]')) {
        const script = root.document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.schoolYoutubeApi = '1';
        script.onerror = function () { if (!settled) { settled = true; root.clearTimeout(timer); apiPromise = null; script.remove(); reject(Error('player-unavailable')); } };
        root.document.head.appendChild(script);
      }
    });
    return apiPromise;
  }
  function hasTrack(id) { return !!((root.SCHOOL_SUBTITLE_TRACKS || {})[id]); }
  function attach(iframe, id, box, textNode) {
    const entry = (root.SCHOOL_SUBTITLE_TRACKS || {})[id];
    if (!entry) { box.hidden = true; return function () {}; }
    let stopped = false, player = null, interval = null, cues = [], last = null;
    const dialog=iframe.parentElement&&iframe.parentElement.parentElement;
    const fullscreen=box.querySelector?box.querySelector('[data-caption-fullscreen]'):null;
    if(fullscreen){fullscreen.hidden=!(dialog&&(dialog.requestFullscreen||dialog.webkitRequestFullscreen));fullscreen.onclick=function(){const enter=dialog.requestFullscreen||dialog.webkitRequestFullscreen;try{const result=enter.call(dialog);if(result&&result.catch)result.catch(function(){});}catch(error){}};}
    const abort = new AbortController();
    box.hidden = false;
    textNode.textContent = '한국어 자막을 불러오는 중…';
    function update() {
      if (stopped || !player || typeof player.getCurrentTime !== 'function') return;
      const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : 1;
      const text = state === 0 ? '' : cueAt(cues, player.getCurrentTime());
      if (text !== last) { textNode.textContent = text || '\u00a0'; last = text; }
    }
    const trackTimeout=root.setTimeout(function(){abort.abort();},12000);
    const track = fetch('./subtitles/' + encodeURIComponent(id) + '.ko.json?v=' + encodeURIComponent(entry.version), {signal:abort.signal})
      .then(function (response) { if (!response.ok) throw Error('track-unavailable'); return response.json(); })
      .then(function (data) { if (data.videoId !== id) throw Error('wrong-video'); return normalizeCues(data); }).finally(function(){root.clearTimeout(trackTimeout);});
    Promise.all([track, youtubeAPI()]).then(function (values) {
      if (stopped) return;
      cues = values[0]; textNode.textContent = '\u00a0';
      player = new values[1].Player(iframe, {events:{
        onReady:function (event) { if (stopped) return; player = event.target; update(); interval = root.setInterval(update, 120); },
        onStateChange:update,
        onPlaybackRateChange:update,
        onError:function () { if (!stopped) { textNode.textContent = '영상을 재생할 수 없습니다.'; root.clearInterval(interval); } }
      }});
    }).catch(function () { if (!stopped) textNode.textContent = '한국어 자막을 불러오지 못했습니다. 영상을 다시 열어 주세요.'; });
    return function () {
      stopped = true; abort.abort(); root.clearTimeout(trackTimeout); root.clearInterval(interval);
      if(fullscreen)fullscreen.onclick=null;
      if(root.document&&root.document.fullscreenElement===dialog&&root.document.exitFullscreen)root.document.exitFullscreen().catch(function(){});
      if (player && typeof player.destroy === 'function') player.destroy();
      player = null; box.hidden = true; textNode.textContent = '';
    };
  }
  root.schoolSubtitles = { normalizeCues:normalizeCues, cueAt:cueAt, hasTrack:hasTrack, attach:attach };
})(typeof window !== 'undefined' ? window : globalThis);
