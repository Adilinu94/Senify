import fs from 'node:fs';
const s = fs.readFileSync('.scratch/hcm-footer-860.json', 'utf8').trim();
try {
  const d = JSON.parse(s);
  const walk = (n, a = {els:0,widgets:new Set(),dyn:0,globals:0,classes:0,vars:0,custom:0,t:0,m:0}) => {
    if (Array.isArray(n)) { for (const x of n) walk(x,a); return a; }
    if (!n || typeof n !== 'object') return a;
    a.els++;
    if (n.widgetType) a.widgets.add(n.widgetType);
    if (n.elType === 'widget' && n.settings && n.settings.__dynamic__) a.dyn++;
    const j = JSON.stringify(n);
    if (j.includes('globals/colors') || j.includes('globals/typography')) a.globals++;
    if (j.includes('e-gv-') || j.includes('global-variable')) a.vars++;
    if (j.includes('css_classes') || j.includes('global-class') || j.includes('e_global_class')) a.classes++;
    if (j.includes('custom_css')) a.custom++;
    if (n.settings && (n.settings._element_width_tablet || n.settings._padding_tablet || n.settings.typography_font_size_tablet)) a.t++;
    if (n.settings && (n.settings._element_width_mobile || n.settings._padding_mobile || n.settings.typography_font_size_mobile)) a.m++;
    for (const k of ['elements','children']) if (n[k]) walk(n[k], a);
    return a;
  };
  const r = walk(d);
  console.log(JSON.stringify({parsed:true,elements:r.els,widgets:[...r.widgets].sort(),dynamic:r.dyn,globals:r.globals,vars:r.vars,classes:r.classes,customCss:r.custom,tabletHints:r.t,mobileHints:r.m}, null, 2));
} catch (e) {
  console.log(JSON.stringify({parsed:false,error:e.message,head:s.slice(0,120)}));
}
