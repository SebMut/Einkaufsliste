import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const DATA_FILE = path.join(ROOT, 'data', 'offers-live.json');
const EMAIL = process.env.METRO_EMAIL || '';
const PASSWORD = process.env.METRO_PASSWORD || '';
const now = new Date().toISOString();

const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
const source = (data.sources || []).find(s => s.store === 'METRO');
if (!source) process.exit(0);

function saveStatus(status, message, count = 0) {
  source.status = status;
  source.count = count;
  source.message = message;
  source.transport = 'authenticated-browser';
}

if (!EMAIL || !PASSWORD) {
  saveStatus('credentials_missing', 'METRO-Zugangsdaten fehlen. GitHub Actions Secrets METRO_EMAIL und METRO_PASSWORD anlegen.');
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('METRO: Zugangsdaten fehlen; kein Login versucht.');
  process.exit(0);
}

const FOOD = /milch|butter|joghurt|käse|quark|sahne|eier|fleisch|rind|schwein|hähnchen|pute|wurst|schinken|salami|fisch|lachs|garnelen|obst|gemüse|tomat|paprika|gurke|kartoff|zwiebel|apfel|äpfel|banane|beeren|trauben|kaffee|tee|brot|brötchen|nudel|pasta|reis|mehl|zucker|öl|pizza|pommes|wasser|saft|cola|bier|wein|sekt|schokolade|keks|chips|snack|eis|bio/i;
const REJECT = /fernseher|werkzeug|geschirr|möbel|stuhl|tisch|pfanne|topf|messer|akku|bohrer|drucker|monitor|lampe|reinigungsgerät|textil/i;

const num = s => Number(String(s).replace(/\./g,'').replace(',','.').replace(/[^0-9.]/g,''));
const clean = s => String(s || '').replace(/\s+/g,' ').trim();

function category(t) {
  if (/banane|apfel|äpfel|tomat|paprika|gurke|kartoff|zwiebel|beeren|trauben/i.test(t)) return 'Obst & Gemüse';
  if (/milch|butter|joghurt|quark|käse|sahne/i.test(t)) return 'Milchprodukte';
  if (/fleisch|hack|rind|schwein|hähnchen|pute|wurst|salami|schinken|lachs|fisch|garnelen/i.test(t)) return 'Fleisch & Fisch';
  if (/kaffee|espresso|tee|müsli|eier/i.test(t)) return 'Kaffee & Frühstück';
  if (/nudel|pasta|reis|mehl|zucker|öl|pesto/i.test(t)) return 'Vorrat';
  if (/tiefkühl|pizza|pommes|eiscreme|speiseeis/i.test(t)) return 'Tiefkühl';
  if (/wasser|cola|saft|bier|wein|sekt|limonade/i.test(t)) return 'Getränke';
  if (/schokolade|keks|chips|snack|bonbon/i.test(t)) return 'Süßes & Snacks';
  if (/brot|brötchen|semmel|breze|baguette/i.test(t)) return 'Backwaren';
  return 'Lebensmittel';
}

function sizeOf(t) {
  const m = t.match(/((?:\d+\s*[x×]\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|Stück|St\.?))/i);
  return m ? clean(m[1]) : 'Packung';
}

function baseOf(price, size, text) {
  let m = text.match(/(?:1\s*)?(kg|l)\s*(?:=|:)\s*(\d+[.,]\d{2})\s*€/i);
  if (m) return { unit: num(m[2]), unitLabel: /kg/i.test(m[1]) ? '€/kg' : '€/l' };
  m = size.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml)/i);
  if (m) {
    const q = num(m[1]) * num(m[2]), u = m[3].toLowerCase();
    if (u === 'g') return {unit: price/(q/1000), unitLabel:'€/kg'};
    if (u === 'kg') return {unit: price/q, unitLabel:'€/kg'};
    if (u === 'ml') return {unit: price/(q/1000), unitLabel:'€/l'};
    return {unit: price/q, unitLabel:'€/l'};
  }
  m = size.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|Stück|St\.?)/i);
  if (!m) return {unit: price, unitLabel:'€/Packung'};
  const q = num(m[1]), u=m[2].toLowerCase();
  if (u==='g') return {unit:price/(q/1000),unitLabel:'€/kg'};
  if (u==='kg') return {unit:price/q,unitLabel:'€/kg'};
  if (u==='ml') return {unit:price/(q/1000),unitLabel:'€/l'};
  if (u==='l') return {unit:price/q,unitLabel:'€/l'};
  return {unit:price/q,unitLabel:'€/Stk.'};
}

