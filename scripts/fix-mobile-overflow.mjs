import fs from 'node:fs/promises';

const path=new URL('../index.html',import.meta.url);
let html=await fs.readFile(path,'utf8');
const marker='/* mobile-overflow-guard */';
if(html.includes(marker)){
  console.log('Mobile-Overflow-Guard bereits vorhanden.');
  process.exit(0);
}
const needle=':root{--green:#0b6b4f;--ink:#14231d;--muted:#687b73;--line:#dce7e2;--bg:#f4f7f5;--soft:#e9f7eb;--baby:#fff2dc;--offer:#fff0e6}\n';
if(!html.includes(needle))throw new Error('CSS-Einstieg nicht eindeutig gefunden.');
const guard=`${marker}\nhtml,body{max-width:100%;overflow-x:hidden}\n.hero>*,.row>*,.layout>*,.card>*,.stats>*,.side>*,.drawerHead>*{min-width:0}\n.card h3,.meta,.panel,.hint,.item span{overflow-wrap:anywhere;word-break:break-word}\nselect,input{min-width:0;max-width:100%}\n`;
html=html.replace(needle,needle+guard);
await fs.writeFile(path,html);
console.log('Mobile-Overflow-Guard eingebaut.');
