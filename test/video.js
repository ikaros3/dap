/* 동영상 강의 점검.   node test/video.js
   - manifest 의 video 파일이 있고, 강의 id 가 겹치지 않으며 주소에 쓸 수 있는가
   - 강의마다 과목(ch)이 subjects 에 있고, 제목·재생 시간·드라이브 id 가 있는가
   - 과목 순서대로 놓였는가 — 레일·이전/다음 강의가 이 순서를 따른다
   - 앱의 화면 주소 함수가 #/video/<id> 를 오가며 같은 강의로 돌아오는가 */
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
const file = M.DAP_MANIFEST.video;
if (!file) { console.log('manifest 에 video 가 없다 — 건너뜀'); process.exit(0); }
const full = path.join('data', file);
if (!fs.existsSync(full)) { console.log('FAIL  파일 없음: ' + full); process.exit(1); }
let VD = null;
vm.runInContext(fs.readFileSync(full, 'utf8'), vm.createContext({ DAP_VIDEO: { add: b => { VD = b; } } }));
if (!VD || !Array.isArray(VD.items) || !VD.items.length) { console.log('FAIL  ' + full + ' 에 강의가 없다'); process.exit(1); }

const DRIVE = /^[\w-]{20,}$/, subs = {}, seen = {}, drives = {};
VD.subjects.forEach(s => {
  if (subs[s.ch]) fail('과목이 겹친다: ' + s.ch);
  subs[s.ch] = s;
  (s.docs || []).forEach(d => { if (!d.t || !DRIVE.test(d.drive || '')) fail('과목 ' + s.ch + ' 자료 링크가 이상하다: ' + JSON.stringify(d)); });
});
VD.items.forEach((it, i) => {
  const w = '[' + it.id + '] ';
  if (seen[it.id]) fail(w + 'id 가 겹친다');
  seen[it.id] = 1;
  if (!/^[\w-]+$/.test(it.id)) fail(w + '주소에 쓸 수 없는 id');
  if (!subs[it.ch]) fail(w + '과목 ch 가 subjects 에 없다: ' + it.ch);
  if (!it.title) fail(w + '제목 없음');
  if (!(it.sec > 0)) fail(w + '재생 시간 없음');
  if (!DRIVE.test(it.drive || '')) fail(w + '드라이브 id 가 이상하다: ' + it.drive);
  if (!/^[^/]+\/[^/]+\.mp4$/.test(it.file || '')) fail(w + '로컬 파일 경로(file)가 「과목 폴더/파일.mp4」 꼴이 아니다: ' + it.file);
  if (drives[it.drive]) fail(w + '드라이브 id 가 ' + drives[it.drive] + ' 와 겹친다');
  drives[it.drive] = it.id;
  if (i && it.ch < VD.items[i - 1].ch) fail(w + '과목 순서가 거꾸로');
});

/* 화면 주소 왕복 */
const ctx = { location: { hash: '' } };
vm.createContext(ctx);
['viewHash', 'viewFromHash'].forEach(n => vm.runInContext(grab(n), ctx));
VD.items.forEach(it => {
  const h = ctx.viewHash({ name: 'vdq', id: it.id });
  ctx.location.hash = h;
  const v = ctx.viewFromHash();
  if (!v || v.name !== 'vdq' || v.id !== it.id) fail('[' + it.id + '] 주소 왕복 실패: ' + h + ' → ' + JSON.stringify(v));
});
ctx.location.hash = '#/video';
if ((ctx.viewFromHash() || {}).name !== 'video') fail('#/video 가 개요로 열리지 않는다');

console.log(bad ? '실패 ' + bad + '건' : '강의 ' + VD.items.length + '개 · 과목 ' + VD.subjects.length + '개 이상 없음');
process.exit(bad ? 1 : 0);
