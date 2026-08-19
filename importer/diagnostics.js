import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data');

const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { return fallback; }
};
const readText = async (file, fallback = '') => {
  try { return await fs.readFile(file, 'utf8'); }
  catch { return fallback; }
};

const markets = await readJson(path.join(DATA, 'markets.json'), { sources: [] });
const live = await readJson(path.join(DATA, 'offers-live.json'), { sources: [], offers: [] });
const rawLog = await readText(path.join(DATA, 'import-run.log'));

const exitCode = Number(process.env.IMPORT_EXIT_CODE || 99);
const startedMs = Number(process.env.IMPORT_STARTED_MS || Date.now());
const finishedMs = Number(process.env.IMPORT_FINISHED_MS || Date.now());
const now = new Date().toISOString();
const liveMs = live?.generatedAt ? Date.parse(live.generatedAt) : NaN;
const liveDataCurrent = Number.isFinite(liveMs) && liveMs >= startedMs - 5000 && liveMs <= finishedMs + 5000;
const currentLive = liveDataCurrent ? live : { sources: [], offers: [], generatedAt: null };

const lines = rawLog.split(/\r?\n/).filter(Boolean).map(line => {
  const m = line.match(/^(\d{10,})\t(.*)$/);
  return m ? { ms: Number(m[1]), text: m[2] } : { ms: null, text: line };
});

function liveStatusFor(source) {
  return (currentLive.sources || []).find(s => s.store === source.store && s.market === source.market) || null;
}
function sourceTiming(source) {
  const needle = `Importiere ${source.store} ${source.market}`;
  const startIndex = lines.findIndex(l => l.text.startsWith(needle));
  if (startIndex < 0) return { startedAt: null, finishedAt: null, durationMs: null };
  const startMs = lines[startIndex].ms;
  let endMs = null;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].text.startsWith(`${source.store}: `)) { endMs = lines[i].ms; break; }
    if (lines[i].text.startsWith('Importiere ') && lines[i].ms) { endMs = lines[i].ms; break; }
  }
  if (!endMs) endMs = finishedMs;
  return {
    startedAt: startMs ? new Date(startMs).toISOString() : null,
    finishedAt: endMs ? new Date(endMs).toISOString() : null,
    durationMs: startMs && endMs ? Math.max(0, endMs - startMs) : null
  };
}

const sources = (markets.sources || []).map(source => {
  const liveSource = liveStatusFor(source);
  const timing = sourceTiming(source);
  let status = liveSource?.status || 'skipped';
  let message = liveSource?.message || 'Quelle wurde in diesem Lauf nicht erreicht.';
  let count = Number(liveSource?.count || 0);

  if (!liveSource && timing.startedAt) {
    status = 'error';
    message = exitCode === 0
      ? 'Quelle wurde gestartet, aber es wurde kein aktuelles Ergebnis in offers-live.json geschrieben.'
      : 'Importer wurde während oder nach dieser Quelle beendet. Details siehe lastLogLines.';
  }

  return {
    store: source.store,
    market: source.market,
    address: source.address,
    sourceUrl: source.url,
    scope: source.scope,
    status,
    count,
    message,
    ...timing
  };
});

const ok = sources.filter(s => s.status === 'ok').length;
const noData = sources.filter(s => s.status === 'no_data').length;
const errors = sources.filter(s => s.status === 'error').length;
const skipped = sources.filter(s => s.status === 'skipped').length;
const runFailed = exitCode !== 0 || !liveDataCurrent || errors > 0;

const diagnostics = {
  schema: 1,
  generatedAt: now,
  run: {
    id: process.env.GITHUB_RUN_ID || null,
    attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    event: process.env.GITHUB_EVENT_NAME || null,
    sha: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF_NAME || null,
    actor: process.env.GITHUB_ACTOR || null,
    exitCode,
    status: runFailed ? 'failed' : (noData || skipped ? 'partial' : 'completed'),
    startedAt: new Date(startedMs).toISOString(),
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: Math.max(0, finishedMs - startedMs)
  },
  summary: {
    configuredSources: sources.length,
    ok,
    noData,
    errors,
    skipped,
    offerCount: Array.isArray(currentLive.offers) ? currentLive.offers.length : 0,
    liveGeneratedAt: currentLive.generatedAt || null,
    liveDataCurrent
  },
  sources,
  lastLogLines: lines.slice(-60).map(l => l.text)
};

await fs.writeFile(path.join(DATA, 'import-diagnostics.json'), JSON.stringify(diagnostics, null, 2) + '\n');
console.log(`Diagnose geschrieben: ${ok} ok, ${noData} ohne Daten, ${errors} Fehler, ${skipped} übersprungen; aktuelle Live-Datei=${liveDataCurrent}.`);
