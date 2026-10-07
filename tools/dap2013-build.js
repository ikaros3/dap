/* DAP 자격검정 실전문제(2013 Edition) → 문제은행 묶음 "dap2013"
 *
 *   node tools/dap2013-build.js
 *
 * 읽는 것 (data_source/DAP 자격검정 실전문제 2013 Edition/, 저장소 밖)
 *   DAP 자격검정 실전문제 2013 Edition.docx          문제
 *   DAP 자격검정 실전문제 2013 Edition_모범답안.docx  정답·해설
 * 만드는 것
 *   data/dap2013.js          평문 팩 (과목마다 DAP_BANK.add 한 번). 암호 없이 바로 읽힌다.
 *                            저장소에 올라가므로 배포본에서 누구나 볼 수 있다 (memory.md 3.14)
 *
 * docx 는 zip + XML 이다. document.xml 을 문단·표·그림 순서대로 풀어 문항 단위로 끊고,
 * 원본의 표·그림·「아 래」 상자·SQL 을 지문 서식(index.html 의 rich())으로 옮긴다.
 *   [[img:키]]  ::: 상자 :::  ``` 고정폭 ```  | 표 |  (‖ 로 시작하면 머리행, 셀 안 줄바꿈 ¶)
 *
 * 문항 본문에 「문제 은행 제외」가 적힌 것은 뺀다. 252번은 보기 없는 서술형(모델 작성)이라 뺀다.
 * 그림은 폭 1400px 이하 JPEG 로 줄인다(Windows PowerShell 의 System.Drawing). 원본보다
 * 작아지지 않으면 원본을 쓰고, SVG 가 딸린 그림은 SVG 를 쓴다. PowerShell 이 없으면 원본 그대로.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_Q = 'DAP 자격검정 실전문제 2013 Edition.docx';
const SRC_A = 'DAP 자격검정 실전문제 2013 Edition_모범답안.docx';
/* data_source/ 는 자료 묶음마다 하위 폴더로 나뉜다. 실전문제 docx·캡처 그림은 이 폴더에 함께 둔다. */
const SRC_DIR = path.join(ROOT, 'data_source', 'DAP 자격검정 실전문제 2013 Edition');
const MARK = '①②③④';

/* ─────────── zip ─────────── */
function unzip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip 이 아님: ' + file);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.slice(start, start + csize);
    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

/* ─────────── document.xml → 블록 ───────────
   p   : { t:'p', s, imgs }  — s 안의 그림 자리는 \0IMG:media/imageN.ext\0
   tbl : { t:'tbl', rows:[[cell]] }, cell = 블록 배열
   글상자(도형 안 텍스트)는 문단의 boxes 에 블록 배열로 붙는다 */
