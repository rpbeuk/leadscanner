# Leadscanner

Mobiele web-app om op een beurs papieren **contactformulieren** (Miltenyi Biotec "Contact form") te fotograferen,
het **handschrift automatisch uit te laten lezen**, de lead te controleren en op te slaan/exporteren.

- Live: https://aron-over.github.io/leadscanner/
- Stack: React 18 + Vite + TypeScript + Tailwind, Supabase (database + Edge Function), Azure OpenAI (handschriftherkenning), GitHub Pages (hosting)

## Hoe het werkt

```
Telefoon (browser, GitHub Pages)
  1. foto maken / uploaden  ──►  verkleinen naar 1536px (imageUtils.ts)
  2. POST foto + toegangscode ─►  Supabase Edge Function "smooth-worker"  (supabase/functions/scan-form)
                                    └─► Azure OpenAI (vision model)  ──► JSON met 7 velden + posities
  3. controle (e-mail vs naam), CRM-account matchen (fuse.js), uitsneden per veld knippen
  4. Review-scherm ──► opslaan lokaal ──► sync naar Supabase (tabel leads) ──► Excel-export
```

De 7 velden: `first_name`, `last_name`, `email`, `institute`, `department`, `notes`, `newsletter_opt_in`.

## Snel starten op een andere laptop

```bash
git clone https://github.com/aron-over/leadscanner.git
cd leadscanner
npm ci
cp .env.example .env     # vul de Supabase-waarden in
npm run dev              # https://localhost:5173 (self-signed cert; nodig voor camera op telefoon)
npm run build            # type-check + productiebuild naar dist/
```

Volledige installatie (Supabase, Azure, GitHub Pages): zie **[docs/SETUP.md](docs/SETUP.md)**.

## Documentatie

| Bestand | Inhoud |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Stap voor stap: Supabase, Edge Function, Azure OpenAI, GitHub Pages, app-instellingen |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Welke keuzes we maakten en waarom |
| [docs/LEARNINGS.md](docs/LEARNINGS.md) | Alle fouten die we tegenkwamen en wat we ervan leerden |
| [docs/SECURITY.md](docs/SECURITY.md) | Bekende risico's, privacy (AVG) en wat nog moet |

## Projectstructuur

```
src/
  App.tsx                      hoofdscherm, scan-flow
  components/                  Header, LeadsTable, ScannerModal, ReviewModal, SettingsModal
  lib/ocrEngine.ts             uitlezen: Azure (via Edge Function), Claude/Gemini uitgeschakeld, nabewerking
  lib/crmAccounts.ts           fuzzy-matching van instituut/afdeling op CRM-accounts
  lib/supabase.ts              database-sync
  lib/excelExport.ts           export
  lib/imageUtils.ts            foto verkleinen (iPhone-foto's zijn groot)
supabase/
  schema.sql                   tabellen + RLS
  functions/scan-form/         Edge Function die Azure OpenAI aanroept (sleutel blijft server-side)
.github/workflows/deploy.yml   build + deploy naar GitHub Pages bij push naar main
```

## Status (6 oktober 2026)

- Werkt: scannen, review, sync, export, deploy.
- **Azure-uitlezing is gebouwd maar nog niet end-to-end bevestigd** met een echt formulier op de live site.
  Gemini en Claude zijn uitgeschakeld (`ENGINES` in `src/lib/ocrEngine.ts`), de code staat er nog voor als reserve.
- Open punten: zie het einde van [docs/LEARNINGS.md](docs/LEARNINGS.md).
