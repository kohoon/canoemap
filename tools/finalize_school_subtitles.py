#!/usr/bin/env python3
"""Validate complete catalog coverage and publish content-versioned subtitle registry."""
import hashlib,json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];raw=Path(sys.argv[1]);school=root/'paddling';source=(school/'index.html').read_text()
ids=list(dict.fromkeys(re.findall(r'id:"([A-Za-z0-9_-]{11})",author:',source)))
no_speech={'HRr0vb-4Bfk','Bj4jh5y0HpM','0BUAVVQx6po','m4hpBhxCKeE'}
unavailable={'Y5TcU3XqDGg'}
registry={};coverage={}
for id in ids:
    if id=='PQDLADzDI1s':coverage[id]={'status':'native-korean','sourceLanguage':'ko'};continue
    if id in unavailable:coverage[id]={'status':'unavailable','reason':'YouTube reported that the video is not available on 2026-11-19'};continue
    if id in no_speech:
        analysis=json.loads((raw/(id+'.asr.json')).read_text())
        usable=[s for s in analysis['segments'] if s.get('no_speech_prob',0)<.65 and s.get('avg_logprob',0)>-1.0 and s['text'].strip()]
        assert not usable,id
        coverage[id]={'status':'no-narration','verifiedBy':'audio analysis','sourceLanguage':None};continue
    track=school/'subtitles'/(id+'.ko.json');data=json.loads(track.read_text());info=json.loads((raw/(id+'.info.json')).read_text())
    assert data['videoId']==id and data['language']=='ko' and data['cues'],id
    previous=-1
    for cue in data['cues']:
        assert cue['start']>=previous and cue['end']>cue['start'] and cue['end']<=info['duration']+.2,(id,cue)
        assert cue['text'].strip() and len(cue['text'])<=600,(id,cue)
        previous=cue['end']
    version=hashlib.sha256(track.read_bytes()).hexdigest()[:12]
    registry[id]={'version':version,'cueCount':len(data['cues'])}
    coverage[id]={'status':'translated','sourceLanguage':data['sourceLanguage'],'cueCount':len(data['cues']),'version':version,'reviewStatus':data['reviewStatus']}
(school/'subtitle-tracks.js').write_text('window.SCHOOL_SUBTITLE_TRACKS = '+json.dumps(registry,separators=(',',':'))+';\n')
for name in ['subtitle-tracks.js','subtitles.js']:
    version=hashlib.sha256((school/name).read_bytes()).hexdigest()[:12]
    source=re.sub(r'src="\./'+re.escape(name)+r'\?v=[^"]+"', 'src="./'+name+'?v='+version+'"', source)
(school/'index.html').write_text(source)
(school/'subtitles'/'coverage.json').write_text(json.dumps({'checkedOn':'2026-11-19','videos':coverage},ensure_ascii=False,indent=2)+'\n')
print('Published subtitle registry:',len(registry),'tracks;',sum(v['cueCount'] for v in registry.values()),'cues')
