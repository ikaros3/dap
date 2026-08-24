/* index.html 안의 인라인 스크립트 구문 검사.
   빌드 도구가 없으므로 이것이 유일한 컴파일 단계다. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

let bad = 0;
[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
  try { new vm.Script(m[1]); console.log('PASS  script[' + i + ']'); }
  catch (e) { bad++; console.log('FAIL  script[' + i + '] ' + e.message); }
});

/* 힙독 편집에서 백슬래시가 사라진 적이 있다(memory.md 6절).
   정규식이 조용히 아무것도 매치하지 않으므로 구문 검사로는 안 걸린다. */
const CANARY = [
  [/\/\^ch\\d\+:\(all\|unseen\|b\\d\+\)\$\//, 'isSeqKey 정규식의 \\d'],
  [/matchAll|match\(/, '(참고) 정규식 사용부'],
];
if (!CANARY[0][0].test(html)) { bad++; console.log('FAIL  ' + CANARY[0][1] + ' 가 사라졌다 — 편집 중 백슬래시 손실'); }
else console.log('PASS  ' + CANARY[0][1]);

console.log(bad ? '\n실패 ' + bad + '건' : '\n구문 검사 통과');
process.exit(bad ? 1 : 0);
