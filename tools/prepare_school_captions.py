#!/usr/bin/env python3
"""Restore English sentence boundaries without changing words or their times.
uv run --python 3.12 --with torch --with 'transformers<5' --with deepmultilingualpunctuation python tools/prepare_school_captions.py SOURCE_DIR
"""
import json,re,sys
from pathlib import Path
import torch
from deepmultilingualpunctuation import PunctuationModel
from build_school_subtitles import source_words
root=Path(sys.argv[1]);model=PunctuationModel()
if torch.backends.mps.is_available():
    model.pipe.model.to('mps');model.pipe.device=torch.device('mps')
for meta in sorted(root.glob('*.info.json')):
    info=json.loads(meta.read_text());id=info['id'];out=root/(id+'.en-punct.json3')
    if out.exists():continue
    source=next((root/(id+s) for s in ['.en-orig.json3','.en.json3'] if (root/(id+s)).exists()),None)
    if not source:continue
    words=source_words(json.loads(source.read_text()),info['duration']);prepared=[]
    for start in range(0,len(words),120):
        batch=words[start:start+120];plain=[re.sub(r'(?<!\d)[.,;:!?](?!\d)','',w) or w for _,w in batch]
        tagged=model.predict(plain)
        for (at,original),(word,label,score) in zip(batch,tagged):
            # Classifier adds punctuation only; it never rewrites the source words.
            punctuation=label if label in ['.',',','?',':'] and score>.6 else ''
            if re.search(r'[.!?]$',original):word=original;punctuation=''
            prepared.append([at,word+punctuation])
    out.write_text(json.dumps({'timedWords':prepared,'sourceCaption':source.name,'punctuationModel':'oliverguhr/fullstop-punctuation-multilang-large'}))
    print('Prepared',id,len(words),'words',flush=True)
