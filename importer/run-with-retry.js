import {spawn} from 'node:child_process';

const name=process.env.RETRY_NAME||'Import';
const command=process.env.RETRY_COMMAND;
const attempts=Math.max(1,Number(process.env.RETRY_ATTEMPTS||4));
const delays=(process.env.RETRY_DELAYS_SECONDS||'0,120,600,1200').split(',').map(Number);
const allowFailure=String(process.env.RETRY_ALLOW_FAILURE||'false').toLowerCase()==='true';
if(!command) throw new Error('RETRY_COMMAND fehlt');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function run(){
  return new Promise(resolve=>{
    const child=spawn(command,{shell:true,stdio:'inherit',env:process.env});
    child.on('exit',code=>resolve(code??1));
    child.on('error',()=>resolve(1));
  });
}

let lastCode=1;
for(let i=0;i<attempts;i++){
  const wait=Math.max(0,delays[Math.min(i,delays.length-1)]||0);
  if(wait>0){
    console.log(`[Retry] ${name}: nächster Versuch in ${wait}s`);
    await sleep(wait*1000);
  }
  console.log(`[Retry] ${name}: Versuch ${i+1}/${attempts}`);
  lastCode=await run();
  if(lastCode===0){
    console.log(`[Retry] ${name}: erfolgreich in Versuch ${i+1}`);
    process.exit(0);
  }
  console.warn(`[Retry] ${name}: Versuch ${i+1} fehlgeschlagen (Code ${lastCode})`);
}

if(allowFailure){
  console.warn(`[Retry] ${name}: alle Versuche fehlgeschlagen; letzter guter Bestand bleibt erhalten.`);
  process.exit(0);
}
process.exit(lastCode||1);
