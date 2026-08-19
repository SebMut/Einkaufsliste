# AngebotsRadar 85622

V4 einer mobilen Web-App zum lokalen Preisvergleich rund um **85622 Feldkirchen (15 km)**.

## V4

- responsive Web-App / PWA
- **automatischer Live-Importer über GitHub Actions**
- Import direkt von offiziellen Händler- und Produktseiten
- aktuell konfigurierte Quellen: REWE, EDEKA, PENNY, HIT, ALDI SÜD, Lidl, Netto, NORMA, Kaufland, METRO, dm und ROSSMANN
- Import viermal täglich sowie manuell über `workflow_dispatch`
- Händler- und Kategorie-Filter
- Produktsuche
- Normalisierung von Angebotspreis und Grundpreis
- automatische Bio-Erkennung (`Bio`, `Bioland`, `Naturland`, `Demeter`, Öko)
- **Bio wird immer gegenüber konventionell priorisiert**
- direkt daneben: günstigster konventioneller Preis inklusive Markt
- App- und Couponpreise werden separat gekennzeichnet
- neue Kategorie **👶 Baby & Kleinkind** für Windeln/Pants, Feuchttücher, Babynahrung, Pre-/Folgemilch, Brei, Gläschen, Quetschies, Kinder-Snacks, Babypflege sowie Schnuller/Flaschen
- dm und ROSSMANN werden für Baby/Kleinkind gezielt ausgewertet, damit die App nicht mit dem restlichen Drogeriesortiment überfüllt wird
- lokale Einkaufsliste im Browser
- Importstatus je Händler direkt in der App
- persistente Importdiagnose in `data/import-diagnostics.json`

## Datenfluss

1. `.github/workflows/import-offers.yml` startet regelmäßig den Importer.
2. `importer/import.js` öffnet die offiziellen Händlerseiten mit Chromium/Playwright.
3. Der Importer wertet sichtbaren und versteckten DOM-Text, Lazy-Load-Inhalte, eingebettete JSON-Daten und passende JSON/API-Antworten aus.
4. Preise, Größen und Grundpreise werden normalisiert; Bio- und Baby/Kleinkind-Produkte werden klassifiziert.
5. `importer/sanitize.js` entfernt fehlerhafte Produktnamen/Grundpreis-Zeilen und Dubletten.
6. Das Ergebnis wird nach `data/offers-live.json` geschrieben und automatisch committed.
7. GitHub Pages veröffentlicht den neuen Datenstand; die App lädt `offers-live.json` beim Start.

## Händlerquellen

Die Markt- und Quellkonfiguration liegt in `data/markets.json`. Das Suchgebiet beträgt **15 km um 85622 Feldkirchen**. Bei marktbezogenen Händlern wird eine konkrete Filialseite verwendet; bei regional bzw. bundesweit identischen Angeboten eine zentrale offizielle Angebotsseite.

Die App zeigt pro Quelle einen Status:

- 🟢 Import erfolgreich
- 🟡 Seite erreichbar, aber aktuell keine verwertbaren Angebote erkannt
- 🔴 Abruf/Parser fehlgeschlagen

## GitHub Pages

Der vorhandene Workflow `.github/workflows/pages.yml` veröffentlicht die statische App über GitHub Pages.

URL: `https://sebmut.github.io/Einkaufsliste/`
