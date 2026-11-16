import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import { snapshotUnframer } from '../../packages/mcp/src/unframer.ts';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const rl=createInterface({input:process.stdin,terminal:false});
const secretUrl=await new Promise<string>(resolve=>rl.once('line',resolve)); rl.close();
const outputDir='.scratch/framer-live-2026-11-09'; await mkdir(outputDir,{recursive:true});
try { const result=await snapshotUnframer({secretUrl,sourceUrl:'https://chocolate-attributes-385353.framer.app/',outputDir}); console.log(JSON.stringify(result)); }
catch(e) { console.error('Snapshot fehlgeschlagen:',e instanceof Error ? e.message : 'Unbekannter Fehler'); process.exitCode=1; }
