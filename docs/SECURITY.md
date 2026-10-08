# Beveiliging en privacy

De repo is openbaar. Dit zijn de bekende risico's, eerlijk opgesomd.

## Wat geheim hoort te blijven (en nergens in de repo staat)
- Azure-sleutel → alleen als Supabase-secret
- `SCAN_ACCESS_CODE` → Supabase-secret + `localStorage` op de telefoon
- Database-wachtwoord (`DATABASE_URL`) → alleen in je lokale `.env`
- Supabase `service_role`-sleutel → alleen server-side; nooit in Vite-variabelen, browser of GitHub Pages build secrets

Een sleutel die ooit in een chat, issue of commit stond is **niet meer geheim**: direct vernieuwen (Azure: *Regenerate key*).

## Bekende risico's
1. **Beveilig ook de Supabase-projectinstellingen.** De nieuwe `supabase/schema.sql` vereist een ingelogde gebruiker voor lezen en schrijven op `leads`, `campaigns` en `accounts`. Schakel publieke signups uit en nodig alleen vertrouwde medewerkers uit. Iedere uitgenodigde gebruiker krijgt toegang tot alle leads.
2. **Het oude Supabase-project blijft een apart risico.** De oude database had open RLS-policies. Deze verhuizing verandert of verwijdert het oude project niet. Behandel gegevens die daar hebben gestaan als blootgesteld; beperk of verwijder het oude project en de data volgens je privacybeleid.
3. **De Edge Function draait zonder JWT-controle.** De toegangscode beperkt misbruik van het Azure-budget, maar is geen echte authenticatie (één gedeelde code, geen rate limiting, geen intrekken per persoon). Zet een kostenlimiet/alert op de Azure-resource.
4. **CORS staat op `*`** in de function; de toegangscode is het enige slot.
5. **Foto's van formulieren** gaan naar Azure. Controleer vooraf of de gekozen dienst/regio is goedgekeurd door IT/privacy en of er een verwerkersovereenkomst is. Gebruik een EU-regio en kies niet automatisch "Global" deployments als de verwerking binnen de EU moet blijven.
6. **Sleutels in `VITE_*` zijn publiek.** De Supabase publishable key is opgenomen in de client; vertrouw op RLS voor databasebescherming. Zet hier nooit service-role-, Azure- of databasewachtwoordsleutels.

## Aanbevolen volgorde om te verbeteren
1. Schakel publieke signups uit en nodig alleen vertrouwde gebruikers uit.
2. Zet rate limiting/kostenlimieten op de Edge Function en in Azure.
3. Stel een bewaartermijn vast voor leads en foto's.
