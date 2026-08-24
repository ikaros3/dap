const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const ctx = {
  console, Date,
  S: { sessions: {}, stats: {} },
  DAP: { id: 'core' },
  st: id => ctx.S.stats[id] || null,
  go: () => { ctx.went = true; },
  touch: () => {},
  went: false,
};
vm.createContext(ctx);
const parts = [
  ['isSeqKey',      /function isSeqKey\(fullKey\)\{[\s\S]*?\n\}/],
  ['resumeSession', /function resumeSession\(fullKey\)\{[\s\S]*?\n\}/],
  ['solvedCount',   /function solvedCount\(s\)\{[\s\S]*?\n\}/],
  ['firstUnsolved', /function firstUnsolved\(s\)\{[\s\S]*?\n\}/],
  ['hydrate',       /function hydrate\(s\)\{[\s\S]*?\n\}/],
];
parts.forEach(([n, re]) => vm.runInContext(grab(n, re), ctx));

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

chk('isSeqKey core/ch1:b25',    ctx.isSeqKey('core/ch1:b25'), true);
chk('isSeqKey core/ch1:all',    ctx.isSeqKey('core/ch1:all'), true);
chk('isSeqKey core/wrong:3',    ctx.isSeqKey('core/wrong:3'), false);
chk('isSeqKey core/due',        ctx.isSeqKey('core/due'), false);
chk('isSeqKey core/set0',       ctx.isSeqKey('core/set0'), false);
chk('isSeqKey core/ch1:rand25', ctx.isSeqKey('core/ch1:rand25'), false);

/* 대시보드 이어풀기 목록이 넘기는 full key 로 실제 이어지는가 */
const ids = Array.from({ length: 25 }, (_, i) => 'C1-' + String(i + 26).padStart(3, '0'));
ids.slice(0, 4).forEach((id, i) => { ctx.S.stats[id] = { right: 1, wrong: 0, box: 1, due: 0, last: i, pick: 1 }; });
ctx.S.sessions['core/ch1:b25'] = { key: 'core/ch1:b25', mode: 'study', ids, idx: 0, ans: {}, revealed: {}, submitted: false, spent: 0 };

ctx.resumeSession('core/ch1:b25');
chk('화면 전환됨',     ctx.went, true);
chk('세션 연결됨',     ctx.session && ctx.session.key, 'core/ch1:b25');
chk('seq 자동 판정',   ctx.session.seq, true);
chk('이전 답 복원',    ctx.session.ans['C1-026'], 1);
chk('시작 위치 → 5번', ctx.session.idx + 1, 5);

/* 없는 키는 조용히 무시 */
ctx.went = false;
ctx.resumeSession('core/없는키');
chk('없는 키는 무시', ctx.went, false);

/* 옛 방식(접두사 이중) 이 더 이상 쓰이지 않는지 — resumeSession 안에 skey 호출이 없어야 한다 */
chk('resumeSession 안에 skey 없음', /skey\(/.test(grab('resumeSession', parts[1][1])), false);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
