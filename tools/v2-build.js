// ver 2 원고(tools/v2-src/chN*.txt) → data/N.과목명.v2.js
//
// 원고 형식 (문항 하나)
//   ### C1-005 C1X-112          ← 근거 core 문항 id (원천 s·rf 를 여기서 물려받는다)
//   지문 줄들 … (::: 상자, | 표 |, ``` 고정폭 ``` 그대로 쓸 수 있다)
//   ① 보기
//   ② 보기
//   ③ 보기
//   ④ 보기
//   A: ③            (v2 는 정답 하나 — 실제 시험에 복수 선택 문항이 없다)
//   K: fixed        보기 순서를 바꾸지 않는다 ((가)~(라)·ㄱㄴㄷ 조합처럼 순서가 의미를 갖는 문항)
//   E: 해설 (다음 ### 까지 여러 줄)
//   S: 원천 파트를 직접 적을 때만 (없으면 첫 근거 문항의 s)
//
// node tools/v2-build.js <과목> [--write]   (--write 없으면 점검 통계만)
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(__dirname, 'v2-src');
const ch = +process.argv[2], write = process.argv.includes('--write');
const NAMES = { 1: '전사아키텍처이해', 2: '데이터요건분석', 3: '데이터표준화', 4: '데이터모델링', 5: '데이터베이스설계와이용', 6: '데이터품질관리이해' };
const MARK = '①②③④';

/* core 문항과 그 실제 원천 */
const core = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter(f => /^\d\..*\.(core|extra|extra2)\.js$/.test(f))) {
  const P = []; vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'), vm.createContext({ DAP_BANK: { add: o => P.push(o) } }));
  P.forEach(p => p.questions.forEach(q => { core[q.id] = { q, rf: [].concat(q.rf || p.sourceFiles || []) }; }));
}

const src = fs.readdirSync(SRC).filter(f => new RegExp('^ch' + ch + '[a-z]?\\.txt$').test(f)).sort()
  .map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n').replace(/\r/g, '');
