# AngebotsRadar 85622

V2 einer mobilen Web-App zum lokalen Lebensmittel-Angebotsvergleich rund um **85622 Feldkirchen (10 km)**.

## V2

- responsive Web-App / PWA
- Händler- und Kategorie-Filter
- Produktsuche
- Vergleich von Angebotspreis und Grundpreis
- **Bio wird immer gegenüber konventionell priorisiert**
- pro Produkt wird das günstigste Bio-Angebot als Empfehlung gezeigt
- direkt daneben: günstigster konventioneller Preis inklusive Markt
- Anzeige des Bio-Aufpreises in Euro und Prozent
- wenn kein Bio-Angebot vorhanden ist, wird automatisch das günstigste konventionelle Angebot verwendet
- optionale App- und Couponpreise
- lokale Einkaufsliste im Browser
- Einkaufsliste nutzt dieselbe Bio-Priorität und zeigt konventionelle Alternativen
- vorbereitet für REWE, EDEKA, PENNY, HIT, ALDI SÜD, Lidl, Netto und NORMA

## Datenstatus

Die V2 enthält weiterhin **Demo-Angebote**. Sie stellt noch keine aktuellen Händlerpreise dar. Die Live-Prospekt-/Angebotsimporte werden als eigener Datenimport angebunden.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` veröffentlicht den statischen Inhalt über GitHub Pages, sobald GitHub Pages im Repository mit **GitHub Actions** als Quelle aktiviert ist.

Geplante URL: `https://sebmut.github.io/Einkaufsliste/`
