import fs from 'node:fs';

const path='index.html';
let html=fs.readFileSync(path,'utf8');
if(html.includes('href="./grundlebensmittel.html"')){
  console.log('Grundlebensmittel-Navigation bereits vorhanden.');
  process.exit(0);
}

const cssMarker='.brand b{display:block}.brand small,.muted{color:var(--muted)}';
if(!html.includes(cssMarker))throw new Error('CSS-Marker für Navigation nicht gefunden');
html=html.replace(cssMarker,`${cssMarker}.headerActions{display:flex;align-items:center;gap:7px}.staplesNav{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px 10px;text-decoration:none;color:var(--ink);font-size:11px;font-weight:800;white-space:nowrap}.staplesNav:hover{border-color:#b9d5c9;background:#f8fffb}`);

const headerMarker='<span class="ver">V5.1 · strikt lokal</span></header>';
if(!html.includes(headerMarker))throw new Error('Header-Marker für Navigation nicht gefunden');
html=html.replace(headerMarker,'<div class="headerActions"><a class="staplesNav" href="./grundlebensmittel.html">🏠 Unsere Grundlebensmittel</a><span class="ver">V5.1 · strikt lokal</span></div></header>');

const mobileMarker='@media(max-width:640px){.ver{display:none}';
if(!html.includes(mobileMarker))throw new Error('Mobile-CSS-Marker nicht gefunden');
html=html.replace(mobileMarker,'@media(max-width:640px){.ver{display:none}.staplesNav{padding:8px;font-size:0}.staplesNav::after{content:"Vorrat";font-size:10px}.staplesNav{gap:2px}');

fs.writeFileSync(path,html);
console.log('Grundlebensmittel-Navigation ergänzt.');
