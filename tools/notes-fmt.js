/* 내용정리 원고의 글자 강조 표기 — 원본 hwpx 의 강조를 그대로 옮긴다.
     **굵게**   {r}빨강{/r}   {b}파랑{/b}   {u}밑줄{/u}     (겹쳐 쓸 수 있다)
   parse()  : 표기가 든 문자열 → [{ c:글자, f:"B r b u" 중 켜진 것 }]
   format() : 그 배열 → 표기 문자열. 같은 모양이 이어지면 하나로 묶고, 앞뒤 공백은 표기 밖에 둔다.
              감싸는 순서는 색 → 굵게 → 밑줄로 일정하다 — 화면의 noteInline 이 이 순서를 기대하지 않지만
              원고를 사람이 읽기 쉽게 하려는 것이다. */
const TAG = /\*\*|\{\/?[rbu]\}/g;

function parse(s) {
  const out = [], on = { B: 0, r: 0, b: 0, u: 0 };
  let last = 0, m;
  const push = t => { for (const c of t) out.push({ c, f: (on.r ? 'r' : '') + (on.b ? 'b' : '') + (on.B ? 'B' : '') + (on.u ? 'u' : '') }); };
  TAG.lastIndex = 0;
  while ((m = TAG.exec(s))) {
    push(s.slice(last, m.index));
    last = TAG.lastIndex;
    if (m[0] === '**') on.B ^= 1;
    else on[m[0].replace(/[{}\/]/g, '')] = m[0][1] === '/' ? 0 : 1;
  }
  push(s.slice(last));
  return out;
}

function format(chars) {
  /* 공백·구두점만 있는 글자는 앞뒤가 같은 모양이면 그 모양을 따른다 — 「**가** **나**」를 하나로 */
  const f = chars.map(x => x.f);
  chars.forEach((x, i) => {
    if (!/\s/.test(x.c)) return;
    let a = i - 1, b = i + 1;
    while (a >= 0 && /\s/.test(chars[a].c)) a--;
    while (b < chars.length && /\s/.test(chars[b].c)) b++;
    f[i] = a >= 0 && b < chars.length && chars[a].f === chars[b].f ? chars[a].f : '';
  });
  let out = '', i = 0;
  while (i < chars.length) {
    let j = i;
    while (j < chars.length && f[j] === f[i]) j++;
    const seg = chars.slice(i, j).map(x => x.c).join(''), fl = f[i];
    if (!fl) out += seg;
    else {
      const lead = /^\s*/.exec(seg)[0], trail = /\s*$/.exec(seg.slice(lead.length))[0];
      const core = seg.slice(lead.length, seg.length - trail.length);
      let w = core;
      if (w) {
        if (fl.includes('u')) w = '{u}' + w + '{/u}';
        if (fl.includes('B')) w = '**' + w + '**';
        if (fl.includes('r')) w = '{r}' + w + '{/r}';
        if (fl.includes('b')) w = '{b}' + w + '{/b}';
      }
      out += lead + w + trail;
    }
    i = j;
  }
  return out;
}

const plain = s => String(s).replace(TAG, '');
const canon = s => format(parse(s));

module.exports = { parse, format, plain, canon, TAG };
