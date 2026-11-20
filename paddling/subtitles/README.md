# 패들링스쿨 한국어 자막

영상은 YouTube 임베드로 재생하고, 별도 한국어 자막은 영상 아래에 표시한다. 원본 영상이나 오디오는 배포하지 않는다. `coverage.json`은 등록된 모든 영상의 자막 제공 상태를 기록한다.

- `*.ko.json`: 원본 영상의 절대 재생 시간(초)에 대응하는 한국어 자막. 기계 번역이며 검수 여부는 `reviewStatus`에 기록한다.
- `../subtitle-tracks.js`: 자막 내용 해시와 연결된 레지스트리. 자막을 수정하면 반드시 다시 생성한다.
- `../subtitles.js`: YouTube IFrame Player API의 실제 재생 시간을 읽어 자막을 표시한다. 구간 이동, 일시정지, 배속 변경에 벽시계 시간을 사용하지 않는다.
- 기존 한국어 자막이 있는 영상은 YouTube 자막 설정을 유지한다. 음성 설명이 없는 시연과 재생 불가 영상은 별도 상태로 기록한다.

## 재생성

원본 공개 자막(JSON3), 영상 메타데이터 및 확인용 음성 분석은 저장소에서 무시되는 `output/paddling-subtitles/`에 보관한다. 원본 자료 수집 후 다음 순서로 실행한다.

```sh
uv run --python 3.12 --with torch --with 'transformers<5' --with deepmultilingualpunctuation python tools/prepare_school_captions.py output/paddling-subtitles
uv run --python 3.12 --with mlx-lm python tools/translate_school_captions_local.py output/paddling-subtitles paddling/subtitles
python3 tools/finalize_school_subtitles.py output/paddling-subtitles
node tests/test_paddling_subtitles.mjs
node tests/test_paddling_video_start.mjs
python3 -m unittest discover -s tests -p 'test_paddling_caption_data.py'
```

문장부호 복원은 단어와 타임코드를 바꾸지 않는다. 전문 용어를 정규화한 뒤 로컬 번역 모델을 사용한다. 번역 자막을 수정할 때 타임코드의 순서·중복·영상 길이 범위를 검사한다.

## 표현 및 용어 검수

2026-11-20에 번역투, 카누 전문 용어, 번역 지시문 혼입을 점검하고 원문 대조가 필요한 구간을 수정했다. 부분적으로 다듬은 트랙은 `editorialReview`에 범위를 기록하며, 이를 전체 영상 수동 검수를 뜻하는 `reviewStatus: reviewed`로 바꾸지 않는다. 수정한 트랙을 번역 모델로 다시 생성하면 수동 수정 내용이 덮어써지므로 기존 자막을 먼저 비교해야 한다.

- 패들 전체, 샤프트, 블레이드, 그립을 구분한다. 위쪽 손은 그립 손, 샤프트를 잡은 손은 샤프트 손으로 표현한다.
- 선수·선미, 패들 쪽·패들 반대쪽, 상류·하류를 구분한다. 온사이드·오프사이드를 고정된 왼쪽·오른쪽으로 바꾸지 않는다.
- recovery는 회수 동작, sweep은 스윕, sculling draw는 스컬링 드로우, hanging draw는 행잉 드로우로 표기한다. blade와 실제 구조용 knife를 구분한다.
- edge는 문맥에 따라 선체 기울기, 선체 옆면, 블레이드 모서리를 뜻하므로 일괄 치환하지 않는다. hip·knee·wrist도 각각 골반·무릎·손목으로 구분한다.
- 브레이스·전복·구조 설명의 방향과 부정문은 원문을 대조한다. 원문 자동 자막이 불분명하면 음성도 확인한다.
- 표현만 고칠 때 기존 자막 개수와 각 구간의 시작·종료 시각은 유지한다. 수정 후 레지스트리를 다시 생성하고 번역 지시문·깨진 문자 검사와 재생 동기화 테스트를 실행한다.

[YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)의 공개 재생 상태 API를 사용한다. 자막은 플레이어 화면과 컨트롤을 가리지 않으며, 자막을 포함한 전체화면 보기는 플레이어와 자막 영역을 함께 확장한다.
