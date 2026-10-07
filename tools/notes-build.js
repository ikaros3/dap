// 내용정리 원고(tools/notes-src/chN.md) → data/notes/N.과목명.js
//
// node tools/notes-build.js <과목> [--ed 2013] [--write]   (--write 없으면 점검 통계만)
//
// 판(--ed) — 내용정리는 두 판이다. 기본은 2020(요약본).
//   2020 : 원고 tools/notes-src/chN.md       → data/notes/N.과목명.js,      그림 data/notes/img/
//   2013 : 원고 tools/notes-src/2013/chN.md  → data/notes/2013/N.과목명.js, 그림 data/notes/img2013/
//          (준전문가 가이드 본문을 개조식으로 정리한 것. 데이터 머리에 ed:"2013" 이 들어간다)
//
// 원고 형식
//   --- 머리 (ch, title, sourceFiles: 파일 | 파일) ---
//   # 제1장 …          장
//   ## 제1절 …         절 — 화면 한 장. 첫 ### 앞의 글은 절 머리말이 된다
//   ### 1. …           항 — 절 화면의 소제목, 오른쪽 목차에 나온다
//   #### 가. …  ##### 1) …   항 안의 소제목
//   - 글머리 (두 칸 들여쓰기마다 한 단계). 글머리 아래 들여쓴 줄은 같은 항목의 다음 줄
//   ‖ 머리 | 셀 |  /  | 셀 | 셀 |   표. 셀 안 줄바꿈 ¶, 병합은 << (왼쪽 칸과) ^^ (위 칸과)
//   [표 III-1-1] …  [그림 …] …  [정리] …   표·그림 제목
//   [[img:III-01]]     그림 — data/notes/img/III-01.(jpg|png)
//   > 암기 : …         암기 상자
//   **굵게**  {r}빨강{/r}  {b}파랑{/b}  {u}밑줄{/u}   원본의 강조 그대로 (tools/notes-fmt.js, 줄마다 짝이 맞아야 한다)
//   {2013}             2013 Edition 에만 있는 내용 표시
//   {w}                2013 판에서 워드 요약(data_source 의 .doc)으로 보탠 내용 표시
// 그림은 tools/notes-draft.js 로 꺼내고 tools/notes-img.ps1 로 바꾼다.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const NAMES = { 1: '전사아키텍처이해', 2: '데이터요건분석', 3: '데이터표준화', 4: '데이터모델링', 5: '데이터베이스설계와이용', 6: '데이터품질관리이해' };
const ch = +process.argv[2], write = process.argv.includes('--write');
const ed = process.argv.includes('--ed') ? process.argv[process.argv.indexOf('--ed') + 1] : '2020';
if (ed !== '2020' && ed !== '2013') { console.error('--ed 는 2020 또는 2013'); process.exit(1); }
const E13 = ed === '2013';
if (!NAMES[ch]) { console.error('사용: node tools/notes-build.js <과목 1~6> [--ed 2013] [--write]'); process.exit(1); }

const srcRel = (E13 ? '2013/' : '') + 'ch' + ch + '.md';
const srcPath = path.join(__dirname, 'notes-src', srcRel);
const IMG_SUB = E13 ? 'img2013' : 'img';
const IMG_DIR = path.join(ROOT, 'data', 'notes', IMG_SUB);
let text = fs.readFileSync(srcPath, 'utf8').replace(/\r/g, '');

