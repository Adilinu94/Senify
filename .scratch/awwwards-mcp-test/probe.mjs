import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const child=spawn(process.execPath,['node_modules/awwwards-mcp/dist/cli.js'],{cwd:process.cwd(),stdio:['pipe','pipe','pipe'],env:{...process.env,NO_COLOR:'1'}});
child.stderr.on('data',d=>process.stderr.write(d));
const pending=new Map(); let next=0;
createInterface({input:child.stdout}).on('line',line=>{try{const m=JSON.parse(line); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}});
function call(method,params){let id=++next;child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');return new Promise(r=>pending.set(id,r));}
const init=await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'senify-eval',version:'1'}});if(init.error)console.log(JSON.stringify(init));
child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
const url='https://chocolate-attributes-385353.framer.app/';
for(const [name,args] of [['analyze_page_structure',{url,compare:'mobile',publicOnly:true}],['analyze_hover_census',{url}],['get_motion_dna',{url,recapture:true}]]) {
 const result=await call('tools/call',{name,arguments:args}); console.log(JSON.stringify({name,result}));
}
child.kill();