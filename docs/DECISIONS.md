# Keuzes en waarom

Chronologisch gegroeid op 6 oktober 2026. Per keuze: wat, waarom, alternatief, en of het nog geldt.

## Platform
| Keuze | Waarom | Kanttekening |
|---|---|---|
| Statische web-app (React + Vite + TS + Tailwind) op **GitHub Pages** | Geen server nodig, werkt op elke telefoon, gratis, deploy bij push | Alles in de browser is publiek: er kan geen geheim in |
| **Supabase** voor database en Edge Function | Al beschikbaar, Postgres + simpele serverless functie | Zie [SECURITY.md](SECURITY.md) over de open RLS-regels |
| Eerst lokaal opslaan, daarna syncen | Beurzen hebben slecht bereik | |
| `fuse.js` voor CRM-matching (~3.500 accounts) | Fuzzy match op instituut/afdeling | |

## Handschriftherkenning (de grootste keuze)
| Stap | Keuze | Uitkomst |
|---|---|---|
| 1 | **Tesseract.js** in de browser | Onbruikbaar: leest handschrift niet; labeltekst en ruis kwamen in de velden. Verwijderd. |
| 2 | **Gemini Flash** (vision) | Leest het formulier goed, maar niet stabiel genoeg: 503 "high demand", gratis modellen worden ingetrokken (404), modelnamen veranderen |
| 3 | **Claude vision** direct vanuit de browser (eigen sleutel, test) | Werkt als testopzet, maar de sleutel staat dan op elk apparaat |
| 4 | **Azure OpenAI** via Supabase Edge Function | Gekozen: stabiele API met SLA, EU-regio mogelijk, sleutel blijft server-side |
| – | Azure Document Intelligence (klassieke OCR) | Niet gekozen: geeft regels tekst, geen velden; zou veel koppellogica vragen |

Waarom een **vision-LLM** en geen klassieke OCR: het formulier heeft een vaste indeling, handschrift en vaktermen
(CD34+, MACS, REAfinity). Een LLM geeft direct de zeven velden terug en begrijpt context.

## Architectuur van het uitlezen
- **Edge Function als tussenstation** (`supabase/functions/scan-form`): de Azure-sleutel mag niet in de publieke JavaScript, en de browser mag Azure meestal niet rechtstreeks aanroepen (CORS).
- **Toegangscode** (`SCAN_ACCESS_CODE` + veld in Instellingen): de function draait zonder JWT-controle (onze Supabase-sleutel is geen JWT), dus iedereen met de URL zou anders het Azure-budget kunnen verbruiken. De code staat alleen in `localStorage` van de telefoon en niet in de bundel. Dit is beperkte bescherming, geen echte authenticatie.
- **Strict JSON-schema** (`response_format: json_schema, strict`): vaste veldnamen en types; geen vrije tekst om te parsen.
- **Prompt beschrijft de indeling van het formulier** (label → veld, volgorde, wat te negeren). Zo komt tekst in het juiste veld terecht, en mag het model niets "opvullen" in een ander veld.
- **Sanitize na uitlezen** (`sanitizeExtracted` in `ocrEngine.ts`): verwijdert meegekopieerde gedrukte labels en haalt een misplaatst e-mailadres uit een ander veld.
- **`reasoning_effort: low`** en automatisch opnieuw zonder die parameter als het model hem weigert: overschrijven van handschrift heeft weinig "denken" nodig; dat scheelt veel wachttijd.
- **Foto op 1536px, kwaliteit 0,8** naar het model: scherp genoeg voor handschrift, klein genoeg voor mobiel netwerk.
- **Posities per veld uit het model** (bounding boxes, schaal 0–1000) voor de uitsneden in het reviewscherm. De eerdere vaste coördinaten klopten niet bij echte (scheve) foto's.
- **`ENGINES`-schakelaar** (`src/lib/ocrEngine.ts`): Azure aan, Claude en Gemini uit, maar de code bleef staan als reserve. Op verzoek: alleen Azure testen.
- **Foutmeldingen met reden** in het reviewscherm (en het formulier blijft bruikbaar met lege velden) in plaats van stil terugvallen op slechte OCR.

## Werkwijze
- Wijzigingen eerst op de featurebranch, daarna fast-forward naar `main` omdat de deploy alleen vanaf `main` loopt.
- Sleutels nooit in de repo: GitHub-secrets voor build, Supabase-secrets voor de function, `localStorage` voor de toegangscode.
- Geen pull requests gebruikt; direct naar `main` (klein project, één persoon).
