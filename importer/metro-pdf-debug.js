import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'data','metro-pdf-debug.txt');
function pad(n){return String(n).padStart(2,'0')}
function slugFor(date=new Date()){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  const saturday=new Date(monday);saturday.setUTCDate(monday.getUTCDate()+5);
  const f=x=>`${pad(x.getUTCDate())}${pad(x.getUTCMonth()+1)}${String(x.getUTCFullYear()).slice(-2)}`;
  return `wochen-angebote-${f(monday)}-${f(saturday)}`;
}
function decodeJsString(s){return s.replace(/\\u0026/g,'&').replace(/\\u0027/g,"'").replace(/\\\//g,'/').replace(/&amp;/g,'&')}
const slug=slugFor();
const landing=`https://prospekte.metro.de/${slug}/page/1`;
const r=await fetch(landing,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36','accept':'text/html'}});
if(!r.ok)throw new Error(`Prospekt HTTP ${r.status}`);
const html=await r.text();
const m=html.match(/\\?"downloadPdfUrl\\?"\s*:\s*\\?"([^"\\]*(?:\\.[^"\\]*)*)\\?"/);
if(!m)throw new Error('downloadPdfUrl nicht gefunden');
const pdfUrl=decodeJsString(m[1]);
const pr=await fetch(pdfUrl,{headers:{'user-agent':'Mozilla/5.0 Chrome/149 Safari/537.36'}});
if(!pr.ok)throw new Error(`PDF HTTP ${pr.status}`);
const bytes=Buffer.from(await pr.arrayBuffer());
const tmp=path.join(os.tmpdir(),'metro-prospekt.pdf');
await fs.writeFile(tmp,bytes);
const {stdout,stderr}=await execFileAsync('pdftotext',['-layout','-nopgbrk',tmp,'-'],{maxBuffer:30*1024*1024});
const text=stdout.replace(/\r/g,'');
await fs.writeFile(OUT,[`SLUG=${slug}`,`LANDING=${landing}`,`PDF=${pdfUrl}`,`PDF_BYTES=${bytes.length}`,`TEXT_CHARS=${text.length}`,`STDERR=${stderr||''}`,'','--- TEXT START ---',text.slice(0,120000)].join('\n'));
console.log(`METRO PDF: ${bytes.length} Bytes, ${text.length} Textzeichen.`);
