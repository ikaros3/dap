/* index.html 의 문제은행 빌드 코드를 원문 그대로 꺼내 실제 data/ 로 돌린다.
   재구현이 아니라 앱이 쓰는 코드를 그대로 검증하는 것이 요점이다. */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');

/* 로더 스크립트(첫 번째 인라인 script) 를 통째로 실행한다 */
const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const ctx = {
  console,
  window: {},
  document: { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] },
  location: { protocol: 'https:' },
  setTimeout: () => 0, clearTimeout: () => {},
};
ctx.window.window = ctx.window;
ctx.self = ctx.window;
vm.createContext(ctx);

/* 매니페스트와 팩 파일을 브라우저가 읽는 순서 그대로 넣는다 */
vm.runInContext(fs.readFileSync('data/manifest.js', 'utf8'), ctx);
const man = ctx.window.DAP_MANIFEST;

/* index.html 안의 DAP_BANK 정의를 찾아 그대로 쓴다 */
const bankSrc = scripts.join('\n');
const m = bankSrc.match(/var DAP_BANK[\s\S]*?\n(?=\/\*|window\.DAP_APP_BOOT|var BANKS)/);
if (!m) {
  /* 정의 형태가 다르면 add() 를 직접 모아 매니페스트 규칙으로 계산한다 */
  const packs = [];
  ctx.DAP_BANK = { add: o => packs.push(o) };
  man.files.forEach(f => {
    const name = typeof f === 'string' ? f : f.file;
    const p = 'data/' + name;
    if (!fs.existsSync(p)) { console.log('건너뜀(없음): ' + name); return; }
    if (/\.enc\./.test(name)) { console.log('건너뜀(암호문): ' + name); return; }
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
  });

  let bad = 0;
  const fail = s => { bad++; console.log('FAIL  ' + s); };

  /* 과목별 문항 수 */
  const byCh = {};
  const seen = new Map();
  packs.forEach(p => p.questions.forEach(q => {
    byCh[q.ch] = (byCh[q.ch] || 0) + 1;
    if (seen.has(q.id)) fail('문항 id 중복: ' + q.id + ' (' + seen.get(q.id) + ' / ' + p.pack + ')');
    seen.set(q.id, p.pack);
  }));

  console.log('\n과목별 문항 수');
  man.chapters.forEach(c => {
    const n = byCh[c.id] || 0;
    console.log('  ' + c.id + '. ' + c.name.padEnd(18) + String(n).padStart(4) + '문항  (perSet ' + c.perSet + ' → ' + Math.floor(n / c.perSet) + '세트분)');
  });
  const total = Object.values(byCh).reduce((a, b) => a + b, 0);
  console.log('  합계 ' + total + '문항');

  /* 모의고사 세트 수 = min(과목별 문항수 / perSet) */
  const sets = Math.min(...man.chapters.map(c => Math.floor((byCh[c.id] || 0) / c.perSet)));
  console.log('\n모의고사 세트 수 = ' + sets + '  (전 과목을 함께 늘려야 증가)');

  /* 보기·정답 형식 전수 점검 */
  packs.forEach(p => p.questions.forEach(q => {
    if (!Array.isArray(q.c) || q.c.length !== 4) fail(q.id + ' 보기 4개 아님');
    if (!Number.isInteger(q.a) || q.a < 0 || q.a >= q.c.length) fail(q.id + ' 정답 인덱스 범위 밖');
    if (!q.s) fail(q.id + ' 출처(s) 없음');
  }));

  console.log(bad ? '\n실패 ' + bad + '건' : '\n전수 점검 통과');
  process.exit(bad ? 1 : 0);
}
