/* Data Modeling(실기) 점검.   node test/dm.js
   - manifest 의 dm 파일이 있고, 문제 id 가 겹치지 않으며, 단계(lv)가 levels 안에 있는가
   - 문제마다 지문 문단과 모범 답안 그림이 있는가, 그림 키가 images 에 있고 파일·크기가 있는가, 쓰지 않는 그림은 없는가
   - 앱의 dmBlocks(원문 그대로 꺼냄)로 모든 문제를 그려 태그 짝이 맞는가 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name) {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
let bad = 0;
const fail = m => { bad++; console.log('FAIL  ' + m); };

const M = {};
vm.runInContext(fs.readFileSync('data/manifest.js', 'utf8'), vm.createContext({ window: M }));
const file = M.DAP_MANIFEST.dm;
if (!file) { console.log('manifest 에 dm 이 없다 — 건너뜀'); process.exit(0); }
const full = path.join('data', file);
if (!fs.existsSync(full)) { console.log('FAIL  파일 없음: ' + full); process.exit(1); }
let DM = null;
vm.runInContext(fs.readFileSync(full, 'utf8'), vm.createContext({ DAP_DM: { add: b => { DM = b; } } }));
if (!DM || !Array.isArray(DM.items) || !DM.items.length) { console.log('FAIL  ' + full + ' 에 문제가 없다'); process.exit(1); }

const ctx = { console, DM };
vm.createContext(ctx);
['esc', 'dmText', 'dmFig', 'dmTable', 'dmBlocks'].forEach(n => vm.runInContext(grab(n), ctx));

const seen = {}, used = {};
DM.items.forEach(it => {
  const w = '[' + it.id + '] ';
  if (seen[it.id]) fail(w + 'id 가 겹친다');
  seen[it.id] = 1;
  if (!/^[\w-]+$/.test(it.id)) fail(w + '주소에 쓸 수 없는 id');
  if (!(it.lv >= 0 && it.lv < DM.levels.length)) fail(w + '단계 lv 가 levels 밖: ' + it.lv);
  if (!it.title) fail(w + '제목 없음');
  if (!it.q.some(b => b.p)) fail(w + '지문 문단 없음');
  if (!it.a.some(b => b.img)) fail(w + '모범 답안 그림 없음');
  it.q.concat(it.a).forEach(b => {
    if (!b.img) return;
    used[b.img] = 1;
    const im = DM.images[b.img];
    if (!im) return fail(w + '그림 키가 images 에 없다: ' + b.img);
    if (!(im.w > 0 && im.h > 0)) fail(w + b.img + ' 크기 없음');
    if (!fs.existsSync(path.join('data', 'dm', im.src))) fail(w + b.img + ' 그림 파일 없음: ' + im.src);
  });
  /* 그려서 태그 짝 보기 */
  const html = ctx.dmBlocks(it.q) + ctx.dmBlocks(it.a);
  const st = [];
  (html.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/g) || []).forEach(t => {
    const n = t.match(/^<\/?([a-z0-9]+)/)[1];
    if (/^(br|img)$/.test(n)) return;
    if (t[1] === '/') { if (st.pop() !== n) fail(w + '태그 짝이 어긋남: ' + t); }
    else st.push(n);
  });
  if (st.length) fail(w + '닫히지 않은 태그: ' + st.join(','));
});
Object.keys(DM.images).forEach(k => { if (!used[k]) fail('쓰지 않는 그림: ' + k); });

