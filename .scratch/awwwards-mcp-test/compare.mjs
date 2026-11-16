import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('../framer-live-2026-11-09/build');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname); if(pathname.endsWith('/'))pathname+='index.html'; if(!path.extname(pathname))pathname+='/index.html';const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}const b=await readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]??'application/octet-stream'}).end(b)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const child=spawn(process.execPath,['node_modules/awwwards-mcp/dist/cli.js'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});child.stderr.on('data',d=>process.stderr.write(d));
const pending=new Map();let next=0;createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}});
function call(method,params){let id=++next;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return new Promise(r=>pending.set(id,r));}
await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'senify-eval',version:'1'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
const output={}; for(const route of ['/','/about/']){const result=await call('tools/call',{name:'verify_build',arguments:{buildUrl:`http://127.0.0.1:${port}${route}`,referenceUrl:`https://chocolate-attributes-385353.framer.app${route}`}});output[route]=result;await writeFile('../framer-live-2026-11-09/awwwards-compare.json',JSON.stringify(output,null,2));console.log(JSON.stringify({route,result}));}
child.kill();server.close();
