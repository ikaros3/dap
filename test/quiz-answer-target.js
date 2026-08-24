/* 동기화가 퀴즈 도중에 돌 때 답이 엉뚱한 문항에 기록되던 사고를 재현한다.
   index.html 의 payloadText / pick / reveal / firstUnsolved 원문을 그대로 쓴다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const ids = ['C1-001', 'C1-002', 'C1-003', 'C1-004', 'C1-005'];
const answers = { 'C1-001': 0, 'C1-002': 0, 'C1-003': 0, 'C1-004': 0, 'C1-005': 3 };

const ctx = {
  console, Date,
  QMAP: Object.fromEntries(ids.map(id => [id, { id, a: answers[id], ch: 1 }])),
  S: { stats: {}, wrong: {}, bookmarks: {}, exams: [], sessions: {}, settings: {} },
  BOX_DAYS: [0, 1, 2, 4, 8, 16, 35],
  st: id => ctx.S.stats[id] || null,
  save: () => {}, render: () => { ctx.renders++; }, markDirty: () => {},
  fmtDate: () => '', overall: () => ({ seen: 0 }), wrongIds: () => [], bookmarkIds: () => [],
  liveSessions: () => [], toast: () => {},
  renders: 0,
};
vm.createContext(ctx);
['function firstUnsolved\\(s\\)\\{[\\s\\S]*?\\n\\}',
 'function record\\(qid, correct, pick\\)\\{[\\s\\S]*?\\n\\}',
 'function reveal\\(\\)\\{[\\s\\S]*?\\n\\}',
 'function pick\\(i, qid\\)\\{[\\s\\S]*?\\n\\}',
 'function payloadText\\(\\)\\{[\\s\\S]*?\\n\\}'].forEach(p => vm.runInContext(grab(p, new RegExp(p)), ctx));

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

/* 1~3번은 이미 풀었고(정답), 4번도 예전에 푼 기록이 전역에 있다.
   5번을 보고 있는 상태에서 동기화가 도는 상황. */
ctx.S.stats['C1-004'] = { right: 1, wrong: 0, box: 1, due: 0, last: 500, pick: 0 };
ctx.session = {
  key: 'core/ch1:b0', mode: 'study', seq: true, ids, idx: 4,
  ans: { 'C1-001': 0, 'C1-002': 0, 'C1-003': 0 },
  revealed: { 'C1-001': true, 'C1-002': true, 'C1-003': true },
  submitted: false, spent: 0, ts: 1,
};

console.log('── 동기화가 퀴즈 도중에 돌아도 위치가 흔들리지 않아야 한다 ──');
chk('동기화 전 위치', ctx.session.idx, 4);
ctx.payloadText();                       /* 자동 동기화가 도는 순간 */
chk('동기화 후 위치 그대로', ctx.session.idx, 4);
chk('세션이 저장되기는 함', !!ctx.S.sessions['core/ch1:b0'], true);

console.log('── 5번 화면에서 4번 보기를 고르면 5번에 기록되어야 한다 ──');
ctx.pick(3, 'C1-005');
chk('5번에 답이 들어감', ctx.session.ans['C1-005'], 3);
chk('4번은 손대지 않음', ctx.session.ans['C1-004'], undefined);
chk('5번은 정답 처리', ctx.S.stats['C1-005'].right, 1);
chk('4번이 오답으로 바뀌지 않음', ctx.S.wrong['C1-004'], undefined);

console.log('── 화면과 위치가 어긋나면 기록하지 않고 화면을 다시 맞춘다 ──');
ctx.session.idx = 3;                     /* 어떤 경로로든 위치가 밀린 상태 */
const before = ctx.renders;
ctx.pick(3, 'C1-005');                   /* 화면에는 5번이 그려져 있었다 */
chk('엉뚱한 문항에 기록 안 함', ctx.session.ans['C1-004'], undefined);
chk('화면을 다시 그림', ctx.renders > before, true);

console.log('── 키보드 입력(문항 id 없음)은 현재 위치에 기록된다 ──');
ctx.session.idx = 3;
ctx.pick(1);
chk('4번에 기록됨', ctx.session.ans['C1-004'], 1);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
