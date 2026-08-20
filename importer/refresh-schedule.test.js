import test from 'node:test';
import assert from 'node:assert/strict';
import {berlinParts,shouldRunScheduled,nextScheduledRun,TARGET_HOURS} from './refresh-schedule.js';

test('Sommerzeit: 04:00 UTC entspricht 06:00 Europe/Berlin',()=>{
  const d=new Date('2026-07-01T04:00:00Z');
  assert.equal(berlinParts(d).hour,'06');
  assert.equal(shouldRunScheduled(d),true);
});

test('Winterzeit: 05:00 UTC entspricht 06:00 Europe/Berlin',()=>{
  const d=new Date('2026-01-15T05:00:00Z');
  assert.equal(berlinParts(d).hour,'06');
  assert.equal(shouldRunScheduled(d),true);
});

test('alle gewünschten lokalen Stunden werden akzeptiert',()=>{
  assert.deepEqual(TARGET_HOURS,[6,9,12,15,18,21]);
  for(const hour of TARGET_HOURS){
    const utcHour=hour-2; // Juli = CEST
    const d=new Date(`2026-07-01T${String(utcHour).padStart(2,'0')}:00:00Z`);
    assert.equal(shouldRunScheduled(d),true,`lokal ${hour}:00`);
  }
});

test('Zwischenstunden werden nicht ausgeführt',()=>{
  assert.equal(shouldRunScheduled(new Date('2026-07-01T05:00:00Z')),false); // 07:00 lokal
  assert.equal(shouldRunScheduled(new Date('2026-07-01T04:17:00Z')),false);
});

test('nächster Lauf bleibt über DST-Wechsel korrekt',()=>{
  const next=nextScheduledRun(new Date('2026-10-25T04:30:00Z'));
  const p=berlinParts(next);
  assert.equal(p.hour,'09');
  assert.equal(p.minute,'00');
});
