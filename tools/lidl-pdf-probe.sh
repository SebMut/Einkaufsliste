#!/usr/bin/env bash
set -euo pipefail
OVERVIEW='https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE'
node - <<'NODE' > /tmp/lidl_pdf_url.txt
const r=await fetch('https://endpoints.leaflets.schwarz/v4/overview?client_locale=lidl/de-DE');
const o=await r.json();
let all=[];for(const c of o.categories||[])for(const s of c.subcategories||[])for(const f of s.flyers||[])if(f.status==='current'&&/Aktionsprospekt/i.test(f.name||''))all.push(f);
const f=all.find(x=>(x.regions||[]).some(r=>r.type==='national'&&String(r.code)==='0'))||all[0];
console.log(f.pdfUrl);
NODE
URL=$(cat /tmp/lidl_pdf_url.txt)
echo "PDF=$URL"
curl -L --fail --retry 2 -A 'Mozilla/5.0 AngebotsRadar/1' "$URL" -o /tmp/lidl.pdf
pdftotext -layout -f 1 -l 25 /tmp/lidl.pdf /tmp/lidl.txt
{
  echo "PDF_URL=$URL"
  echo "PDF_BYTES=$(stat -c%s /tmp/lidl.pdf)"
  echo "TEXT_BYTES=$(stat -c%s /tmp/lidl.txt)"
  echo
  echo '--- ZEILEN MIT PREISVERDACHT ---'
  grep -nE '(^|[[:space:]])[0-9]{1,3}[,.][0-9]{2}([[:space:]]|€|\*)' /tmp/lidl.txt | head -n 250 || true
  echo
  echo '--- ERSTE 450 TEXTZEILEN ---'
  head -n 450 /tmp/lidl.txt
} > data/lidl-pdf-probe.log
