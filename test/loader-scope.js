/* 로더 스크립트를 **혼자** 돌려 본다.
   index.html 은 인라인 script 가 둘이다. 앞은 문제은행 로더, 뒤는 앱(DAP_APP_BOOT).
   둘은 서로 다른 스코프라 로더가 앱 쪽 함수를 부르면 브라우저에서만 ReferenceError 가
   나고, 로딩 화면이 "문항을 정리하는 중…"에서 멈춘다. 두 script 를 이어 붙여
   검사하는 다른 테스트는 이것을 못 잡는다 — 그래서 여기서는 앞쪽만 넣는다.
   가짜 DOM 이 <script> 삽입을 파일 읽기로 바꿔 실제 data/ 를 그대로 태운다. */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');

const scripts = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length < 2) { console.log('FAIL  인라인 script 가 2개가 아님'); process.exit(1); }

let bad = 0;
const fail = s => { bad++; console.log('FAIL  ' + s); };

const el = () => ({ style: { setProperty(){} }, textContent: '', classList: { add(){} },
                    setAttribute(){}, parentNode: null });

const ctx = {
  console,
  window: {},
  localStorage: { getItem: () => null },
  setTimeout: () => 0, clearTimeout: () => {},
  document: {
    readyState: 'complete',
    documentElement: el(),
    getElementById: () => el(),
    addEventListener(){},
    createElement: () => ({ onload: null, onerror: null }),
    head: {
      /* <script src> 삽입을 파일 읽기로 대신한다 */
      appendChild(node){
        try {
          const src = String(node.src);
          if (!fs.existsSync(src)) return node.onerror && node.onerror();
          vm.runInContext(fs.readFileSync(src, 'utf8'), ctx, { filename: src });
          node.onload && node.onload();
        } catch (e) {
          fail('팩 실행 중 오류: ' + node.src + ' — ' + e.message);
        }
      }
    }
  }
};
ctx.window.window = ctx.window;
ctx.window.addEventListener = () => {};
/* 브라우저에서는 window 의 속성이 곧 전역이다. 팩 파일이 맨 이름 DAP_BANK 를 쓰므로
   그 통로를 만들어 준다. */
Object.defineProperty(ctx, 'DAP_BANK', { get: () => ctx.window.DAP_BANK });
vm.createContext(ctx);

/* 앱 스크립트는 넣지 않는다. 로더가 조립을 마치고 부르는 것만 확인한다. */
let booted = false;
ctx.window.DAP_APP_BOOT = () => { booted = true; };

vm.runInContext(scripts[0], ctx, { filename: 'index.html(로더)' });

const banks = ctx.window.DAP_BANKS;
if (!booted) fail('앱 시작(DAP_APP_BOOT)까지 가지 못했다 — 로더가 도중에 멈췄다');
if (!banks || !banks.length) fail('window.DAP_BANKS 가 비어 있다');
else {
  const core = banks.find(b => b.id === 'core') || banks[0];
  if (!core.questions.length) fail('core 묶음에 문항이 없다');
  /* 로더가 만들어야 하는 필드 — 하나라도 빠지면 해설 화면이 반쪽이 된다 */
  const miss = ['r', 'f'].filter(k => core.questions.every(q => !q[k]));
  if (miss.length) fail('로더가 ' + miss.join(', ') + ' 를 채우지 못했다');
  if (!bad) console.log('로더 단독 실행 통과 — 묶음 ' + banks.length +
                        ' · core ' + core.questions.length + '문항');
}

console.log(bad ? '\n실패 ' + bad + '건' : '\n전부 통과');
process.exit(bad ? 1 : 0);
