import fs from 'node:fs/promises';
const overview=await (await fetch('https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE',{headers:{accept:'application/json','user-agent':'AngebotsRadar/1'}})).json();
const flyers=[];for(const c of overview.categories||[])for(const s of c.subcategories||[])for(const f of s.flyers||[])if(f.status==='current'&&/Aktionsprospekt/i.test(f.name||''))flyers.push(f);
const f=flyers.find(x=>(x.regions||[]).some(r=>r.type==='national'&&String(r.code)==='0'))||flyers[0];
const detail=await (await fetch(f.flyerJson,{headers:{accept:'application/json','user-agent':'AngebotsRadar/1'}})).json();
const pages=(detail.flyer?.pages||detail.pages||[]).map(p=>({number:p.number,type:p.type,pageType:p.pageType,keyWords:p.keyWords||'',altText:p.altText||'',links:(p.links||[]).map(l=>({displayType:l.displayType,title:l.title,url:l.url,productDetails:l.productDetails||null})).slice(0,100)}));
const out={flyer:{title:f.title,regions:f.regions,flyerJson:f.flyerJson,pdfUrl:f.pdfUrl},pageCount:pages.length,pages};
await fs.writeFile('data/lidl-pages-summary.json',JSON.stringify(out,null,2)+'\n');
console.log(`Lidl Seiten: ${pages.length}; OCR-Zeichen: ${pages.reduce((a,p)=>a+p.keyWords.length,0)}; Produktlinks: ${pages.reduce((a,p)=>a+p.links.filter(l=>l.displayType==='product').length,0)}`);
