import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { bootEngine, createTestSite } from '../../packages/engine/test/helpers.ts';
import { bakePages } from '../../packages/engine/src/bake.ts';
const origin='https://chocolate-attributes-385353.framer.app';
const outDir=resolve('.scratch/framer-live-2026-11-09/build'); await mkdir(outDir,{recursive:true});
const env=await bootEngine();
try {
 const site=await createTestSite(env.api,'Framer Chocolate Akzeptanz 2026-11-09');
 const ids:string[]=[];
 for(const path of ['/','/about']) {
  const res=await env.api.request<any>({method:'POST',path:`/api/sites/${site.id}/imports/framer`,body:{source:{url:origin+path},pagePath:path,capture:'browser',mode:'fidelity',write:true,applyTheme:path==='/',createOnly:true}});
  console.log(JSON.stringify({path,status:res.status,job:res.body?.job?.status,report:res.body?.report}));
  if(res.status!==201||!res.body?.report?.pageId)throw new Error(`Import ${path} failed: ${res.status}`);
  ids.push(res.body.report.pageId);
 }
 const storedSite=await env.engine.store.getSite(site.id); const pages=await Promise.all(ids.map(id=>env.engine.store.getPage(id)));
 const built=await bakePages(env.engine.store,{site:storedSite,pages,outDir,dataDir:env.engine.dataDir}); console.log(JSON.stringify({build:built,outDir}));
} finally {await env.close();}