function grossPrice(text, grossMode) {
  const explicit = text.match(/(?:brutto|inkl\.?\s*mwst\.?)[^0-9]{0,20}(\d+[.,]\d{2})\s*€/i);
  if (explicit) return num(explicit[1]);
  const vals = [...text.matchAll(/(\d+[.,]\d{2})\s*€/g)].map(m=>num(m[1])).filter(v=>v>0.05&&v<500);
  for (let i=0;i<vals.length;i++) for(let j=i+1;j<vals.length;j++) {
    const lo=Math.min(vals[i],vals[j]), hi=Math.max(vals[i],vals[j]), r=hi/lo;
    if ((r>1.055&&r<1.085)||(r>1.175&&r<1.205)) return hi;
  }
  return grossMode ? (vals[0] ?? NaN) : NaN;
}

function nameFrom(block) {
  const lines = block.split(/\n/).map(clean).filter(Boolean);
  for (const l of lines) {
    if (l.length<3 || l.length>120) continue;
    if (!/[A-Za-zÄÖÜäöüß]{3}/.test(l)) continue;
    if (/^(aktion|angebot|preis|brutto|netto|inkl\.? mwst|je |ab |pro )/i.test(l)) continue;
    if (/\d+[.,]\d{2}\s*€/.test(l)) continue;
    if (FOOD.test(l)) return l;
  }
  return '';
}

const browser = await chromium.launch({headless:true});
const context = await browser.newContext({locale:'de-DE', timezoneId:'Europe/Berlin'});
let page = await context.newPage();

async function clickIf(textRe) {
  const loc = page.getByRole('button', {name:textRe}).or(page.getByRole('link',{name:textRe})).first();
  if (await loc.count()) { try { await loc.click({timeout:2500}); return true; } catch {} }
  return false;
}

