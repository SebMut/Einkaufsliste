import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT=path.resolve(process.cwd(),'..');
const typeByExt={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.css':'text/css; charset=utf-8'};
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    let rel=decodeURIComponent(url.pathname);
    if(rel==='/')rel='/index.html';
    const file=path.resolve(ROOT,'.'+rel);
    if(!file.startsWith(ROOT+path.sep))throw new Error('path traversal');
    const body=await fs.readFile(file);
    res.writeHead(200,{'content-type':typeByExt[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  }catch{
    res.writeHead(404,{'content-type':'text/plain'});res.end('not found');
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port;
const base=`http://127.0.0.1:${port}/`;
const browser=await chromium.launch({headless:true});
const results=[];

async function runViewport(label,viewport){
  const context=await browser.newContext({viewport});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(String(err)));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#liveNote')?.textContent?.includes('Daten aktiv')||document.querySelector('#liveNote')?.textContent?.includes('Demo-Fallback'),null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll('.card').length>0,null,{timeout:10000});

  const initialCards=await page.locator('.card').count();
  assert(initialCards>0,`${label}: keine Produktkarten`);
  assert(await page.locator('#productCount').textContent()!=='0',`${label}: Produkte-Zähler blieb 0`);

  await page.locator('#q').fill('Milch');
  await page.waitForTimeout(300);
  const filteredStatus=await page.locator('#status').textContent();
  const milkCards=await page.locator('.card').count();
  assert(/Produkte/.test(filteredStatus||''),`${label}: Suche aktualisiert Produktstatus nicht`);
  assert(!/Produktgruppen/.test(filteredStatus||''),`${label}: alte Produktgruppen-Anzeige ist noch aktiv`);
  assert(milkCards>=2,`${label}: Milchsuche zeigt nur ${milkCards} konkrete Produktkarte(n)`);
  await page.locator('#q').fill('');
  await page.waitForTimeout(250);

  await page.locator('#sort').selectOption('price');
  await page.locator('#useApp').uncheck();
  await page.locator('#useApp').check();
  await page.locator('#useCoupon').uncheck();
  await page.locator('#useCoupon').check();

  const firstAdd=page.locator('.card [data-add]').first();
  await firstAdd.click();
  assert(Number(await page.locator('#listCount').textContent())>=1,`${label}: Einkaufsliste wurde nicht erhöht`);
  await page.locator('#openList').click();
  await page.locator('#backdrop.open').waitFor({state:'visible'});
  assert(await page.locator('#items .item').count()>=1,`${label}: Listen-Drawer enthält keinen Artikel`);
  await page.locator('#optimize').click();
  assert((await page.locator('#result').textContent()||'').trim().length>0,`${label}: Einkaufsoptimierung liefert kein Ergebnis`);
  await page.locator('#closeList').click();

  const history=page.locator('.card [data-history]').first();
  assert(await history.count()===1,`${label}: Preisverlauf-Button fehlt`);
  await history.click();
  await page.locator('#historyBack.open').waitFor({state:'visible'});
  await page.locator('#historyContent').waitFor({state:'visible'});
  await page.locator('#closeHistory').click();

  const more=page.locator('#more');
  if(await more.isVisible()){
    const before=await page.locator('.card').count();
    await more.click();
    const after=await page.locator('.card').count();
    assert(after>=before,`${label}: Mehr-Produkte-Button reduziert Kartenanzahl`);
  }

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert(overflow<=3,`${label}: horizontaler Überlauf ${overflow}px`);
  assert(pageErrors.length===0,`${label}: JavaScript-Fehler: ${pageErrors.join(' | ')}`);

  const result={label,viewport,initialCards,milkCards,filteredStatus,overflow,pageErrors};
  results.push(result);
  await context.close();
}

try{
  await runViewport('Desktop',{width:1440,height:900});
  await runViewport('iPhone',{width:390,height:844});
  console.log(JSON.stringify({status:'passed',results},null,2));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
