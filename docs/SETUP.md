# Installatie

Alles hieronder is eenmalig. Plak **nooit** sleutels in chats, issues of code: alleen in de genoemde secret-vensters.

## 1. Lokaal draaien
```bash
npm ci
cp .env.example .env
npm run dev
```
Camera in de browser werkt alleen via https. `vite-plugin-basic-ssl` regelt dat lokaal (je browser waarschuwt voor het certificaat).

## 2. Een eigen Supabase-project (lege database)
1. Maak een project aan op supabase.com **in je eigen account**. Kies een sterke databasewachtwoord en bewaar die in een wachtwoordmanager. De database staat in de regio die je bij het aanmaken kiest.
2. Open in het nieuwe project **SQL Editor → New query**, plak de volledige inhoud van `supabase/schema.sql` en voer die uit. Dit maakt de tabellen aan en voegt de standaardcampagne toe. De `accounts`-tabel is leeg; de CRM-matchlijst in de app blijft lokaal.
3. Haal de **Project URL** en de **publishable key** op via **Project Settings → API** (of **Connect**). Gebruik nooit de `service_role`-sleutel in de browser.
4. Zet de aanmelding op uitnodiging-only: in **Authentication → Settings / User Signups**, schakel nieuwe publieke gebruikersregistraties uit. E-mail/wachtwoord-aanmelding blijft aan. De RLS-policies in `schema.sql` staan database-toegang alleen toe voor ingelogde gebruikers.
5. Stel onder **Authentication → URL Configuration** de Site URL in op `https://rpbeuk.github.io/leadscanner/` en voeg die URL toe aan de toegestane redirect URLs. Nodig daarna jezelf en medewerkers uit onder **Authentication → Users → Invite user**. Er is geen registratieknop in de app. Uitgenodigde gebruikers kunnen via **Wachtwoord vergeten?** hun wachtwoord instellen.
6. Voor betrouwbare uitnodigings- en wachtwoordherstel-e-mails configureer je een eigen SMTP-provider onder **Authentication → SMTP Settings**. Supabase' standaard e-mailservice is beperkt.

Dit is een **nieuwe, lege database**: bestaande cloudleads worden niet gekopieerd. De app gebruikt ook een nieuwe lokale browserdatabase, zodat oude lokaal opgeslagen leads niet automatisch naar het nieuwe project worden gesynchroniseerd. De oude browserdatabase wordt niet verwijderd.

## 3. Azure OpenAI (handschriftherkenning)
1. portal.azure.com → resource aanmaken (Azure OpenAI of Foundry). Regio in de EU. Netwerk: **All networks** (anders kan Supabase er niet bij).
2. In de Foundry-portal een **model uitrollen dat afbeeldingen kan lezen** (vision), bij voorkeur het nieuwste volledige model (geen mini/nano: handschrift met vaktermen vraagt de grotere variant). Noteer de **deploymentnaam** (kolom *Name* onder Deployments; dat is niet per se de modelnaam).
3. Bij de resource → *Keys and Endpoint*: kopieer endpoint en Key 1.
   Het endpoint heeft de vorm `https://<resource>.services.ai.azure.com` (Foundry) of `https://<resource>.openai.azure.com`. De Edge Function gebruikt de route `…/openai/v1/chat/completions`.

## 4. Supabase Edge Function
De functie moet opnieuw op het **nieuwe** Supabase-project worden uitgerold:
1. Installeer de Supabase CLI, voer `supabase login` uit en link de repo aan het nieuwe project met `supabase link --project-ref <project-ref>`.
2. Deploy met de naam `scan-form`: `supabase functions deploy scan-form --no-verify-jwt`.
3. Voeg in **Edge Functions → Secrets** toe:

| Naam | Waarde |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | endpoint zonder slash aan het eind |
| `AZURE_OPENAI_KEY` | Key 1 uit Azure |
| `AZURE_OPENAI_DEPLOYMENT` | deploymentnaam uit Foundry |
| `SCAN_ACCESS_CODE` | zelfbedachte code (bijv. drie woorden + cijfers) |

4. Controleer dat de function `scan-form` actief is en **Verify JWT** uit staat. De app verstuurt een publishable key en een aparte `SCAN_ACCESS_CODE`.

Na elke wijziging aan `index.ts` (bijv. de prompt) moet je de function **opnieuw deployen**; de GitHub-deploy doet dat niet.

## 5. Koppel de app aan je nieuwe project
1. Werk lokaal het genegeerde `.env`-bestand bij met de nieuwe `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY`-waarden uit stap 2. `.env.example` toont de namen. Start de dev-server opnieuw.
2. Open de repo → **Settings → Secrets and variables → Actions** en vervang de secrets `VITE_SUPABASE_URL` en `VITE_SUPABASE_ANON_KEY` door de nieuwe projectwaarden. Voer deze waarden niet in broncode, issues of chat in.
3. De app gebruikt standaard de Edge Function `scan-form`. Als je een andere naam kiest, stel die dan in bij GitHub **Settings → Secrets and variables → Actions → Variables** als `VITE_OCR_FUNCTION_NAME` en gebruik lokaal dezelfde variabele in `.env`.
4. Publiceer de app-code met een pull request naar `main` nadat het nieuwe project, de uitgenodigde eigenaar en de nieuwe GitHub Secrets klaarstaan. De workflow `.github/workflows/deploy.yml` bouwt met de nieuwe secrets en publiceert de app op GitHub Pages.
5. Na de deploy: sluit de oude site op mobiel helemaal af, open `https://rpbeuk.github.io/leadscanner/` opnieuw en log in met je uitgenodigde account.

> Zodra je de GitHub secrets vervangt en de gewijzigde app live staat, wijst de openbare app naar jouw project. De publishable key is zichtbaar voor bezoekers; de bescherming komt van uitgeschakelde publieke registratie en de RLS-policies, niet van geheimhouding van die key.

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
