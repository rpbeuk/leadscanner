# Installatie

Alles hieronder is eenmalig. Plak **nooit** sleutels in chats, issues of code: alleen in de genoemde secret-vensters.

## 1. Lokaal draaien
```bash
npm ci
cp .env.example .env
npm run dev
```
Camera in de browser werkt alleen via https. `vite-plugin-basic-ssl` regelt dat lokaal (je browser waarschuwt voor het certificaat).

## 2. Supabase (database)
1. Project aanmaken op supabase.com.
2. SQL uit `supabase/schema.sql` uitvoeren (SQL editor), of `npm run db:migrate` met `DATABASE_URL` in `.env`.
3. In `.env` (en als GitHub-secrets, stap 5): `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` (de *publishable* key).

> De RLS-regels in `schema.sql` zijn nu **volledig open**. Lees [SECURITY.md](SECURITY.md) voordat je echte klantgegevens opslaat.

## 3. Azure OpenAI (handschriftherkenning)
1. portal.azure.com → resource aanmaken (Azure OpenAI of Foundry). Regio in de EU. Netwerk: **All networks** (anders kan Supabase er niet bij).
2. In de Foundry-portal een **model uitrollen dat afbeeldingen kan lezen** (vision), bij voorkeur het nieuwste volledige model (geen mini/nano: handschrift met vaktermen vraagt de grotere variant). Noteer de **deploymentnaam** (kolom *Name* onder Deployments; dat is niet per se de modelnaam).
3. Bij de resource → *Keys and Endpoint*: kopieer endpoint en Key 1.
   Het endpoint heeft de vorm `https://<resource>.services.ai.azure.com` (Foundry) of `https://<resource>.openai.azure.com`. De Edge Function gebruikt de route `…/openai/v1/chat/completions`.

## 4. Supabase Edge Function
Zonder opdrachtregel (dashboard):
1. Kopieer `supabase/functions/scan-form/index.ts`.
2. Supabase → *Edge Functions* → *Deploy a new function* → *Via Editor* → plak → Deploy.
   Supabase geeft de function een **automatische naam** (bij ons `smooth-worker`). Controleer de naam: de app roept `/functions/v1/smooth-worker` aan (`src/lib/ocrEngine.ts`, functie `extractWithAzure`). Heet de jouwe anders, pas dat daar aan.
3. *Secrets* toevoegen:

| Naam | Waarde |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | endpoint zonder slash aan het eind |
| `AZURE_OPENAI_KEY` | Key 1 uit Azure |
| `AZURE_OPENAI_DEPLOYMENT` | deploymentnaam uit Foundry |
| `SCAN_ACCESS_CODE` | zelfbedachte code (bijv. drie woorden + cijfers) |

4. Zet **Verify JWT uit** bij de function (Details). Onze Supabase-sleutel is een `sb_publishable_…`-sleutel en geen JWT; met de controle aan krijgt de browser "Failed to fetch".
5. Met CLI kan ook: `supabase functions deploy <naam> --no-verify-jwt`.

Na elke wijziging aan `index.ts` (bijv. de prompt) moet je de function **opnieuw deployen**; de GitHub-deploy doet dat niet.

## 5. GitHub Pages
1. Repo → *Settings → Pages* → Source: **GitHub Actions**.
2. Repo → *Settings → Secrets and variables → Actions*: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (en optioneel `VITE_GEMINI_API_KEY`; niet nodig).
3. Elke push naar `main` bouwt en publiceert (`.github/workflows/deploy.yml`, ongeveer een minuut).
4. Na een deploy houdt een mobiele browser vaak de oude versie vast: sluit de pagina helemaal en open opnieuw.

## 6. In de app (per telefoon)
*Instellingen* → **Toegangscode Azure OCR** invullen (precies gelijk aan `SCAN_ACCESS_CODE`, inclusief kleine letters en streepjes). Dit wordt alleen in de browser van die telefoon bewaard.

## Problemen oplossen
| Melding | Oorzaak / oplossing |
|---|---|
| `Azure: function niet bereikt…` / *Failed to fetch* | Function niet uitgerold, verkeerde functienaam, of **Verify JWT** staat aan |
| `Ongeldige toegangscode` | Code in app ≠ secret `SCAN_ACCESS_CODE` |
| `Function is not configured (missing secrets)` | Een van de vier secrets ontbreekt |
| `Azure 401/403` | Verkeerde of ingetrokken sleutel |
| `Azure 404` | Verkeerde deploymentnaam of endpoint |
| `Azure 429/5xx` | Quotum of tijdelijke overbelasting; opnieuw proberen |
| Oude gedrag na deploy | Pagina helemaal sluiten en opnieuw openen (cache) |
