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
/* 단계 순서대로 놓였는가 — 레일·이전/다음 문제가 이 순서를 따른다 */
DM.items.forEach((it, i) => { if (i && it.lv < DM.items[i - 1].lv) fail('[' + it.id + '] 단계 순서가 거꾸로'); });

if (bad) { console.log(bad + '건 실패'); process.exit(1); }
console.log('전부 통과 (문제 ' + DM.items.length + ' · 그림 ' + Object.keys(DM.images).length + ')');
