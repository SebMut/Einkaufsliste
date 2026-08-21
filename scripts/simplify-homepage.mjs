import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

// Ruhigere, klarere Oberfläche – bestehende IDs und JS-Funktionalität bleiben erhalten.
const css = `
<style id="homepage-clean-v6">
:root{--surface:#fff;--surface2:#f7faf8;--shadow:0 8px 28px rgba(20,35,29,.07)}
body{background:#f5f7f6!important}
.wrap{width:min(1180px,calc(100% - 28px))!important;padding-bottom:50px!important}
header{padding:12px 0!important}
.brand small{display:block;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:24px!important;padding:22px 24px!important;border-radius:22px!important;margin-bottom:12px!important}
.hero h1{font-size:clamp(25px,4vw,38px)!important;margin:7px 0!important;max-width:720px!important}
.hero p{margin:0!important;max-width:700px!important;font-size:14px!important}
.hero .ey{font-size:11px!important;padding:5px 8px!important}
.stats{display:flex!important;gap:7px!important;flex-shrink:0!important}
.stat{min-width:92px!important;padding:10px 12px!important;text-align:center!important}
.stat b{font-size:20px!important}.stat span{font-size:9px!important}
.notice{margin:8px 0!important;padding:9px 12px!important;border-radius:11px!important}
.priority{display:none!important}
[data-staples-nav="1"]{margin:8px 0!important}
[data-staples-nav="1"] a{padding:10px 13px!important;border-radius:13px!important;box-shadow:none!important}
.tools{top:0!important;padding:9px 0 8px!important;background:rgba(245,247,246,.96)!important;backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.row{grid-template-columns:minmax(260px,1fr) 190px 170px 52px!important}
.search,.select,.listBtn{border-radius:12px!important;box-shadow:0 1px 2px rgba(20,35,29,.03)}
.search input{padding:11px 7px!important}
.chips{padding-top:6px!important;gap:5px!important}
.chip{padding:6px 9px!important;font-size:10px!important}
.head{margin:17px 2px 7px!important}.head h2{font-size:18px!important}.head p{margin:1px 0!important}
.top{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
.topcard{padding:11px!important;border-radius:14px!important}
.topcard .emoji{font-size:21px!important}.topcard h3{font-size:13px!important;margin:5px 0 2px!important}.topcard .bigprice{font-size:20px!important;margin-top:6px!important}
.layout{grid-template-columns:minmax(0,1fr)!important;gap:0!important}
.side{display:none!important}
.cards{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
.card{grid-template-columns:38px minmax(0,1fr) auto!important;padding:11px!important;border-radius:14px!important;gap:8px!important;min-height:112px!important}
.ico{width:38px!important;height:38px!important;border-radius:11px!important;font-size:19px!important}
.card h3{font-size:13px!important;line-height:1.25!important}.meta{font-size:9px!important}.tags{margin-top:4px!important}.tag{font-size:8px!important;padding:3px 5px!important}
.price{min-width:82px!important}.price>b{font-size:17px!important}.add{margin-top:6px!important;padding:6px 8px!important}.compare{display:none!important}
.historyBtn,.ratingBtn{font-size:8px!important;margin-top:5px!important;padding:5px 6px!important}
.more{border-radius:12px!important;padding:11px!important}
footer{padding:22px 0!important}
@media(max-width:920px){.hero{align-items:flex-start!important}.stats{display:grid!important;grid-template-columns:repeat(3,1fr)!important;width:100%!important}.hero{flex-direction:column!important}.stat{min-width:0!important}.cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.row{grid-template-columns:minmax(0,1fr) 52px!important}.select{grid-column:auto!important}.row .select{display:none!important}.tools:focus-within .row .select{display:block!important;grid-column:1/-1!important;height:38px!important}}
@media(max-width:640px){.wrap{width:min(100% - 18px,1180px)!important}.brand small{max-width:210px}.headerActions .ver{display:none!important}.syncBtn{padding:7px 9px!important}.hero{padding:17px!important;border-radius:18px!important;gap:14px!important}.hero p{font-size:12px!important}.stats{gap:5px!important}.stat{padding:8px 6px!important}.stat b{font-size:18px!important}.notice{font-size:10px!important}[data-staples-nav="1"] a small{display:none!important}.cards{grid-template-columns:1fr!important}.card{min-height:104px!important}.top{display:none!important}.head:has(+ .top){display:none!important}.tools{margin-left:-9px;margin-right:-9px;padding-left:9px!important;padding-right:9px!important}.chips{max-width:100vw!important}.price{min-width:76px!important}}
</style>`;

html = html.replace('</head>', css + '\n</head>');

// Hero-Text fokussieren: Suchnutzen statt technische Erklärung.
html = html.replace(
  /<section class="hero"><div><span class="ey">[\s\S]*?<\/section>/,
  `<section class="hero"><div><span class="ey">🛒 Preise in deiner Nähe vergleichen</span><h1>Was möchtest du einkaufen?</h1><p>Durchsuche Produkte und aktuelle Angebote aus deinen Märkten rund um Feldkirchen. Bio wird bevorzugt, Preise und Grundpreise bleiben direkt vergleichbar.</p></div><div class="stats"><div class="stat"><b id="productCount">0</b><span>Produkte</span></div><div class="stat"><b id="offerCount">0</b><span>Angebote</span></div><div class="stat"><b id="storeCount">0</b><span>Händler</span></div></div></section>`
);

// Produktbereich klarer benennen.
html = html.replace('<h2>Alle Produkte</h2>', '<h2>Produkte & Angebote</h2>');

// Statusmeldung kürzer formulieren, ID bleibt gleich.
html = html.replace('⏳ <b>Produktdaten werden geladen.</b>', '⏳ <b>Preise werden geladen …</b>');

fs.writeFileSync(file, html);
console.log('Homepage vereinfacht: klare Suche, kompakter Hero, weniger Nebeninfos, responsive Produktkarten.');
