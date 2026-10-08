/* Data Modeling(실기) → 「실기」 화면 데이터
 *
 *   node tools/dm-build.js            확인만 (문제 목록·그림 수 출력)
 *   node tools/dm-build.js --write    data/dm/dm.js 와 data/dm/img/*.png 를 쓴다
 *
 * 읽는 것 (data_source/Data Modeling(실기)/, 저장소 밖)
 *   Modeling 실습문제.hwpx   같은 원고의 pdf 도 있지만 글자는 hwpx 에서 뽑는다
 * 만드는 것
 *   data/dm/dm.js            DAP_DM.add({...}) — 단계(기초~특급) → 문제(지문 · 모범 답안)
 *   data/dm/img/dm-NN.png    ERD 그림. 원본 BMP 를 크기 그대로 PNG 로(확대해 보므로 줄이지 않는다)
 *
 * 원고 구조: 단계 머리(「0. 기초」 칸 하나짜리 표) → 문제 머리(「[0-1] 보험 회사」, 「[396] 프로젝트 관리」)
 * → 지문 문단 → ERD 그림 → (4-7 만) 엔터티 정의서·표준 정의서 표.
 * 문제마다 첫 그림부터를 모범 답안으로 본다. 4-9 는 「잘못된 모델」 그림이 지문이라 ANSWER_AT 로 따로 정한다.
 * 그림 변환은 Windows PowerShell 의 System.Drawing 을 쓴다.
 */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data_source', 'Data Modeling(실기)', 'Modeling 실습문제.hwpx');
const OUT = path.join(ROOT, 'data', 'dm');
const LEVELS = ['기초', '기본', '중급', '고급', '특급'];

/* 원본 그대로 두지 않은 곳 — 뚜렷한 오타만 */
const FIX = [
  ['g판매직원은', '판매직원은'],                 /* 3-3 문단 첫 글자 앞의 잘못 들어간 g */
  ['관리하지 안고', '관리하지 않고'],            /* 2-3 */
  ['프로로젝트팀원', '프로젝트팀원'],            /* 396 */
  ['헙의를 통해 조정 및 확인을 거처', '협의를 통해 조정 및 확인을 거쳐'],   /* 396 */
  ['근무르 종료한', '근무를 종료한'],            /* 4-7 표준 용어 */
  ['목용도움', '목욕도움'],                      /* 4-7 엔터티 정의서 */
  ['System Intergation', 'System Integration'],  /* 4-12 */
  ['Aplication Architecture', 'Application Architecture'],
  ['리스트들을 도출하여', '리스크들을 도출하여'] /* 4-12 */
];
/* 모범 답안이 시작되는 그림 — 없으면 첫 그림 */
const ANSWER_AT = { '4-9': 'image28' };
/* 그림 제목 — 없으면 단독 그림은 제목 없이 */
const CAPTION = { image27: '잘못된 모델', image28: '수정한 모델', image29: '모범 답안 ERD', image30: '코드종류 · 컬럼 관계 예' };
/* 답안 쪽 소제목을 원문 번호 체계에 맞춘다 (4-7: 「기관」만 번호가 빠져 있다) */
const HEAD_FIX = { '기관': '1. 기관' };

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
const unent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const fix = s => FIX.reduce((t, [a, b]) => t.split(a).join(b), s);

/* ─────────── 본문 → 블록 ───────────
   맨 바깥 문단은 { p } / { img }, 표는 { tbl:[[{t,cs,rs}|null]] } 로. 칸 안의 문단은 칸 글자에 줄바꿈으로 잇는다. */