function readBlocks(zip) {
  const xml = zip['word/document.xml'].toString('utf8');
  const rels = zip['word/_rels/document.xml.rels'].toString('utf8');
  const rmap = {};
  for (const m of rels.matchAll(/<Relationship [^>]*>/g)) rmap[/Id="([^"]+)"/.exec(m[0])[1]] = /Target="([^"]+)"/.exec(m[0])[1];
  const dec = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  function endOf(s, start, tag) {
    const re = new RegExp('<(/?)' + tag + '(?=[ >/])[^>]*?(/?)>', 'g'); re.lastIndex = start;
    let depth = 0, m;
    while ((m = re.exec(s))) {
      if (m[1]) depth--; else if (!m[2]) depth++;
      if (depth === 0) return re.lastIndex;
    }
    return s.length;
  }
  function children(s) {
    const out = [], re = /<(w:p|w:tbl|w:sdt)(?=[ >\/])/g; let m;
    while ((m = re.exec(s))) {
      const e = endOf(s, m.index, m[1]);
      out.push({ tag: m[1], x: s.slice(m.index, e) });
      re.lastIndex = e;
    }
    return out;
  }
  function para(p) {
    p = p.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');     /* 같은 그림의 대체본 */
    const txbx = [];
    p = p.replace(/<w:txbxContent>([\s\S]*?)<\/w:txbxContent>/g, (m, inner) => { txbx.push(inner); return '<TXBX/>'; });
    let s = '', ti = 0; const imgs = [], boxes = [];
    const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|r:embed="([^"]+)"|<TXBX\/>/g; let m;
    while ((m = re.exec(p))) {
      if (m[1] !== undefined) s += dec(m[1]);
      else if (m[0] === '<w:tab/>') s += '\t';
      else if (m[0] === '<w:br/>') s += '\n';
      else if (m[2]) { const f = rmap[m[2]]; imgs.push(f); s += '\u0000IMG:' + f + '\u0000'; }
      else boxes.push(walk(txbx[ti++]));
    }
    const b = { t: 'p', s, imgs };
    if (boxes.length) b.boxes = boxes;
    return b;
  }
  function walk(s) {
    const out = [];
    for (const c of children(s)) {
      if (c.tag === 'w:p') out.push(para(c.x));
      else if (c.tag === 'w:sdt') { const i = /<w:sdtContent>([\s\S]*)<\/w:sdtContent>/.exec(c.x); if (i) out.push(...walk(i[1])); }
      else {
        const rows = [], inner = c.x.slice(c.x.indexOf('>') + 1, c.x.lastIndexOf('</w:tbl>'));
        const re = /<w:tr(?=[ >])/g; let m;
        while ((m = re.exec(inner))) {
          const e = endOf(inner, m.index, 'w:tr'), tr = inner.slice(m.index, e); re.lastIndex = e;
          const trIn = tr.slice(tr.indexOf('>') + 1), cells = [], rc = /<w:tc(?=[ >])/g; let mc;
          while ((mc = rc.exec(trIn))) {
            const ce = endOf(trIn, mc.index, 'w:tc'); rc.lastIndex = ce;
            const tc = trIn.slice(mc.index, ce);
            cells.push(walk(tc.slice(tc.indexOf('>') + 1)));
          }
          rows.push(cells);
        }
        out.push({ t: 'tbl', rows });
      }
    }
    return out;
  }
  return walk(xml.slice(xml.indexOf('<w:body>') + 8, xml.lastIndexOf('</w:body>')));
}

