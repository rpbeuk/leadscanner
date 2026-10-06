# Fouten en learnings

Alles wat misging, in de volgorde waarin het gebeurde, met oorzaak en oplossing.

## 1. Uitgelezen tekst was onzin ("or Krawar FE n = 1")
- **Zichtbaar**: voornaam `| Cs EA ' ny Ly (T`, e-mail vol labeltekst, notities onleesbaar.
- **Oorzaak**: de app viel **stilletjes** terug op Tesseract (kan geen handschrift lezen) zodra Gemini ontbrak of faalde. Vaste crop-posities knipten bovendien de verkeerde stukken (het vak "First Name" liep door tot "Last Name"; de Department-regel viel buiten het vak).
- **Oplossing**: Tesseract-fallback verwijderd; fouten tonen met reden; uitsneden uit door het model aangegeven posities.
- **Learning**: een slechte fallback is erger dan een duidelijke foutmelding. Niet stil terugvallen op iets dat niet kan werken.

## 2. Analyseren duurde veel te lang
- **Oorzaken**: model met "thinking" aan, grote foto (2048px) over mobiel netwerk, geen time-out.
- **Oplossing**: thinking uit/laag, foto op 1536px/q0,8, time-out per aanvraag.
- **Learning**: voor transcriptie is redeneren overbodig; meten wat er daadwerkelijk wacht (model of netwerk).

## 3. Gemini 503 "high demand"
- Tijdelijke overbelasting bij Google op één model.
- **Oplossing**: korte pauze en een lijst met meerdere modellen.
- **Learning**: bij gratis/gedeelde capaciteit hoort altijd een uitwijkmodel, maar bouw er niet te veel op.

## 4. Gemini 404 "model is no longer available to new users" (eigen fout)
- Ik had `gemini-2.5-flash` vastgezet; Google blokkeerde dat model voor dit account. Een 404 telde bij mij niet als "probeer volgende", dus alles stopte.
- Daarna werd ook `gemini-2.5-flash-lite` ingetrokken.
- **Learning**: modelnamen bij Google veroud­eren snel. Niet vastpinnen zonder uitwijk, 404 behandelen als "volgend model", en de alias `gemini-flash-latest` gebruiken.

## 5. "Plak de sleutel in Instellingen" — veld bestond niet
- Instellingen had geen veld voor een API-sleutel. De Gemini-sleutel kwam alleen uit de build-secret `VITE_GEMINI_API_KEY`.
- **Learning**: controleer of de UI echt bestaat voordat je iemand ernaartoe stuurt.

## 6. Een API-sleutel werd in de chat geplakt (twee keer)
- Een Gemini-sleutel en later een Azure-sleutel.
- **Aanpak**: nooit gebruiken in code of repo; direct vervangen (Regenerate) en alleen als secret zetten.
- **Learning**: alles wat in een chat staat is niet meer geheim. Gebruik secret-invoervensters, geen gesprekken.

## 7. Een publieke site kan geen geheimen bewaren
- `VITE_*`-variabelen komen in de JavaScript terecht en zijn voor iedereen leesbaar, ook als ze uit GitHub-secrets komen.
- **Oplossing**: Azure-aanroep via Supabase Edge Function met serverside secrets.

## 8. Azure: verwarring over product en rechten
- Microsoft 365 Copilot ≠ Azure. De Copilot-licentie geeft geen API-toegang.
- Eindpunt bleek `https://<resource>.services.ai.azure.com` (Foundry) en niet `….openai.azure.com`; de route `/openai/v1/chat/completions` werkt voor beide.
- De deploymentnaam is niet automatisch de modelnaam.
- Azure-documentatie was niet bereikbaar vanuit de ontwikkelomgeving; de modelkeuze is daarom niet tegen de actuele modellijst gecontroleerd.

## 9. "Failed to fetch" bij Azure
- **Oorzaak 1**: de app belde `/functions/v1/scan-form`, maar Supabase gaf de function de automatische naam `smooth-worker`.
- **Oorzaak 2 (mogelijk)**: *Verify JWT* aan. De browser-preflight (CORS) krijgt dan 401 zonder CORS-headers; de browser meldt alleen "Failed to fetch".
- **Learning**: dat bericht zegt "geen antwoord ontvangen", niet "fout van Azure". De foutmelding noemt nu de drie waarschijnlijke oorzaken.

## 10. Supabase-sleutel is geen JWT
- Het project gebruikt een `sb_publishable_…`-sleutel. De Edge Function-standaard (JWT verifiëren) wijst die af. Daarom `--no-verify-jwt`, met de toegangscode als extra slot.

## 11. Mobiele cache toont na deploy de oude versie
- Pagina helemaal sluiten en opnieuw openen. Controleer de GitHub Actions-run (deploy duurt ± 1 minuut) vóór je test.

## 12. Kleine technische vallen
- Backticks in een JavaScript-template-string (in de prompt) braken de build; gebruik aanhalingstekens.
- De prompt-wijziging zit in de Edge Function; die wordt **niet** door de GitHub-deploy bijgewerkt. Opnieuw deployen in Supabase.
- `.github/workflows/deploy.yml` deployt alleen vanaf `main`.

## Wat we niet konden testen (eerlijk)
- Azure end-to-end met een echt formulier op de live site: de ontwikkelomgeving kon het Azure-adres niet bereiken.
- De prompt is wel met Gemini op het echte voorbeeldformulier geprobeerd: alle velden stonden in het juiste veld. Eén leesfout in de notities ("MS voor betere purity" → "MS 100% better purity"). Handschrift blijft controle in het reviewscherm vragen.

## Open punten
- [ ] Azure end-to-end bevestigen en de nauwkeurigheid op meerdere formulieren meten.
- [ ] RLS-regels aanscherpen en leadfoto's/uitsneden beschermen (zie [SECURITY.md](SECURITY.md)).
- [ ] Ongebruikte afhankelijkheid `tesseract.js` uit `package.json` halen.
- [ ] "Opnieuw proberen"-knop in het reviewscherm zonder opnieuw te fotograferen.
- [ ] Verwerking op de achtergrond zodat je al het volgende formulier kunt scannen.
- [ ] Toegangscode vervangen door echte authenticatie (bijv. Supabase Auth).
- [ ] Documentatie van de modelkeuze controleren tegen de actuele Azure-modellijst.