/* 머리 */
const meta = {};
const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
if (fm) {
  fm[1].split('\n').forEach(l => { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); });
  text = text.slice(fm[0].length);
}
/* 그림의 가로·세로 — 화면이 그림을 읽기 전에 자리를 잡아 두어, 목차로 건너뛸 때 위치가 밀리지 않게 한다 */
function imgSize(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length - 9;) {
    const mk = b[i + 1], len = b.readUInt16BE(i + 2);
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

const errs = [];
if (+meta.ch !== ch) errs.push('머리의 ch(' + meta.ch + ')가 과목 번호와 다르다');

const book = Object.assign(E13 ? { ed: '2013' } : {}, {
  ch, title: meta.title || '',
  sourceFiles: (meta.sourceFiles || '').split('|').map(s => s.trim()).filter(Boolean),
  images: {}, chapters: []
});
let C = null, S = null, I = null;
const stat = { lines: 0, tables: 0, images: 0, e2013: 0, w: 0 };

text.split('\n').forEach((line, n) => {
  const at = srcRel + ':' + (n + 1);
  let m;
  if ((m = /^# 제\s*(\d+)\s*장\s+(.+)$/.exec(line))) {
    C = { no: +m[1], title: m[2].trim(), sections: [] }; book.chapters.push(C); S = I = null; return;
  }
  if ((m = /^## 제\s*(\d+)\s*절\s+(.+)$/.exec(line))) {
    if (!C) { errs.push(at + ' 장 없이 절이 나왔다'); return; }
    S = { no: +m[1], title: m[2].trim(), intro: '', items: [] }; C.sections.push(S); I = null; return;
  }
  if ((m = /^### (\d+)\.\s*(.+)$/.exec(line))) {
    if (!S) { errs.push(at + ' 절 없이 항이 나왔다'); return; }
    I = { no: +m[1], title: m[2].trim(), body: '' }; S.items.push(I); return;
  }
  if (/^#{1,3} /.test(line)) { errs.push(at + ' 형식을 모르는 제목: ' + line); return; }
  if (!S) { if (line.trim()) errs.push(at + ' 절 밖의 글: ' + line.slice(0, 40)); return; }
  if (I) I.body += line + '\n'; else S.intro += line + '\n';
  if (line.trim()) stat.lines++;
  for (const im of line.matchAll(/\[\[img:([\w-]+)\]\]/g)) {
    const key = im[1];
    const file = ['jpg', 'png'].map(e => key + '.' + e).find(f => fs.existsSync(path.join(IMG_DIR, f)));
    if (!file) errs.push(at + ' 그림 파일 없음: ' + key);
    else { const [w, h] = imgSize(path.join(IMG_DIR, file)); book.images[key] = { src: IMG_SUB + '/' + file, w, h }; }
    stat.images++;
  }
  stat.e2013 += (line.match(/\{2013\}/g) || []).length;
  stat.w += (line.match(/\{w\}/g) || []).length;
  /* 강조 표기 짝 — 한 줄(표는 한 칸) 안에서 닫혀야 화면에서 태그가 엇갈리지 않는다 */
  (/^[|‖] /.test(line) ? line.slice(2, -2).split(' | ') : [line]).forEach(part => {
    const odd = ((part.match(/\*\*/g) || []).length % 2) ? ['**'] : [];
    ['r', 'b', 'u'].forEach(t => {
      if ((part.split('{' + t + '}').length) !== (part.split('{/' + t + '}').length)) odd.push('{' + t + '}');
    });
    if (odd.length) errs.push(at + ' 강조 표기 짝이 안 맞는다 (' + odd.join(' ') + '): ' + part.slice(0, 40));
  });
  for (const k of ['r', 'b', 'u']) stat[k] = (stat[k] || 0) + (line.split('{' + k + '}').length - 1);
});

/* 다듬기 · 점검: 앞뒤 빈 줄을 걷고, 표의 칸 수가 행마다 같은지 본다 */
const trim = s => s.replace(/^\n+|\s+$/g, '');
book.chapters.forEach(c => c.sections.forEach(s => {
  s.intro = trim(s.intro);
  s.items.forEach(i => { i.body = trim(i.body); });
  [s.intro].concat(s.items.map(i => i.body)).forEach(body => {
    let rows = [];
    const flush = () => {
      if (!rows.length) return;
      stat.tables++;
      const w = rows.map(r => r.split(' | ').length);
      if (new Set(w).size > 1) errs.push(c.no + '장 ' + s.no + '절 표의 칸 수가 행마다 다르다 (' + w.join(',') + '): ' + rows[0].slice(0, 40));
      rows = [];
    };
    body.split('\n').forEach(l => { if (/^[|‖] /.test(l)) rows.push(l.replace(/\s+$/, '').slice(2, -2)); else flush(); });
    flush();
  });
  s.items.forEach((i, k) => { if (i.no !== k + 1) errs.push(c.no + '장 ' + s.no + '절 항 번호가 이어지지 않는다: ' + i.no + '. ' + i.title); });
}));
book.chapters.forEach((c, k) => { if (c.no !== k + 1) errs.push('장 번호가 이어지지 않는다: 제' + c.no + '장'); });

const nSec = book.chapters.reduce((a, c) => a + c.sections.length, 0);
const nItem = book.chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.items.length, 0), 0);
console.log('과목 ' + ch + ' ' + book.title + ' : ' + book.chapters.length + '장 ' + nSec + '절 ' + nItem + '항 · 본문 ' +
  stat.lines + '줄 · 표 ' + stat.tables + ' · 그림 ' + stat.images + ' · 2013 표시 ' + stat.e2013 + ' · 워드 표시 ' + stat.w + ' · 강조 빨강 ' + (stat.r||0) + ' 파랑 ' + (stat.b||0) + ' 밑줄 ' + (stat.u||0));
if (errs.length) { errs.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }

if (write) {
  const out = path.join(ROOT, 'data', 'notes', E13 ? '2013' : '', ch + '.' + NAMES[ch] + '.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out,
    '/* 내용정리' + (E13 ? ' 2013 Edition' : '') + ' · 과목 ' + ch + ' ' + book.title + '\n' +
    '   tools/notes-build.js 가 tools/notes-src/' + srcRel + ' 에서 만든다. 손으로 고치지 말 것. */\n' +
    'DAP_NOTES.add(' + JSON.stringify(book, null, 1) + ');\n', 'utf8');
  console.log('→ ' + path.relative(ROOT, out));
}
