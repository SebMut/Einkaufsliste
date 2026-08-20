export const TIME_ZONE='Europe/Berlin';
export const TARGET_HOURS=[6,9,12,15,18,21];

export function berlinParts(date=new Date()){
  const parts=new Intl.DateTimeFormat('de-DE',{
    timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}

export function shouldRunScheduled(date=new Date()){
  const p=berlinParts(date);
  return Number(p.minute)===0 && TARGET_HOURS.includes(Number(p.hour));
}

export function nextScheduledRun(from=new Date()){
  const start=new Date(from);
  start.setUTCSeconds(0,0);
  start.setUTCMinutes(0);
  if(start<=from) start.setUTCHours(start.getUTCHours()+1);
  for(let i=0;i<60;i++){
    const candidate=new Date(start.getTime()+i*60*60*1000);
    if(shouldRunScheduled(candidate)) return candidate;
  }
  throw new Error('Kein Europe/Berlin-Zeitfenster innerhalb von 60 Stunden gefunden.');
}

export function formatBerlin(date){
  return new Intl.DateTimeFormat('de-DE',{
    timeZone:TIME_ZONE,dateStyle:'short',timeStyle:'short'
  }).format(date);
}
