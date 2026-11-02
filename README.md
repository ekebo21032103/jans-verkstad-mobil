# Jans verkstad – mobilapp

Öppna appen: https://ekebo21032103.github.io/jans-verkstad-mobil/

Mobilanpassat register över verktyg och förvaringsplatser, med foton, maskinuppgifter, sökning, utskrift och projekt med ritningar.

## Lokala funktioner

- Markera och flytta flera föremål samtidigt till en befintlig eller ny plats.
- Registrera utlåning, återlämningsdatum och historik. Filtrera på utlånade eller försenade föremål. En utlåning gäller hela registerpostens antal.
- Spara projekt med checklistor, materiallistor, kopplingar till verktygsregistret samt bilder och PDF. Avprickning behålls när oförändrade textrader flyttas i listan.
- Sök i projekt utan att läsa in alla bilagor.
- Använd startsidan, projekt, platsbilder och registerutskrift offline efter första lyckade inladdningen. Testversioner används aldrig som reserv för ordinarie startsida.

## Säkerhetskopiering

**Säkerhetskopiera hela verkstaden** på startsidan skapar en ZIP-fil med verktygsregister, maskinuppgifter, utlåningar, förvaringsplatser, platsbilder, projekt, checklistor, materiallistor och bilagor. Inloggningsuppgifter och synkinställningar ingår inte. Kontrollera att nedladdningen har sparats i Filer/iCloud Drive eller Hämtade filer; appen kan bara visa när exporten startades.

Vid återställning kontrolleras filernas integritet och innehåll innan något skrivs. Förhandsgranskningen visar antalen. Spara först den erbjudna återställningskopian av nuvarande uppgifter. Återställningen ersätter de tre lokala registren och försöker rulla tillbaka om ett skrivfel inträffar. IndexedDB saknar gemensamma transaktioner över flera databaser, så behåll återställningskopian även efteråt. Stäng andra flikar med appen under återställningen.

Projekt kan också exporteras/importeras separat som ZIP. Bilagorna lagras som egna filer, vilket undviker den äldre JSON-exportens storleksökning. ZIP-formatet är okomprimerat och har samma gräns på **2 GB** för export och import. Varje projekt tillåter högst 30 bilagor och 25 MB per bilaga. Större exporter avbryts med ett tydligt meddelande.

Äldre JSON-kopior kan fortfarande importeras i respektive del: verktygsregister på startsidan, projekt på projektsidan och platsbilder i bildgalleriet. Projektimport lägger till nya projekt och rapporterar hur många befintliga projekt som hoppades över. Den ersätter inte befintliga projekt.

## Källkod och bygge

Aktuell källkod finns direkt i repot:

- `src/`: registerapp, lokal lagring och gemensamma ZIP-/backupfunktioner.
- `web/`: redigerbara HTML-sidor, inklusive startsida och projektsida.
- `public/`: ikoner och befintliga fristående sidor/moduler.
- `scripts/`: service worker-mall, källkodspaketering och publicering av byggda filer.
- `tests/`: tester för databevarande, återställning, stora bilagor och offlineflöden.

Använd Node.js 22.13 eller senare:

```sh
npm ci
npm run check
npm test
npm run build
```

Bygget skapar `dist/`, inklusive en service worker som hör till exakt samma bygge och en aktuell `source-code.zip`. Arkivet innehåller samma redigerbara källkod som repot. Redigera inte de genererade filerna i repots rot.

För att uppdatera rotfilerna som GitHub Pages serverar:

```sh
npm run publish:files
```

Granska och committa både källkod och byggda filer tillsammans. `npm run dev` startar utvecklingsversionen; `npm run preview` visar produktionsbygget. Ett kompletterande mobiltest finns i `tests/browser-smoke.py` och kräver Python, Playwright och Chromium. Se `docs/RELEASE.md`.

## Synkronisering

Befintlig valfri synkronisering finns kvar. Synklogiken har inte ändrats i denna omgång och QR-funktioner ingår inte. Synkronisering för nya arbetsflöden behöver testas separat innan den används som ersättning för lokala säkerhetskopior.

## På hemskärmen

Öppna appen i mobilens webbläsare och välj Lägg till på hemskärmen. Använd samma webbläsare/öppningssätt och webbplatsadress varje gång. Lokal lagring följer inte automatiskt med mellan webbläsare, olika webbplatsadresser eller enheter.
