/* 문항 팩 형식 점검 — 매니페스트에 실린 모든 팩을 훑는다.
   인자로 과목 번호를 주면 그 과목만 본다.  예)  node test/pack-format.js 3
   암호문 팩(practice.enc.js)과 로컬 전용 팩은 건너뛴다. */
const fs = require('fs'), vm = require('vm'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
const only = process.argv[2] ? +process.argv[2] : null;

function loadManifest() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/manifest.js'), 'utf8'), ctx);
  return ctx.window.DAP_MANIFEST;
}
/* 한 파일이 과목마다 add 를 여러 번 부를 수 있다 (practice.e1.js, dap2013.plain.js) */
function loadPacks(file) {
  const got = [];
  const ctx = { DAP_BANK: { add: o => { got.push(o); } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'), ctx);
  return got;
}

const man = loadManifest();
let bad = 0;
const fail = m => { bad++; console.log('FAIL  ' + m); };

/* 읽을 수 있는 팩만 모은다 */
const packs = [];
man.files.forEach(f => {
  const file = typeof f === 'string' ? f : f.file;
  const p = path.join(ROOT, 'data', file);
  if (/\.enc\./.test(file)) return;                 /* 암호문 — 여기서는 볼 수 없다 */
  if (!fs.existsSync(p)) return;                    /* optional 팩이 없을 수 있다 */
  const got = loadPacks(file);
  if (!got.length || got.some(p => !p || !p.questions)) { fail(file + ' — DAP_BANK.add 형태가 아님'); return; }
  const collection = typeof f === 'string' ? 'core' : (f.collection || 'core');
  got.forEach(pack => packs.push({ file: got.length > 1 ? file + '#' + pack.chapter : file, collection, pack }));
});

/* 문항 id 는 전체 은행에서 유일해야 한다 (매니페스트 주석의 규칙) */
const owner = new Map();
packs.forEach(({ file, pack }) => pack.questions.forEach(q => {
  if (owner.has(q.id)) fail('문항 id 중복: ' + q.id + '  (' + owner.get(q.id) + ' / ' + file + ')');
  else owner.set(q.id, file);
}));

packs.forEach(({ file, collection, pack }) => {
  const qs = pack.questions;
  if (only && pack.chapter !== only) return;
  console.log('\n■ ' + file + '  [' + collection + ']  ' + qs.length + '문항');

  /* 원천 자료는 해설과 함께 화면에 나온다. 팩의 source 나 문항의 r 중
     하나는 있어야 "어느 문서를 펴 봐야 하는가"를 답해 줄 수 있다.
     외부 출처 묶음(practice)은 원본이 하나뿐이라 예외로 둔다. */
  if (collection === 'core' && !pack.source && qs.some(q => !q.r))
    fail(file + ' — 팩에 source 가 없고 r 이 없는 문항이 있음');

  /* 참고 파일은 원천의 짝이다. 원천이 "무엇을 근거로 했나"라면 이쪽은
     "data_source/ 의 어느 파일을 여나"에 답한다. 같은 이유로 하나는 있어야 한다. */
  if (collection === 'core' && !pack.sourceFiles && qs.some(q => !q.rf))
    fail(file + ' — 팩에 sourceFiles 가 없고 rf 가 없는 문항이 있음');

  const nos = new Set();
  let odd = 0;                      /* s 표기가 관례와 다른 문항 수 */
  const selfRef = [];               /* 해설이 자기 정답 번호를 짚는 문항 */
  qs.forEach((q, i) => {
    const at = file + '[' + i + '] ' + (q.id || '(id 없음)');
    ['id', 'q', 'e', 's'].forEach(k => {
      if (typeof q[k] !== 'string' || !q[k].trim()) fail(at + ' — ' + k + ' 가 비어 있음');
    });
    if (q.ch !== pack.chapter) fail(at + ' — ch 가 팩의 chapter 와 다름: ' + q.ch);
    /* 직접 만든 core 는 보기 4개. 외부 원본 묶음은 원본 오류를 "없다" 보기로 바로잡은 경우 5개일 수 있다 */
    const nc = collection === 'core' ? [4] : [4, 5];
    if (!Array.isArray(q.c) || !nc.includes(q.c.length)) fail(at + ' — 보기가 ' + nc.join('~') + '개가 아님');
    else {
      if (new Set(q.c).size !== q.c.length) fail(at + ' — 보기 중복');
      q.c.forEach((c, j) => { if (!String(c).trim()) fail(at + ' — 보기 ' + (j + 1) + ' 이 비어 있음'); });
    }
    /* a 는 보기 인덱스(0부터) 하나, 또는 인덱스 배열. 배열은 m 이 있으면 "모두 고르시오",
       없으면 복수 정답 인정(원본 정답이 정정된 문항)이다. */
    const as = Array.isArray(q.a) ? q.a : [q.a];
    if (!as.length || as.some(a => !Number.isInteger(a) || a < 0 || a >= (q.c || []).length) || new Set(as).size !== as.length)
      fail(at + ' — a 가 보기 인덱스(또는 그 배열)가 아님');
    if (q.m && !Array.isArray(q.a)) fail(at + ' — m(모두 고르시오)인데 a 가 배열이 아님');
    if (!q.m && Array.isArray(q.a) && as.length < 2) fail(at + ' — 복수 정답 인정인데 정답이 하나뿐');

    /* 지문·보기·해설의 그림 표기는 팩의 images 에 있어야 화면에 나온다 */
    [q.q, q.e, ...(q.c || [])].forEach(t => {
      for (const mm of String(t || '').matchAll(/\[\[img:([^\]]+)\]\]/g))
        if (!pack.images || !pack.images[mm[1]]) fail(at + ' — 그림 ' + mm[1] + ' 이 팩 images 에 없음');
    });
    if (q.no !== undefined) {
      if (nos.has(q.no)) fail(at + ' — no 중복: ' + q.no);
      nos.add(q.no);
    }
    /* s(출처)는 취약 영역 분석에 쓰이므로 표기가 고를수록 좋다. 다만 2013 Edition
       표기나 practice 팩의 "과목 추정"처럼 정당한 예외가 있어, 새로 쓰는 extra 팩만
       "N장 M절 …" 을 강제하고 나머지는 세어서 알리기만 한다. */
    if (!/^\d+장 \d+절 /.test(q.s || '')) {
      if (/\.extra\./.test(file)) fail(at + ' — s 가 "N장 M절 …" 형식이 아님: ' + q.s);
      else odd++;
    }

    /* 해설이 자기 정답 번호를 짚는 문항을 모아 둔다. 보기 순서를 바꾸면 해설이
       조용히 어긋나므로 눈으로 확인할 목록이 필요하다. 다만 부정형 문항이나
       보기 넷을 모두 설명하는 해설에서는 정상이므로 실패로 다루지 않는다. */
    if ([...String(q.e || '').matchAll(/([1-4])번/g)].some(m => +m[1] - 1 === q.a)) selfRef.push(q.id);
  });

  /* 정답이 한 보기에 쏠리면 찍어서 맞힐 수 있다 */
  const dist = [0, 0, 0, 0];
  qs.forEach(q => { if (Number.isInteger(q.a) && q.a >= 0 && q.a <= 3) dist[q.a]++; });
  const multi = qs.filter(q => Array.isArray(q.a)).length;
  if (multi) console.log('   복수 정답 문항 ' + multi + '개 (분포에서 뺌)');
  const worst = Math.max(...dist), even = qs.length / 4;
  console.log('   정답 분포 (1/2/3/4번) : ' + dist.join(' / ') +
              (odd ? '   · s 표기가 관례와 다른 문항 ' + odd + '개' : ''));
  if (selfRef.length) console.log('   확인 요망 · 해설이 자기 정답 번호를 짚음 : ' + selfRef.join(', '));
  /* 쏠림은 직접 만든 문항에서만 실패로 본다. 외부 원본(practice·dap2013)은 원래 정답
     그대로여야 하므로 보기 순서를 바꿀 수 없다 — 알리기만 한다. */
  if (collection !== 'core' && qs.length >= 20 && worst > even * 1.6) {
    console.log('   참고 · 원본 정답이 한 보기에 몰려 있음 (' + dist.join('/') + ')');
  } else if (qs.length >= 20 && worst > even * 1.6) {
    fail(file + ' — 정답이 한 보기에 쏠림 (' + dist.join('/') + ', 고른 값은 ' + Math.round(even) + ')');
  }

  /* 같은 과목의 다른 팩과 문두가 겹치는지 */
  const norm = s => String(s).replace(/[\s'"“”‘’()·,.?!]/g, '');
  const others = packs.filter(p => p.pack.chapter === pack.chapter && p.file !== file);
  const map = new Map();
  others.forEach(p => p.pack.questions.forEach(q => map.set(norm(q.q), p.file + ' ' + q.id)));
  qs.forEach(q => {
    const hit = map.get(norm(q.q));
    if (hit) fail(q.id + ' — 문두가 ' + hit + ' 과 동일');
  });
});

console.log(bad ? '\n실패 ' + bad + '건' : '\n형식 점검 전부 통과');
process.exit(bad ? 1 : 0);
