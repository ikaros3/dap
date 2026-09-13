/* index.html 의 regradeByKey 원문을 꺼내, 정답을 바로잡은 뒤 이미 낸 응시의
   점수·과목별 집계와 오답노트가 지금 정답 기준으로 맞춰지는지 본다. */
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('index.html', 'utf8');
const m = src.match(/function regradeByKey\(\)\{[\s\S]*?\n\}/);
if (!m) { console.error('추출 실패: regradeByKey'); process.exit(1); }

let fail = 0;
function check(name, cond) { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fail++; }

function makeCtx() {
  const QMAP = {
    A: { id: 'A', ch: 1, a: 0 },   /* 정답을 3 → 0 으로 바로잡은 문항 */
    B: { id: 'B', ch: 1, a: 2 },
    C: { id: 'C', ch: 2, a: 1 },
  };
  const ctx = {
    JSON, Date, Math,
    DAP: { id: 'main' }, BANKS: [{ id: 'main' }], QMAP,
    CHLIST: [{ id: 1 }, { id: 2 }], PER_Q: 2, BOX_DAYS: [0, 1, 2, 4, 8, 16, 35], KEY: 'k',
    dirty: 0, store: {},
    localStorage: { setItem: (k, v) => { ctx.store[k] = v; } },
    markDirty: () => { ctx.dirty++; },
    examBank: e => e.bank || 'main',
    examIds: e => e.ids,
    S: {
      exams: [{
        id: 'E1', bank: 'main', ids: ['A', 'B', 'C'], answers: { A: 0, B: 2, C: 3 },
        /* 옛 정답(A=3)으로 채점된 값 */
        count: 3, correct: 1, score: 2, byCh: { 1: { count: 2, correct: 1 }, 2: { count: 1, correct: 0 } },
      }],
      stats: { A: { right: 0, wrong: 1, box: 0, due: 0, last: 1, pick: 0 },
               C: { right: 0, wrong: 1, box: 0, due: 0, last: 1, pick: 3 } },
      wrong: { A: true, C: true },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx;
}

const c = makeCtx();
const n = c.regradeByKey();
const e = c.S.exams[0];
check('점수·정답 수를 지금 정답으로 다시 센다', e.correct === 2 && e.score === 4);
check('과목별 집계도 맞춘다', e.byCh[1].correct === 2 && e.byCh[2].correct === 0);
check('마지막 선택이 지금 정답인 문항은 오답노트에서 뺀다', !c.S.wrong.A);
check('여전히 틀린 문항은 오답노트에 남긴다', c.S.wrong.C === true);
check('뺀 문항은 복습 상자를 한 칸 올린다', c.S.stats.A.box === 1);
check('right/wrong 횟수는 건드리지 않는다', c.S.stats.A.wrong === 1 && c.S.stats.A.right === 0);
check('바뀐 것이 있으면 저장하고 동기화 대상으로 표시한다', n > 0 && c.store.k && c.dirty === 1);
check('다시 돌려도 바뀌는 것이 없다', c.regradeByKey() === 0 && c.dirty === 1);

const d = makeCtx();
d.S.exams[0].bank = 'other';
d.S.wrong = {};
check('다른 묶음의 응시는 건드리지 않는다', d.regradeByKey() === 0 && d.S.exams[0].score === 2);

const f = makeCtx();
f.S.exams[0].ids = ['A', 'Z'];
f.S.wrong = {};
check('지금 문제은행에 없는 문항이 섞인 응시는 그대로 둔다', f.regradeByKey() === 0);

console.log(fail ? fail + '건 실패' : '전부 통과');
process.exit(fail ? 1 : 0);
