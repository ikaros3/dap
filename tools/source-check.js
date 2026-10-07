/* 문항의 원천·참고 파일 표기가 실제 원문과 맞는지 대조한다.
 *
 *   node tools/source-check.js            # 대조만
 *   node tools/source-check.js --extract  # 원천 텍스트를 다시 뽑고 대조
 *
 * data_source/ 는 gitignore 라 이 도구는 로컬에서만 돌아간다. 자료 묶음별 하위 폴더까지
 * 모두 훑되 캐시는 파일 이름만으로 둔다 — 문항의 rf 가 경로 없이 이름만 적기 때문이다. 추출 결과는
 * tools/.source-text/ 에 캐시하며 이 폴더도 저장소에 올리지 않는다.
 *
 * 두 방향을 함께 본다.
 *   [빠진 원천] 표기했어야 할 파일이 빠졌다 → 더해야 한다.
 *   [거짓 원천] 표기했지만 그 문항 내용이 없는 파일이다 → 빼야 한다.
 *
 * 원천을 적는 이유는 그 파일을 펼쳐 해당 대목을 다시 읽기 위해서다.
 * 없는 것을 가리키면 펼쳐 봐야 찾지 못하니, 없느니만 못하다.
 *
 * 판정 근거는 "짚어서 보여 줄 수 있는 것"만 쓴다.
 *   ① 지문 핵심어 — 문제 지문의 변별력 있는 용어가 표기한 파일에 0회이고
 *                   다른 후보에 있으면, 그 후보를 표기에 더해야 한다.
 *   ② 절 이름     — s 의 절 이름이 표기 파일에 없고 다른 후보에 그대로 있을 때.
 *                   다만 내용 일치율이 이미 표기를 뒷받침하면 쓰지 않는다.
 *                   팩이 일부러 요약본 체계로 s 를 적는 경우가 있기 때문이다.
 *   ③ 근거 구(句) — 지문·정답·해설·절 이름을 어절 단위로 끊어 두세 어절짜리 구를
 *                   만들고, 그 구가 원문에 글자 그대로 있는지 본다. 거짓 원천은
 *                   이 방향으로 잡는다. 자세한 것은 falseClaims() 주석 참고.
 * 낱말 빈도 평균처럼 추정에 기대는 신호는 쓰지 않는다. 분량이 큰 자료가
 * 무조건 이기고, 근거 없는 파일을 붙이게 된다.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const zlib = require('zlib'), cp = require('child_process');

const SRC = 'data_source', CACHE = path.join('tools', '.source-text');

/* ─────────── 원천 텍스트 추출 ─────────── */
function unzip(buf, want) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('EOCD 없음');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30);
    const cl = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nl).toString('utf8');
    if (want.test(name)) {
      const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
      const raw = buf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
      out.push({ name, data: method === 8
        ? zlib.inflateRawSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }) : raw });
    }
    off += 46 + nl + el + cl;
  }
  return out;
}
const tags = x => x.replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function extract() {
  fs.mkdirSync(CACHE, { recursive: true });
  const walk = d => fs.readdirSync(d, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const full of walk(SRC)) {
    const f = path.basename(full), out = path.join(CACHE, f + '.txt');
    try {
      if (/\.hwpx$/.test(f)) {
        const e = unzip(fs.readFileSync(full), /^Contents\/section\d+\.xml$/)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        fs.writeFileSync(out, e.map(s => tags(s.data.toString('utf8'))).join('\n'), 'utf8');
      } else if (/\.docx$/.test(f)) {
        const e = unzip(fs.readFileSync(full), /^word\/document\.xml$/);
        fs.writeFileSync(out, e.length ? tags(e[0].data.toString('utf8')) : '', 'utf8');
      } else if (/\.doc$/.test(f)) {
        /* 구형 .doc = OLE. UTF-16LE 로 읽어 한글·영문 구간만 골라낸다 */
        let s = fs.readFileSync(full).toString('utf16le')
          .replace(/[^가-힣ㄱ-ㆎ0-9A-Za-z .,()\[\]{}·:;%\/+\-~='"\n]+/g, ' ');
        fs.writeFileSync(out, s.split(/\s{3,}/).filter(x => /[가-힣]/.test(x) && x.length > 4).join('\n'), 'utf8');
      } else if (/\.pdf$/.test(f)) {
        /* 같은 폴더에 같은 이름의 hwpx 가 있으면 그 사본이다. 본문은 hwpx 로만 본다 */
        if (fs.existsSync(full.replace(/\.pdf$/, '.hwpx'))) { console.log('  ' + f + ' — hwpx 사본, 건너뜀'); continue; }
        cp.execFileSync('pdftotext', ['-enc', 'UTF-8', full, out]);
      } else continue;
      console.log('  ' + f + ' → ' + fs.statSync(out).size.toLocaleString() + 'B');
    } catch (e) { console.log('  ' + f + ' — 건너뜀 (' + e.message + ')'); }
  }
}

/* ─────────── 과목별 후보 ───────────
   가이드(A)는 과목 1~4만 다룬다. 5·6의 후보로 넣으면 분량 때문에 거짓 양성이 난다.
   1~3과목 강의자료는 글자가 벡터 도형이라 본문을 얻을 수 없어 대조 대상이 아니다. */
const GUIDE = '[데이터 전문가 포럼] 데이터아키텍처 준전문가 가이드(2020.08.29.).hwpx';
const CAND = {
  1: [GUIDE, 'I. 전사아키텍처 이해.hwpx'],
  2: [GUIDE, 'II. 데이터 요건 분석.hwpx'],
  3: [GUIDE, 'III. 데이터 표준화.hwpx', '400. 데이터표준화.doc'],
  4: [GUIDE, 'IV. 데이터 모델링.hwpx', '4과목. 데이터모델링.pdf', '510. 데이터모델링이해.doc',
      '521. 개념데이터 모델_entity.doc', '522. 개념데이터 모델_relationship.doc',
      '531. 논리데이터모델_속성.doc', '532. 논리데이터모델_엔터티 상세화.doc',
      '541. 물리데이터모델.doc', 'RDB의 데이터 조작.docx'],
  5: ['V. 데이터베이스 설계와 이용.hwpx', '5과목. 데이터베이스 설계와 이용.pdf',
      '610. 데이터베이스 설계.doc', '620. 데이터베이스 이용.doc',
      '630. 데이터베이스 성능개선.doc', 'RDB의 데이터 조작.docx'],
  6: ['VI. 데이터 품질관리 이해.hwpx', '230. 데이터품질관리_프로세스.doc']
};
/* 같은 문서의 pdf 사본 추출본이 캐시에 있으면 함께 본다. 표시는 hwpx 이름으로 통일한다.
   다만 extract() 는 hwpx 옆의 pdf 사본을 뽑지 않는다. 이어 붙이면 그 파일 점수만 부풀어
   가이드를 거짓 원천으로 잘못 잡는다 — 2026-10-07 폴더 정리 때 C 의 pdf 가 다시 들어와
   6문항이 그렇게 잡혔다. */

const norm = s => s.toLowerCase().replace(/\s+/g, '');
const TXT = {};
function loadAll() {
  if (!fs.existsSync(CACHE)) { console.error('추출본이 없다. --extract 로 먼저 뽑을 것.'); process.exit(1); }
  const files = fs.readdirSync(CACHE);
  new Set(Object.values(CAND).flat()).forEach(name => {
    let t = '';
    [name, name.replace(/\.hwpx$/, '.pdf')].forEach(v => {
      const f = files.find(x => x === v + '.txt');
      if (f) t += norm(fs.readFileSync(path.join(CACHE, f), 'utf8'));
    });
    if (t) TXT[name] = t;
  });
}

/* ─────────── 문항 읽기 ─────────── */
function loadPacks() {
  const packs = [];
  const ctx = vm.createContext({ DAP_BANK: { add: o => packs.push(o) }, window: {} });
  /* 대조 대상은 직접 만든 core 묶음뿐이다. 외부 원본을 옮긴 묶음(practice · dap2013)은
     원천이 그 원본 하나라 교재·요약본과 맞댈 것이 없다. 묶음은 매니페스트로 가린다 —
     파일 이름으로 거르면 새 묶음이 생길 때마다 여기서 멈춘다(dap2013 때 실제로 그랬다). */
  vm.runInContext(fs.readFileSync('data/manifest.js', 'utf8'), ctx);
  const core = new Set(ctx.window.DAP_MANIFEST.files
    .filter(f => typeof f === 'string' || (f.collection || 'core') === 'core')
    .map(f => typeof f === 'string' ? f : f.file));
  for (const f of fs.readdirSync('data')) {
    if (!core.has(f)) continue;
    vm.runInContext(fs.readFileSync('data/' + f, 'utf8'), ctx);
    packs[packs.length - 1].file = f;
  }
  return packs;
}

const STOP = new Set(['가장','적절','옳은','옳지','않은','것은','설명','대한','다음','거리가','해당',
  '아닌','모두','고른','하는','되는','한다','이다','에서','경우','위해','통해','때문','이며','하여',
  '것이다','수행','필요','사용','가능','대상','내용','기준','방법','관리','정의','구성','포함','않는다']);
const SKIP = new Set(['the','and','for','edition','not','all','one','you','are','with','from']);
const memo = new Map();
const has = (n, t) => { const k = n + ' ' + t;
  if (!memo.has(k)) memo.set(k, TXT[n].includes(norm(t))); return memo.get(k); };

/* ─────────── 거짓 원천 판정 ───────────
   낱말 하나로는 판정할 수 없다. "데이터품질"·"데이터요소" 같은 조각은 어느 자료에나
   있어서, 그 문항을 다루지 않는 파일에도 걸린다. 그래서 두세 어절을 이어붙인
   구(句)가 원문에 글자 그대로 있는지를 본다. 구는 우연히 겹치지 않는다.

   구마다 무게를 준다.  무게 = 길이 / log10(10 + 말뭉치 전체 빈도)
   길고 드문 구일수록 그 문항 고유의 내용이다. 짧고 흔한 구는 두 어절이 어쩌다
   붙은 조각이라 근거가 못 된다.

   표기한 파일의 점수가
     ① 0 이고 다른 후보는 뚜렷하거나(≥8),
     ② 최고점의 1/4 에 못 미치면서 그 자체로도 낮으면(<15)
   그 파일에는 이 문항의 내용이 없다고 보고 뺀다.
   ②의 절대 기준을 함께 두는 것은, 다른 파일이 유난히 많이 걸렸다는 이유만으로
   멀쩡한 표기가 밀려나는 것을 막기 위해서다. */
const ENDINGS = ['하였다','되었다','이었다','하여야','되어야','으로서','으로써','에서는','에서의','이라는','한다는','된다는',
  '한다','된다','이다','하는','되는','하며','되며','하고','되고','하여','되어','하지','되지','해야','이며','이나','에서','에게','으로','에는','과의','와의','들의','들을','들이','들은','이란','라는',
  '의','를','을','이','가','은','는','에','로','와','과','도','만','나','여','고','며','서','한','된','할','될','함','됨','들','인','임','적'];
function stemWord(w) {
  let s = w, cut = true;
  while (cut && s.length > 2) { cut = false;
    for (const e of ENDINGS) if (s.length - e.length >= 2 && s.endsWith(e)) { s = s.slice(0, -e.length); cut = true; break; } }
  return s;
}
const LAT_SKIP = new Set(['the','and','for','not','all','one','you','are','with','from','that','this','has','can','its',
  'edition','type','data','table','index','value','name']);
function phrases(text) {
  const out = new Set();
  /* 영문 전문 용어는 그 자체로 변별력이 있다 */
  (text.match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) || []).map(t => t.toLowerCase())
    .filter(t => !LAT_SKIP.has(t)).forEach(t => out.add(t));
  /* 문장을 넘나드는 가짜 구가 생기지 않도록 문장 단위로 끊는다 */
  for (const sent of text.split(/[.!?·「」『』()（）\[\]{},;:\n]+/)) {
    const toks = (sent.match(/[가-힣A-Za-z0-9]+/g) || [])
      .map(w => /[가-힣]/.test(w) ? stemWord(w) : w.toLowerCase()).filter(w => w.length >= 2);
    for (let i = 0; i < toks.length; i++)
      for (let k = 2; k <= 3 && i + k <= toks.length; k++) {
        const p = toks.slice(i, i + k).join('');
        if (p.length >= 5 && p.length <= 24) out.add(p);
      }
  }
  return [...out];
}
const fmemo = new Map();
function corpusFreq(p) {
  if (fmemo.has(p)) return fmemo.get(p);
  const s = norm(p); let t = 0;
  for (const n of Object.keys(TXT)) { const T = TXT[n]; let i = 0; while ((i = T.indexOf(s, i)) >= 0) { t++; i += s.length; } }
  fmemo.set(p, t); return t;
}
const weigh = p => (/[가-힣]/.test(p) ? p.length : p.length * 1.2) / Math.log10(10 + corpusFreq(p));

/* 가이드와 그 밖의 자료를 같은 잣대로 재면 안 된다.
 *
 * 가이드는 시험 범위 전체를 담은 교재라 어느 대목이든 조금씩은 걸린다. 분량도
 * 다른 자료의 서너 배여서, 문항의 문장과 더 길게 일치하는 쪽은 거의 늘 가이드다.
 * 그래서 점수를 맞대 놓고 낮은 쪽을 빼면, 정작 그 대목을 다루고 있는 요약본·
 * 강의자료가 밀려난다. 실제로 그렇게 C4-181(원자 값)·C4-163(다대다)처럼
 * 요약본에 분명히 있는 문항에서 요약본이 빠질 뻔했다.
 *
 * 원천을 적는 목적에 비추어도 방향이 다르다. "가이드에도 있다"는 사실은 거의
 * 언제나 참이라 길잡이가 못 되지만, 요약본·강의자료는 실제로 펼쳐 읽는 자료다.
 *
 *   [가이드]      기계 판정으로 뺀다.
 *   [그 밖의 자료] 기계 판정으로는 빼지 않는다. 구가 안 걸리는 것과 그 대목이
 *                 없는 것은 다른 이야기다 — 요약본은 같은 내용을 풀어 쓴다.
 *                 "확인 요망"으로만 알리고, 원문을 손으로 열어 본 뒤에 뺀다. */
function falseClaims(info) {
  const sure = [], ask = [];
  info.forEach(x => {
    const q = x.q;
    /* 오답 보기는 저자가 지어낸 문장이라 원천에 없는 것이 정상이므로 뺀다 */
    const ans = (q.c || [])[q.a] || '';
    const ps = phrases([q.q, x.sec, ans, q.e || ''].join('\n')).filter(p => x.cand.some(n => has(n, p)));
    const score = {}; x.cand.forEach(n => score[n] = ps.filter(p => has(n, p)).reduce((a, p) => a + weigh(p), 0));
    const best = Math.max(0, ...x.cand.map(n => score[n]));
    const weak = n => x.cand.includes(n) &&
      ((score[n] === 0 && best >= 8) || (best >= 15 && score[n] / best < 0.25 && score[n] < 15));
    const why = n => ps.filter(p => !has(n, p)).sort((a, b) => weigh(b) - weigh(a))[0] || x.sec;
    x.claimed.filter(weak).forEach(n => {
      const rest = x.claimed.filter(m => m !== n);
      if (!rest.length) return;                       // 하나뿐인 원천은 빼지 않는다
      (n === GUIDE ? sure : ask).push({ id: q.id, file: x.pk.file, s: q.s, drop: n, why: why(n) });
    });
  });
  return { sure, ask };
}

function stemTerms(q) {
  return [...new Set((q.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || []).map(t => t.toLowerCase())
    .concat((q.match(/['"“”‘’]([가-힣A-Za-z0-9 ·-]{3,20})['"“”‘’]/g) || [])
      .map(t => t.replace(/['"“”‘’]/g, '').trim())))]
    .filter(t => !SKIP.has(t) && t.length >= 3)
    /* 저자가 지어낸 사례 문장은 용어가 아니다. 조사로 끝나거나 어절이 셋을 넘으면 뺀다 */
    .filter(t => !/[가-힣](의|에|은|는|이|가|을|를|와|과|로|서|도|만)$/.test(t))
    .filter(t => t.split(/\s+/).length <= 3);
}

function main() {
  loadAll();
  const packs = loadPacks();
  const info = [];
  packs.forEach(pk => pk.questions.forEach(q => {
    const cand = CAND[pk.chapter].filter(n => TXT[n]);
    const claimed = [].concat(q.rf || pk.sourceFiles || []).join(' · ').split(' · ').filter(Boolean);
    const lim = Math.max(1, Math.floor(cand.length / 2));
    const key = stemTerms(q.q).map(t => ({ t, w: cand.filter(n => has(n, t)) }))
                              .filter(x => x.w.length && x.w.length <= lim);
    const all = [...new Set(([q.q, (q.c || []).join(' '), q.e || ''].join(' ')
      .match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) || []).map(t => t.toLowerCase())
      .concat(([q.q, (q.c || []).join(' '), q.e || ''].join(' ').match(/[가-힣]{4,9}/g) || [])
        .filter(t => !STOP.has(t))))];
    const useful = all.filter(t => cand.some(n => has(n, t)));
    const rate = n => useful.length ? useful.filter(t => has(n, t)).length / useful.length : 0;
    const mine = Math.max(...claimed.map(rate), 0);
    const sec = String(q.s || '').replace(/^\(?\d{4}\s*Edition\)?\s*/i, '')
      .replace(/^\d+장\s*(\d+절)?\s*/, '').replace(/^\(2013 Edition\)\s*/, '').trim();
    info.push({ q, pk, cand, claimed, rate,
                keyMiss: key.filter(x => !x.w.some(n => claimed.includes(n))), mine, sec });
  }));

  /* 절 이름 증거는 절 단위로 모아 본다 */
  const bySec = new Map();
  info.forEach(x => { if (x.sec.length < 5) return;
    const k = x.pk.file + '|' + x.sec;
    (bySec.get(k) || bySec.set(k, []).get(k)).push(x); });
  const secAdd = new Map();
  for (const [k, list] of bySec) {
    if (list.reduce((a, x) => a + x.mine, 0) / list.length >= 0.85) continue;
    const found = list[0].cand.filter(n => has(n, list[0].sec));
    if (found.length && !found.some(n => list[0].claimed.includes(n))) secAdd.set(k, found);
  }

  const bad = [];
  info.forEach(x => {
    const add = new Set();
    x.keyMiss.forEach(m => add.add(m.w.slice().sort((a, b) => x.rate(b) - x.rate(a))[0]));
    (secAdd.get(x.pk.file + '|' + x.sec) || []).forEach(n => add.add(n));
    const list = [...add].filter(n => n && !x.claimed.includes(n));
    if (list.length) bad.push({ id: x.q.id, file: x.pk.file, s: x.q.s, add: list,
      why: (x.keyMiss[0] && x.keyMiss[0].t) || x.sec });
  });

  const { sure, ask } = falseClaims(info);

  console.log('대조 ' + info.length + '문항');
  console.log('  빠진 원천 ' + bad.length + ' · 거짓 원천(가이드) ' + sure.length + ' · 확인 요망 ' + ask.length);
  if (bad.length) {
    console.log('\n[빠진 원천] 표기에 더해야 한다');
    bad.forEach(b => console.log('  ' + b.id.padEnd(9) + ' 「' + b.why + '」 → + ' + b.add.join(' · ')));
  }
  if (sure.length) {
    console.log('\n[거짓 원천] 가이드에 이 대목이 없다. 빼도 된다');
    sure.forEach(w => console.log('  ' + w.id.padEnd(9) + ' 「' + w.why + '」 → − 가이드'));
  }
  if (ask.length) {
    console.log('\n[확인 요망] 구가 안 걸리지만 요약본·강의자료는 풀어 쓰기도 한다.');
    console.log('            원문을 열어 주제어가 정말 0회인지 보고 판단할 것');
    ask.forEach(w => console.log('  ' + w.id.padEnd(9) + ' 「' + w.why + '」 ? ' + w.drop));
  }
  process.exit(bad.length + sure.length ? 1 : 0);   // 확인 요망은 실패로 치지 않는다
}

if (process.argv.includes('--extract')) { console.log('원천 텍스트 추출'); extract(); console.log(); }
main();
