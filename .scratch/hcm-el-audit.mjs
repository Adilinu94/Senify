import fs from 'node:fs';
const file = process.argv[2];
const s = fs.readFileSync(file, 'utf8').trim();
try {
  const d = JSON.parse(s);
  const walk = (n, a = {els:0,widgets:new Map(),dyn:0,globals:0,gv:0,cssClasses:0,custom:0,t:0,m:0}) => {
    if (Array.isArray(n)) { for (const x of n) walk(x,a); return a; }
    if (!n || typeof n !== 'object') return a;
    a.els++;
    if (n.widgetType) a.widgets.set(n.widgetType, (a.widgets.get(n.widgetType)||0)+1);
    if (n.settings && n.settings.__dynamic__) a.dyn++;
    if (n.settings && (n.settings.css_classes || n.settings._css_classes)) a.cssClasses++;
    const j = JSON.stringify(n);
    if (j.includes('globals/colors') || j.includes('globals/typography')) a.globals++;
    if (j.includes('e-gv-')) a.gv++;
    if (j.includes('custom_css')) a.custom++;
    if (n.settings) for (const k of Object.keys(n.settings)) { if (/_tablet$|_tablet_/.test(k)) a.t++; if (/_mobile$|_mobile_/.test(k)) a.m++; }
    for (const k of ['elements','children']) if (n[k]) walk(n[k], a);
    return a;
  };
  const r = walk(d);
  console.log(JSON.stringify({parsed:true,elements:r.els,widgets:Object.fromEntries([...r.widgets.entries()].sort((a,b)=>b[1]-a[1])),dynamic:r.dyn,globalsRefs:r.globals,eGvRefs:r.gv,cssClassFields:r.cssClasses,customCss:r.custom,tabletSettingKeys:r.t,mobileSettingKeys:r.m}, null, 2));
} catch (e) {
  console.log(JSON.stringify({parsed:false,error:e.message,head:s.slice(0,120)}));
}
