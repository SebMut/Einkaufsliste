import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

// Sync-Button vollständig aus der Implementierung entfernen.
html = html.replace(/<a id="manualSync" class="syncBtn"[\s\S]*?<\/a>/, '');
html = html.replace(/\.syncBtn\{[^}]*\}\.syncBtn:active\{[^}]*\}/, '');
html = html.replace(/<div class="headerActions">\s*<span class="ver">/, '<div class="headerActions"><span class="ver">');

if (html.includes('id="manualSync"') || html.includes('class="syncBtn"')) {
  throw new Error('Sync-Button konnte nicht vollständig entfernt werden.');
}

fs.writeFileSync(file, html);
console.log('Sync-Button vollständig aus index.html entfernt.');
