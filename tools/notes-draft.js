/* 내용정리 초안 추출기 — 요약본 hwpx 를 내용정리 원고(.md) 초안으로 옮긴다.
   node tools/notes-draft.js <hwpx> <과목번호> <초안.md> [그림폴더]

   - 문단 스타일로 단계를 가른다: 장(#) · 절(##) · 항(###) · 「가.」(####) · 글머리(- 들여쓰기)
   - 원본의 강조는 표기로 남긴다: 굵게 **…** · 빨강 {r}…{/r} · 파랑 {b}…{/b} · 밑줄 {u}…{/u}
   - 표는 내용정리 표 표기(| 셀 |, 병합은 << ^^)로, 그림은 [[img:키]] 로 옮긴다
   - 그림폴더를 주면 BinData 원본을 키 이름으로 복사해 둔다 (변환은 tools/notes-img.ps1)
   초안은 사람이 다듬는다. 원고는 tools/notes-src/ 에 둔다. */
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const fmt = require('./notes-fmt');

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nl = buf.readUInt16LE(off + 28), xl = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nl);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.slice(start, start + csize);
    out[name] = () => method === 0 ? raw : zlib.inflateRawSync(raw);
    off += 46 + nl + xl + cl;
  }
  return out;
}

const unent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* 글자 모양별 강조 표기 — 굵게 ** · 빨강 {r} · 파랑 {b} · 밑줄 {u} (tools/notes-fmt.js).
   빨강·파랑이 아닌 색은 가장 가까운 쪽으로 붙이고, 검정·회색은 색이 없는 것으로 본다. */
function charStyles(header) {
  const map = {};
  for (const m of header.matchAll(/<hh:charPr id="(\d+)"([^>]*)>([\s\S]*?)<\/hh:charPr>/g)) {
    const color = ((/textColor="([^"]+)"/.exec(m[2]) || [])[1] || '#000000').toUpperCase();
    const [r, g, b] = [1, 3, 5].map(i => parseInt(color.substr(i, 2), 16) || 0);
    let col = '';
    if (r - Math.max(g, b) > 80) col = 'r';
    else if (b - Math.max(r, g) > 80) col = 'b';
    map[m[1]] = { col, bold: /<hh:bold/.test(m[3]), u: /<hh:underline type="(?!NONE)/.test(m[3]) };
  }
  return map;
}
const wrap = (t, st) => {
  if (!st || !t.trim()) return t;
  if (st.u) t = '{u}' + t + '{/u}';
  if (st.bold) t = '**' + t + '**';
  if (st.col) t = '{' + st.col + '}' + t + '{/' + st.col + '}';
  return t;
};

/* 문단 모양별 글머리 단계: <hh:heading type="BULLET" idRef="n"> 의 n(1~4) → 0~3 단계 */
function bulletLevels(header) {
  const map = {};
  for (const m of header.matchAll(/<hh:paraPr id="(\d+)"[^>]*>([\s\S]*?)<\/hh:paraPr>/g)) {
    const h = /<hh:heading type="BULLET" idRef="(\d+)"/.exec(m[2]);
    if (h) map[m[1]] = +h[1] - 1;
  }
  return map;
}

/* XML 을 태그 단위로 훑는 아주 작은 파서 */
function parse(xml) {
  const re = /<(\/?)([\w:]+)([^>]*?)(\/?)>|([^<]+)/g;
  const root = { tag: 'root', kids: [] }, stack = [root];
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.kids.push({ text: unent(m[5]) }); continue; }
    const [, close, tag, attrs, self] = m;
    if (close) { while (stack.length > 1 && stack.pop().tag !== tag); continue; }
    const node = { tag, attrs, kids: [] };
    top.kids.push(node);
    if (!self) stack.push(node);
  }
  return root;
}
const attr = (n, k) => (new RegExp('\\b' + k + '="([^"]*)"').exec(n.attrs || '') || [])[1];

