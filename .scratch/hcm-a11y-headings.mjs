import fs from 'node:fs';
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(file,'utf8'));
  const headings = [];
  const linksNoText = [];
  const imgs = [];
  const buttons = [];
  const walk = n => {
    if (Array.isArray(n)) { for (const x of n) walk(x); return; }
    if (!n || typeof n!=='object') return;
    const s = n.settings || {};
    if (n.widgetType === 'heading') headings.push({tag:s.header_size||s.title_size||'?', text:(s.title||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,80)});
    if (n.widgetType === 'image') imgs.push({alt:s.image?.alt ?? s.image_alt ?? '', id:s.image?.id ?? null, hasLink:!!(s.link?.url)});
    if (n.widgetType === 'button') buttons.push({text:(s.text||'').replace(/<[^>]+>/g,'').trim().slice(0,60), link:s.link?.url||''});
    if (n.widgetType === 'icon-list' && Array.isArray(s.icon_list)) for (const it of s.icon_list) { if (!it.text || !String(it.text).trim()) linksNoText.push({type:'icon-list',link:it.link?.url}); }
    for (const k of ['elements','children']) if (n[k]) walk(n[k]);
  };
  walk(d);
  console.log(JSON.stringify({file:file.replace(/^.*[\\\/]/,''),headingCount:headings.length,headings:headings.slice(0,25),imageWidgets:imgs.length,imagesWithoutAlt:imgs.filter(i=>!i.alt).length,buttons:buttons.slice(0,12)}, null, 2));
}
