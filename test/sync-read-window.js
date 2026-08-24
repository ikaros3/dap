/* 받아오는 도중에 문제를 풀면 그 답이 pull 로 지워지는지 확인한다.
   index.html 의 syncNow 원문을 그대로 쓴다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
function grab(re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + re.source.slice(0, 30)); process.exit(1); }
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
  sync: { token: 't', gistId: 'g', last: 0, auto: true, base: 0, baseBy: '', dirty: false, wid: 'PHONE' },
  localStorage: { setItem: () => {}, removeItem: () => {} },
  clearTimeout: () => {}, setTimeout: () => 1,
  toast: m => ctx.msgs.push(m), render: () => {}, go: () => {},
  syncStatus: () => {}, applyTypography: () => {}, saveSync: () => {}, syncOn: () => true,
  liveSessions: () => [], overall: () => ({ seen: 0 }), wrongIds: () => [], bookmarkIds: () => [],
  fmtDate: () => '', firstUnsolved: () => 0,
  msgs: [],
  /* 읽기 응답이 돌아오기 직전에 사용자가 한 문항을 푼다 */
  gistRead: ok => { if (ctx.duringRead) { ctx.duringRead(); ctx.duringRead = null; } ok(gist.text); },
  ghReq: (m, p, body, cb) => { gist.text = body.files['dap-progress.json'].content; cb(); },
};
ctx.payloadText = () => JSON.stringify({ app: 'dap750', ver: 2, data: ctx.S });
vm.createContext(ctx);
FNS.forEach(re => vm.runInContext(grab(re), ctx));
ctx.S = ctx.blank();

let clock = 1000;
function solve(id) {
  clock += 100;
  ctx.S.stats[id] = { right: 1, wrong: 0, box: 1, due: 0, last: clock, pick: 0 };
  ctx.sync.dirty = true; ctx.changeSeq++;
}
const ids = s => Object.keys(s.stats).sort();

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

/* PC 가 A·B 를 올려 둔 상태(rev 1). 이 기기는 아직 아무것도 모른다. */
gist.text = JSON.stringify({
  app: 'dap750', ver: 2,
  data: Object.assign(ctx.blank(), {
    rev: 1, by: 'PC',
    stats: { A: { right: 1, wrong: 0, box: 1, due: 0, last: 10, pick: 0 },
             B: { right: 1, wrong: 0, box: 1, due: 0, last: 20, pick: 0 } },
  }),
});
ctx.sync.base = 0; ctx.sync.baseBy = ''; ctx.sync.dirty = false;

console.log('── 받아오는 도중에 이 기기에서 C 를 푼다 ──');
ctx.duringRead = () => solve('C');
ctx.msgs = []; ctx.syncNow(true);

chk('받아온 A·B 가 들어옴', ids(ctx.S).includes('A') && ids(ctx.S).includes('B'), true);
chk('읽는 도중에 푼 C 가 살아 있음', ids(ctx.S).includes('C'), true);
chk('세 문항 모두', ids(ctx.S), ['A', 'B', 'C']);
chk('Gist 에도 C 가 올라감', ids(JSON.parse(gist.text).data), ['A', 'B', 'C']);

console.log('── 아무것도 안 바뀌면 평상시대로 받아오기 ──');
ctx.S = ctx.blank(); ctx.sync.base = 0; ctx.sync.baseBy = ''; ctx.sync.dirty = false;
ctx.msgs = []; ctx.syncNow(false);
console.log('   ' + ctx.msgs.join(' | '));
chk('병합이 아니라 받아오기', /받아왔습니다/.test(ctx.msgs.join(' ')), true);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