const blocks = src.split(/^### /m).slice(1);
const out = [], errs = [];
blocks.forEach((b, bi) => {
  const lines = b.split('\n');
  const bases = lines[0].trim().split(/\s+/).filter(Boolean);
  const at = '#' + (bi + 1) + ' (' + bases.join(' ') + ')';
  bases.forEach(id => { if (!core[id]) errs.push(at + ' 근거 id 없음: ' + id); });
  const body = lines.slice(1);
  const ci = body.findIndex(l => /^①/.test(l));
  const ai = body.findIndex(l => /^A:/.test(l));
  const ei = body.findIndex(l => /^E:/.test(l));
  if (ci < 0 || ai < 0 || ei < 0) { errs.push(at + ' 형식 오류(보기/A/E)'); return; }
  const stem = body.slice(0, ci).join('\n').trim();
  const c = body.slice(ci, ai).filter(l => l.trim()).map(l => l);
  if (c.length !== 4 || c.some((x, i) => x[0] !== MARK[i])) errs.push(at + ' 보기 4개(①~④)가 아님');
  const cc = c.map(x => x.slice(1).trim());
  const aRaw = body[ai].slice(2).trim();
  const nums = [...aRaw].map(x => MARK.indexOf(x)).filter(k => k >= 0);
  const sLine = body.find(l => /^S:/.test(l));
  let e = body.slice(ei).filter(l => !/^S:/.test(l)).join('\n').replace(/^E:\s*/, '').trim();
  const multi = /모두 고르/.test(stem);
  if (!nums.length) errs.push(at + ' 정답 없음');
  if (multi !== nums.length > 1 && !(multi && nums.length === 1)) errs.push(at + ' 모두 고르시오 / 정답 개수 불일치');
  if (!/\?$|시오\.$/.test(stem.split('\n').filter(l => l.trim() && !/^[|‖:`]/.test(l)).pop() || '') && !/\?/.test(stem)) errs.push(at + ' 묻는 문장이 없음');
  const base = core[bases[0]] ? core[bases[0]].q : null;
  const rf = [...new Set(bases.flatMap(id => core[id] ? core[id].rf : []))];
  const item = { ch, q: stem, c: cc, a: multi ? nums : nums[0], e, s: sLine ? sLine.slice(2).trim() : (base ? base.s : ''), rf, from: bases };
  if (multi) item.m = 1;
  item.fixed = body.some(l => /^K:\s*fixed/.test(l));
  if (/[①②③④]/.test(e) && !item.fixed && !multi) errs.push(at + ' 해설이 보기 번호를 짚음 — 순서를 돌리면 어긋난다 (K: fixed 로 두거나 해설을 고칠 것)');
  out.push(item);
});

/* 정답 위치 고르게 — 순서가 뜻을 갖지 않는 단일 정답 문항만 보기를 돌린다.
   고정 문항의 위치를 먼저 세고, 나머지는 지금까지 가장 적게 쓰인 자리로 보낸다. */
{
  const cnt = [0, 0, 0, 0];
  out.filter(q => !q.m && q.fixed).forEach(q => cnt[q.a]++);
  out.forEach((q, i) => {
    if (q.m || q.fixed) return;
    const min = Math.min(...cnt);
    const cands = [0, 1, 2, 3].filter(k => cnt[k] === min);
    const t = cands[(i * 7 + 3) % cands.length];
    const shift = (t - q.a + 4) % 4;
    const c2 = new Array(4);
    q.c.forEach((x, k) => { c2[(k + shift) % 4] = x; });
    q.c = c2; q.a = t; cnt[t]++;
  });
}

/* 점검 */
const neg = q => /(틀린|부적절|부적합|아닌|거리가 먼|옳지 않은|적절하지 않은|잘못|어려운|볼 수 없는|가장 먼|않은|없는)/.test((q.q.match(/[^\n.?]*\?/g) || ['']).pop());
const single = out.filter(q => !q.m);
const dist = [0, 0, 0, 0]; single.forEach(q => dist[q.a]++);
const longest = single.filter(q => { const l = q.c.map(x => x.length); return l.indexOf(Math.max(...l)) === q.a && l.filter(x => x === l[q.a]).length === 1; });
const pct = (n, d) => Math.round(100 * n / (d || 1)) + '%';
const noPeriod = out.filter(q => q.c.filter(x => !/[다.)]$/.test(x.trim())).length && q.c.some(x => x.length > 20));
console.log('문항 ' + out.length + '  · 정답 분포 ' + dist.join('/') + '  · 모두 고르시오 ' + out.filter(q => q.m).length);
console.log('부정형 ' + pct(out.filter(neg).length, out.length) + ' · "다음 중" ' + pct(out.filter(q => /다음 중/.test(q.q)).length, out.length) +
  ' · 상자/표 ' + pct(out.filter(q => /^(:::|[|‖] |```)/m.test(q.q)).length, out.length) +
  ' · 사례형 ' + pct(out.filter(q => /[A-Z](기업|은행|기관|회사|공사|병원|대학)|담당자|팀장|과장|대리|차장/.test(q.q)).length, out.length) +
  ' · 가장 긴 보기=정답 ' + pct(longest.length, single.length) + ' (' + longest.map(q => out.indexOf(q) + 1).join(',') + ')');
const used = new Set(out.flatMap(q => q.from));
const pool = Object.keys(core).filter(id => core[id].q.ch === ch);
console.log('근거로 쓴 core 문항 ' + used.size + ' / ' + pool.length);
if (errs.length) { console.log('\n오류\n' + errs.join('\n')); process.exit(1); }

if (write) {
  const file = ch + '.' + NAMES[ch] + '.v2.js';
  const qs = out.map((q, i) => {
    const o = { id: 'V' + ch + '-' + String(i + 1).padStart(3, '0'), ch, no: i + 1, q: q.q, c: q.c, a: q.a };
    if (q.m) o.m = 1;
    Object.assign(o, { e: q.e, s: q.s, rf: q.rf, from: q.from });
    return o;
  });
  const files = [...new Set(qs.flatMap(q => q.rf))];
  const js = '/*!\n * DAP 문제은행 ver 2 — 과목 ' + ch + '. (' + qs.length + '문항)\n' +
    ' * encoding: UTF-8 (BOM 없음)\n *\n' +
    ' * 기본 문제은행(core·extra·extra2)을 실제 출제 유형(실전문제 2013)에 맞춰 새로 쓴 것.\n' +
    ' * from = 근거로 삼은 기본 문제은행 문항 id. s·rf 는 그 문항의 원천을 물려받았다.\n */\n' +
    'DAP_BANK.add(' + JSON.stringify({ chapter: ch, pack: 'v2', source: '기본 문제은행 근거 문항의 원천', sourceFiles: files, questions: qs }, null, 1)
      .replace(/\n\s+(?=[\]}"\d])/g, m => m) + ');\n';
  fs.writeFileSync(path.join(ROOT, 'data', file), js);
  console.log('→ data/' + file);
}
