# Beveiliging en privacy

De repo is openbaar. Dit zijn de bekende risico's, eerlijk opgesomd.

## Wat geheim hoort te blijven (en nergens in de repo staat)
- Azure-sleutel → alleen als Supabase-secret
- `SCAN_ACCESS_CODE` → Supabase-secret + `localStorage` op de telefoon
- Database-wachtwoord (`DATABASE_URL`) → alleen in je lokale `.env`

Een sleutel die ooit in een chat, issue of commit stond is **niet meer geheim**: direct vernieuwen (Azure: *Regenerate key*).

## Bekende risico's
1. **De database staat open.** `supabase/schema.sql` heeft RLS-policies met `USING (true)` voor lezen, invoegen en wijzigen op `leads`, `campaigns` en `accounts`. De publishable Supabase-sleutel staat als fallback in `src/lib/supabase.ts` en dus in de openbare repo en de live bundel. **Iedereen kan daarmee alle leads lezen en wijzigen.** Leads bevatten namen en e-mailadressen (persoonsgegevens, AVG).
   - Voor echte gegevens: policies aanscherpen (Supabase Auth, alleen eigen rijen), fallback-sleutel uit de code halen, en eventueel een nieuwe sleutel aanmaken.
2. **De Edge Function draait zonder JWT-controle.** De toegangscode beperkt misbruik van het Azure-budget, maar is geen echte authenticatie (één gedeelde code, geen rate limiting, geen intrekken per persoon). Zet een kostenlimiet/alert op de Azure-resource.
3. **CORS staat op `*`** in de function; de toegangscode is het enige slot.
4. **Foto's van formulieren** gaan naar Azure. Controleer vooraf of de gekozen dienst/regio is goedgekeurd door IT/privacy en of er een verwerkersovereenkomst is. Gebruik een EU-regio en kies niet automatisch "Global" deployments als de verwerking binnen de EU moet blijven.
5. **Sleutels in `VITE_*` zijn publiek.** Zet daar alleen waarden die publiek mogen zijn.

## Aanbevolen volgorde om te verbeteren
1. RLS aanscherpen + Supabase Auth.
2. Fallback-sleutel uit de code, nieuwe publishable key.
3. Rate limiting/kostenlimiet op de function en in Azure.
4. Beleid voor bewaartermijn van leads en foto's.