/* ─────────── 문항 / 해설 단위로 끊기 ─────────── */
const CH_RE = /^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ)\. /;
const ROMAN = { 'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6 };
function splitQuestions(B) {
  const qs = []; let cur = null, ch = 0;
  for (const b of B) {
    if (b.t === 'p') {
      const s = b.s.trim(), cm = CH_RE.exec(s);
      if (cm && s.length < 40) { ch = ROMAN[cm[1]]; cur = null; continue; }
      if (/^데이터아키텍처 자격검정 실전문제|^DAP 실전문제 2013|^253~255/.test(s)) { cur = null; continue; }
      const qm = /^(\d+)\.\t/.exec(b.s);
      if (qm) { cur = { no: +qm[1], ch, blocks: [] }; qs.push(cur); b.s = b.s.slice(qm[0].length); }
    }
    if (cur) cur.blocks.push(b);
  }
  return qs;
}
function splitAnswers(B) {
  const as = {}; let cur = null;
  for (const b of B) {
    if (b.t === 'p') {
      if (CH_RE.test(b.s.trim()) && b.s.length < 50) { cur = null; continue; }
      const m = /^\s*(\d+)\s+(?:정답\s*(.*))?$/.exec(b.s);
      if (m && +m[1] >= 1 && +m[1] <= 395 && (m[2] !== undefined || b.s.trim() === m[1])) {
        cur = { no: +m[1], head: (m[2] || '').trim(), blocks: [] }; as[cur.no] = cur; continue;
      }
    }
    if (cur) cur.blocks.push(b);
  }
  return as;
}

/* ─────────── 블록 → 지문 서식 ─────────── */
const imgKey = (side, f) => 'd13' + side + '-' + f.replace(/^media\/image/, '').replace(/\.\w+$/, '');
function pText(b, side) {
  let s = b.s; const imgs = b.imgs || [];
  for (let i = 0; i < imgs.length; i++) {
    const f = imgs[i], n = imgs[i + 1];
    /* png 바로 뒤에 svg 가 오면 같은 그림의 두 형식이다 — svg 쪽만 쓴다 */
    if (/\.png$/.test(f) && n && /\.svg$/.test(n)) { s = s.replace('\u0000IMG:' + f + '\u0000', ''); continue; }
    s = s.replace('\u0000IMG:' + f + '\u0000', '\n[[img:' + imgKey(side, f) + ']]\n');
  }
  if (b.boxes) s += '\n' + b.boxes.map(bx => ':::\n' + bx.map(x => blockText(x, side)).join('\n') + '\n:::').join('\n');
  return s;
}
const cellText = (cell, side) => cell.map(b => blockText(b, side)).join('\n');
const isCode = s => /\bSELECT\b|\bFROM\b|\bWHERE\b|TABLE ACCESS|INDEX (RANGE|UNIQUE|FULL)|call\s+count|NESTED LOOPS|SORT|HASH JOIN|^\s{3,}\S/m.test(s);
function tblText(t, side) {
  const rows = t.rows;
  /* 한 칸짜리 표(또는 한 열짜리)는 원본의 「아 래」 상자나 SQL 상자다 */
  if (rows.every(r => r.length === 1)) {
    const s = rows.map(r => cellText(r[0], side)).join('\n').replace(/\n+$/, '');
    return isCode(s) ? '```\n' + s + '\n```' : ':::\n' + s + '\n:::';
  }
  /* 머리행 — 첫 행이 빈칸 없이 채워져 있고, ㄱ./가./① 같은 항목 나열이 아닐 때 */
  const r0 = rows[0].map(c => cellText(c, side).trim());
  const head = rows.length >= 2 && r0.every(x => x) && !r0.some(x => /^([ㄱ-ㅎ가-힣]\.|[①②③④])/.test(x));
  return '\n' + rows.map((r, ri) => (ri === 0 && head ? '‖ ' : '| ') + r.map(c =>
    cellText(c, side).replace(/\n+$/, '').replace(/\n/g, '¶').replace(/\|/g, '｜').trim()
  ).join(' | ') + ' |').join('\n') + '\n';
}
function blockText(b, side) { return b.t === 'p' ? pText(b, side) : tblText(b, side); }

/* 문항 블록 → 지문 + 보기 4개. 보기는 ①로 시작하는 문단, 또는 ①이 든 표(2×2 배치)부터다 */
function isChoiceTable(t) {
  const flat = t.rows.flat().map(c => c.map(b => b.s || '').join(' ').trim());
  return flat.some(x => x.startsWith('①')) && flat.some(x => /^[②③④]/.test(x));
}
function convert(q) {
  const ci = q.blocks.findIndex(b => (b.t === 'p' && /^\s*①/.test(b.s)) || (b.t === 'tbl' && isChoiceTable(b)));
  const stemB = ci < 0 ? q.blocks : q.blocks.slice(0, ci), choB = ci < 0 ? [] : q.blocks.slice(ci);
  const stem = stemB.map(b => blockText(b, 'q')).join('\n');
  const ctext = choB.map(b => (b.t === 'tbl' && isChoiceTable(b))
    ? b.rows.map(r => r.map(c => cellText(c, 'q')).join('\n')).join('\n')
    : blockText(b, 'q')).join('\n');
  const c = ['', '', '', ''];
  for (const p of ctext.split(/(?=[①②③④])/)) { const k = MARK.indexOf(p[0]); if (k >= 0) c[k] += p.slice(1); }
  return { stem: stem.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''), c: c.map(x => x.trim()) };
}

/* ─────────── 원본 그대로는 옮겨지지 않는 문항 ─────────── */
const cellPlain = c => c.map(b => b.t === 'p' ? b.s : '').join('\n').trim();