function parse(xml) {
  const tok = /<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>|<hp:t\/>|<hp:tab\b[^>]*\/>|<hp:lineBreak\/>|<\/hp:p>|<hc:img [^>]*binaryItemIDRef="([^"]+)"|<hp:tbl\b|<\/hp:tbl>|<hp:tr\b|<hp:tc\b|<\/hp:tc>|<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"|<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/g;
  const blocks = [], stack = [];   /* stack: 열린 표들 { cells:[], cell } */
  let line = '', m;
  const inCell = () => stack.length && stack[stack.length - 1].cell;
  while ((m = tok.exec(xml))) {
    const s = m[0];
    if (m[1] !== undefined) line += unent(m[1].replace(/<[^>]+>/g, ''));
    else if (s.startsWith('<hp:tab')) line += ' ';
    else if (s === '<hp:lineBreak/>') line += '\n';
    else if (m[2]) { if (!inCell()) { flush(); blocks.push({ img: m[2] }); } }
    else if (s === '</hp:p>') flush();
    else if (s === '<hp:tbl') { flush(); stack.push({ cells: [], cell: null }); }
    else if (s === '</hp:tbl>') {
      const T = stack.pop();
      const tbl = grid(T.cells);
      if (stack.length && stack[stack.length - 1].cell) stack[stack.length - 1].cell.lines.push(tbl.map(r => r.filter(Boolean).map(c => c.t).join(' | ')).join('\n'));
      else blocks.push({ tbl });
    }
    else if (s === '<hp:tc') { const T = stack[stack.length - 1]; T.cell = { lines: [], c: 0, r: 0, cs: 1, rs: 1 }; T.cells.push(T.cell); }
    else if (s === '</hp:tc>') stack[stack.length - 1].cell = null;
    else if (m[3] !== undefined) { const c = inCell(); if (c) { c.c = +m[3]; c.r = +m[4]; } }
    else if (m[5] !== undefined) { const c = inCell(); if (c) { c.cs = +m[5]; c.rs = +m[6]; } }
  }
  flush();
  return blocks;

  function flush() {
    const t = fix(line).replace(/[  ]+$/gm, '').replace(/^\s+|\s+$/g, '');
    line = '';
    const c = inCell();
    if (c) { if (t) c.lines.push(t); return; }
    if (t) blocks.push({ p: t });
  }
}
function grid(cells) {
  const rows = [];
  cells.forEach(c => {
    rows[c.r] = rows[c.r] || [];
    rows[c.r][c.c] = { t: c.lines.join('\n'), cs: c.cs, rs: c.rs };
  });
  const w = Math.max(...rows.map(r => (r || []).length));
  return rows.map(r => { r = r || []; const o = []; for (let i = 0; i < w; i++) o.push(r[i] || null); return o; });
}

/* ─────────── 블록 → 문제 ─────────── */
function build(blocks) {
  const items = [];
  let lv = -1, grp = '', cur = null;
  blocks.forEach(b => {
    /* 단계 머리 : 칸 하나짜리 표 「0. 기초」 */
    if (b.tbl && b.tbl.length === 1 && b.tbl[0].length === 1) {
      const m = /^(\d)\.\s*(\S+)/.exec(b.tbl[0][0].t);
      if (m && LEVELS[+m[1]] === m[2]) { lv = +m[1]; grp = ''; cur = null; }
      return;
    }
    if (lv < 0) return;   /* 표지 · 목차 */
    if (b.p) {
      const h = /^\[(\d-\d+|\d{3})\]\s*(.+)$/.exec(b.p);
      if (h) {
        let title = h[2].trim(), stars = 0;
        const st = /\s*\((★+)\)\s*$/.exec(title);
        if (st) { stars = st[1].length; title = title.slice(0, st.index); }
        cur = { id: h[1], lv, grp: /^\d{3}$/.test(h[1]) ? '교재 연습문제' : '', title, stars, q: [], a: [], _ans: false };
        items.push(cur);
        return;
      }
      if (!cur && /^<교재 연습문제>/.test(b.p)) return;
    }
    if (!cur) { if (b.p || b.img) console.warn('문제 밖 블록: ' + JSON.stringify(b).slice(0, 80)); return; }
    if (b.img && !cur._ans && (!ANSWER_AT[cur.id] || ANSWER_AT[cur.id] === b.img)) cur._ans = true;
    (cur._ans ? cur.a : cur.q).push(b);
  });

  /* 정리 — 그림 제목, 답안 쪽 문단은 소제목으로, 「<잘못된 모델>」 같은 꺾쇠 줄은 다음 그림의 제목으로 */
  items.forEach(it => {
    delete it._ans;
    ['q', 'a'].forEach(k => {
      const out = [];
      it[k].forEach((b, i, arr) => {
        if (b.p && /^<.+>$/.test(b.p) && arr[i + 1] && arr[i + 1].img) return;   /* 그림 제목으로 넘긴다 */
        if (b.img) { const o = { img: b.img }; if (CAPTION[b.img]) o.cap = CAPTION[b.img]; out.push(o); return; }
        if (b.p && k === 'a') { out.push({ h: HEAD_FIX[b.p] || b.p }); return; }
        if (b.tbl) { out.push({ tbl: b.tbl.map(r => r.map(c => c && (c.cs > 1 || c.rs > 1 ? c : c.t))), kv: b.tbl[0].length === 2 }); return; }
        out.push(b);
      });
      it[k] = out;
    });
    /* 답안 쪽의 「[1] 엔터티 정의서 작성(…)」 같은 과제 지시는 지문 끝에도 둔다 — 무엇을 써야 하는지 미리 보이게 */
    /* 4-7 : ERD 바로 아래 제목 없는 표는 기관근무현황 데이터 예다 */
    const ti = it.a.findIndex(b => b.tbl);
    if (ti > 0 && it.a[ti - 1].img) it.a.splice(ti, 0, { h: '기관근무현황 데이터 예' });
    const tasks = it.a.filter(b => b.h && /^\[\d\]/.test(b.h));
    if (tasks.length) it.q.push({ task: tasks.map(b => b.h) });
  });
  return items;
}

