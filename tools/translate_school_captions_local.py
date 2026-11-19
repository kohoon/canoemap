#!/usr/bin/env python3
"""Translate sentence-aligned public tutorial captions locally on Apple Silicon.
uv run --python 3.12 --with mlx-lm python tools/translate_school_captions_local.py SOURCE_DIR OUTPUT_DIR
"""
import hashlib,json,re,sys,time
import mlx.core as mx
from pathlib import Path
from mlx_lm import load,batch_generate,generate
from mlx_lm.sample_utils import make_sampler
from build_school_subtitles import source_cues,terminology,clean,split_cue
MODEL='mlx-community/Qwen3-8B-4bit'
SYSTEM='''카누 강습 영상의 영어 자막을 자연스럽고 정확한 한국어로 번역하세요. 입력 문장에 있는 내용만 번역하고 설명, 해설, 예시, 추측을 추가하지 마세요. 부정문, 좌우 방향, 신체 부위, 안전 주의사항을 반드시 그대로 보존하세요. 원문에 이미 한국어로 적힌 카누 전문 용어는 바꾸지 마세요. 문장이 불완전하면 없는 내용을 완성하지 말고 있는 부분만 번역하세요. 번역문만 출력하세요.'''
root=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
model,tok=load(MODEL)
if hasattr(mx,'set_cache_limit'):mx.set_cache_limit(512*1024*1024)
sampler=make_sampler(temp=0);print('Local translation model loaded',flush=True)

def translate(cue):
    return tok.apply_chat_template([{'role':'system','content':SYSTEM},{'role':'user','content':cue}],tokenize=True,add_generation_prompt=True,enable_thinking=False)


while True:
    metas=[]
    for path in sorted(root.glob('*.info.json'),key=lambda p:(p.stem!='kXY4x4lwUcw.info',p.name)):
        info=json.loads(path.read_text());id=info['id']
        if (info.get('language') or '').startswith('ko') or any(k=='ko' or k.startswith('ko-') for k in info.get('subtitles',{})):continue
        if any((root/(id+s)).exists() for s in ['.en-orig.json3','.en.json3']):metas.append(info)
    done=0;waiting=0
    for info in metas:
        id=info['id'];out=output/(id+'.ko.json');source=root/(id+'.en-punct.json3')
        if out.exists():done+=1;continue
        if not source.exists():waiting+=1;continue
        cues=source_cues(json.loads(source.read_text()),info['duration']);cache=root/'translation'/(id+'.sentence-8b.json');previous=json.loads(cache.read_text()) if cache.exists() else {}
        pending=[c for c in cues if c['source'] not in previous]
        for start in range(0,len(pending),24):
            batch=pending[start:start+24];inputs=[terminology(c['source'],info['title']) for c in batch]
            response=batch_generate(model,tok,[translate(s) for s in inputs],max_tokens=220,sampler=sampler,completion_batch_size=24,prefill_batch_size=8,verbose=True)
            for cue,processed,result in zip(batch,inputs,response.texts):
                text=clean(result)
                if not re.search('[가-힣]',text):
                    if re.search(r'\[music\]',cue['source'],re.I):text='[음악]'
                    else:
                        prompt=tok.apply_chat_template([{'role':'system','content':SYSTEM},{'role':'user','content':'한국어로 번역: '+processed}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
                        text=clean(generate(model,tok,prompt=prompt,max_tokens=220,sampler=sampler))
                if not text or len(text)>600:raise ValueError(id+' invalid subtitle: '+repr(text[:80]))
                previous[cue['source']]=text
            cache.write_text(json.dumps(previous,ensure_ascii=False,indent=2));print(id,min(start+24,len(pending)),'/',len(pending),flush=True)
        final=[]
        for cue in cues:final.extend(split_cue(cue,previous[cue['source']]))
        track={'videoId':id,'language':'ko','sourceLanguage':'en','kind':'machine-translation','sourceUrl':'https://www.youtube.com/watch?v='+id,'sourceCaptionSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'translationModel':MODEL,'reviewStatus':'automatic','cues':final}
        temp=out.with_suffix('.tmp');temp.write_text(json.dumps(track,ensure_ascii=False,separators=(',',':'))+'\n');temp.replace(out);done+=1;print('Completed',id,len(final),'cues',flush=True)
    if metas and done==len(metas):break
    print('Waiting for sentence boundaries:',waiting,'finished:',done,'of',len(metas),flush=True);time.sleep(5)
