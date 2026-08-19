import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const OUT=path.join(ROOT,'data','markets.json');
const REPORT=path.join(ROOT,'data','market-audit-report.json');
const CENTER={name:'85622 Feldkirchen',lat:48.145,lon:11.73,radiusKm:15};

const old=JSON.parse(await fs.readFile(OUT,'utf8'));
const beforeMarkets=Array.isArray(old.markets)?old.markets:(old.nearbyMarkets||[]);
const beforeStores=new Set(beforeMarkets.map(x=>x.store).filter(Boolean));

const BRAND_RULES=[
  [/\brewe\b/i,'REWE','Supermarkt','https://www.rewe.de/marktsuche/','market'],
  [/\bedeka\b|\be center\b|\be xpress\b/i,'EDEKA','Supermarkt','https://www.edeka.de/marktsuche/','market'],
  [/\bhit\b/i,'HIT','Supermarkt','https://www.hit.de/','market'],
  [/\bkaufland\b/i,'Kaufland','Supermarkt','https://filiale.kaufland.de/','market'],
  [/\bv-?markt\b/i,'V-Markt','Supermarkt','https://www.v-markt.de/standorte_vmarkt','market'],
  [/\btegut\b/i,'tegut','Supermarkt','https://www.tegut.com/maerkte.html','regional'],
  [/\baldi\b/i,'ALDI SÜD','Discounter','https://www.aldi-sued.de/filialen','regional'],
  [/\blidl\b/i,'Lidl','Discounter','https://www.lidl.de/s/de-DE/filialen','regional'],
  [/\bpenny\b/i,'PENNY','Discounter','https://www.penny.de/marktsuche','regional'],
  [/\bnetto\b/i,'Netto','Discounter','https://www.netto-online.de/filialfinder','market'],
  [/\bnorma\b/i,'NORMA','Discounter','https://www.norma-online.de/de/filialfinder/','regional'],
  [/\bdm\b|dm-drogerie/i,'dm','Drogerie','https://www.dm.de/store','regional'],
  [/rossmann/i,'ROSSMANN','Drogerie','https://www.rossmann.de/de/filialen/','regional'],
  [/\bmüller\b|\bmueller\b/i,'Müller','Drogerie','https://www.mueller.de/meine-filiale/','regional'],
  [/alnatura/i,'Alnatura','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/','regional'],
  [/denns|denn.?s biomarkt/i,'Denns BioMarkt','Bio-Supermarkt','https://www.biomarkt.de/marktindex/','regional'],
  [/vollcorner/i,'VollCorner','Bio-Supermarkt','https://www.vollcorner.de/maerkte/','regional'],
  [/\bbasic\b/i,'basic Bio','Bio-Supermarkt','https://www.tegut.com/','regional'],
  [/\bmetro\b/i,'METRO','Großhandel','https://www.metro.de/maerkte','market'],
  [/selgros/i,'SELGROS','Großhandel','https://www.selgros.de/markt','market'],
  [/fristo/i,'FRISTO','Getränkemarkt','https://www.fristo.de/angebote-maerkte/marktfinder/','market'],
  [/orter(er)?/i,'Orterer','Getränkemarkt','https://www.orterer.de/','market'],
  [/getränke hoffmann/i,'Getränke Hoffmann','Getränkemarkt','https://www.getraenke-hoffmann.de/filialen','market'],
  [/babyone/i,'BabyOne','Babyfachmarkt','https://www.babyone.de/fachmarkt','market']
];
const OFFER_RULES={
  'REWE':'https://www.rewe.de/angebote/','EDEKA':'https://www.edeka.de/angebote/','HIT':'https://www.hit.de/maerkte/','Kaufland':'https://filiale.kaufland.de/','V-Markt':'https://www.v-markt.de/standorte_vmarkt','tegut':'https://www.tegut.com/angebote.html',
  'ALDI SÜD':'https://www.aldi-sued.de/angebote','Lidl':'https://www.lidl.de/c/indexangebote','PENNY':'https://www.penny.de/angebote','Netto':'https://www.netto-online.de/filialfinder','NORMA':'https://www.norma-online.de/de/angebote/?desktop=1',
  'dm':'https://www.dm.de/baby-und-kind','ROSSMANN':'https://www.rossmann.de/de/baby-und-spielzeug/c/olcat1_2','Müller':'https://www.mueller.de/aktuell/','Alnatura':'https://www.alnatura.de/de-de/angebote/','Denns BioMarkt':'https://www.biomarkt.de/angebote','VollCorner':'https://www.vollcorner.de/angebote/','METRO':'https://www.metro.de/angebote','FRISTO':'https://www.fristo.de/angebote-maerkte/','BabyOne':'https://www.babyone.de/angebote'
};
function initialStatus(store){
  if(store==='METRO')return'login_required';
  if(['HIT'].includes(store))return'supported';
  if(['REWE','EDEKA','Kaufland','ALDI SÜD','Lidl','PENNY','Netto','NORMA','dm','ROSSMANN'].includes(store))return'partial';
  if(['Müller','Alnatura','Denns BioMarkt','VollCorner','tegut','V-Markt','FRISTO','BabyOne','SELGROS','Orterer','Getränke Hoffmann'].includes(store))return'not_yet_implemented';
  return'no_offer_source';
}
function hav(lat1,lon1,lat2,lon2){const R=6371,toRad=x=>x*Math.PI/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function norm(s=''){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim()}
function classifyName(name='',brand='',shop=''){const text=`${brand} ${name}`.trim();for(const [re,store,type,source,scope] of BRAND_RULES)if(re.test(text))return{store,type,sourceUrl:source,scope};if(shop==='chemist')return{store:name||'Drogeriemarkt',type:'Drogerie',sourceUrl:'',scope:'market'};if(shop==='beverages')return{store:name||'Getränkemarkt',type:'Getränkemarkt',sourceUrl:'',scope:'market'};if(shop==='baby_goods')return{store:name||'Babyfachmarkt',type:'Babyfachmarkt',sourceUrl:'',scope:'market'};if(shop==='wholesale')return{store:name||'Großhandel',type:'Großhandel',sourceUrl:'',scope:'market'};return{store:name||brand||'Lokaler Lebensmittelmarkt',type:'Supermarkt',sourceUrl:'',scope:'market'}}
function address(tags={}){const street=[tags['addr:street'],tags['addr:housenumber']].filter(Boolean).join(' ');const city=[tags['addr:postcode'],tags['addr:city']||tags['addr:suburb']].filter(Boolean).join(' ');return[street,city].filter(Boolean).join(', ')}
function locality(tags={}){return tags['addr:suburb']||tags['addr:city']||tags['branch']||''}
function badCandidate(x){const n=norm(`${x.name||''} ${x.brand||''}`);if(/rewe to go|tankstelle|aral|shell|esso|agip|avia|totalenergies|backerei|bäckerei|metzgerei|apotheke|kiosk|restaurant|imbiss|mode|elektronik|mobel|möbel/.test(n))return true;return false}

const query=`[out:json][timeout:90];(
 nwr(around:${CENTER.radiusKm*1000},${CENTER.lat},${CENTER.lon})[shop~"^(supermarket|chemist|beverages|baby_goods|wholesale|department_store)$"];
 nwr(around:${CENTER.radiusKm*1000},${CENTER.lat},${CENTER.lon})[brand~"REWE|EDEKA|HIT|Kaufland|V-Markt|tegut|ALDI|Lidl|PENNY|Netto|NORMA|dm|ROSSMANN|Müller|Alnatura|Denns|VollCorner|METRO|SELGROS|FRISTO|Orterer|Getränke Hoffmann|BabyOne",i];
 nwr(around:${CENTER.radiusKm*1000},${CENTER.lat},${CENTER.lon})[name~"REWE|EDEKA|HIT|Kaufland|V-Markt|tegut|ALDI|Lidl|PENNY|Netto|NORMA|dm|ROSSMANN|Müller|Alnatura|Denns|VollCorner|METRO|SELGROS|FRISTO|Orterer|Getränke Hoffmann|BabyOne",i];
);out center tags;`;
async function overpass(){for(const base of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){try{const r=await fetch(base,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'AngebotsRadar-MarketAudit/1.0'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(95000)});if(r.ok)return await r.json();console.error('Overpass',base,r.status)}catch(e){console.error('Overpass error',base,e.message)}}throw new Error('Alle Overpass-Endpunkte fehlgeschlagen')}
async function geocode(addr){if(!addr)return null;try{const u='https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q='+encodeURIComponent(addr);const r=await fetch(u,{headers:{'user-agent':'AngebotsRadar-MarketAudit/1.0 contact:github.com/SebMut/Einkaufsliste'},signal:AbortSignal.timeout(20000)});if(!r.ok)return null;const j=await r.json();return j[0]?{lat:Number(j[0].lat),lon:Number(j[0].lon)}:null}catch{return null}}
const osm=await overpass();
const markets=[];
for(const el of osm.elements||[]){const t=el.tags||{},name=t.name||t.brand||'',brand=t.brand||'';if(!name&& !brand)continue;const raw={name,brand,shop:t.shop||''};if(badCandidate(raw))continue;const lat=Number(el.lat??el.center?.lat),lon=Number(el.lon??el.center?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;const d=hav(CENTER.lat,CENTER.lon,lat,lon);if(d>CENTER.radiusKm+0.02)continue;const c=classifyName(name,brand,t.shop||'');
 if(c.store==='basic Bio')continue; // heutige ehemalige basic-Märkte werden als tegut separat erfasst
 markets.push({store:c.store,market:locality(t)||name.replace(new RegExp(c.store,'i'),'').trim()||t['addr:city']||'',address:address(t),lat:+lat.toFixed(6),lon:+lon.toFixed(6),distanceKm:+d.toFixed(2),distanceVerified:true,type:c.type,sourceUrl:t.website||c.sourceUrl||'',offerUrl:OFFER_RULES[c.store]||'',scope:c.scope,active:true,importStatus:initialStatus(c.store),discoverySource:'OpenStreetMap/Overpass',osmId:`${el.type}/${el.id}`});
}

// Offiziell verifizierte Sondermärkte und Filialen, die in OSM fehlen können.
const curated=[
 ['REWE','Feldkirchen','Kapellenstraße 16b, 85622 Feldkirchen','Supermarkt','https://www.rewe.de/marktseite/feldkirchen/461761/rewe-markt-kapellenstr-16b/'],
 ['REWE','Aschheim-Dornach','Humboldtstraße 2b, 85609 Aschheim','Supermarkt','https://www.rewe.de/marktseite/aschheim-dornach/440674/rewe-markt-humboldtstr-2b/'],
 ['REWE','Aschheim','Jedovnicestraße 10, 85609 Aschheim','Supermarkt','https://www.rewe.de/marktsuche/aschheim/'],
 ['REWE','Haar-Gronsdorf','Heimgartenstraße 4, 85540 Haar','Supermarkt','https://www.rewe.de/marktsuche/haar/'],
 ['REWE','Haar','Keferloher Straße 14, 85540 Haar','Supermarkt','https://www.rewe.de/marktsuche/haar/'],
 ['REWE','Vaterstetten','Bahnhofstraße 36, 85591 Vaterstetten','Supermarkt','https://www.rewe.de/marktsuche/bayern/'],
 ['REWE','Poing','Am Hanselbrunn 9, 85586 Poing','Supermarkt','https://www.rewe.de/marktseite/poing/431147/rewe-markt-am-hanselbrunn-9/'],
 ['REWE','Trudering','Hugo-Weiss-Straße 2-4, 81827 München','Supermarkt','https://www.rewe.de/marktsuche/muenchen/'],
 ['REWE','Berg am Laim','Kreillerstraße 33, 81673 München','Supermarkt','https://www.rewe.de/marktsuche/muenchen/'],
 ['REWE','Berg am Laim','Hermann-Weinhauser-Straße 90, 81673 München','Supermarkt','https://www.rewe.de/marktsuche/muenchen/'],
 ['REWE','Bogenhausen','Daglfinger Straße 5, 81929 München','Supermarkt','https://www.rewe.de/marktsuche/muenchen/'],
 ['REWE','Ismaning','Max-von-Eyth-Straße 1, 85737 Ismaning','Supermarkt','https://www.rewe.de/marktseite/ismaning/440353/rewe-markt-max-von-eyth-str-1/'],
 ['EDEKA','Berghammer Feldkirchen','Brauereiweg 1, 85622 Feldkirchen','Supermarkt','https://www.edeka.de/maerkte/030244/'],
 ['EDEKA','Pfeilstetter Kirchheim','Fraunhofer Straße 1, 85551 Kirchheim','Supermarkt','https://www.edeka.de/maerkte/139243/'],
 ['EDEKA','Pfeilstetter Heimstetten','Räterstraße 24, 85551 Kirchheim-Heimstetten','Supermarkt','https://www.edeka.de/maerkte/033913/'],
 ['EDEKA','Pfeilstetter Poing Bergfeld','Bergfeldstraße 11, 85586 Poing','Supermarkt','https://www.edeka.de/maerkte/030942/'],
 ['EDEKA','Pfeilstetter Poing Alte Gruber','Alte Gruber Straße 2, 85586 Poing','Supermarkt','https://www.edeka.de/maerkte/033874/'],
 ['EDEKA','Haar Leibstraße','Leibstraße 63, 85540 Haar','Supermarkt','https://www.edeka.de/maerkte/232708/'],
 ['EDEKA','Haar Jagdfeldring','Jagdfeldring 7, 85540 Haar','Supermarkt','https://www.edeka.de/maerkte/232713/'],
 ['EDEKA','E xpress Haar','Waldluststraße 38-40, 85540 Haar','Supermarkt','https://www.edeka.de/maerkte/232714/'],
 ['EDEKA','Berg am Laim','Annabrunner Straße 2, 81673 München','Supermarkt','https://www.edeka.de/maerkte/232716/'],
 ['Netto','Trudering','Truderinger Straße 217, 81825 München','Discounter','https://www.netto-online.de/filialen/muenchen/truderinger-str-217/8317'],
 ['Netto','Mitterfeld','Am Mitterfeld 18, 81829 München','Discounter','https://www.netto-online.de/filialen/muenchen/am-mitterfeld-18/8314'],
 ['Netto','Wasserburger Landstraße','Wasserburger Landstraße 8, 81825 München','Discounter','https://www.netto-online.de/filialen/muenchen/wasserburger-landstr-8/8381'],
 ['Netto','Berg am Laim','Neumarkter Straße 64, 81673 München','Discounter','https://www.netto-online.de/filialen/muenchen-berg-am-laim/neumarkter-str-64/1415'],
 ['Netto','Bogenhausen','Einsteinstraße 130, 81675 München','Discounter','https://www.netto-online.de/filialen/muenchen/einsteinstr-130/4063'],
 ['Netto','Neuperlach','Therese-Giehse-Allee 26, 81739 München','Discounter','https://www.netto-online.de/filialen/muenchen/therese-giehse-allee-26/8502'],
 ['Netto','Bogenhausen City','Stefan-George-Ring 24, 81929 München','Discounter','https://www.netto-online.de/filialen/muenchen/stefan-george-ring-24/1426/'],
 ['Müller','Riem Arcaden','Willy-Brandt-Platz 5, 81829 München','Drogerie','https://www.mueller.de/meine-filiale/'],
 ['Müller','Neuperlach','Ollenhauerstraße 6, 81737 München','Drogerie','https://www.mueller.de/meine-filiale/'],
 ['Alnatura','Trudering','Hafelhofweg 2, 81825 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/'],
 ['Alnatura','Haidhausen','Weißenburger Straße 20, 81667 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/muenchen-alnatura-super-natur-markt-m066/'],
 ['Alnatura','Schwabing','Münchner Freiheit 7, 80802 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/'],
 ['Alnatura','Schwabing Leopoldstraße','Leopoldstraße 64, 80802 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/muenchen-alnatura-super-natur-markt-m121/'],
 ['Alnatura','Milbertshofen','Ingolstädter Straße 170b, 80939 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/'],
 ['Alnatura','Innenstadt','Sonnenstraße 23, 80331 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/'],
 ['Alnatura','Isarvorstadt','Lindwurmstraße 117, 80337 München','Bio-Supermarkt','https://www.alnatura.de/de-de/maerkte/marktseiten/muenchen/muenchen-alnatura-super-natur-markt-m112/'],
 ['Denns BioMarkt','Ismaning','Osterfeldstraße 43, 85737 Ismaning','Bio-Supermarkt','https://www.biomarkt.de/ismaning-osterfeldstr-43/marktseite/'],
 ['Denns BioMarkt','Trudering','Wasserburger Landstraße 214, 81827 München','Bio-Supermarkt','https://www.biomarkt.de/marktindex/'],
 ['Denns BioMarkt','Berg am Laim/Trudering','Kreillerstraße 211, 81825 München','Bio-Supermarkt','https://www.biomarkt.de/muenchen-kreillerstr-211/marktseite/'],
 ['Denns BioMarkt','Poing','Alte-Gruber-Straße 4, 85586 Poing','Bio-Supermarkt','https://www.biomarkt.de/marktindex/'],
 ['Denns BioMarkt','Giesing','Giesinger Bahnhofplatz 2, 81539 München','Bio-Supermarkt','https://www.biomarkt.de/marktindex/'],
 ['Denns BioMarkt','Ottobrunn','Putzbrunner Straße 26, 85521 Ottobrunn','Bio-Supermarkt','https://www.biomarkt.de/marktindex/'],
 ['VollCorner','Bogenhausen','Warthestraße 1, 81927 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Haidhausen','Weißenburger Straße 5, 81667 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Haidhausen Innere Wiener','Innere Wiener Straße 52, 81667 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Giesing','Tegernseer Landstraße 41, 81541 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Neubiberg','Hauptstraße 19, 85579 Neubiberg','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Maxvorstadt','Augustenstraße 55, 80333 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['VollCorner','Maxvorstadt Türkenstraße','Türkenstraße 27, 80799 München','Bio-Supermarkt','https://www.vollcorner.de/maerkte/'],
 ['tegut','Bogenhausen','Richard-Strauss-Straße 48, 81677 München','Supermarkt','https://www.tegut.com/maerkte/markt/tegut-muenchen-bogenhausen-richard-strauss-strasse-48.html'],
 ['tegut','Neuperlach','Thomas-Dehler-Straße 15, 81737 München','Supermarkt','https://www.tegut.com/maerkte.html'],
 ['tegut','Altstadt/Isartor','Westenriederstraße 35, 80331 München','Supermarkt','https://www.tegut.com/maerkte.html'],
 ['tegut','Glockenbach','Müllerstraße 45, 80469 München','Supermarkt','https://www.tegut.com/maerkte.html'],
 ['V-Markt','Balanstraße','Balanstraße 50, 81541 München','Supermarkt','https://www.v-markt.de/Markt/713/V-Markt-M%C3%BCnchen-Balanstra%C3%9Fe'],
 ['V-Markt','Euro-Industriepark','Maria-Probst-Straße 6, 80939 München','Supermarkt','https://www.v-markt.de/Markt/714/V-Markt-M%C3%BCnchen-Euro-Industriepark'],
 ['FRISTO','Vaterstetten','Johann-Sebastian-Bach-Straße 5, 85591 Vaterstetten','Getränkemarkt','https://www.fristo.de/angebote-maerkte/marktfinder/marktdetail/vaterstetten-johann-sebastian-bach-str-5/'],
 ['FRISTO','München Heidemannstraße','Heidemannstraße 7, 80939 München','Getränkemarkt','https://www.fristo.de/angebote-maerkte/marktfinder/marktdetail/muenchen-heidemannstrasse-7/'],
 ['BabyOne','München-Neuperlach','Ottobrunner Straße 6, 81737 München','Babyfachmarkt','https://www.babyone.de/fachmarkt/muenchen'],
 ['METRO','München-Freimann','Helene-Wessel-Bogen 39, 80939 München','Großhandel','https://www.metro.de/maerkte/muenchen-freimann']
];

for(const [store,market,addr,type,url] of curated){const same=markets.find(x=>x.store===store&&(norm(x.address)===norm(addr)||norm(x.market)===norm(market)&&x.address));if(same){same.market=market;same.address=addr;same.type=type;same.sourceUrl=url;same.offerUrl=OFFER_RULES[store]||same.offerUrl;same.discoverySource='OSM + offizielle Quelle';continue}const g=await geocode(addr);await new Promise(r=>setTimeout(r,1050));if(!g)continue;const d=hav(CENTER.lat,CENTER.lon,g.lat,g.lon);if(d>CENTER.radiusKm+0.02)continue;markets.push({store,market,address:addr,lat:+g.lat.toFixed(6),lon:+g.lon.toFixed(6),distanceKm:+d.toFixed(2),distanceVerified:true,type,sourceUrl:url,offerUrl:OFFER_RULES[store]||'',scope:['REWE','EDEKA','Netto','HIT','Kaufland','V-Markt','FRISTO','METRO','BabyOne'].includes(store)?'market':'regional',active:true,importStatus:initialStatus(store),discoverySource:'offizielle Quelle + Nominatim'});}

// Deduplication: gleiche Marke + nahe Koordinate oder gleiche Adresse.
markets.sort((a,b)=>a.distanceKm-b.distanceKm||a.store.localeCompare(b.store,'de'));
const dedup=[];let duplicates=0;
for(const m of markets){const dup=dedup.find(x=>x.store===m.store&&(norm(x.address)&&norm(x.address)===norm(m.address)||hav(x.lat,x.lon,m.lat,m.lon)<0.07));if(dup){duplicates++;if((m.sourceUrl||'').includes(m.store.toLowerCase())||m.discoverySource.includes('offizielle'))Object.assign(dup,{market:m.market||dup.market,address:m.address||dup.address,sourceUrl:m.sourceUrl||dup.sourceUrl,offerUrl:m.offerUrl||dup.offerUrl,discoverySource:dup.discoverySource.includes('offizielle')?dup.discoverySource:m.discoverySource});continue}dedup.push(m)}

// Vorhandene funktionierende Importquellen unverändert erhalten und mit Typ/Distanz anreichern.
const preservedSources=[];
for(const s of old.sources||[]){const m=dedup.find(x=>x.store===s.store&&(norm(x.address)===norm(s.address)||norm(x.market)===norm(s.market)));preservedSources.push({...s,type:m?.type||s.type||classifyName(s.store,s.store,'').type,distanceKm:m?.distanceKm??s.distanceKm,lat:m?.lat??s.lat,lon:m?.lon??s.lon,importStatus:m?.importStatus||s.importStatus||initialStatus(s.store)});}
// Neue branch-spezifische Quellen nur dann aktivieren, wenn die vorhandenen Importer sie sicher verarbeiten können.
for(const m of dedup){if(!['REWE','EDEKA','Netto'].includes(m.store))continue;if(!m.sourceUrl)continue;const exact=m.store==='REWE'?/rewe\.de\/(?:marktseite|angebote)\//.test(m.sourceUrl):m.store==='EDEKA'?/edeka\.de\/maerkte\/\d+/.test(m.sourceUrl):/netto-online\.de\/filialen\//.test(m.sourceUrl);if(!exact)continue;if(preservedSources.some(s=>s.store===m.store&&norm(s.address)===norm(m.address)))continue;preservedSources.push({store:m.store,market:m.market,address:m.address,url:m.sourceUrl,scope:'market',type:m.type,distanceKm:m.distanceKm,lat:m.lat,lon:m.lon,importStatus:'partial'});}

const counts={};for(const m of dedup)counts[m.store]=(counts[m.store]||0)+1;
const typeCounts={};for(const m of dedup)typeCounts[m.type]=(typeCounts[m.type]||0)+1;
const afterStores=new Set(dedup.map(x=>x.store));
const result={schema:5,generatedAt:new Date().toISOString(),center:CENTER,markets:dedup,nearbyMarkets:dedup.map(({store,market,address,lat,lon,distanceKm,type,active,importStatus})=>({store,market,address,lat,lon,distanceKm,type,active,importStatus})),sources:preservedSources,audit:{method:['OpenStreetMap/Overpass 15-km radius','offizielle Händlerseiten/Marktfinder','Nominatim nur für offiziell verifizierte fehlende Filialen'],before:{handlers:beforeStores.size,branches:beforeMarkets.length},after:{handlers:afterStores.size,branches:dedup.length},duplicatesRemoved:duplicates,storeCounts:counts,typeCounts}};
await fs.writeFile(OUT,JSON.stringify(result,null,2)+'\n');
const report={generatedAt:result.generatedAt,region:`${CENTER.name} + ${CENTER.radiusKm} km Luftlinie`,before:result.audit.before,after:result.audit.after,newHandlers:[...afterStores].filter(x=>!beforeStores.has(x)).sort(),removedHandlers:[...beforeStores].filter(x=>!afterStores.has(x)).sort(),duplicatesRemoved:duplicates,byStore:counts,byType:typeCounts,importStatusCounts:dedup.reduce((a,m)=>(a[m.importStatus]=(a[m.importStatus]||0)+1,a),{}),outsideRadius:'Automatisch verworfen, wenn Haversine > 15,00 km'};
await fs.writeFile(REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
