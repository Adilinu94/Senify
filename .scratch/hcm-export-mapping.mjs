import fs from 'node:fs';
const read = f => fs.existsSync(f) ? fs.readFileSync(f,'utf8') : null;
const kit = JSON.parse(read('.scratch/hcm-kit-settings.json')||'null');
const vars = JSON.parse(read('.scratch/hcm-global-variables.json')||'null');
const reg = JSON.parse(read('.scratch/hcm-global-classes-registry.json')||'null');
const summary = {
  kit: kit ? {
    system_colors: kit.system_colors?.map(c=>({id:c._id,title:c.title,color:c.color})),
    custom_colors: kit.custom_colors?.map(c=>({id:c._id,title:c.title,color:c.color})),
    typography: {
      primary: kit.system_typography?.[0]?.typography_font_family,
      secondary: kit.system_typography?.[1]?.typography_font_family,
      text: kit.system_typography?.[2]?.typography_font_family,
      accent: kit.system_typography?.[3]?.typography_font_family,
      body: kit.body_typography?.typography_font_family
    },
    breakpoints: {tablet: kit.viewport_tablet, mobile: kit.viewport_mobile},
    pageTitle: kit.page_title_selector,
    bodyBg: kit.body_background_color
  } : null,
  variables: vars?.data ? Object.values(vars.data).map(v=>({id:v.id,label:v.label,value:v.value,order:v.order,type:v.type})) : vars,
  classesRegistryCount: reg?.items ? Object.keys(reg.items).length : (Array.isArray(reg)?reg.length:null),
  classesRegistryOrder: reg?.order,
};
console.log(JSON.stringify(summary, null, 2));