/* 보기가 표의 행(①~④)이고 머리행에 항목 이름이 있는 문항(76·90·104) — 이름을 붙여 보기 글로 푼다 */
function choiceRowsTable(q) {
  const t = q.blocks.find(b => b.t === 'tbl' && b.rows.length === 5 && cellPlain(b.rows[1][0]) === '①');
  if (!t) return null;
  const head = t.rows[0].map(c => cellPlain(c).replace(/^구 분$/, '구분').replace(/^용 어$/, '용어').replace(/^도 메 인$/, '도메인'));
  return {
    stem: q.blocks.filter(b => b !== t && b.t === 'p').map(b => b.s).join('\n').trim(),
    c: t.rows.slice(1).map(r => r.slice(1).map((cell, j) =>
      head[j + 1] + ' : ' + cell.filter(b => b.t === 'p').map(b => b.s.trim()).filter(Boolean).join(', ')).join('\n')),
  };
}
/* CRUD 매트릭스(74·77~80) — 첫 칸의 셀값 범례를 표 위로 빼고, 세로쓰기 머리글을 한 줄로 */
function crudFix(stem) {
  return stem.replace(/^‖ 셀값 정의¶(.*?)¶¶기본프로세스 \| 정¶보¶항¶목 \| (.*) \|$/m, (m, legend, cols) =>
    '셀값 정의 — ' + legend.split('¶').map(s => s.trim()).filter(Boolean).join(' · ') +
    '\n‖ 기본프로세스 ＼ 정보항목 | ' + cols.split(' | ').map(s => s.replace(/¶/g, '')).join(' | ') + ' |');
}
const OVERRIDE = {
  /* 모범답안은 ① 만 정답인데 ③ 도 틀린 설명이다 — "모두 고르시오" 로 고쳐 ①·③ 을 정답으로 */
  267: s => s.replace(/틀린 것은\?$/, '틀린 것을 모두 고르시오.'),
  /* tab1·tab2 두 개의 작은 표가 표 안의 표로 들어 있다 */
  321: s => s.replace(/:::\s*\n\| tab1 테이블.*\n:::/, '[tab1 테이블]\n‖ col1 |\n| A |\n| B |\n| C |\n\n[tab2 테이블]\n‖ col2 |\n| A |\n| C |\n| D |'),
};
/* 보기 넷이 그림 한 장 안에 그려진 문항 */
const PICTURE_CHOICES = [158, 162, 204, 238];
/* 158번은 문제 오류 — 모범답안은 ② 를 틀린 표기로 보지만 ② 도 가능한 표기라 잘못된 것이 없다.
   보기 ⑤ "없다" 를 더해 정답으로 한다. 이 문항만 보기가 다섯이다. */
const NONE_CHOICE = { 158: '없다' };
/* 과목 5 머리에 따로 놓인 그림 — 261~264번이 함께 본다 */
const SHARED = { from: 261, to: 264, text: '[261~264번 공통] 아래는 OLTP 시스템 데이터 모델 일부이다.\n[[img:d13q-24]]\n\n' };
const SKIP = { 252: '서술형(모델 작성) — 보기가 없다' };
/* 모범답안의 정답 줄에 붙은 정정 메모 — 해설 끝에 옮겨 둔다 */
const NOTE_TEXT = {
  158: '※ 문제 오류 : 모범답안은 ②를 정답(잘못된 표기)으로 두었으나 ②도 가능한 표기이므로 잘못 표기된 것이 없다. 보기 ⑤ "없다"를 더해 정답으로 한다.',
  266: '※ 모범답안 정정 : 원래 해설의 정답 ③은 오답이며 ④가 정답이다.',
  267: '※ 문제 수정 : 모범답안은 ①만 정답이지만 ③도 틀린 설명이다(NUMBER 와 CHAR 를 비교하면 CHAR 를 NUMBER 로 바꾼다 — 266번 참고). 원래 "틀린 것은?" 을 "틀린 것을 모두 고르시오." 로 고치고 ①·③을 정답으로 한다.',
  362: '※ 모범답안 정정 : 교재의 정답 표기가 틀렸으며 ①이 정답이다.',
};