try {
  await page.goto('https://www.metro.de/angebote', {waitUntil:'domcontentloaded', timeout:45000});
  await clickIf(/alle akzeptieren|akzeptieren|zustimmen/i);

  const oldPages = context.pages().length;
  await clickIf(/jetzt einloggen|einloggen|anmelden/i);
  await page.waitForTimeout(1200);
  if (context.pages().length > oldPages) page = context.pages().at(-1);

  let email = page.locator('input[type="email"], input[name*="email" i], input[name*="user" i], input[autocomplete="username"]').first();
  if (!await email.count()) {
    await page.waitForTimeout(1500);
    email = page.locator('input[type="email"], input[name*="email" i], input[name*="user" i], input[autocomplete="username"]').first();
  }
  if (!await email.count()) throw new Error('Loginformular: E-Mail-Feld nicht gefunden');
  await email.fill(EMAIL);

  let pass = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  if (!await pass.count()) {
    await clickIf(/weiter|fortfahren|next/i);
    await page.waitForTimeout(1200);
    pass = page.locator('input[type="password"], input[autocomplete="current-password"]').first();
  }
  if (!await pass.count()) throw new Error('Loginformular: Passwort-Feld nicht gefunden');
  await pass.fill(PASSWORD);
  if (!await clickIf(/einloggen|anmelden|login|weiter/i)) await pass.press('Enter');
  await page.waitForTimeout(2500);

  await page.goto('https://www.metro.de/angebote', {waitUntil:'domcontentloaded', timeout:45000});
  await page.waitForTimeout(1800);
  const bodyAfterLogin = clean(await page.locator('body').innerText());
  if (/jetzt einloggen und exklusive vorteile erhalten/i.test(bodyAfterLogin)) throw new Error('METRO-Login wurde nicht übernommen');

  // Markt München-Freimann setzen.
  if (await clickIf(/anderen markt auswählen/i)) {
    const marketSearch = page.locator('input[placeholder*="Markt" i], input[placeholder*="PLZ" i]').first();
    if (await marketSearch.count()) {
      await marketSearch.fill('80939');
      await page.waitForTimeout(1200);
      const freimann = page.getByText(/Freimann|Helene-Wessel-Bogen 39/i).first();
      if (await freimann.count()) { try { await freimann.click({timeout:3000}); } catch {} }
      await clickIf(/diesen markt auswählen/i);
      await page.waitForTimeout(1500);
    }
  }

  // Falls verfügbar, auf Bruttopreise umstellen. Das ist für den Vergleich mit
  // REWE/EDEKA/etc. zwingend nötig.
  let grossMode = false;
  const includeVat = page.getByText(/MwSt\.? in Preise einschließen/i).first();
  if (await includeVat.count()) {
    try { await includeVat.click({timeout:2500}); await page.waitForTimeout(900); } catch {}
  }
  const body = clean(await page.locator('body').innerText());
  grossMode = /MwSt\.? (?:nicht )?in Preise (?:einschließen|enthalten)|Preise.*(?:inkl|mit).*MwSt/i.test(body) && !/Preise werden ohne MwSt\. angezeigt/i.test(body);

  for (let i=0;i<8;i++) { await page.mouse.wheel(0,1800); await page.waitForTimeout(450); }

  const blocks = await page.evaluate(() => {
    const sels=['article','li','[class*="offer" i]','[class*="product" i]','[class*="card" i]','[class*="tile" i]'];
    const seen=new Set(), out=[];
    for(const sel of sels) for(const el of document.querySelectorAll(sel)) {
      const t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
      if(t.length<15||t.length>1800||seen.has(t)) continue;
      if(!/\d+[,.]\d{2}\s*€/.test(t)) continue;
      seen.add(t); out.push(t);
    }
    return out.slice(0,700);
  });

  const offers=[];
  for (const block of blocks) {
    if (!FOOD.test(block) || REJECT.test(block)) continue;
    const name=nameFrom(block); if(!name) continue;
    const price=grossPrice(block,grossMode); if(!Number.isFinite(price)) continue;
    const size=sizeOf(block), bp=baseOf(price,size,block), cat=category(`${name} ${block}`);
    offers.push({
      key:name.slice(0,55), name, store:'METRO', market:'München-Freimann',
      address:'Helene-Wessel-Bogen 39, 80939 München', cat, size,
      price:+price.toFixed(2), unit:+bp.unit.toFixed(3), unitLabel:bp.unitLabel,
      icon:{'Obst & Gemüse':'🥦','Milchprodukte':'🥛','Fleisch & Fisch':'🥩','Kaffee & Frühstück':'☕','Vorrat':'🍝','Tiefkühl':'🧊','Getränke':'🥤','Süßes & Snacks':'🍫','Backwaren':'🥖'}[cat]||'🛒',
      bio:/\bbio\b|bioland|naturland|demeter|öko-/i.test(block), app:false, coupon:/coupon/i.test(block), advertised:true,
      sourceUrl:'https://www.metro.de/angebote', sourceScope:'market', sourceTransport:'authenticated-browser',
      priceBasis:'gross', vatIncluded:true, importedAt:now
    });
  }

  const unique=[]; const seen=new Set();
  for(const o of offers){const k=[o.name.toLowerCase(),o.size,o.price].join('|');if(!seen.has(k)){seen.add(k);unique.push(o)}}

  // Alte METRO-Einträge ersetzen, alle anderen Händler behalten.
  data.offers=(data.offers||[]).filter(o=>o.store!=='METRO').concat(unique.slice(0,250));
  data.offers.forEach((o,i)=>o.id=i+1);
  data.offerCount=data.offers.length;
  if (unique.length) saveStatus('ok', `${unique.length} METRO-Angebote nach Kunden-Login importiert (Bruttopreise).`, unique.length);
  else saveStatus('no_data', grossMode ? 'METRO-Login erfolgreich, aber keine validen Lebensmittelangebote erkannt.' : 'METRO-Login erfolgreich, Bruttopreis-Modus konnte aber nicht sicher bestätigt werden. Keine Preise übernommen.', 0);
  console.log(`METRO: Login erfolgreich; ${unique.length} valide Bruttopreis-Angebote.`);
} catch (e) {
  saveStatus('auth_error', `METRO-Login/Import fehlgeschlagen: ${String(e.message||e).slice(0,180)}`, 0);
  console.log(`METRO: Import fehlgeschlagen: ${String(e.message||e).slice(0,180)}`);
} finally {
  await browser.close();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2) + '\n');
}
