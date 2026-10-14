/* 형광펜 점검.   node test/highlight.js
   index.html 의 hlFind / blank / normalize / applyEpoch / clone / mergeState 원문을 꺼내 돌린다.
   - 칠한 글자를 앞뒤 글자로 다시 찾는가 (같은 글자가 여러 곳, 원고가 바뀐 경우, 사라진 경우)
   - 두 기기 병합: 늦게 고친 쪽이 이기고, 지운 것이 되살아나지 않는가
   - 전체 초기화(epoch) 이전 형광펜이 걸러지는가, 오래된 지움 표시가 정리되는가
   - 강의 슬라이드 형광펜: 끈 자리가 알맞은 네모가 되는가, 내용정리 판과 섞이지 않는가, 병합되는가 */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name, re) {
  const m = src.match(re || new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const ctx = { console, Date, Math, SD_LINE: 0.032, FONTS: [{ id: 'pretendard', stack: 'x' }], FONT_MAP: { pretendard: { id: 'pretendard', stack: 'x' } }, FS_MIN: 0.8, FS_MAX: 1.4 };
vm.createContext(ctx);
['hlFind', 'hlEdOf', 'sdRectOf', 'blank', 'normalize', 'applyEpoch', 'mergeState'].forEach(n => vm.runInContext(grab(n), ctx));
vm.runInContext(grab('clone', /function clone\(o\)\{.*\n/), ctx);

let bad = 0;
const chk = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + ' → ' + JSON.stringify(got) + (ok ? '' : ' / 기대 ' + JSON.stringify(want)));
};

console.log('── 1. 자리 찾기 ──');
const text = '표준 단어\n표준 용어는 표준 단어를 조합한다\n표준 도메인';
const at = (q, pre, suf, o) => ctx.hlFind(text, { q, pre, suf, o: o || 0 });
chk('하나뿐인 글자', at('조합한다', '', ''), text.indexOf('조합한다'));
chk('같은 글자가 여럿이면 앞뒤로 가린다', at('표준 단어', '용어는 ', '를', 0), text.indexOf('표준 단어를'));
chk('앞뒤가 같으면 칠할 때 위치에 가까운 곳', at('표준', '', '', 40), text.lastIndexOf('표준'));
chk('앞 글자가 바뀌어도 찾는다', at('표준 도메인', '바뀐 앞 글자', ''), text.indexOf('표준 도메인'));
chk('사라진 글자는 -1', at('금칙어', '', ''), -1);
chk('빈 글자는 -1', at('', '', ''), -1);

console.log('── 2. 두 기기 병합 ──');
const T = Date.now() - 60000;   /* 반년 지난 지움 표시는 normalize 가 버리므로 지금 시각 기준 */
const pc = ctx.blank(), phone = ctx.blank();
pc.hl.a = { k: '3-1-2', c: 'y', q: '표준', u: T };
phone.hl.a = { k: '3-1-2', c: 'r', q: '표준', u: T + 5 };            /* 폰에서 나중에 색을 바꿈 */
pc.hl.b = { k: '13:3-1-2', c: 'g', q: '용어', u: T };
phone.hl.b = { k: '13:3-1-2', del: 1, u: T + 9 };                   /* 폰에서 지움 */
phone.hl.c = { k: '3-1-2', c: 'y', q: '도메인', u: T + 1 };          /* 폰에서 새로 칠함 */
let r = ctx.mergeState(pc, phone);
chk('늦게 바꾼 색', r.hl.a.c, 'r');
chk('지운 것은 지운 채로', !!r.hl.b.del, true);
chk('새로 칠한 것은 들어온다', r.hl.c && r.hl.c.q, '도메인');
r = ctx.mergeState(phone, pc);
chk('반대 방향도 지운 것이 되살아나지 않는다', !!r.hl.b.del, true);
chk('반대 방향도 늦게 바꾼 색', r.hl.a.c, 'r');

console.log('── 3. 초기화 · 정리 ──');
const wiped = ctx.blank(); wiped.epoch = T + 3;
const old = ctx.blank();
old.hl.x = { k: '1-1-1', c: 'y', q: '전', u: T };
old.hl.y = { k: '1-1-1', c: 'y', q: '후', u: T + 7 };
r = ctx.mergeState(old, wiped);
chk('초기화 이전 형광펜은 버린다', Object.keys(r.hl), ['y']);
const aged = ctx.blank();
aged.hl.d1 = { k: '1-1-1', del: 1, u: Date.now() - 200 * 864e5 };
aged.hl.d2 = { k: '1-1-1', del: 1, u: Date.now() - 10 * 864e5 };
aged.hl.bad = { c: 'y' };
r = ctx.normalize(aged);
chk('반년 지난 지움 표시와 깨진 기록은 정리', Object.keys(r.hl), ['d2']);
chk('옛 진도 파일(hl 없음)도 읽힌다', Object.keys(ctx.normalize({ stats: {}, settings: {} }).hl), []);

console.log('── 4. 강의 슬라이드 ──');
chk('판 구분 — 슬라이드', ctx.hlEdOf('sd:3:12'), 'sd');
chk('판 구분 — 2013', ctx.hlEdOf('13:3-1-2'), '2013');
chk('판 구분 — 2020', ctx.hlEdOf('3-1-2'), '2020');
chk('비스듬히 끌면 끈 만큼의 네모', ctx.sdRectOf(0.6, 0.5, 0.2, 0.3, 1000, 750), [0.2, 0.3, 0.4, 0.2]);
chk('옆으로 그으면 한 줄 굵기로', ctx.sdRectOf(0.1, 0.5, 0.5, 0.505, 1000, 750), [0.1, 0.4865, 0.4, 0.032]);
chk('작은 화면에서는 적어도 14px', ctx.sdRectOf(0.1, 0.5, 0.5, 0.5, 400, 200), [0.1, 0.465, 0.4, 0.07]);
chk('쪽 끝에서는 쪽 안으로', ctx.sdRectOf(0.1, 0.999, 0.5, 0.999, 1000, 750), [0.1, 0.968, 0.4, 0.032]);
chk('너무 짧으면 칠하지 않는다', ctx.sdRectOf(0.1, 0.1, 0.105, 0.4, 1000, 750), null);
const sa = ctx.blank(), sb = ctx.blank();
sa.hl.s1 = { k: 'sd:1:5', c: 'y', r: [0.1, 0.1, 0.3, 0.04], u: T };
sb.hl.s1 = { k: 'sd:1:5', c: 'y', r: [0.1, 0.1, 0.3, 0.04], m: '외울 것', u: T + 3 };
sb.hl.s2 = { k: 'sd:2:9', del: 1, u: T + 2 };
r = ctx.mergeState(sa, sb);
chk('슬라이드 형광펜도 늦게 고친 쪽', r.hl.s1.m, '외울 것');
chk('슬라이드 형광펜 지움도 전달', !!r.hl.s2.del, true);

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