/* ─────────── 그림 줄이기 ─────────── */
function shrinkAll(pngs) {          /* { key: Buffer(png) } → { key: Buffer(jpg) } (작아진 것만) */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dap2013-'));
  Object.entries(pngs).forEach(([k, b]) => fs.writeFileSync(path.join(dir, k + '.png'), b));
  const ps = [
    'Add-Type -AssemblyName System.Drawing',
    '$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }',
    '$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)',
    '$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)',
    'foreach ($f in Get-ChildItem -LiteralPath $env:D13DIR -Filter *.png) {',
    '  $src = [System.Drawing.Image]::FromFile($f.FullName)',
    '  $w = [Math]::Min(1400, $src.Width); $h = [int]($src.Height * $w / $src.Width)',
    '  $bmp = New-Object System.Drawing.Bitmap($w, $h); $g = [System.Drawing.Graphics]::FromImage($bmp)',
    '  $g.InterpolationMode = "HighQualityBicubic"; $g.Clear([System.Drawing.Color]::White); $g.DrawImage($src, 0, 0, $w, $h)',
    '  $bmp.Save([IO.Path]::ChangeExtension($f.FullName, ".jpg"), $enc, $ep)',
    '  $g.Dispose(); $bmp.Dispose(); $src.Dispose()',
    '}',
  ].join('\n');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: Object.assign({}, process.env, { D13DIR: dir }), encoding: 'utf8' });
  const out = {};
  if (r.status !== 0) { console.warn('그림 줄이기 건너뜀 (PowerShell 실패): ' + (r.stderr || r.error)); }
  else Object.entries(pngs).forEach(([k, b]) => {
    const j = path.join(dir, k + '.jpg');
    if (fs.existsSync(j)) { const jb = fs.readFileSync(j); if (jb.length < b.length * 0.85) out[k] = jb; }
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

/* ─────────── 도형으로 그린 표 → 그림 ───────────
   156번 「동산 관리 대장」은 그림 파일이 아니라 글상자 속 표로 그려져 있다. 표로 옮기면 원본의
   칸 배치·음영이 사라지므로, 원본을 캡처한 그림을 docx 옆에 두고 그것을 쓴다.
   그림이 없으면 표로 옮긴 것을 그대로 쓴다. */
const DRAWN = { 156: { key: 'd13q-f156', file: 'DAP 자격검정 실전문제 2013 Edition_156.png' } };

/* ─────────── 조립 ─────────── */
const zq = unzip(path.join(SRC_DIR, SRC_Q)), za = unzip(path.join(SRC_DIR, SRC_A));
const qs = splitQuestions(readBlocks(zq)), as = splitAnswers(readBlocks(za));
if (qs.length !== 395) throw new Error('문항 수가 395 가 아님: ' + qs.length);

const drawn = {};
for (const d of Object.values(DRAWN)) {
  const p = path.join(SRC_DIR, d.file);
  if (fs.existsSync(p)) drawn[d.key] = fs.readFileSync(p);
  else console.warn('그림 없음 — 표로 둔다: ' + d.file);
}

const packs = {}, skipped = [], needImg = new Set();
for (const q of qs) {
  let { stem, c } = convert(q);
  /* 글상자 속 표(::: … :::)를 원본 캡처 그림으로 바꾼다 */
  if (DRAWN[q.no] && drawn[DRAWN[q.no].key]) stem = stem.replace(/\n?:::\n[\s\S]*\n:::/, '\n[[img:' + DRAWN[q.no].key + ']]');
  if (/문제 ?은행 제외/.test(stem)) { skipped.push(q.no + ' 문제은행 제외'); continue; }
  if (SKIP[q.no]) { skipped.push(q.no + ' ' + SKIP[q.no]); continue; }
  const rowT = choiceRowsTable(q);
  if (rowT) { stem = rowT.stem; c = rowT.c; }
  stem = crudFix(stem);
  if (OVERRIDE[q.no]) stem = OVERRIDE[q.no](stem);
  if (PICTURE_CHOICES.includes(q.no)) c = ['그림의 ①', '그림의 ②', '그림의 ③', '그림의 ④'];
  if (q.no >= SHARED.from && q.no <= SHARED.to) stem = SHARED.text + stem;
  stem = stem.replace(/\s*문제 오류 \(2번도 가능\)/, '').replace(/\n{3,}/g, '\n\n').trim();
  if (c.some(x => !x)) throw new Error(q.no + '번 보기가 비어 있음');

  const a0 = as[q.no];
  if (!a0) throw new Error(q.no + '번 모범답안 없음');
  const nums = [...a0.head.replace(/\(.*$/, '').replace(/문제 오류.*$/, '')].map(x => MARK.indexOf(x)).filter(k => k >= 0);
  if (!nums.length) throw new Error(q.no + '번 정답 없음: ' + a0.head);
  const multi = /모두 고르/.test(stem);
  /* 모두 고르시오 → 배열 + m. 그 밖에 정답이 둘이면 복수 정답 인정 → 배열만 */
  let a = multi || nums.length > 1 ? nums : nums[0];
  if (NONE_CHOICE[q.no]) { c = c.concat(NONE_CHOICE[q.no]); a = c.length - 1; }

  let e = a0.blocks.map(b => blockText(b, 'a')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  /* 정답을 바꾼 문항은 결론이 먼저 보이도록 메모를 앞에, 원래 해설은 그 뒤에 표시해 둔다 */
  if (NONE_CHOICE[q.no]) e = NOTE_TEXT[q.no] + '\n\n[모범답안의 원래 해설]\n' + e;
  else if (NOTE_TEXT[q.no]) e = (e ? e + '\n\n' : '') + NOTE_TEXT[q.no];
  if (!e) throw new Error(q.no + '번 해설 없음');

  const pk = packs[q.ch] || (packs[q.ch] = { chapter: q.ch, keys: new Set(), questions: [] });
  for (const t of [stem, e, ...c]) for (const m of t.matchAll(/\[\[img:([^\]]+)\]\]/g)) { pk.keys.add(m[1]); needImg.add(m[1]); }
  const item = { id: 'D13-' + String(q.no).padStart(3, '0'), ch: q.ch, no: q.no, q: stem, c, a, e, s: '실전문제 ' + q.no + '번' };
  if (multi) item.m = 1;
  pk.questions.push(item);
}

/* 그림: key → data URI */
const media = {};
for (const k of needImg) {
  if (drawn[k]) { media[k] = { mime: 'image/png', b: drawn[k] }; continue; }
  const zip = k[3] === 'q' ? zq : za, num = k.slice(5);
  const svg = zip['word/media/image' + num + '.svg'], png = zip['word/media/image' + num + '.png'];
  if (svg) media[k] = { mime: 'image/svg+xml', b: svg };
  else if (png) media[k] = { mime: 'image/png', b: png };
  else throw new Error('그림 없음: ' + k);
}
const pngs = {};
Object.entries(media).forEach(([k, v]) => { if (v.mime === 'image/png') pngs[k] = v.b; });
Object.entries(shrinkAll(pngs)).forEach(([k, b]) => { media[k] = { mime: 'image/jpeg', b }; });

const SOURCE_FILES = [SRC_Q, SRC_A];
const arr = Object.keys(packs).sort().map(ch => {
  const p = packs[ch], images = {};
  [...p.keys].sort().forEach(k => { images[k] = 'data:' + media[k].mime + ';base64,' + media[k].b.toString('base64'); });
  return { chapter: p.chapter, pack: 'd13', source: 'DAP 자격검정 실전문제 2013 Edition · 모범답안', sourceFiles: SOURCE_FILES, images, questions: p.questions };
});

const js = '/*! DAP 자격검정 실전문제(2013 Edition) \n' +
  ' * tools/dap2013-build.js 가 data_source/ 의 docx 두 개로 만든다. 개인 학습용.\n */\n' +
  arr.map(p => 'DAP_BANK.add(' + JSON.stringify(p) + ');').join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'data', 'dap2013.js'), js);

const all = arr.flatMap(p => p.questions);
console.log('과목별 : ' + arr.map(p => p.chapter + '과목 ' + p.questions.length).join(' · ') + '  = ' + all.length + '문항');
console.log('모두 고르시오 ' + all.filter(q => q.m).length + ' · 복수 정답 인정 ' + all.filter(q => !q.m && Array.isArray(q.a)).length +
  ' · 그림 ' + Object.keys(media).length + '장 · ' + (js.length / 1048576).toFixed(2) + ' MB');
console.log('뺀 문항 ' + skipped.length + ' : ' + skipped.join(' / '));
