import fs from 'node:fs/promises';
const file=new URL('../index.html',import.meta.url);
let s=await fs.readFile(file,'utf8');
const marker='data-staples-nav="1"';
if(s.includes(marker)){
  console.log('Grundlebensmittel-Link bereits vorhanden.');
  process.exit(0);
}
const needle='<div class="tools">';
if(!s.includes(needle))throw new Error('Erwarteter Toolbar-Marker in index.html nicht gefunden');
const nav=`<div data-staples-nav="1" style="margin:12px 0"><a href="./grundlebensmittel.html" style="display:flex;align-items:center;justify-content:space-between;gap:10px;text-decoration:none;background:#fff;border:1px solid var(--line);border-radius:16px;padding:13px 14px"><span><b>🏠 Unsere Grundlebensmittel</b><br><small class="muted">Standardvorrat: aktueller Bestpreis inkl. Prospektangebote</small></span><span style="font-size:20px">›</span></a></div>\n`;
s=s.replace(needle,nav+needle);
await fs.writeFile(file,s);
console.log('Grundlebensmittel-Link in index.html ergänzt.');