/* ─────────── 그림 ─────────── */
function convert(entries, ids) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-'));
  ids.forEach(id => fs.writeFileSync(path.join(tmp, id + '.bmp'), entries['BinData/' + id + '.bmp']()));
  const ps = `Add-Type -AssemblyName System.Drawing
Get-ChildItem $env:DMDIR -Filter *.bmp | ForEach-Object {
  $i = [System.Drawing.Image]::FromFile($_.FullName)
  $i.Save([IO.Path]::ChangeExtension($_.FullName, 'png'), [System.Drawing.Imaging.ImageFormat]::Png)
  "{0} {1} {2}" -f $_.BaseName, $i.Width, $i.Height
  $i.Dispose()
}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: Object.assign({}, process.env, { DMDIR: tmp }), encoding: 'utf8' });
  if (r.status !== 0) throw new Error('그림 변환 실패 (PowerShell): ' + (r.stderr || r.error));
  const size = {};
  r.stdout.trim().split(/\r?\n/).forEach(L => { const [k, w, h] = L.trim().split(' '); size[k] = { w: +w, h: +h }; });
  return { tmp, size };
}

/* ─────────── 실행 ─────────── */
const write = process.argv.includes('--write');
const entries = unzip(SRC);
const xml = entries['Contents/section0.xml']().toString('utf8');
const items = build(parse(xml));

const imgIds = [];
items.forEach(it => it.q.concat(it.a).forEach(b => { if (b.img) imgIds.push(b.img); }));
const key = id => 'dm-' + String(id.replace('image', '')).padStart(2, '0');

LEVELS.forEach((L, lv) => {
  const xs = items.filter(it => it.lv === lv);
  console.log(`${lv}. ${L} — ${xs.length}문제`);
  xs.forEach(it => console.log(`   [${it.id}] ${it.title}${it.stars ? ' ' + '★'.repeat(it.stars) : ''}  지문 ${it.q.filter(b => b.p).length}문단` +
    `${it.q.some(b => b.img) ? ' +지문그림' : ''} · 답안 그림 ${it.a.filter(b => b.img).length}${it.a.some(b => b.tbl) ? ' 표 ' + it.a.filter(b => b.tbl).length : ''}`));
});
console.log(`문제 ${items.length} · 그림 ${imgIds.length}`);
if (!write) { console.log('(확인만 — 쓰려면 --write)'); process.exit(0); }

const { tmp, size } = convert(entries, imgIds);
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
const images = {};
imgIds.forEach(id => {
  const k = key(id);
  fs.copyFileSync(path.join(tmp, id + '.png'), path.join(OUT, 'img', k + '.png'));
  images[k] = { src: 'img/' + k + '.png', w: size[id].w, h: size[id].h };
});
fs.rmSync(tmp, { recursive: true, force: true });
items.forEach(it => it.q.concat(it.a).forEach(b => { if (b.img) b.img = key(b.img); }));

const data = { title: 'Data Modeling(실기)', sourceFiles: [path.basename(SRC)], levels: LEVELS, images, items };
fs.writeFileSync(path.join(OUT, 'dm.js'),
  '/* Data Modeling(실기) — 지문과 모범 답안 ERD\n   tools/dm-build.js 가 data_source 의 「Modeling 실습문제.hwpx」에서 만든다. 손으로 고치지 말 것. */\n' +
  'DAP_DM.add(' + JSON.stringify(data, null, 1) + ');\n');
const kb = imgIds.reduce((s, id) => s + fs.statSync(path.join(OUT, 'img', key(id) + '.png')).size, 0) / 1024;
console.log(`썼음: data/dm/dm.js · data/dm/img/ ${imgIds.length}장 ${Math.round(kb)}KB`);
