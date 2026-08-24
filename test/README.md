# 점검 스크립트

빌드 도구도 테스트 프레임워크도 없다. node만 있으면 돌아간다.

```bash
node test/run.js            # 전부
node test/sync.js           # 하나만 (아래 목록 참고)
node test/pack-format.js 3  # 과목 3 팩만
```

**요점은 재구현하지 않는 것이다.** 각 스크립트는 `index.html`에서 함수 원문을
정규식으로 꺼내 `vm`에 넣고 돌린다. 앱이 실제로 쓰는 코드를 검증하는 것이지,
같은 로직을 다시 짜서 비교하는 것이 아니다. 그래서 `index.html`을 고치면
그대로 회귀 검사가 된다 — 함수 이름이나 시그니처를 바꾸면 "추출 실패"로 멈춘다.

| 파일 | 무엇을 보는가 |
|---|---|
| `syntax.js` | 인라인 스크립트 구문. 편집 중 백슬래시가 사라졌는지도 함께 본다 |
| `bank-build.js` | 과목별 문항 수, 모의고사 세트 수, 문항 id 중복 |
| `pack-format.js` | 보기 4개·정답 인덱스·출처 표기·정답 쏠림·문두 중복 |
| `session-resume.js` | 이어풀기 키 처리, `isSeqKey`, 이전 답 복원 |
| `quiz-answer-target.js` | 답이 화면에 있는 문항에 기록되는가 |
| `wipe.js` | 전체 초기화가 로컬과 Gist를 모두 비우는가 |
| `epoch.js` | 초기화가 다른 기기로 전파되는가 |
| `sync-two-devices.js` | PC·폰 왕복. 평상시 `pull`/`push`, 삭제 전파 |
| `sync-overwrite.js` | 같은 판에서 동시에 올려 덮였을 때 감지·복구 |
| `sync-upload-window.js` | 올리는 도중에 푼 문항이 유실되지 않는가 |
| `sync-read-window.js` | 받아오는 도중에 푼 문항이 `pull`로 지워지지 않는가 |

## 통과가 아니라 "확인 요망"으로 나오는 것

`pack-format.js`는 두 가지를 세어서 알리기만 한다. 규칙으로 못 박으면 정당한
예외까지 막기 때문이다.

- **s 표기가 관례와 다른 문항** — 2013 Edition 표기나 practice 팩의 "과목 추정"은
  정당하다. 새로 쓰는 `*.extra.js` 팩만 `N장 M절 …`을 강제한다
- **해설이 자기 정답 번호를 짚는 문항** — 부정형 문항이나 보기 넷을 모두 설명하는
  해설에서는 정상이다. 다만 **보기 순서를 바꾼 뒤에는 반드시 이 목록을 확인해야 한다.**
  실제로 과목2 작업에서 순서를 재배치했다가 해설이 어긋난 것을 여기서 잡았다

## 원천 자료 추출

`tools/hwpx-text.js` — HWPX에서 본문을 뽑는다. `unzip` 없이 node만 쓴다.

```bash
node tools/hwpx-text.js "data_source/III. 데이터 표준화.hwpx" /tmp/ch3.txt
```
