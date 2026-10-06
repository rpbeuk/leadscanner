# Plan: Leadscanner reproduceren met je eigen GitHub en Supabase

Doel: dezelfde app draaien onder een **ander GitHub-account** en een **ander Supabase-project**, met je eigen Azure-resource.
Geschatte tijd: 1 tot 2 uur, grotendeels klikwerk. Details per onderdeel staan in [SETUP.md](SETUP.md); dit bestand is de volgorde en de checklist.

> Houd bij het overnemen bij elke stap de regel aan: **sleutels alleen in secret-vensters**, nooit in chats, code of issues.

## Wat je nodig hebt
- GitHub-account (publieke repo voor gratis Pages)
- Supabase-account (gratis plan volstaat)
- Azure-abonnement waarin je een Azure OpenAI/Foundry-resource mag aanmaken (rechten! zo niet: vraag IT) en een vision-model mag uitrollen
- Node.js 20+ en git op je laptop
- Een telefoon met camera om te testen

## Fase 0 — Code naar je eigen GitHub
- [ ] Fork `aron-over/leadscanner`, of: clone en push naar een eigen nieuwe repo
  ```bash
  git clone https://github.com/aron-over/leadscanner.git
  cd leadscanner
  git remote set-url origin https://github.com/<jij>/<jouw-repo>.git
  git push -u origin main
  ```
- [ ] `npm ci` en `npm run build` lokaal: moet slagen

## Fase 1 — Supabase
- [ ] Nieuw project aanmaken (kies een EU-regio); noteer de **project-URL** en de **publishable key** (Project Settings → API)
- [ ] Database: voer `supabase/schema.sql` uit in de SQL editor (maakt `campaigns`, `accounts`, `leads` en RLS)
- [ ] **Beveilig dit voordat je echte klantgegevens opslaat** — de meegeleverde RLS-regels staan open voor iedereen met de key (zie [SECURITY.md](SECURITY.md))
- [ ] Let op: de repo bevat als fallback nog de sleutel van het oorspronkelijke project (`src/lib/supabase.ts`). Vervang die door een eigen waarde of verwijder de fallback, anders praat jouw app met het verkeerde project als je secrets vergeet

## Fase 2 — Azure OpenAI
- [ ] Resource aanmaken in een EU-regio; netwerk: **All networks**
- [ ] In Foundry een **vision-capabel model** uitrollen (volledig model, geen mini/nano); noteer de **deploymentnaam**
- [ ] Noteer endpoint (`https://<resource>.services.ai.azure.com` of `…openai.azure.com`) en Key 1
- [ ] Zet een **kostenlimiet/alert** op de resource

## Fase 3 — Edge Function in jouw Supabase
- [ ] Supabase → Edge Functions → *Deploy a new function* → *Via Editor* → plak `supabase/functions/scan-form/index.ts` → Deploy
- [ ] Noteer de **functienaam** die Supabase gaf (vaak automatisch, zoals `smooth-worker`)
- [ ] Secrets: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `SCAN_ACCESS_CODE` (zelf bedenken)
- [ ] **Verify JWT uit** bij de function
- [ ] Controleer in het dashboard dat de function *Active* is

## Fase 4 — Eigen GitHub Pages
- [ ] Repo → Settings → Pages → Source: **GitHub Actions**
- [ ] Repo → Settings → Secrets and variables → Actions → **Secrets**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Repo → Settings → Secrets and variables → Actions → **Variables** (of in `deploy.yml` toevoegen): `VITE_OCR_FUNCTION_NAME` = jouw functienaam (alleen nodig als die niet `smooth-worker` heet)
  - de workflow leest nu alleen secrets; voeg bij *Build Vite App* in `.github/workflows/deploy.yml` desnoods toe: `VITE_OCR_FUNCTION_NAME: ${{ vars.VITE_OCR_FUNCTION_NAME }}`
- [ ] Push naar `main` (of start de workflow handmatig) en wacht op een groene run
- [ ] Je site staat op `https://<jij>.github.io/<jouw-repo>/` (`vite.config.ts` gebruikt `base: './'`, dus de repo-naam is vrij te kiezen)

## Fase 5 — Telefoon instellen en testen
- [ ] Site openen op de telefoon (sluit het tabblad volledig bij een eerdere versie)
- [ ] Instellingen: naam, campagne-ID (`U-` + 5 cijfers), en **Toegangscode Azure OCR** (exact gelijk aan `SCAN_ACCESS_CODE`)
- [ ] Scan één bekend formulier en vergelijk met het verwachte resultaat:

```json
{ "first_name": "Robbin", "last_name": "Kramer", "email": "robbin.kramer@radboudumc.nl",
  "institute": "Radboudumc", "department": "TIL | Medical Biosciences",
  "notes": "For the CD34+ UltraPure kit, is the serum concentration in the buffer ...",
  "newsletter_opt_in": false }
```
- [ ] Controleer: velden op de juiste plek, e-mail klopt, uitsneden horen bij hun veld, lead verschijnt in Supabase (`leads`), Excel-export werkt

## Foutzoeken (kort)
| Melding | Eerste controle |
|---|---|
| Failed to fetch / "function niet bereikt" | functienaam klopt? function Active? Verify JWT uit? |
| Ongeldige toegangscode | code in app = secret, exact |
| Missing secrets | alle vier de secrets gezet? |
| Azure 401/403/404 | sleutel, endpoint, deploymentnaam |
| Oude versie op telefoon | tabblad sluiten, opnieuw openen; Actions-run groen? |

Volledige tabel: [SETUP.md](SETUP.md#problemen-oplossen). Alle fouten die wij zelf tegenkwamen: [LEARNINGS.md](LEARNINGS.md).

## Aanpassen aan een ander formulier of andere campagne
- Veldlayout en prompt: `PROMPT` in `supabase/functions/scan-form/index.ts` (daarna opnieuw deployen in Supabase)
- Velden/typen: `src/types.ts`, schema in `supabase/schema.sql`, `sanitizeExtracted` in `src/lib/ocrEngine.ts`
- CRM-accounts voor matching: `src/lib/crmAccounts.ts` en de tabel `accounts`
- Ander model: alleen `AZURE_OPENAI_DEPLOYMENT` aanpassen (oudere en nieuwere modellen worden beide ondersteund; de function probeert zonder `reasoning_effort` opnieuw als het model die weigert)

## Definition of done
- [ ] Groene deploy op jouw GitHub
- [ ] Een echt formulier correct uitgelezen op de telefoon
- [ ] Lead zichtbaar in jouw Supabase
- [ ] RLS aangescherpt en fallback-sleutel uit de code (of bewust geaccepteerd en vastgelegd)
- [ ] Kostenlimiet gezet in Azure
- [ ] Privacy/IT-akkoord voor het verwerken van persoonsgegevens
