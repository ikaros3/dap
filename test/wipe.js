/* index.html 의 wipeAll / blank 원문을 그대로 꺼내 초기화 동작을 검증한다 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re);
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}

const calls = [];
const ctx = {
  console, Date,
  S: { stats: { 'C1-001': { right: 1, wrong: 0, pick: 2 } }, sessions: { 'core/ch1:b0': { ids: ['x'] } },
       bookmarks: { a: 1 }, wrong: { b: 1 }, exams: [{ id: 'E1' }], settings: {} },
  session: { key: 'core/ch1:b0' },
  syncT: 123, syncBusy: false, wipeGen: 0,
  sync: { gistId: 'abc123', token: 't', last: 0, auto: true },
  SYNC_FILE: 'dap-progress.json',
  KEY: 'dap750:v1',
  FONTS: [{ id: 'pretendard', stack: 'x' }],
  localStorage: { removeItem: k => calls.push('removeItem:' + k),
                  setItem: (k, v) => { calls.push('setItem:' + k); ctx.stored = v; } },
  clearTimeout: () => calls.push('clearTimeout'),
  go: v => calls.push('go:' + v),
  toast: m => calls.push('toast:' + m),
  render: () => calls.push('render'),
  saveSync: () => {},
  syncStatus: m => calls.push('status:' + m),
  payloadText: () => JSON.stringify({ data: ctx.S }),
  ghReq: (method, path, body, ok, err) => { calls.push(method + ' ' + path); ctx.lastBody = body; ok(); },
};
vm.createContext(ctx);
vm.runInContext(grab('blank', /function blank\(\)\{[\s\S]*?\n\}/), ctx);
vm.runInContext(grab('wipeAll', /function wipeAll\(pushEmpty\)\{[\s\S]*?\n\}/), ctx);

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

ctx.wipeAll(true);

chk('풀이 기록 비워짐',   Object.keys(ctx.S.stats).length, 0);
chk('세션 비워짐',        Object.keys(ctx.S.sessions).length, 0);
chk('북마크 비워짐',      Object.keys(ctx.S.bookmarks).length, 0);
chk('오답 비워짐',        Object.keys(ctx.S.wrong).length, 0);
chk('모의고사 이력 비워짐', ctx.S.exams.length, 0);
chk('진행 세션 해제',     ctx.session, null);
/* 지우기만 하면 새로고침 때 epoch 이 사라져 초기화 사실이 잊힌다. 빈 상태를 써 둬야 한다. */
chk('빈 상태를 저장',     calls.includes('setItem:dap750:v1'), true);
chk('초기화 시각 기록',   JSON.parse(ctx.stored).epoch > 0, true);
chk('저장된 것도 비어 있음', Object.keys(JSON.parse(ctx.stored).stats).length, 0);
chk('예약된 업로드 취소', calls.includes('clearTimeout'), true);
chk('예약 핸들 해제',     ctx.syncT, null);
chk('세대 카운터 증가',   ctx.wipeGen, 1);
chk('Gist 를 PATCH 함',   calls.includes('PATCH /gists/abc123'), true);
chk('빈 상태를 올림',     JSON.parse(ctx.lastBody.files['dap-progress.json'].content).data.stats, {});

/* pushEmpty=false 면 Gist 를 건드리지 않는다 */
calls.length = 0; ctx.lastBody = null; ctx.syncT = null;
ctx.S = { stats: { z: 1 }, sessions: {}, bookmarks: {}, wrong: {}, exams: [], settings: {} };
ctx.wipeAll(false);
chk('미연결이면 Gist 안 건드림', calls.some(c => c.startsWith('PATCH')), false);
chk('미연결이어도 로컬은 비움',  Object.keys(ctx.S.stats).length, 0);
chk('세대 카운터 또 증가',       ctx.wipeGen, 2);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