function main() {
  const [file, ch, outPath, imgDir] = process.argv.slice(2);
  if (!outPath) { console.error('사용: node tools/notes-draft.js <hwpx> <과목번호> <초안.md> [그림폴더]'); process.exit(1); }
  const z = unzip(fs.readFileSync(file));
  const header = z['Contents/header.xml']().toString('utf8');
  const styles = charStyles(header), bullets = bulletLevels(header);
  const sec = Object.keys(z).filter(k => /^Contents\/section\d+\.xml$/.test(k)).sort();
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][+ch];
  const lines = [];
  let imgN = 0;
  const images = [];

  function imgKey(bin) {
    imgN++;
    const key = roman + '-' + String(imgN).padStart(2, '0');
    images.push({ key, bin });
    return key;
  }

  /* 문단 하나의 글자. 표·그림을 만나면 cb 로 넘긴다 */
  function runText(p, onBlock, inCell) {
    let s = '';
    const walk = (n, em) => {
      for (const k of n.kids) {
        if (k.text !== undefined) { s += wrap(k.text, em); continue; }
        if (k.tag === 'hp:run') walk(k, styles[attr(k, 'charPrIDRef')]);
        else if (k.tag === 'hp:t') walk(k, em);
        else if (k.tag === 'hp:tab') s += ' ';
        else if (k.tag === 'hp:lineBreak') s += inCell ? '¶' : '\n';
        else if (k.tag === 'hp:tbl') { if (inCell) s += tableInline(k); else onBlock({ tbl: k }); }
        else if (k.tag === 'hp:pic' || k.tag === 'hp:container' || k.tag === 'hp:rect') {
          const imgs = [];
          (function f(n2) { for (const c of n2.kids) { if (c.tag === 'hc:img') imgs.push(attr(c, 'binaryItemIDRef')); if (c.kids) f(c); } })(k);
          imgs.forEach(b => { if (inCell) s += ' [[img:' + imgKey(b) + ']] '; else onBlock({ img: b }); });
        }
        else if (k.kids && !/^hp:(linesegarray|shapeComment|ctrl|secPr)$/.test(k.tag)) walk(k, em);
      }
    };
    walk(p, false);
    return fmt.canon(s);   /* 같은 모양이 이어진 토막을 하나로 묶는다 */
  }

  function cellText(tc) {
    const out = [];
    const sub = tc.kids.find(k => k.tag === 'hp:subList');
    for (const p of (sub ? sub.kids : []).filter(k => k.tag === 'hp:p')) {
      const t = runText(p, null, true).trim();
      if (t) out.push(t);
    }
    return out.join('¶').replace(/\|/g, '｜');
  }
  function tableInline(tbl) { return '[표] ' + tableRows(tbl).join(' / '); }

  function tableRows(tbl) {
    const grid = [];
    let maxC = 0;
    for (const tr of tbl.kids.filter(k => k.tag === 'hp:tr')) {
      for (const tc of tr.kids.filter(k => k.tag === 'hp:tc')) {
        const addr = tc.kids.find(k => k.tag === 'hp:cellAddr'), span = tc.kids.find(k => k.tag === 'hp:cellSpan');
        const c = +attr(addr, 'colAddr'), r = +attr(addr, 'rowAddr');
        const cs = +attr(span, 'colSpan') || 1, rs = +attr(span, 'rowSpan') || 1;
        for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) {
          (grid[r + i] = grid[r + i] || [])[c + j] = i === 0 && j === 0 ? cellText(tc) : (i === 0 ? '<<' : '^^');
        }
        maxC = Math.max(maxC, c + cs);
      }
    }
    return grid.filter(Boolean).map(row => {
      const cells = [];
      for (let j = 0; j < maxC; j++) cells.push(row[j] === undefined ? '' : row[j]);
      return '| ' + cells.join(' | ') + ' |';
    });
  }

  for (const s of sec) {
    const root = parse(z[s]().toString('utf8'));
    const secNode = root.kids.find(k => k.tag === 'hs:sec') || root;
    for (const p of secNode.kids.filter(k => k.tag === 'hp:p')) {
      const blocks = [];
      let text = runText(p, b => blocks.push(b), false).trim();
      const st = attr(p, 'styleIDRef');
      const plainT = fmt.plain(text);
      const boldStart = /^(\{[rb]\})?\*\*/.test(text);
      let pre = '';
      const bl = bullets[attr(p, 'paraPrIDRef')];
      if (/^제\s*\d+\s*장/.test(plainT)) pre = '# ';
      else if (/^제\s*\d+\s*절/.test(plainT)) pre = '## ';
      else if (st === '1') pre = '# ';
      else if (st === '2') pre = '## ';
      else if (/^[가-하]\.\s/.test(plainT)) pre = '#### ';
      else if (/^\d+\.\s/.test(plainT) && (st === '3' || boldStart)) pre = '### ';
      else if (/^\d+\)\s/.test(plainT.trim()) && boldStart) pre = '##### ';
      else if (st === '3') pre = '### ';
      else if (st === '4') pre = '#### ';
      else if (bl !== undefined) pre = '  '.repeat(bl) + '- ';
      else if (st === '5') pre = '- ';
      else if (st === '6') pre = '  - ';
      else if (st === '7') pre = '    - ';
      else if (st === '8') pre = '      - ';
      if (pre.startsWith('#')) text = plainT.trim();
      if (text) lines.push(pre + text.replace(/\n/g, '\n' + ' '.repeat(pre.startsWith('#') ? 0 : pre.length)));
      for (const b of blocks) {
        if (b.img) lines.push('[[img:' + imgKey(b.img) + ']]');
        else { lines.push(''); lines.push(...tableRows(b.tbl)); lines.push(''); }
      }
    }
  }
  fs.writeFileSync(outPath, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');

  if (imgDir) {
    fs.mkdirSync(imgDir, { recursive: true });
    const bins = Object.keys(z).filter(k => k.startsWith('BinData/'));
    const map = [];
    for (const { key, bin } of images) {
      const src = bins.find(k => path.basename(k).replace(/\.\w+$/, '') === bin);
      if (!src) { console.error('그림 없음: ' + bin); continue; }
      const dst = path.join(imgDir, key + path.extname(src).toLowerCase());
      fs.writeFileSync(dst, z[src]());
      map.push(key + '\t' + path.basename(src));
    }
    fs.writeFileSync(path.join(imgDir, '_map.tsv'), map.join('\n') + '\n', 'utf8');
  }
  console.log(path.basename(file) + ' → ' + lines.length + '줄, 그림 ' + images.length + '장');
}
main();
