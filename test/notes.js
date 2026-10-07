/* 내용정리 점검.   node test/notes.js
   - manifest 의 notes 파일이 있고, 과목 번호가 맞고, 그림 파일이 모두 있는가
   - 앱의 noteHtml(원문 그대로 꺼냄)로 모든 절을 그려 태그 짝이 맞는가
   - 문항의 s(「N장 M절 주제」)가 가리키는 절이 실제로 있는가 — 없으면 실패
     그 주제에 맞는 소제목을 찾지 못한 문항은 「확인 요망」으로 센다(절 머리로 열린다) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync('index.html', 'utf8');
function grab(name) {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}'));
  if (!m) { console.error('추출 실패: ' + name); process.exit(1); }
  return m[0];
}
const ctx = { console };
vm.createContext(ctx);
const tagDecl = src.match(/var NOTE_TAG = .*;/);
if (!tagDecl) { console.error('추출 실패: NOTE_TAG'); process.exit(1); }
vm.runInContext(tagDecl[0], ctx);
['esc', 'noteInline', 'noteList', 'noteTable', 'noteHtml', 'noteHeads', 'noteAnchor', 'srcKind']
  .forEach(n => vm.runInContext(grab(n), ctx));

const M = {};
vm.runInContext(fs.readFileSync('data/manifest.js', 'utf8'), vm.createContext({ window: M }));
const notes = (M.DAP_MANIFEST.notes || []);
let bad = 0, warn = 0;
const fail = m => { bad++; console.log('FAIL  ' + m); };

const NOTES = {};
notes.forEach(n => {
  const file = path.join('data', n.file);
  if (!fs.existsSync(file)) return fail('파일 없음: ' + file);
  vm.runInContext(fs.readFileSync(file, 'utf8'), vm.createContext({ DAP_NOTES: { add: b => { NOTES[n.ch] = b; } } }));
  const b = NOTES[n.ch];
  if (!b || b.ch !== n.ch) return fail(file + ' 의 ch 가 manifest 와 다르다');
  Object.entries(b.images || {}).forEach(([k, im]) => {
    if (!fs.existsSync(path.join('data', 'notes', im.src))) fail(k + ' 그림 파일 없음: ' + im.src);
  });
  let secs = 0;
  b.chapters.forEach(C => C.sections.forEach(S => {
    secs++;
    const H = { n: 0 };
    let html = ctx.noteHtml(S.intro, b, H);
    S.items.forEach(it => { html += ctx.noteHtml(it.body, b, H); });
    for (const t of ['ul', 'li', 'table', 'tr', 'div', 'figure']) {
      const o = (html.match(new RegExp('<' + t + '[ >]', 'g')) || []).length, c = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
      if (o !== c) fail(n.ch + '-' + C.no + '-' + S.no + ' <' + t + '> 짝이 안 맞는다 (' + o + '/' + c + ')');
    }
    if (/\[그림을 찾을 수 없습니다/.test(html)) fail(n.ch + '-' + C.no + '-' + S.no + ' 그림 키를 못 찾았다');
    const heads = ctx.noteHeads(S);
    if (heads.filter(h => h.lv === 4 || h.lv === 5).length !== H.n || heads.filter(h => h.lv === 6).length !== (H.c || 0)) fail(n.ch + '-' + C.no + '-' + S.no + ' 소제목 번호가 noteHeads 와 noteHtml 에서 다르다');
  }));
  console.log('PASS  과목 ' + n.ch + ' ' + b.title + ' — ' + secs + '절, 그림 ' + Object.keys(b.images || {}).length);
});

/* 문항 → 절 · 소제목 */
const packs = [];
fs.readdirSync('data').filter(f => /^\d\..*\.js$/.test(f)).forEach(f => {
  vm.runInContext(fs.readFileSync(path.join('data', f), 'utf8'), vm.createContext({ DAP_BANK: { add: p => packs.push(p) } }));
});
Object.keys(NOTES).forEach(chs => {
  const ch = +chs, b = NOTES[ch];
  let linked = 0, anchored = 0;
  const miss = {};
  packs.filter(p => p.chapter === ch).forEach(p => p.questions.forEach(q => {
    const m = /^(\d+)장 (\d+)절\s*(.*)$/.exec(q.s || '');
    if (!m) return;
    const files = [].concat(q.rf || p.sourceFiles || []);
    if (files.length && !files.some(f => ctx.srcKind(f) === '요약본')) return;
    linked++;
    const C = b.chapters.find(c => c.no === +m[1]), S = C && C.sections.find(s => s.no === +m[2]);
    if (!S) return fail(q.id + ' 의 ' + q.s + ' — 그런 절이 내용정리에 없다');
    if (ctx.noteAnchor(S, m[3]) || m[3].replace(/\s/g, '') === S.title.replace(/\s/g, '')) anchored++;   /* 절 제목 그 자체면 절 머리가 맞는 자리 */
    else (miss[q.s] = miss[q.s] || []).push(q.id);
  }));
  const keys = Object.keys(miss);
  warn += keys.length;
  console.log('PASS  과목 ' + ch + ' 문항 연결 ' + linked + '문항 — 소제목까지 ' + anchored + ', 절 머리로 ' + (linked - anchored));
  keys.forEach(k => console.log('      확인 요망  ' + k + '  (' + miss[k].join(', ') + ')'));
});

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과' + (warn ? ' (확인 요망 ' + warn + ')' : ''));
process.exit(bad ? 1 : 0);
