/* 내용정리 원고(.md) → 데이터(book) 변환. tools/notes-build.js(Node)와 앱의 원고 편집(브라우저)이 함께 쓴다.
   원고 형식은 tools/notes-build.js 머리 주석을 볼 것.

   build(text, opt)  원고 전체 → { book, errs, stat }
                     opt = { ch, ed:"2020"|"2013", srcRel:오류 표시에 쓸 이름, img(key) → {src,w,h} | null }
   fileText(book)    book → data/notes/…js 파일 내용
   itemRange(text, c, s, no)  c장 s절 no항의 원고 줄 범위 { from, to } (0부터, to 는 포함 안 함).
                     no = 0 이면 절 머리말(## 다음 줄부터 첫 ### 앞까지). 없으면 null
   splice(text, r, part)      범위 r 을 part 로 바꾼 원고 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DAP_NOTES_CORE = factory();
})(this, function () {
  var NAMES = { 1: '전사아키텍처이해', 2: '데이터요건분석', 3: '데이터표준화', 4: '데이터모델링', 5: '데이터베이스설계와이용', 6: '데이터품질관리이해' };
  function srcRel(ch, ed) { return (ed === '2013' ? '2013/' : '') + 'ch' + ch + '.md'; }
  function outRel(ch, ed) { return (ed === '2013' ? '2013/' : '') + ch + '.' + NAMES[ch] + '.js'; }

  /* 머리(--- … ---)를 떼어 낸다. body 의 첫 줄이 원고 몇째 줄인지(skip)도 함께 */
  function front(text) {
    var meta = {}, fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!fm) return { meta: meta, body: text, skip: 0 };
    fm[1].split('\n').forEach(function (l) { var m = /^(\w+):\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); });
    return { meta: meta, body: text.slice(fm[0].length), skip: fm[0].split('\n').length - 1 };
  }

  function build(text, opt) {
    var ch = opt.ch, E13 = opt.ed === '2013', rel = opt.srcRel || srcRel(ch, opt.ed);
    text = String(text).replace(/\r/g, '');
    var F = front(text), meta = F.meta;
    var errs = [];
    if (+meta.ch !== ch) errs.push('머리의 ch(' + meta.ch + ')가 과목 번호와 다르다');

    var book = Object.assign(E13 ? { ed: '2013' } : {}, {
      ch: ch, title: meta.title || '',
      sourceFiles: (meta.sourceFiles || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean),
      images: {}, chapters: []
    });
    var C = null, S = null, I = null;
    var stat = { lines: 0, tables: 0, images: 0, e2013: 0, w: 0 };

    F.body.split('\n').forEach(function (line, n) {
      var at = rel + ':' + (n + 1), m;
      if ((m = /^# 제\s*(\d+)\s*장\s+(.+)$/.exec(line))) {
        C = { no: +m[1], title: m[2].trim(), sections: [] }; book.chapters.push(C); S = I = null; return;
      }
      if ((m = /^## 제\s*(\d+)\s*절\s+(.+)$/.exec(line))) {
        if (!C) { errs.push(at + ' 장 없이 절이 나왔다'); return; }
        S = { no: +m[1], title: m[2].trim(), intro: '', items: [] }; C.sections.push(S); I = null; return;
      }
      if ((m = /^### (\d+)\.\s*(.+)$/.exec(line))) {
        if (!S) { errs.push(at + ' 절 없이 항이 나왔다'); return; }
        I = { no: +m[1], title: m[2].trim(), body: '' }; S.items.push(I); return;
      }
      if (/^#{1,3} /.test(line)) { errs.push(at + ' 형식을 모르는 제목: ' + line); return; }
      if (!S) { if (line.trim()) errs.push(at + ' 절 밖의 글: ' + line.slice(0, 40)); return; }
      if (I) I.body += line + '\n'; else S.intro += line + '\n';
      if (line.trim()) stat.lines++;
      var re = /\[\[img:([\w-]+)\]\]/g, im;
      while ((im = re.exec(line))) {
        var key = im[1], got = opt.img(key);
        if (!got) errs.push(at + ' 그림 파일 없음: ' + key);
        else book.images[key] = got;
        stat.images++;
      }
      stat.e2013 += (line.match(/\{2013\}/g) || []).length;
      stat.w += (line.match(/\{w\}/g) || []).length;
      /* 강조 표기 짝 — 한 줄(표는 한 칸) 안에서 닫혀야 화면에서 태그가 엇갈리지 않는다 */
      (/^[|‖] /.test(line) ? line.slice(2, -2).split(' | ') : [line]).forEach(function (part) {
        var odd = ((part.match(/\*\*/g) || []).length % 2) ? ['**'] : [];
        ['r', 'b', 'g', 'u'].forEach(function (t) {
          if ((part.split('{' + t + '}').length) !== (part.split('{/' + t + '}').length)) odd.push('{' + t + '}');
        });
        if (odd.length) errs.push(at + ' 강조 표기 짝이 안 맞는다 (' + odd.join(' ') + '): ' + part.slice(0, 40));
      });
      ['r', 'b', 'g', 'u'].forEach(function (k) { stat[k] = (stat[k] || 0) + (line.split('{' + k + '}').length - 1); });
    });

    /* 다듬기 · 점검: 앞뒤 빈 줄을 걷고, 표의 칸 수가 행마다 같은지 본다 */
    var trim = function (s) { return s.replace(/^\n+|\s+$/g, ''); };
    book.chapters.forEach(function (c) { c.sections.forEach(function (s) {
      s.intro = trim(s.intro);
      s.items.forEach(function (i) { i.body = trim(i.body); });
      [s.intro].concat(s.items.map(function (i) { return i.body; })).forEach(function (body) {
        var rows = [];
        var flush = function () {
          if (!rows.length) return;
          stat.tables++;
          var w = rows.map(function (r) { return r.split(' | ').length; });
          if (w.some(function (x) { return x !== w[0]; })) errs.push(c.no + '장 ' + s.no + '절 표의 칸 수가 행마다 다르다 (' + w.join(',') + '): ' + rows[0].slice(0, 40));
          rows = [];
        };
        body.split('\n').forEach(function (l) { if (/^[|‖] /.test(l)) rows.push(l.replace(/\s+$/, '').slice(2, -2)); else flush(); });
        flush();
      });
      s.items.forEach(function (i, k) { if (i.no !== k + 1) errs.push(c.no + '장 ' + s.no + '절 항 번호가 이어지지 않는다: ' + i.no + '. ' + i.title); });
    }); });
    book.chapters.forEach(function (c, k) { if (c.no !== k + 1) errs.push('장 번호가 이어지지 않는다: 제' + c.no + '장'); });
    return { book: book, errs: errs, stat: stat };
  }

  function fileText(book) {
    var E13 = book.ed === '2013';
    return '/* 내용정리' + (E13 ? ' 2013 Edition' : '') + ' · 과목 ' + book.ch + ' ' + book.title + '\n' +
      '   tools/notes-build.js 가 tools/notes-src/' + srcRel(book.ch, book.ed) + ' 에서 만든다. 손으로 고치지 말 것. */\n' +
      'DAP_NOTES.add(' + JSON.stringify(book, null, 1) + ');\n';
  }

  function itemRange(text, c, s, no) {
    var lines = String(text).split('\n'), skip = front(text).skip, cc = 0, ss = 0, from = -1, m;
    for (var i = skip; i < lines.length; i++) {
      var L = lines[i];
      if ((m = /^# 제\s*(\d+)\s*장\s/.exec(L))) { if (from >= 0) return { from: from, to: i }; cc = +m[1]; ss = 0; continue; }
      if ((m = /^## 제\s*(\d+)\s*절\s/.exec(L))) {
        if (from >= 0) return { from: from, to: i };
        ss = +m[1];
        if (cc === c && ss === s && no === 0) from = i + 1;
        continue;
      }
      if ((m = /^### (\d+)\./.exec(L))) {
        if (from >= 0) return { from: from, to: i };
        if (cc === c && ss === s && +m[1] === no) from = i;
      }
    }
    return from >= 0 ? { from: from, to: lines.length } : null;
  }

  function splice(text, r, part) {
    var lines = String(text).split('\n');
    return lines.slice(0, r.from).concat(String(part).split('\n'), lines.slice(r.to)).join('\n');
  }

  return { NAMES: NAMES, srcRel: srcRel, outRel: outRel, build: build, fileText: fileText, itemRange: itemRange, splice: splice };
});
