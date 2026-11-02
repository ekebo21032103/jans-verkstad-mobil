# Bygg och publicera

Källan är `src/`, `web/`, `public/` och `scripts/`. Rotens HTML, `assets/`, `sw.js` och `source-code.zip` är byggresultat som GitHub Pages serverar från `main`.

1. Kör `npm ci`, `npm run check`, `npm test` och `npm run build`.
2. Testa produktionsbygget med `npm run preview`. Om Python/Playwright/Chromium finns kan `python tests/browser-smoke.py` köra mobilflödet på en separat lokal origin. Testet använder testdata och blockerar molnanrop.
3. Kör `npm run publish:files` och kontrollera diffen. Källkod, HTML, moduler, service worker och källkodsarkiv ska ingå i samma commit.
4. Granska ändringen på en separat testorigin. Olika sökvägar på samma origin kan dela IndexedDB; använd inte ett riktigt register som testdata.
5. Efter publicering: spara en säkerhetskopia och kontrollera antal, foton, maskinuppgifter och projekt på den riktiga enheten. Rensa inte webbläsardata för att uppdatera appen. Den nya service workern ändrar inte användardatabaserna.

## Kontroller för denna ändring

- Tidigare register öppnas med oförändrade databasnamn och versioner.
- Modell, serienummer, egna metadata och foton bevaras vid redigering och massflytt.
- Utlåning, återlämning och historik fungerar lokalt.
- Checklistor, materiallistor och verktygskopplingar sparas och följer med i backup.
- Hela verkstaden kan exporteras, förhandsgranskas och återställas med separat återställningskopia. Vid simulerat skrivfel läggs tidigare uppgifter tillbaka.
- Projektkopior med åtta 25 MB-bilagor kan återställas; korrupt ZIP avvisas före skrivning.
- Startsidan fungerar offline efter första installationen, utan att växla till testversionens databas. Projekt och bildgalleri ska också öppnas offline.

## Återstående enhetskontroll

Mobiltestet använder Chromium med mobil skärmstorlek. Safari/iPhone och faktisk hemskärmsinstallation måste fortfarande kontrolleras på en fysisk enhet, särskilt nedladdning/sparande av stora filer. Moln-/synktesterna i `TESTPLAN.md` är en tidigare separat plan och ingår inte i denna ändring.
