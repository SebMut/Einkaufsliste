# AngebotsRadar 85622

V3 einer mobilen Web-App zum lokalen Lebensmittel-Angebotsvergleich rund um **85622 Feldkirchen (10 km)**.

## V3

- responsive Web-App / PWA
- **automatischer Live-Importer über GitHub Actions**
- Import direkt von den offiziellen Angebotsseiten der Händler
- aktuell konfigurierte Quellen: REWE Feldkirchen, EDEKA Berghammer Feldkirchen, PENNY, HIT Parsdorf, ALDI SÜD, Lidl, Netto Trudering und NORMA
- Import viermal täglich sowie manuell über `workflow_dispatch`
- Händler- und Kategorie-Filter
- Produktsuche
- Normalisierung von Angebotspreis und Grundpreis
- automatische Bio-Erkennung (`Bio`, `Bioland`, `Naturland`, `Demeter`, Öko)
- **Bio wird immer gegenüber konventionell priorisiert**
- direkt daneben: günstigster konventioneller Preis inklusive Markt
- App- und Couponpreise werden separat gekennzeichnet
- lokale Einkaufsliste im Browser
- Importstatus je Händler direkt in der App
- Demo-Daten bleiben nur als Fallback sichtbar, solange noch keine Live-Datei vorhanden ist

## Datenfluss

1. `.github/workflows/import-offers.yml` startet regelmäßig den Importer.
2. `importer/import.js` öffnet die offiziellen Händlerseiten mit Chromium/Playwright und extrahiert Lebensmittelangebote.
3. Preise, Größen und Grundpreise werden normalisiert und Bio-Produkte klassifiziert.
4. Das Ergebnis wird nach `data/offers-live.json` geschrieben und automatisch committed.
5. GitHub Pages veröffentlicht den neuen Datenstand; die App lädt `offers-live.json` beim Start.

## Händlerquellen

Die Markt- und Quellkonfiguration liegt in `data/markets.json`. Bei marktbezogenen Händlern wird die konkrete Filialseite verwendet. Bei Händlern mit regional bzw. bundesweit identischen Wochenangeboten wird die zentrale offizielle Angebotsseite genutzt.

Die App zeigt pro Quelle einen Status:

- 🟢 Import erfolgreich
- 🟡 Seite erreichbar, aber aktuell keine strukturierten Angebote erkannt
- 🔴 Abruf/Parser fehlgeschlagen

## GitHub Pages

Der vorhandene Workflow `.github/workflows/pages.yml` veröffentlicht die statische App über GitHub Pages.

URL: `https://sebmut.github.io/Einkaufsliste/`
