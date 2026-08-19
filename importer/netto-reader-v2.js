import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const livePath=path.join(ROOT,'data/offers-live.json');
const markets=JSON.parse(await fs.readFile(path.join(ROOT,'data/markets.json'),'utf8'));
const live=JSON.parse(await fs.readFile(livePath,'utf8'));
const sources=markets.sources.filter(x=>x.store==='Netto');
const now=new Date().toISOString();

const norm=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const num=v=>Number(String(v??'').replace(/\s+/g,'').replace(/[€*]/g,'').replace(',','.'));
const FOOD=/kartoff|butter|schokolade|coca-cola|cola|hohes c|saft|rauch eistee|eistee|albi|paulaner|spezi|limonade|zwetsch|trauben|champignon|blumenkohl|streichzart|froop|torte|frühlingsrollen|croissant|franzbrötchen|brot|gouda|käse|milch|joghurt|fleisch|wurst|fisch|lachs|kaffee|nudel|reis|pizza|obst|gemüse|banane|apfel|äpfel|tomat|paprika|gurke|müsli|cerealien|eier|mehl|zucker|öl|quark|sahne|mozzarella|salami|schinken|hack|hähnchen|pute|rind|schwein|wasser|bier|wein|sekt|chips|keks|haribo|fruchtgummi|eis|dessert|pudding|marmelade|konfitüre|honig|toast|brötchen|semmel|breze/i;
const NONFOOD=/shampoo|wc-gel|geschirr|waschmittel|katzen|hunde|tierfutter|rosen|blumen|lenor|fructis|domestos|finish|weichspüler|spülmittel|reiniger|deo|duschgel|zahnpasta|toilettenpapier|küchenrolle/i;
const ICONS={'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖','Lebensmittel':'🛒'};
function cat(n){if(/cola|saft|eistee|spezi|limonade|wasser|bier|wein|sekt/i.test(n))return'Getränke';if(/kartoff|zwetsch|trauben|champignon|blumenkohl|banane|apfel|äpfel|tomat|paprika|gurke|obst|gemüse/i.test(n))return'Obst & Gemüse';if(/butter|streichzart|froop|gouda|käse|milch|joghurt|quark|sahne|mozzarella|pudding|dessert/i.test(n))return'Milchprodukte';if(/fleisch|wurst|salami|schinken|hack|hähnchen|pute|rind|schwein|lachs|fisch/i.test(n))return'Fleisch & Fisch';if(/torte|frühlingsrollen|pizza|tiefgekühlt|eis/i.test(n))return'Tiefkühl';if(/croissant|franzbrötchen|brot|toast|brötchen|semmel|breze/i.test(n))return'Backwaren';if(/schokolade|chips|keks|haribo|fruchtgummi/i.test(n))return'Süßes & Snacks';if(/kaffee|müsli|cerealien|eier|honig|marmelade|konfitüre/i.test(n))return'Kaffee & Frühstück';if(/nudel|reis|mehl|zucker|öl/i.test(n))return'Vorrat';return'Lebensmittel'}
function key(n){for(const[k,re]of [['Butter',/butter|streichzart/i],['Milch',/\bmilch\b|vollmilch|h-milch/i],['Eier',/\beier\b/i],['Äpfel',/äpfel|apfel/i],['Kartoffeln',/kartoff/i],['Beeren & Trauben',/zwetsch|trauben/i],['Joghurt',/froop|joghurt/i],['Käse',/käse|gouda|mozzarella/i],['Cola',/cola|spezi|limonade/i],['Saft',/saft|hohes c|albi/i],['Schokolade',/schokolade/i],['Brot',/brot|toast/i],['Kaffee',/kaffee/i],['Nudeln',/nudel|pasta/i],['Reis',/\breis\b/i],['Pizza',/pizza/i]])if(re.test(n))return k;return n.slice(0,55)}
function sizeOf(n){const m=n.match(/((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|l|ml|Stück|St\.?))/i);return m?m[1]:'Packung'}
function quantity(s){let m=s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);if(m){let q=num(m[1])*num(m[2]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':'l'}}m=s.match(/(\d+(?:[.,]\d+)?)\s*(?:[–-]\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|l|ml|Stück|St\.?)/i);if(!m)return null;let q=num(m[2]||m[1]),u=m[3].toLowerCase();if(u==='g'||u==='ml')q/=1000;return{q,type:u==='g'||u==='kg'?'kg':u==='l'||u==='ml'?'l':'st'}}
function ground(block){const ms=[...block.matchAll(/(\d+[.,]\d{1,2})\s*(?:[–-]\s*(\d+[.,]\d{1,2}))?\s*\/\s*(kg|l)/gi)];if(!ms.length)return null;const m=ms[0],vals=[num(m[1]),m[2]?num(m[2]):NaN].filter(Number.isFinite);return{unit:Math.min(...vals),label:`€/${m[3].toLowerCase()}${vals.length>1?' ab':''}`}}
function cleanLine(x){return norm(x.replace(/^[-*#> ]+/,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^_+|_+$/g,''))}
function priceInfo(block){let m=block.match(/(?:UVP|statt)\s*(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\*?/i);if(m){const app=block.match(/(?:^|\s)(\d+[.,]\d{2})\*?\s*\((?:\d+[.,]\d{1,2})(?:\s*[–-]\s*\d+[.,]\d{1,2})?\s*\/\s*(?:kg|l)\)/i);return{regular:num(m[2]),app:app&&num(app[1])<num(m[2])?num(app[1]):null}}m=block.match(/(?:Aktion|Dauertiefpreis)[\s\n]*(\d+[.,]\d{2})\*?/i);return m?{regular:num(m[1]),app:null}:null}
function make(source,name,block,price,app=false){name=cleanLine(name);if(!FOOD.test(name)||NONFOOD.test(name)||!Number.isFinite(price)||price<=.05||price>100)return null;const size=sizeOf(name+' '+block),q=quantity(size),g=ground(block);let unit=price,label='€/Packung';if(g){unit=g.unit;label=g.label}else if(q&&q.q>0){unit=price/q.q;label=q.type==='kg'?'€/kg':q.type==='l'?'€/l':'€/Stk.'}const c=cat(name);return{key:key(name),name,store:source.store,market:source.market,address:source.address,cat:c,size,price:+price.toFixed(2),unit:+unit.toFixed(3),unitLabel:label,icon:ICONS[c]||'🛒',bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(name+' '+block),app,coupon:false,advertised:true,sourceUrl:source.url,sourceScope:source.scope,sourceTransport:'netto-block-reader',importedAt:now}}

function parse(source,md){
  const sections=md.split(/\n\s*\*\s+Filiale(?:\s*&\s*Shop)?\s*\n/i).slice(1);
  const rows=[];const debug=[];
  for(const sec of sections){
    const ls=sec.split(/\r?\n/).map(cleanLine).filter(Boolean);
    const p=priceInfo(ls.join('\n'));if(!p)continue;
    let name='';
    for(const l of ls.slice(0,16)){
      if(!l||/^Image$|^Bayern$|^Zu den Angeboten$|^Filiale/i.test(l)||/^\d+[.,]\d+\s*(?:[–-]\s*\d+[.,]\d+)?\s*\/\s*(?:kg|l|wl)/i.test(l)||/^-?\d+\s*%$/.test(l)||/^(?:UVP|statt|Aktion|Dauertiefpreis)/i.test(l))continue;
      if(/[A-Za-zÄÖÜäöüß]{3}/.test(l)){name=l;break}
    }
    if(!name)continue;
    debug.push(`${p.regular.toFixed(2)} | ${name}`);
    const regular=make(source,name,ls.join('\n'),p.regular,false);if(regular)rows.push(regular);
    if(p.app!=null){const a=make(source,name,ls.join('\n'),p.app,true);if(a)rows.push(a)}
  }
  const uniq=new Map();for(const o of rows){const k=[o.name.toLowerCase(),o.size,o.price,o.app].join('|');if(!uniq.has(k))uniq.set(k,o)}
  return {offers:[...uniq.values()],debug,sectionCount:sections.length};
}

const logs=[];
for(const source of sources){
  try{
    const r=await fetch('https://r.jina.ai/'+source.url,{headers:{accept:'text/plain','user-agent':'AngebotsRadar-Netto/3'}});
    if(!r.ok)throw new Error(`Reader HTTP ${r.status}`);
    const md=await r.text();
    const parsed=parse(source,md);
    live.offers=(live.offers||[]).filter(x=>!(x.store==='Netto'&&x.market===source.market)).concat(parsed.offers);
    let s=(live.sources||[]).find(x=>x.store==='Netto'&&x.market===source.market);
    if(!s){s={store:'Netto',market:source.market,address:source.address,url:source.url,scope:'market'};(live.sources??=[]).push(s)}
    s.status=parsed.offers.length?'ok':'no_data';s.count=parsed.offers.length;s.message=parsed.offers.length?`${parsed.offers.length} qualitätsgeprüfte Filialangebote über Netto Blockreader`:`Netto-Filialseite erreichbar, aber 0 Lebensmittelangebote erkannt (${parsed.sectionCount} Angebotsblöcke)`;s.transport='netto-block-reader';
    logs.push(`${source.market}: chars=${md.length} sections=${parsed.sectionCount} valid=${parsed.offers.length}`,...parsed.debug.slice(0,25));
  }catch(e){
    let s=(live.sources||[]).find(x=>x.store==='Netto'&&x.market===source.market);if(!s){s={store:'Netto',market:source.market,address:source.address,url:source.url,scope:'market'};(live.sources??=[]).push(s)}
    s.status='error';s.count=0;s.message=`Netto Reader: ${String(e.message||e).slice(0,160)}`;s.transport='netto-block-reader';logs.push(`${source.market}: ERROR ${e.message||e}`);
  }
}
live.offerCount=(live.offers||[]).length;live.nettoV3At=now;
await fs.writeFile(path.join(ROOT,'data/netto-v2.log'),logs.join('\n')+'\n');
await fs.writeFile(livePath,JSON.stringify(live,null,2)+'\n');
console.log(`Netto V3: ${sources.length} Filialen, ${(live.offers||[]).filter(x=>x.store==='Netto').length} Angebote`);
