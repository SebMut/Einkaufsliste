# METRO Login – GitHub-only Setup

Die Einkaufsliste bleibt vollständig auf GitHub. Für den automatischen METRO-Import werden die Zugangsdaten ausschließlich als GitHub Actions Secrets bereitgestellt.

## Einmalige Einrichtung

1. Repository `SebMut/Einkaufsliste` öffnen.
2. `Settings` → `Secrets and variables` → `Actions` öffnen.
3. Unter `Repository secrets` auf `New repository secret` klicken.
4. Secret `METRO_EMAIL` anlegen und als Wert die E-Mail-Adresse des METRO-Kundenkontos eintragen.
5. Secret `METRO_PASSWORD` anlegen und als Wert das METRO-Passwort eintragen.
6. Danach unter `Actions` den Workflow `Live-Angebote importieren V4.1` einmal manuell starten.

## Sicherheit

- Die Zugangsdaten werden nicht in HTML, JavaScript, `offers-live.json` oder Logs geschrieben.
- Der Workflow erhält die Werte nur zur Laufzeit über `${{ secrets.METRO_EMAIL }}` und `${{ secrets.METRO_PASSWORD }}`.
- Ohne Secrets bleibt METRO auf `credentials_missing` und der Rest des Imports läuft weiter.
- Bei falschen/abgelaufenen Zugangsdaten steht METRO auf `auth_error`.
- Bei erfolgreichem Login werden nur Lebensmittelangebote für METRO München-Freimann übernommen.
- Für den Preisvergleich werden nur verifizierte Bruttopreise inkl. MwSt. gespeichert. Kann die MwSt.-Darstellung nicht sicher bestätigt werden, werden keine METRO-Preise in den Vergleich aufgenommen.

## Aktueller METRO-Markt

METRO München-Freimann  
Helene-Wessel-Bogen 39  
80939 München
