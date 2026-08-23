/*!
 * DAP 문제은행 매니페스트
 * encoding: UTF-8 (BOM 없음)
 *
 * 문제은행을 나중에 추가하려면
 *   1) data/ 폴더에 새 팩 파일을 만든다.  예) data/4.데이터모델링.extra1.js
 *   2) 파일 안에서 DAP_BANK.add({ chapter:4, pack:"extra1", questions:[...] }) 를 호출한다.
 *   3) 아래 files 배열에 파일명을 추가한다.
 *   4) index.html 을 새로고침하면 해당 과목 문항 수가 자동으로 늘어난다.
 *
 * 주의
 *   - 문항 id 는 전체 은행에서 유일해야 한다. 중복되면 나중에 읽힌 문항이 무시된다.
 *     새 팩은 접두사를 다르게 두는 것을 권장한다. 예) "C4X-001"
 *   - 모든 파일은 UTF-8(BOM 없음)로 저장한다. 그래야 한글이 깨지지 않는다.
 */
window.DAP_MANIFEST = {
  /* 시험 배점 규칙 — 모의고사 1세트(75문항 / 60점) 구성 */
  exam: { perQuestion: 0.8, totalQuestions: 75, totalScore: 60 },

  /* 과목 정의. perSet = 모의고사 1세트에 출제되는 문항 수, score = 그 배점 */
  chapters: [
    { id: 1, name: "전사아키텍처 이해",      perSet: 10, score: 8.0 },
    { id: 2, name: "데이터 요건 분석",        perSet: 10, score: 8.0 },
    { id: 3, name: "데이터 표준화",           perSet: 10, score: 8.0 },
    { id: 4, name: "데이터 모델링",           perSet: 25, score: 20.0 },
    { id: 5, name: "데이터베이스 설계와 이용", perSet: 10, score: 8.0 },
    { id: 6, name: "데이터 품질 관리 이해",    perSet: 10, score: 8.0 }
  ],

  /* 읽어들일 문제은행 팩 파일 목록 (data/ 기준 상대 경로, 나열 순서대로 로딩) */
  files: [
    "1.전사아키텍처이해.core.js",
    "2.데이터요건분석.core.js",
    "3.데이터표준화.core.js",
    "4.데이터모델링.core.js",
    "5.데이터베이스설계와이용.core.js",
    "6.데이터품질관리이해.core.js"
  ]
};
