/* HWPX = ZIP + XML. Contents/section*.xml 의 <hp:t> 텍스트만 뽑아 문단 단위로 잇는다.
   node 만으로 처리하려고 zip 중앙 디렉터리를 직접 읽고 raw deflate 를 푼다. */
const fs = require('fs'), zlib = require('zlib');

function unzipEntries(buf) {
  /* End of Central Directory 찾기 */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD 없음');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    out.push({ name, method, csize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out.map(e => {
    const nl = buf.readUInt16LE(e.lho + 26), xl = buf.readUInt16LE(e.lho + 28);
    const start = e.lho + 30 + nl + xl;
    const raw = buf.slice(start, start + e.csize);
    e.data = () => e.method === 0 ? raw : zlib.inflateRawSync(raw);
    return e;
  });
}

function textOf(xml) {
  /* 문단(<hp:p>)마다 줄을 나누고, 그 안의 <hp:t> 내용을 잇는다 */
  return xml
    .replace(/<hp:p[ >]/g, '\n<hp:p ')
    .replace(/<hp:tab[^>]*\/>/g, '\t')
    .replace(/<hp:lineBreak[^>]*\/>/g, '\n')
    .split('\n')
    .map(line => {
      const parts = [...line.matchAll(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g)].map(m => m[1]);
      return parts.join('')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
        .trim();
    })
    .filter(Boolean)
    .join('\n');
}

const file = process.argv[2];
const outPath = process.argv[3];
const entries = unzipEntries(fs.readFileSync(file));
const sections = entries.filter(e => /^Contents\/section\d+\.xml$/.test(e.name))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
if (!sections.length) { console.error('section*.xml 없음: ' + entries.map(e => e.name).slice(0, 20)); process.exit(1); }
let all = '';
sections.forEach(s => { all += textOf(s.data().toString('utf8')) + '\n'; });
fs.writeFileSync(outPath, all, 'utf8');
console.log(file.split(/[\\/]/).pop() + ' → ' + sections.length + ' section, ' + all.length.toLocaleString() + '자');
