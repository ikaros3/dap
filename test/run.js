/* 전체 점검을 한 번에 돌린다.   node test/run.js
   각 스크립트는 index.html / data 를 저장소 루트 기준으로 읽으므로 여기서 루트로 옮긴다. */
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const SUITES = [
  ['구문 검사',                'test/syntax.js'],
  ['문제은행 빌드',            'test/bank-build.js'],
  ['로더 단독 실행',            'test/loader-scope.js'],
  ['문항 팩 형식',             'test/pack-format.js'],
  ['세션 이어풀기',            'test/session-resume.js'],
  ['답이 기록되는 문항',       'test/quiz-answer-target.js'],
  ['전체 초기화',              'test/wipe.js'],
  ['초기화 전파(epoch)',       'test/epoch.js'],
  ['두 기기 동기화',           'test/sync-two-devices.js'],
  ['덮어쓰기 감지·복구',       'test/sync-overwrite.js'],
  ['올리는 중 변경',           'test/sync-upload-window.js'],
  ['받아오는 중 변경',         'test/sync-read-window.js'],
];

let failed = [];
SUITES.forEach(([name, file]) => {
  if (!fs.existsSync(path.join(ROOT, file))) { console.log('SKIP  ' + name + '  (' + file + ' 없음)'); return; }
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, [file], { encoding: 'utf8' }); }
  catch (e) { ok = false; out = (e.stdout || '') + (e.stderr || ''); failed.push(name); }
  const last = out.trim().split('\n').filter(Boolean).pop() || '';
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name.padEnd(22) + last.trim());
  if (!ok) console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).map(l => '        ' + l).join('\n'));
});

console.log(failed.length ? '\n실패한 묶음 : ' + failed.join(', ') : '\n전부 통과');
process.exit(failed.length ? 1 : 0);
