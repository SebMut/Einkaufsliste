# AngebotsRadar 85622

V4.4 einer mobilen Web-App zum lokalen Preisvergleich rund um **85622 Feldkirchen (15 km)**.

## V4.4 – Produktnormalisierung & Preisverlauf

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
- semantische Produktnormalisierung mit Hierarchie `Bereich → Warengruppe → Produktgruppe → Produktart → Attribute`
- wichtige Gegenfälle werden bewusst getrennt, z. B. **Milch ≠ Milchreis ≠ Milchschokolade ≠ Milchbrötchen**
- echte Vergleichsebenen (`exact_match`, `similar_product`, `same_group`, Bio-/konventionelle Alternative)
- **kein Eigenvergleich**: existiert nur ein Angebot, wird keine redundante Vergleichsbox angezeigt
- Händlervergleich zeigt abhängig vom Fall „Günstiger bei“, „Günstigstes Angebot / Nächster Preis“ oder „Konventionelle Alternative“
- persistente Preishistorie in `data/price-history.json`
- Preisbewertung direkt an der Karte, sobald mindestens vier unabhängige Preisereignisse vorliegen, z. B. **🔥 18 % günstiger als üblich**
- „üblich“ basiert auf einem robusten Median der letzten sechs Monate; Bio und konventionell werden getrennt ausgewertet
- interaktiver Preisverlauf mit 1M / 3M / 6M / 1J / Alles und Händlerfilter
- neue Kategorie **👶 Baby & Kleinkind** für Windeln/Pants, Feuchttücher, Babynahrung, Pre-/Folgemilch, Brei, Gläschen, Quetschies, Kinder-Snacks, Babypflege sowie Schnuller/Flaschen
- Produkttaxonomie unterstützt zusätzlich Drogerie-/Haushaltsprodukte wie Waschmittel und Toilettenpapier, auch wenn die heutigen Händlerquellen nicht jedes Vollsortiment importieren
- lokale Einkaufsliste im Browser
- Importstatus je Händler direkt in der App
- persistente Importdiagnose in `data/import-diagnostics.json`

## Datenfluss

1. `.github/workflows/import-offers-v41.yml` startet regelmäßig den Importer und führt zuerst die Produktlogik-Tests aus.
2. `importer/import.js` öffnet die offiziellen Händlerseiten mit Chromium/Playwright.
3. Der Importer wertet sichtbaren und versteckten DOM-Text, Lazy-Load-Inhalte, eingebettete JSON-Daten und passende JSON/API-Antworten aus.
4. Preise, Größen und Grundpreise werden normalisiert; Bio- und Baby/Kleinkind-Produkte werden klassifiziert.
5. Die Qualitätsstufen entfernen Parserfehler und Dubletten.
6. `importer/product-normalizer.js` führt die finale semantische Taxonomie, Canonical IDs und Vergleichsschlüssel ein.
7. `importer/price-history.js` schreibt neue Preisereignisse nach `data/price-history.json` oder verlängert unveränderte Preisereignisse, statt tägliche Dubletten zu erzeugen.
8. Das Ergebnis wird nach `data/offers-live.json` geschrieben und automatisch committed.
9. GitHub Pages veröffentlicht den neuen Datenstand; die App lädt Live-Angebote und Preishistorie beim Start.

## Produktnormalisierung

Die finale Angebotsstruktur enthält zusätzlich unter anderem:

- `department`
- `category` / `subcategory`
- `canonicalGroup`
- `canonicalProduct`
- `canonicalId`
- `bundleKey`
- `similarityKey`
- `exactMatchKey`
- `attributes`
- `marketSection`
- `confidence`

Beispiel: „Bio Frische Vollmilch 3,8 %“ wird unter **Milch** gebündelt, bleibt aber als **Vollmilch**, Bio, frisch und 3,8 % Fett unterscheidbar. „Müller Milchreis“ bleibt eine eigene Produktgruppe.

## Preisstatistik

`data/price-history.json` speichert Preisereignisse getrennt von den aktuellen Angeboten. Unveränderte Preise ohne explizite Gültigkeitsdaten werden innerhalb eines Acht-Tage-Fensters als dasselbe Ereignis fortgeschrieben. Damit verfälschen tägliche Imports die Statistik nicht künstlich.

Für die Kartenbewertung gilt standardmäßig:

- mindestens 4 unabhängige Preisereignisse
- Median als robuster üblicher Preis
- bevorzugt Grundpreis bei passender Einheit
- Bio und konventionell getrennt
- ≥ 15 % günstiger: 🔥 sehr guter Preis
- 5–15 % günstiger: 👍 guter Preis
- ungefähr ±5 %: ➖ normaler Preis
- > 5 % teurer: ⚠️ eher teuer
- ein echter historischer Tiefstpreis hat Vorrang

## Händlerquellen

Die Markt- und Quellkonfiguration liegt in `data/markets.json`. Das Suchgebiet beträgt **15 km um 85622 Feldkirchen**. Bei marktbezogenen Händlern wird eine konkrete Filialseite verwendet; bei regional bzw. bundesweit identischen Angeboten eine zentrale offizielle Angebotsseite.

Die App zeigt pro Quelle einen Status:

- 🟢 Import erfolgreich
- 🟡 Seite erreichbar, aber aktuell keine verwertbaren Angebote erkannt
- 🔴 Abruf/Parser fehlgeschlagen

## Tests

Im Verzeichnis `importer`:

```bash
npm test
```

Die Regressionstests decken insbesondere Milch/Milchreis/Milchschokolade/Butterkeks, Apfelsaft/Äpfel, Baby-Wattestäbchen, Hackfleisch-Varianten, Eigenvergleiche, Händlervergleiche und Preisbewertung ab.

## GitHub Pages

Der vorhandene Workflow `.github/workflows/pages.yml` veröffentlicht die statische App über GitHub Pages.

URL: `https://sebmut.github.io/Einkaufsliste/`
