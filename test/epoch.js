/* index.html 의 applyEpoch / clone / mergeState / normalize / blank 원문을 그대로 꺼내
   "PC 초기화 → 폰 동기화" 시나리오를 실제 코드로 재현한다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const ctx = { console, Date, FONTS: [{ id: 'pretendard', stack: 'x' }], FONT_MAP: { pretendard: { id: 'pretendard', stack: 'x' } }, FS_MIN: 0.8, FS_MAX: 1.4 };
vm.createContext(ctx);
[['blank', /function blank\(\)\{[\s\S]*?\n\}/],
 ['normalize', /function normalize\(o\)\{[\s\S]*?\n\}/],
 ['applyEpoch', /function applyEpoch\(o, epoch\)\{[\s\S]*?\n\}/],
 ['clone', /function clone\(o\)\{.*\n/],
 ['mergeState', /function mergeState\(cur, inc\)\{[\s\S]*?\n\}/]].forEach(([n, re]) => vm.runInContext(grab(n, re), ctx));

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

const T0 = 1000, T1 = 5000, T2 = 9000;   /* T1 = PC 초기화 시각 */

function phoneState() {
  const s = ctx.blank();
  s.stats['C1-001'] = { right: 1, wrong: 0, box: 1, due: 0, last: T0, pick: 2 };
  s.stats['C1-002'] = { right: 0, wrong: 1, box: 0, due: 0, last: T0, pick: 3 };
  s.wrong['C1-002'] = true;
  s.bookmarks['C1-001'] = true;
  s.exams.push({ id: 'E1', ts: T0, byCh: {} });
  s.sessions['core/ch1:b0'] = { key: 'core/ch1:b0', ts: T0, ids: ['C1-001'] };
  s.epoch = 0;
  return s;
}
const wiped = ctx.blank(); wiped.epoch = T1;   /* PC 가 초기화 후 올린 상태 */

console.log('── 1. 폰이 초기화된 Gist 를 받아온다 ──');
let r = ctx.mergeState(phoneState(), wiped);
chk('풀이 기록 사라짐',   Object.keys(r.stats).length, 0);
chk('오답 사라짐',        Object.keys(r.wrong).length, 0);
chk('북마크 사라짐',      Object.keys(r.bookmarks).length, 0);
chk('모의고사 이력 사라짐', r.exams.length, 0);
chk('세션 사라짐',        Object.keys(r.sessions).length, 0);
chk('epoch 전파됨',       r.epoch, T1);

console.log('── 2. 반대 방향(초기화한 PC 가 폰의 옛 기록을 받아도) ──');
r = ctx.mergeState(wiped, phoneState());
chk('되살아나지 않음', Object.keys(r.stats).length, 0);
chk('epoch 유지',      r.epoch, T1);

console.log('── 3. 초기화 뒤에 푼 것은 살아남는다 ──');
const afterWipe = ctx.blank();
afterWipe.stats['C1-050'] = { right: 1, wrong: 0, box: 1, due: 0, last: T2, pick: 0 };
afterWipe.exams.push({ id: 'E2', ts: T2, byCh: {} });
afterWipe.sessions['core/ch1:b25'] = { key: 'core/ch1:b25', ts: T2, ids: ['C1-050'] };
afterWipe.epoch = 0;                       /* 아직 초기화 소식을 못 들은 기기 */
r = ctx.mergeState(afterWipe, wiped);
chk('초기화 이후 기록 보존', Object.keys(r.stats), ['C1-050']);
chk('초기화 이후 모의고사 보존', r.exams.map(e => e.id), ['E2']);
chk('초기화 이후 세션 보존', Object.keys(r.sessions), ['core/ch1:b25']);

console.log('── 4. 초기화가 없으면 기존 병합 그대로 ──');
const a = ctx.blank(); a.stats['X'] = { right: 2, wrong: 0, box: 2, due: 0, last: T0, pick: 1 };
const b = ctx.blank(); b.stats['X'] = { right: 1, wrong: 1, box: 0, due: 0, last: T2, pick: 3 };
b.stats['Y'] = { right: 1, wrong: 0, box: 1, due: 0, last: T2, pick: 0 };
r = ctx.mergeState(a, b);
chk('양쪽 기록 합쳐짐', Object.keys(r.stats).sort(), ['X', 'Y']);
chk('시도 많은 쪽 채택', [r.stats.X.right, r.stats.X.wrong], [2, 1]);
chk('최근 pick 채택',    r.stats.X.pick, 3);
chk('epoch 0 유지',      r.epoch, 0);

console.log('── 5. 두 번 초기화하면 나중 것이 이긴다 ──');
const w2 = ctx.blank(); w2.epoch = T2;
const stale = ctx.blank(); stale.epoch = T1;
stale.stats['Z'] = { right: 1, wrong: 0, box: 1, due: 0, last: T1 + 1, pick: 0 };
r = ctx.mergeState(stale, w2);
chk('나중 초기화가 이김', r.epoch, T2);
chk('그 사이 기록도 정리', Object.keys(r.stats).length, 0);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
