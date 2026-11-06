import fs from 'node:fs';
function walk(n, a={fields:[],consent:[],labels:0,noLabel:0,required:0}) {
  if (Array.isArray(n)) { for (const x of n) walk(x,a); return a; }
  if (!n || typeof n!=='object') return a;
  const w=n.widgetType||'';
  const s=n.settings||{};
  if (/^mf-/.test(w) || w.includes('form')) {
    const label = s.mf_input_label || s.label || s.field_label || '';
    const ph = s.mf_input_placeholder || s.placeholder || '';
    const req = s.mf_input_required === 'yes' || s.required === 'yes';
    if (req) a.required++;
    if (label) a.labels++; else a.noLabel++;
    a.fields.push({w, label:String(label).slice(0,60), placeholder:String(ph).slice(0,60), required:req, name:s.mf_input_name||s.name||''});
    const txt = JSON.stringify(s).toLowerCase();
    if (txt.includes('einwill') || txt.includes('datenschutz') || txt.includes('privacy') || txt.includes('consent') || txt.includes('dsgvo')) a.consent.push({w,label:String(label).slice(0,80),name:s.mf_input_name||''});
  }
  for (const k of ['elements','children']) if (n[k]) walk(n[k],a);
  return a;
}
for (const [file,id] of process.argv.slice(2).reduce((r,x,i)=>{ if(i%2===0) r.push([x,process.argv[2+i+1]]); return r;},[])) {
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  console.log(JSON.stringify({form:id, ...walk(d)}, null, 2));
}
