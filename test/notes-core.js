/* 내용정리 변환 모듈 점검.   node test/notes-core.js
   - 원고를 tools/notes-core.js 로 빌드한 결과가 저장소의 data/notes/…js 와 같은가 (원고를 고치고 빌드를 잊었는지)
   - itemRange 가 모든 절 머리말·항의 원고 범위를 정확히 짚는가 — 앱의 원고 편집이 이 범위를 바꿔 커밋한다
   - 한 항만 바꿔 다시 빌드하면 그 항만 바뀌는가 */
const fs = require('fs'), path = require('path');
const core = require('../tools/notes-core');
const ROOT = path.join(__dirname, '..');
let bad = 0, n = 0;
const fail = m => { bad++; console.log('FAIL  ' + m); };

['2020', '2013'].forEach(ed => {
  Object.keys(core.NAMES).map(Number).forEach(ch => {
    const src = path.join(ROOT, 'tools', 'notes-src', core.srcRel(ch, ed));
    const out = path.join(ROOT, 'data', 'notes', core.outRel(ch, ed));
    if (!fs.existsSync(src) || !fs.existsSync(out)) return;
    const text = fs.readFileSync(src, 'utf8'), have = fs.readFileSync(out, 'utf8');
    const old = JSON.parse(have.slice(have.indexOf('DAP_NOTES.add(') + 14, have.lastIndexOf(');')));
    const img = k => old.images[k] || null;
    const r = core.build(text, { ch, ed, img });
    const tag = ed + ' 과목 ' + ch;
    if (r.errs.length) fail(tag + ' 빌드 오류 ' + r.errs[0]);
    if (core.fileText(r.book) !== have) fail(tag + ' 원고와 데이터 파일이 다르다 — node tools/notes-build.js ' + ch + (ed === '2013' ? ' --ed 2013' : '') + ' --write');

    const lines = text.split('\n');
    r.book.chapters.forEach(C => C.sections.forEach(Sx => {
      [{ no: 0, body: Sx.intro }].concat(Sx.items).forEach(it => {
        n++;
        const at = tag + ' ' + C.no + '장 ' + Sx.no + '절 ' + it.no + '항';
        const g = core.itemRange(text, C.no, Sx.no, it.no);
        if (!g) { if (it.no || it.body) fail(at + ' 범위를 못 찾음'); return; }
        let part = lines.slice(g.from, g.to);
        if (it.no) {
          if (!/^### (\d+)\./.test(part[0]) || +/^### (\d+)\./.exec(part[0])[1] !== it.no) { fail(at + ' 첫 줄이 항 제목이 아님: ' + part[0]); return; }
          part = part.slice(1);
        }
        if (part.join('\n').replace(/^\n+|\s+$/g, '') !== it.body) fail(at + ' 범위의 본문이 데이터와 다르다');
      });
    }));

    /* 가운데 항 하나를 바꿔 본다 */
    const all = [];
    r.book.chapters.forEach(C => C.sections.forEach(Sx => Sx.items.forEach(it => all.push({ C, Sx, it }))));
    const x = all[all.length >> 1], g = core.itemRange(text, x.C.no, x.Sx.no, x.it.no);
    const r2 = core.build(core.splice(text, g, '### ' + x.it.no + '. 바꾼 제목\n- 바꾼 줄\n'), { ch, ed, img });
    const it2 = r2.book.chapters.find(C => C.no === x.C.no).sections.find(S => S.no === x.Sx.no).items[x.it.no - 1];
    if (r2.errs.length || it2.title !== '바꾼 제목' || it2.body !== '- 바꾼 줄') fail(tag + ' 바꾼 항이 반영되지 않음');
    it2.title = x.it.title; it2.body = x.it.body;
    const imgs = Object.keys(r.book.images).length === Object.keys(r2.book.images).length;
    if (imgs && JSON.stringify(r2.book) !== JSON.stringify(r.book)) fail(tag + ' 다른 항까지 바뀌었다');
  });
});
console.log((bad ? '✗ ' + bad + '건 실패' : '✓ 통과') + ' · 범위 ' + n + '곳');
process.exit(bad ? 1 : 0);
