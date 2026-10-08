/* 강의 슬라이드 점검.   node test/slides.js
   - manifest 의 slides 파일이 있고, 자료 id 가 겹치지 않으며 주소에 쓸 수 있는가
   - 자료마다 제목·쪽수·크기·드라이브 id·로컬 파일 이름(.pdf)이 있고, 과목(ch)·함께 볼 과목(rel)이 과목 범위 안인가
   - 드라이브 id 가 동영상 강의 video.js 의 과목 자료(docs) 링크와 어긋나지 않는가
   - 로컬 원본(data_source/DAP 영상 강의자료(2020+2013)/)이 있으면 같은 이름의 파일이 있는가 — 없는 PC 에서는 건너뛴다
   - 앱의 화면 주소 함수가 #/slides/<id> 를 오가며 같은 자료로 돌아오는가 */
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
const file = M.DAP_MANIFEST.slides;
if (!file) { console.log('manifest 에 slides 가 없다 — 건너뜀'); process.exit(0); }
const full = path.join('data', file);
if (!fs.existsSync(full)) { console.log('FAIL  파일 없음: ' + full); process.exit(1); }
let SD = null;
vm.runInContext(fs.readFileSync(full, 'utf8'), vm.createContext({ DAP_SLIDES: { add: b => { SD = b; } } }));
if (!SD || !Array.isArray(SD.items) || !SD.items.length) { console.log('FAIL  ' + full + ' 에 자료가 없다'); process.exit(1); }

const CHS = M.DAP_MANIFEST.chapters.map(c => c.id);
const DRIVE = /^[\w-]{20,}$/, seen = {}, drives = {};
SD.items.forEach(it => {
  const w = '[' + it.id + '] ';
  if (seen[it.id]) fail(w + 'id 가 겹친다');
  seen[it.id] = 1;
  if (!/^[\w-]+$/.test(it.id)) fail(w + '주소에 쓸 수 없는 id');
  if (it.ch && CHS.indexOf(it.ch) < 0) fail(w + '과목 ch 가 없는 과목이다: ' + it.ch);
  if (!it.ch && !(it.rel || []).length) fail(w + '과목 밖 자료인데 함께 볼 과목(rel)이 없다');
  (it.rel || []).forEach(c => { if (CHS.indexOf(c) < 0) fail(w + 'rel 에 없는 과목: ' + c); });
  if (!it.title) fail(w + '제목 없음');
  if (!(it.pages > 0)) fail(w + '쪽수 없음');
  if (!(it.mb > 0)) fail(w + '크기 없음');
  if (!DRIVE.test(it.drive || '')) fail(w + '드라이브 id 가 이상하다: ' + it.drive);
  if (!/^[^/]+\.pdf$/.test(it.file || '')) fail(w + '로컬 파일 이름(file)이 「파일.pdf」 꼴이 아니다: ' + it.file);
  if (drives[it.drive]) fail(w + '드라이브 id 가 ' + drives[it.drive] + ' 와 겹친다');
  drives[it.drive] = it.id;
  /* 목차 — 장·절 모두 제목과 1 ~ pages 쪽, 장 안의 절은 장 쪽부터 오름차순, 장끼리도 오름차순 */
  let last = 0;
  (it.toc || []).forEach(c => {
    if (!c.t || !(c.p >= 1 && c.p <= it.pages)) fail(w + '목차 장이 이상하다: ' + JSON.stringify({ t: c.t, p: c.p }));
    if (c.p < last) fail(w + '목차 장 쪽이 거꾸로: ' + c.t);
    last = c.p;
    (c.s || []).forEach(s => {
      if (!s.t || !(s.p >= 1 && s.p <= it.pages)) fail(w + '목차 절이 이상하다: ' + JSON.stringify(s));
      if (s.p < last) fail(w + '목차 절 쪽이 거꾸로: ' + s.t);
      last = s.p;
    });
  });
});

/* 동영상 강의의 과목 자료 링크와 같은 파일을 가리키는가 */
if (M.DAP_MANIFEST.video && fs.existsSync(path.join('data', M.DAP_MANIFEST.video))) {
  let VD = null;
  vm.runInContext(fs.readFileSync(path.join('data', M.DAP_MANIFEST.video), 'utf8'), vm.createContext({ DAP_VIDEO: { add: b => { VD = b; } } }));
  (VD && VD.subjects || []).forEach(s => (s.docs || []).forEach(d => {
    if (!drives[d.drive]) fail('동영상 강의 ' + s.ch + '과목 자료 「' + d.t + '」 가 슬라이드 목록에 없다: ' + d.drive);
  }));
}

/* 로컬 원본과 파일 이름 대조 */
const SRC = path.join('data_source', 'DAP 영상 강의자료(2020+2013)');
let checked = '';
if (fs.existsSync(SRC)) {
  const have = fs.readdirSync(SRC);
  SD.items.forEach(it => { if (have.indexOf(it.file) < 0) fail('[' + it.id + '] 원본 폴더에 파일이 없다: ' + it.file); });
  checked = ' · 원본 파일 이름 대조';
}

/* 화면 주소 왕복 */
const ctx = { location: { hash: '' } };
vm.createContext(ctx);
['viewHash', 'viewFromHash'].forEach(n => vm.runInContext(grab(n), ctx));
SD.items.forEach(it => {
  const h = ctx.viewHash({ name: 'sdq', id: it.id });
  ctx.location.hash = h;
  const v = ctx.viewFromHash();
  if (!v || v.name !== 'sdq' || v.id !== it.id) fail('[' + it.id + '] 주소 왕복 실패: ' + h + ' → ' + JSON.stringify(v));
});
ctx.location.hash = '#/slides';
if ((ctx.viewFromHash() || {}).name !== 'slides') fail('#/slides 가 개요로 열리지 않는다');

console.log(bad ? '실패 ' + bad + '건' : '자료 ' + SD.items.length + '개 이상 없음' + checked);
process.exit(bad ? 1 : 0);
