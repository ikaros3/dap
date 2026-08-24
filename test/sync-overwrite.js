/* 같은 판 위에서 두 기기가 동시에 올려 한쪽이 덮이는 경우(git 의 non-fast-forward)를
   index.html 의 syncNow 원문으로 재현한다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const FNS = [
  ['blank',        /function blank\(\)\{[\s\S]*?\n\}/],
  ['normalize',    /function normalize\(o\)\{[\s\S]*?\n\}/],
  ['applyEpoch',   /function applyEpoch\(o, epoch\)\{[\s\S]*?\n\}/],
  ['clone',        /function clone\(o\)\{.*\n/],
  ['mergeState',   /function mergeState\(cur, inc\)\{[\s\S]*?\n\}/],
  ['parsePayload', /function parsePayload\(text\)\{[\s\S]*?\n\}/],
  ['syncNow',      /function syncNow\(quiet\)\{[\s\S]*?\n\}/],
];

const gist = { text: null };
let wids = 0;

function makeDevice(name) {
  const ctx = {
    console, Date, FONTS: [{ id: 'p', stack: 'x' }], FONT_MAP: { p: { id: 'p', stack: 'x' } },
    FS_MIN: 0.8, FS_MAX: 1.4, KEY: 'k', SYNC_FILE: 'dap-progress.json',
    session: null, view: { name: 'dash' },
    syncBusy: false, syncT: null, wipeGen: 0, changeSeq: 0,
    sync: { token: 't', gistId: 'g', last: 0, auto: true, base: 0, baseBy: '', dirty: false, wid: 'W' + (++wids) },
    localStorage: { setItem: () => {}, removeItem: () => {} },
    clearTimeout: () => {}, toast: m => ctx.msgs.push(m), render: () => {}, go: () => {},
    syncStatus: () => {}, syncSchedule: () => {}, applyTypography: () => {}, saveSync: () => {}, syncOn: () => true,
    liveSessions: () => [], overall: () => ({ seen: 0 }), wrongIds: () => [], bookmarkIds: () => [],
    fmtDate: () => '', firstUnsolved: () => 0, msgs: [],
    /* 읽기와 쓰기를 따로 세워 "동시에 올리는" 상황을 만든다 */
    gistRead: (ok) => ok(ctx.pinned !== undefined ? ctx.pinned : gist.text),
    ghReq: (m, p, body, ok) => { gist.text = body.files['dap-progress.json'].content; ok(); },
  };
  ctx.payloadText = () => JSON.stringify({ app: 'dap750', ver: 2, data: ctx.S });
  vm.createContext(ctx);
  FNS.forEach(([n, re]) => vm.runInContext(grab(n, re), ctx));
  ctx.S = ctx.blank();
  return ctx;
}

let clock = 1000;
function solve(dev, id) {
  clock += 100;
  dev.S.stats[id] = { right: 1, wrong: 0, box: 1, due: 0, last: clock, pick: 0 };
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

console.log('── 공통 조상 만들기 ──');
solve(pc, 'BASE'); sync(pc); sync(ph);
chk('두 기기 같은 판', [pc.sync.base, ph.sync.base], [1, 1]);
chk('쓴 기기도 같게 기억', pc.sync.baseBy === ph.sync.baseBy, true);

console.log('── 같은 판 위에서 동시에 올린다 (PC 것이 덮인다) ──');
solve(pc, 'PC-A');
solve(ph, 'PH-B');
const snapshot = gist.text;          /* 둘 다 이 판을 읽은 상태 */
pc.pinned = snapshot; sync(pc); delete pc.pinned;   /* PC 가 먼저 올림 */
ph.pinned = snapshot; sync(ph); delete ph.pinned;   /* 폰이 같은 판 위에서 올려 덮음 */
chk('Gist 에는 폰 것만 남음', ids(JSON.parse(gist.text).data), ['BASE', 'PH-B']);
chk('PC 는 자기 것이 올라갔다고 믿음', pc.sync.base, 2);
chk('PC 로컬에는 아직 있음', ids(pc.S).includes('PC-A'), true);

console.log('── PC 가 다음에 동기화할 때 알아채는가 ──');
const msg = sync(pc);
console.log('   PC: ' + msg);
chk('덮인 것을 감지', /되살렸습니다/.test(msg), true);
chk('PC 가 양쪽 모두 갖게 됨', ids(pc.S), ['BASE', 'PC-A', 'PH-B']);
chk('Gist 도 복구됨', ids(JSON.parse(gist.text).data), ['BASE', 'PC-A', 'PH-B']);

console.log('── 폰도 따라온다 ──');
console.log('   폰: ' + sync(ph));
chk('폰도 양쪽 모두', ids(ph.S), ['BASE', 'PC-A', 'PH-B']);

console.log('── 이후 평상시 동작은 그대로 ──');
chk('두 기기 판 일치', pc.sync.base === ph.sync.base, true);
solve(pc, 'NEXT');
console.log('   PC: ' + sync(pc));
const m = sync(ph);
console.log('   폰: ' + m);
chk('평상시는 받아오기', /받아왔습니다/.test(m), true);
chk('폰에 반영됨', ids(ph.S).includes('NEXT'), true);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
