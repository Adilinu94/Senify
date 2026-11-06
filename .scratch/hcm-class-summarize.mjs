import fs from 'node:fs';
// Very small PHP-serialized string extractor for our known class payload shapes.
function phpStrings(buf) {
  const s = buf.toString('utf8');
  const out = [];
  for (const m of s.matchAll(/s:\d+:"([^"\\]*(?:\\.[^"\\]*)*)";/g)) out.push(m[1].replace(/\\"/g,'"').replace(/\\\\/g,'\\'));
  return out;
}
for (const id of [306,307,308,309,310,311]) {
  const b = fs.readFileSync(`.scratch/hcm-class-${id}.dat`);
  const strs = phpStrings(b);
  const label = strs.find(x=>!/^g-/.test(x) && !/^e-/.test(x) && /[A-Za-z]/.test(x) && x.length<60) || null;
  const gid = strs.find(x=>/^g-/.test(x));
  const refs = strs.filter(x=>/^e-gv-/.test(x));
  const props = [...new Set(strs.filter(x=>/typography|font|color|margin|padding|border|background|width|height|flex|gap|radius|size/i.test(x)))].slice(0,12);
  console.log(JSON.stringify({id,label,gid,eGvRefs:[...new Set(refs)],bytes:b.length,propHints:props}));
}
