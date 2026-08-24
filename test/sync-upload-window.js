/* 올리는 도중에 문제를 풀면 그 답이 영영 올라가지 않는지 확인한다.
   index.html 의 syncNow 원문을 그대로 쓰고, PATCH 응답 직전에 사용자가 한 문항을
   더 푸는 상황을 만든다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const FNS = [
  /function blank\(\)\{[\s\S]*?\n\}/,
  /function normalize\(o\)\{[\s\S]*?\n\}/,
  /function applyEpoch\(o, epoch\)\{[\s\S]*?\n\}/,
  /function clone\(o\)\{.*\n/,
  /function mergeState\(cur, inc\)\{[\s\S]*?\n\}/,
  /function parsePayload\(text\)\{[\s\S]*?\n\}/,
  /function syncSchedule\(\)\{[\s\S]*?\n\}/,
  /function syncNow\(quiet\)\{[\s\S]*?\n\}/,
];

const gist = { text: null };
const ctx = {
  console, Date,
  FONTS: [{ id: 'p', stack: 'x' }], FONT_MAP: { p: { id: 'p', stack: 'x' } },
  FS_MIN: 0.8, FS_MAX: 1.4, KEY: 'k', SYNC_FILE: 'dap-progress.json', SYNC_WAIT: 20000,
  session: null, view: { name: 'dash' },
  syncBusy: false, syncT: null, wipeGen: 0, changeSeq: 0,
  sync: { token: 't', gistId: 'g', last: 0, auto: true, base: 0, baseBy: '', dirty: false, wid: 'PC' },
  localStorage: { setItem: () => {}, removeItem: () => {} },
  clearTimeout: () => {}, setTimeout: () => { ctx.scheduled = true; return 1; },
  toast: m => ctx.msgs.push(m), render: () => {}, go: () => {},
  syncStatus: () => {}, applyTypography: () => {}, saveSync: () => {}, syncOn: () => true,
  liveSessions: () => [], overall: () => ({ seen: 0 }), wrongIds: () => [], bookmarkIds: () => [],
  fmtDate: () => '', firstUnsolved: () => 0,
  msgs: [], scheduled: false,
  gistRead: ok => ok(gist.text),
  /* PATCH 는 보낸 내용을 저장하되, 응답이 오기 직전에 사용자가 한 문항을 더 푼다 */
  ghReq: (m, p, body, ok) => {
    gist.text = body.files['dap-progress.json'].content;
    if (ctx.duringUpload) { ctx.duringUpload(); ctx.duringUpload = null; }
    ok();
  },
};
ctx.payloadText = () => JSON.stringify({ app: 'dap750', ver: 2, data: ctx.S });
vm.createContext(ctx);
FNS.forEach(re => vm.runInContext(grab(re.source.slice(0, 30), re), ctx));
ctx.S = ctx.blank();

/* markDirty 가 있으면 그것을 쓰고, 없으면(이전 코드) dirty 만 세운다 */
let clock = 1000;
function solve(id) {
  clock += 100;
  ctx.S.stats[id] = { right: 1, wrong: 0, box: 1, due: 0, last: clock, pick: 0 };
  ctx.sync.dirty = true;
  ctx.changeSeq++;                       /* save() 안의 markDirty 와 같은 역할 */
}
const ids = s => Object.keys(s.stats).sort();

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

console.log('── 올리는 도중에 한 문항을 더 푼다 ──');
solve('A');
ctx.duringUpload = () => solve('B');      /* PATCH 응답 직전에 B 를 푼다 */
ctx.msgs = []; ctx.syncNow(true);

chk('Gist 에는 A 만 올라감', ids(JSON.parse(gist.text).data), ['A']);
chk('로컬에는 A, B 둘 다 있음', ids(ctx.S), ['A', 'B']);
chk('B 가 남았으므로 아직 dirty 여야 함', ctx.sync.dirty, true);

console.log('── 다음 동기화에서 B 가 올라가는가 ──');
ctx.msgs = []; ctx.syncNow(true);
console.log('   ' + ctx.msgs.join(' | '));
chk('Gist 에 B 도 올라감', ids(JSON.parse(gist.text).data), ['A', 'B']);

console.log('── 다른 기기가 앞서 있으면 B 를 잃지 않아야 한다 ──');
/* 위 상황에서 B 가 dirty 로 남지 않았다면, 저쪽이 앞설 때 pull 로 B 가 사라진다 */
chk('B 가 로컬에 살아 있음', ids(ctx.S).includes('B'), true);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
