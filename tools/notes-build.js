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
//   **굵게**  {r}빨강{/r}  {b}파랑{/b}  {g}초록{/g}  {u}밑줄{/u}   원본의 강조 그대로(초록은 앱의 원고 편집에서 더한 것) (tools/notes-fmt.js, 줄마다 짝이 맞아야 한다)
//   {2013}             2013 Edition 에만 있는 내용 표시
//   {w}                2013 판에서 워드 요약(data_source 의 .doc)으로 보탠 내용 표시
// 그림은 tools/notes-draft.js 로 꺼내고 tools/notes-img.ps1 로 바꾼다.
// 변환 자체는 tools/notes-core.js 에 있다 — 앱의 원고 편집(설정 › 원고 편집)이 같은 코드로 빌드해 커밋한다.
const fs = require('fs'), path = require('path');
const core = require('./notes-core');
const ROOT = path.join(__dirname, '..');
const ch = +process.argv[2], write = process.argv.includes('--write');
const ed = process.argv.includes('--ed') ? process.argv[process.argv.indexOf('--ed') + 1] : '2020';
if (ed !== '2020' && ed !== '2013') { console.error('--ed 는 2020 또는 2013'); process.exit(1); }
if (!core.NAMES[ch]) { console.error('사용: node tools/notes-build.js <과목 1~6> [--ed 2013] [--write]'); process.exit(1); }

const srcRel = core.srcRel(ch, ed);
const IMG_SUB = ed === '2013' ? 'img2013' : 'img';
const IMG_DIR = path.join(ROOT, 'data', 'notes', IMG_SUB);
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
function img(key) {
  const file = ['jpg', 'png'].map(e => key + '.' + e).find(f => fs.existsSync(path.join(IMG_DIR, f)));
  if (!file) return null;
  const [w, h] = imgSize(path.join(IMG_DIR, file));
  return { src: IMG_SUB + '/' + file, w, h };
}

const { book, errs, stat } = core.build(fs.readFileSync(path.join(__dirname, 'notes-src', srcRel), 'utf8'), { ch, ed, srcRel, img });

const nSec = book.chapters.reduce((a, c) => a + c.sections.length, 0);
const nItem = book.chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.items.length, 0), 0);
console.log('과목 ' + ch + ' ' + book.title + ' : ' + book.chapters.length + '장 ' + nSec + '절 ' + nItem + '항 · 본문 ' +
  stat.lines + '줄 · 표 ' + stat.tables + ' · 그림 ' + stat.images + ' · 2013 표시 ' + stat.e2013 + ' · 워드 표시 ' + stat.w + ' · 강조 빨강 ' + (stat.r||0) + ' 파랑 ' + (stat.b||0) + ' 초록 ' + (stat.g||0) + ' 밑줄 ' + (stat.u||0));
if (errs.length) { errs.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }

if (write) {
  const out = path.join(ROOT, 'data', 'notes', core.outRel(ch, ed));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, core.fileText(book), 'utf8');
  console.log('→ ' + path.relative(ROOT, out));
}
