/* index.html 의 syncNow / mergeState / applyEpoch / wipeAll 원문을 그대로 꺼내
   PC·폰 두 기기와 공유 Gist 를 세워 실제 시나리오를 돌린다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const FNS = [
  ['blank',      /function blank\(\)\{[\s\S]*?\n\}/],
  ['normalize',  /function normalize\(o\)\{[\s\S]*?\n\}/],
  ['applyEpoch', /function applyEpoch\(o, epoch\)\{[\s\S]*?\n\}/],
  ['clone',      /function clone\(o\)\{.*\n/],
  ['mergeState', /function mergeState\(cur, inc\)\{[\s\S]*?\n\}/],
  ['parsePayload', /function parsePayload\(text\)\{[\s\S]*?\n\}/],
  ['syncNow',    /function syncNow\(quiet\)\{[\s\S]*?\n\}/],
  ['wipeAll',    /function wipeAll\(pushEmpty\)\{[\s\S]*?\n\}/],
];

/* 공유 Gist 하나 */
const gist = { text: null };

function makeDevice(name) {
  const ctx = {
    console, Date, name,
    FONTS: [{ id: 'p', stack: 'x' }], FONT_MAP: { p: { id: 'p', stack: 'x' } },
    FS_MIN: 0.8, FS_MAX: 1.4,
    KEY: 'dap750:v1', SYNC_FILE: 'dap-progress.json',
    session: null, view: { name: 'dash' },
    syncBusy: false, syncT: null, wipeGen: 0, changeSeq: 0,
    sync: { token: 't', gistId: 'g1', last: 0, auto: true, base: 0, dirty: false },
    store: {},
    localStorage: { setItem: (k, v) => { ctx.store[k] = v; }, removeItem: k => { delete ctx.store[k]; } },
    clearTimeout: () => {}, setTimeout: () => 0,
    toast: m => ctx.msgs.push(m), render: () => {}, go: () => {},
    syncStatus: () => {}, syncSchedule: () => {}, applyTypography: () => {}, saveSync: () => {}, syncOn: () => true,
    liveSessions: () => [], overall: () => ({ seen: 0 }), wrongIds: () => [], bookmarkIds: () => [],
    fmtDate: () => '', firstUnsolved: () => 0,
    msgs: [],
    /* 네트워크 대역 — 공유 Gist 를 동기적으로 읽고 쓴다 */
    gistRead: (ok) => ok(gist.text),
    ghReq: (method, path, body, ok) => { gist.text = body.files['dap-progress.json'].content; ok(); },
  };
  ctx.payloadText = () => JSON.stringify({ app: 'dap750', ver: 2, data: ctx.S });
  vm.createContext(ctx);
  FNS.forEach(([n, re]) => vm.runInContext(grab(n, re), ctx));
  ctx.S = ctx.blank();
  return ctx;
}

/* 문항을 푼다 — record() 와 같은 모양으로 기록하고 dirty 를 세운다 */
let clock = 1000;
function solve(dev, id, correct) {
  clock += 100;
  dev.S.stats[id] = { right: correct ? 1 : 0, wrong: correct ? 0 : 1, box: correct ? 1 : 0, due: 0, last: clock, pick: correct ? 0 : 3 };
  if (correct) delete dev.S.wrong[id]; else dev.S.wrong[id] = true;
  dev.sync.dirty = true; dev.changeSeq++;
}
const sync = dev => { dev.msgs = []; dev.syncNow(false); return dev.msgs.join(' | '); };
const ids = s => Object.keys(s.stats).sort();

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

const pc = makeDevice('PC'), ph = makeDevice('폰');

console.log('── 1. PC 에서 5문항, 동기화 ──');
['A', 'B', 'C', 'D', 'E'].forEach(id => solve(pc, id, true));
console.log('   ' + sync(pc));
chk('Gist 에 5문항', ids(JSON.parse(gist.text).data).length, 5);
chk('PC base 1', pc.sync.base, 1);

console.log('── 2. 폰이 받아온다 (빠른 감기 · 병합 아님) ──');
console.log('   ' + sync(ph));
chk('폰도 5문항', ids(ph.S), ['A', 'B', 'C', 'D', 'E']);
chk('폰 base 1', ph.sync.base, 1);

console.log('── 3. 폰에서 3문항 더 풀고 동기화 ──');
['F', 'G', 'H'].forEach(id => solve(ph, id, true));
console.log('   ' + sync(ph));
chk('Gist 에 8문항', ids(JSON.parse(gist.text).data).length, 8);
chk('폰 base 2', ph.sync.base, 2);

console.log('── 4. PC 가 받아온다 ──');
console.log('   ' + sync(pc));
chk('PC 도 8문항', ids(pc.S), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

console.log('── 5. 바뀐 것이 없으면 올리지 않는다 ──');
const before = gist.text;
console.log('   ' + sync(pc));
chk('Gist 그대로', gist.text === before, true);

console.log('── 6. PC 에서 전체 초기화 → 폰이 동기화 ──');
pc.wipeAll(true);
console.log('   폰: ' + sync(ph));
chk('폰 기록 사라짐', ids(ph.S).length, 0);
chk('폰이 되돌려 올리지 않음', ids(JSON.parse(gist.text).data).length, 0);

console.log('── 7. 오답 해결이 전달되는가 ──');
solve(pc, 'W', false); sync(pc); sync(ph);
chk('폰도 오답 W 를 안다', Object.keys(ph.S.wrong), ['W']);
solve(pc, 'W', true);                     /* PC 에서 다시 풀어 맞힘 */
sync(pc); sync(ph);
chk('폰의 오답노트에서도 사라짐', Object.keys(ph.S.wrong), []);

console.log('── 8. 북마크 해제가 전달되는가 ──');
pc.S.bookmarks['A'] = true; pc.sync.dirty = true; sync(pc); sync(ph);
chk('폰도 북마크를 안다', Object.keys(ph.S.bookmarks), ['A']);
delete pc.S.bookmarks['A']; pc.sync.dirty = true; sync(pc); sync(ph);
chk('폰에서도 해제됨', Object.keys(ph.S.bookmarks), []);

console.log('── 9. 진짜로 갈라졌을 때만 병합한다 ──');
solve(pc, 'X', true); solve(ph, 'Y', true);   /* 둘 다 같은 판 위에서 각자 품 */
const m1 = sync(pc);                          /* PC 가 먼저 올린다 */
const m2 = sync(ph);                          /* 폰은 갈라진 것을 발견 */
console.log('   PC: ' + m1 + '   /   폰: ' + m2);
chk('폰이 병합을 탐', /합쳤습니다/.test(m2), true);
chk('양쪽 문항 모두 보존', ids(ph.S).includes('X') && ids(ph.S).includes('Y'), true);
sync(pc);
chk('PC 도 둘 다 갖게 됨', ids(pc.S).includes('X') && ids(pc.S).includes('Y'), true);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
