#!/usr/bin/env python3
"""Shared caption timing and glossary utilities for the school subtitle builders.
Original captions and raw audio stay in ignored output/; published files contain Korean tracks.
"""
import html
import json
import re



def source_words(data, duration):
    events = [e for e in data.get('events', []) if any(s.get('utf8', '').strip() for s in e.get('segs', []))]
    words = []
    for i, event in enumerate(events):
        start = event['tStartMs'] / 1000
        end = min(start + event.get('dDurationMs', 3000) / 1000, events[i+1]['tStartMs']/1000 if i+1 < len(events) else duration)
        end = max(start + .1, min(end, duration))
        segments = event.get('segs', [])
        for j, segment in enumerate(segments):
            text = re.sub(r'<[^>]+>', '', html.unescape(segment.get('utf8', ''))).strip()
            if not text:
                continue
            pieces = re.findall(r'\[[^\]]+\]|\S+', text)
            at = start + segment.get('tOffsetMs', 0) / 1000
            until = min(end, start + segments[j+1].get('tOffsetMs', 0)/1000) if j+1 < len(segments) else end
            until = max(at + .05, until)
            for k, word in enumerate(pieces):
                words.append((at + (until-at)*k/len(pieces), word))
    return words


def source_cues(data, duration):
    words = data.get("timedWords") or source_words(data,duration)
    cues, group = [], []
    def flush(end):
        if group:
            cues.append({'start':round(group[0][0],3), 'end':round(max(group[0][0]+.1,end),3),'source':' '.join(w for _,w in group)})
            group.clear()
    for at, word in words:
        if group and (at-group[-1][0] > 1.8 or at-group[0][0] > 16 or len(group)>=64):
            flush(min(at, group[-1][0]+1.8))
        group.append((at,word))
        if re.search(r'[.!?]$',word) and len(group)>=3:
            # The next word caps this provisional end in the final pass.
            flush(min(duration,at+1.2))
    if group:
        flush(min(duration,group[-1][0]+2))
    for i, cue in enumerate(cues[:-1]):
        cue['end'] = max(cue['start']+.01,min(cue['end'],cues[i+1]['start']))
    return cues


def clean(text):
    text = re.sub(r'^\s*(?:번역|한국어(?: 번역)?|자막)\s*[:：]\s*','',text).strip().strip('"')
    text = text.replace('캐노잉','카누잉').replace('카노잉','카누잉').replace('캐누','카누').replace('로드 레이스','로우 브레이스').replace('낮은 브레이스','로우 브레이스').replace('펜던트 축','패들 샤프트')
    return text


TERMS = {
    'load race':'low brace', 'low grace':'low brace',
    'forward stroke':'전진 스트로크', 'back stroke':'백 스트로크',
    'canadian stroke':'캐나디언 스트로크', 'indian stroke':'인디언 스트로크',
    'sculling draw':'스컬링 드로우', 'sculling pry':'스컬링 프라이',
    'cross draw':'크로스 드로우', 'low brace':'로우 브레이스', 'high brace':'하이 브레이스',
    'righting pry':'라이팅 프라이', 'stern pry':'선미 프라이', 'bow pry':'보우 프라이',
    'j-stroke':'J 스트로크', 'j stroke':'J 스트로크', 'c-stroke':'C 스트로크', 'c stroke':'C 스트로크',
    'white water':'급류', 'flat water':'평수', 'draw strokes':'드로우 스트로크', 'draw stroke':'드로우 스트로크', 'hanging draw':'행잉 드로우', 't-grip':'T 그립', 'choke grip':'초크 그립', 'power face':'파워 페이스', 'whitewater':'급류', 'gunwales':'거널', 'gunwale':'거널', 'canoeing':'카누잉',
    'canoes':'카누', 'canoe':'카누', 'paddle shaft':'패들 샤프트', 'paddle blade':'패들 블레이드',
    'paddles':'패들', 'paddle':'패들', 'torso':'몸통', 'elbow':'팔꿈치',
    'stroke':'스트로크', 'pry':'프라이', 'sculling':'스컬링', 'offside':'패들 반대쪽',
    'onside':'패들 쪽', 'eddy':'에디', 'ferry':'페리'
}


def terminology(text, title):
    # Resolve obvious ASR sound-alikes only where the lesson names that technique.
    if 'pry' in title.lower():text=re.sub(r'\bprize?\b','pry',text,flags=re.I)
    if 'hold' in title.lower() and 'paddle' in title.lower():text=re.sub(r'\bnew canoes\b','beginner canoeists',text,flags=re.I)
    for term,replacement in TERMS.items():
        text=re.sub(r'\b'+re.escape(term)+r'\b',replacement,text,flags=re.I)
    return text



def split_cue(cue,text):
    chunks=[];part=''
    for word in text.split():
        if part and len(part)+len(word)>90:chunks.append(part);part=''
        part+=((' ' if part else '')+word)
    if part:chunks.append(part)
    total=sum(map(len,chunks));start=cue['start'];result=[]
    for i,part in enumerate(chunks):
        end=cue['end'] if i==len(chunks)-1 else start+(cue['end']-cue['start'])*len(part)/total
        result.append({'start':round(start,3),'end':round(end,3),'text':part});start=end
    return result