/* 작성 문제 — 4-7 의 과제 머리 아래 표로 빈 양식을 만들고, 적은 글을 모범 답안과 견준다 */
['dmCell', 'dmNorm', 'dmEx', 'dmwAll', 'dmwRows', 'dmwPart', 'dmcInner'].forEach(n => vm.runInContext(grab(n), ctx));
function tagsOk(w, html) {
  const st = [];
  (html.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/g) || []).forEach(t => {
    const n = t.match(/^<\/?([a-z0-9]+)/)[1];
    if (/^(br|img|input|col)$/.test(n)) return;
    if (t[1] === '/') { if (st.pop() !== n) fail(w + '태그 짝이 어긋남: ' + t); }
    else st.push(n);
  });
  if (st.length) fail(w + '닫히지 않은 태그: ' + st.join(','));
}
const exIds = DM.items.filter(it => ctx.dmEx(it)).map(it => it.id);
if (exIds.join() !== '4-7') fail('작성 문제가 있는 문제: ' + exIds.join() + ' (기대 4-7)');
const it47 = DM.items.filter(it => it.id === '4-7')[0];
const ex = it47 && ctx.dmEx(it47);
if (ex) {
  const w = '[4-7 작성] ';
  const parts = [].concat(...ex.tasks.map(t => t.parts));
  const shape = parts.map(p => p.kind + ':' + (p.n || p.ents.length)).join(' ');
  if (ex.tasks.length !== 2) fail(w + '과제 수 ' + ex.tasks.length);
  if (shape !== 'ent:4 grid:10 grid:10 grid:5') fail(w + '양식 구성 ' + shape);
  if (!ex.pre.some(b => b.img) || ex.pre.some(b => b.h && /^\[\d+\]/.test(b.h))) fail(w + 'A 에 남길 ERD 구분이 어긋남');
  const ent = parts[0];
  if (ent.ents.map(e => e.name).join() !== '기관,기관근무현황,종사자,제공서비스') fail(w + '엔터티 ' + ent.ents.map(e => e.name).join());
  if (ent.labels.length !== 7) fail(w + '엔터티 항목 수 ' + ent.labels.length);
  if (parts.map(p => p.key).join() !== ',0,0,1') fail(w + '이름 열 ' + parts.map(p => p.key).join());
  /* 빈 상태 · 몇 칸 적은 상태로 그려 본다 */
  ctx.S = { dmWork: {} };
  parts.forEach(p => { tagsOk(w + '빈 양식 ', ctx.dmwPart(it47, p)); tagsOk(w + '빈 비교 ', ctx.dmcInner(it47, p)); });
  const g = parts.slice(1);
  if (!g[0].given || g[0].given.length !== 10 || g[0].given[0] !== '기관번호') fail(w + '표준 용어 이름이 모범 답안으로 채워지지 않음');
  if (g[1].given || g[2].given) fail(w + '코드·도메인은 이름을 채워 두지 않는다');
  if (g.map(p => p.grow).join() !== 'false,true,false') fail(w + '행 추가는 코드 표만 ' + g.map(p => p.grow).join());
  if (g[2].cols.length !== 4) fail(w + '도메인 양식에 비고 열이 남음');
  ctx.S.dmWork['4-7'] = { u: 1, v: {
    'e0.1.0': '<i>종사자 정보', 'e0.0.0': '통합 관리',
    'g1.0.2': '기관 번호', 'g1.1.2': '이름', 'g1.2.2': '번호', 'g1.rows': '13',
    'g2.0.0': '기관구분코드', 'g2.0.1': '10', 'g2.1.1': '20', 'g2.2.0': '근무 구분코드', 'g2.rows': '12',
    'g3.0.1': '일자', 'g3.1.1': '금액', 'g3.0.4': '비고글' } };
  const htm = parts.map(p => ctx.dmwPart(it47, p) + ctx.dmcInner(it47, p)).join('');
  tagsOk(w + '적은 뒤 ', htm);
  if (htm.indexOf('<i>') >= 0) fail(w + '적은 글이 이스케이프되지 않음');
  if (htm.indexOf('비고글') >= 0 || htm.indexOf('g3.0.4') >= 0) fail(w + '비고 열이 양식·내 답안에 보임');
  if ((htm.match(/data-act="dmwrow"/g) || []).length !== 1) fail(w + '행 추가 단추 수');
  const sum = parts.map(p => (ctx.dmcInner(it47, p).match(/(?:일치|항목) (\d+ \/ \d+)/) || [])[1]).join(' | ');
  if (sum !== '2 / 28 | 2 / 10 | 2 / 6 | 2 / 11') fail(w + '일치 수 ' + sum);
  if (ctx.dmwRows(g[0], ctx.dmwAll('4-7')) !== 10) fail(w + '표준 용어 행 수는 10 으로 고정');
  if (ctx.dmwRows(g[1], ctx.dmwAll('4-7')) !== 12) fail(w + '코드 표 늘린 행 수');
}
/* 직접 작성 동기화 — 문제마다 늦게 고친 쪽, 지운 것이 되살아나지 않고, 초기화 이전 것은 버린다 */
{
  const sx = { console, Date, FONTS: [{ id: 'p', stack: 'x' }], FONT_MAP: { p: { id: 'p', stack: 'x' } }, FS_MIN: 0.8, FS_MAX: 1.4 };
  vm.createContext(sx);
  ['blank', 'normalize', 'applyEpoch', 'mergeState'].forEach(n => vm.runInContext(grab(n), sx));
  vm.runInContext(src.match(/function clone\(o\)\{.*\n/)[0], sx);
  const w = '[작성 동기화] ', T = Date.now() - 60000;
  const pc = sx.blank(), phone = sx.blank();
  pc.dmWork['4-7'] = { u: T, v: { 'e0.0.0': '통합 관리' } };
  phone.dmWork['4-7'] = { u: T + 5, v: {} };                       /* 폰에서 나중에 지움 */
  phone.dmWork['4-8'] = { u: T, v: { 'g1.0.0': '바우처' } };
  [sx.mergeState(pc, phone), sx.mergeState(phone, pc)].forEach((r, i) => {
    if (Object.keys(r.dmWork['4-7'].v).length) fail(w + '지운 것이 되살아남 (' + i + ')');
    if (!r.dmWork['4-8'] || r.dmWork['4-8'].v['g1.0.0'] !== '바우처') fail(w + '한쪽에만 있는 것이 빠짐 (' + i + ')');
  });
  const wiped = sx.blank(); wiped.epoch = T + 3;
  if (Object.keys(sx.mergeState(pc, wiped).dmWork).length) fail(w + '초기화 이전 작성이 남음');
  if (!sx.normalize({ stats: {}, settings: {} }).dmWork) fail(w + '옛 진도 파일에 dmWork 가 채워지지 않음');
}

/* 단계 순서대로 놓였는가 — 레일·이전/다음 문제가 이 순서를 따른다 */
DM.items.forEach((it, i) => { if (i && it.lv < DM.items[i - 1].lv) fail('[' + it.id + '] 단계 순서가 거꾸로'); });

if (bad) { console.log(bad + '건 실패'); process.exit(1); }
console.log('전부 통과 (문제 ' + DM.items.length + ' · 그림 ' + Object.keys(DM.images).length + ')');
