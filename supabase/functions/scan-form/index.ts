// Supabase Edge Function: reads a photographed contact form with Azure OpenAI vision.
// The Azure key never reaches the browser.
//
// Secrets (supabase secrets set ...):
//   AZURE_OPENAI_ENDPOINT    e.g. https://leadscanneroai.openai.azure.com
//   AZURE_OPENAI_KEY
//   AZURE_OPENAI_DEPLOYMENT  the deployment name chosen in Foundry
//   SCAN_ACCESS_CODE         shared code the app sends (blocks strangers from burning budget)
//
// Deploy with: supabase functions deploy scan-form --no-verify-jwt

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-access-code, authorization, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const FIELDS = ['first_name', 'last_name', 'email', 'institute', 'department', 'notes'];

const PROMPT = `You receive a photo of a lead form in a fixed, standard layout (the "Miltenyi Biotec Contact Form"). Recognize the handwritten text and return it as JSON with these 7 fields: first_name, last_name, email, institute, department, notes, newsletter_opt_in.

LAYOUT (top to bottom). Each printed label is followed, to its right, by the handwritten answer for THAT label only:
1. Title "Contact form" with the Miltenyi Biotec logo (ignore; a small handwritten number in a top corner is a form number: ignore it).
2. One row with two fields: "First Name*" (left) -> first_name, and "Last Name*" (right of it) -> last_name.
3. "Email*" -> email.
4. "University/Institution/Company" -> institute.
5. "Department" -> department.
6. The printed question "How can we support you with your research?" followed by a large rectangle -> notes. Put ALL handwriting inside that rectangle in notes, in reading order, keeping line breaks. Text may stray over the rectangle's border: still notes.
7. At the bottom a small checkbox with the text "Yes, I want to receive scientific news, product promotions... sign me up for the newsletter" -> newsletter_opt_in (true only if the checkbox is clearly ticked, otherwise false).

RULES
- Transcribe verbatim. Do NOT paraphrase, translate, correct spelling or invent. Keep abbreviations (MACS, CAR-T, PBMC, REAfinity, CD34+, LS, MS...) exactly as written.
- NEVER copy printed text (labels, the question, the newsletter sentence) into any field.
- Every answer belongs in exactly one field. If a field is empty or unreadable, return "" for it. Do not move text from one field to another to fill a gap.
- email: no spaces, lowercase, must contain @ if legible.
- The photo may be rotated, skewed or taken at an angle. Find the fields by their printed labels, not by fixed positions.
- For every field also return in "boxes" the tight bounding box of the HANDWRITTEN answer only (not the printed label), as [ymin, xmin, ymax, xmax] on a 0-1000 scale relative to the photo. For notes, box all handwriting in the rectangle. Use an empty array for an empty field.
- In confidence_flags list individual words you are unsure about (confidence 0-1).`;

// Strict mode: every property required, no optional keys
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    email: { type: 'string' },
    institute: { type: 'string' },
    department: { type: 'string' },
    notes: { type: 'string' },
    newsletter_opt_in: { type: 'boolean' },
    boxes: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(FIELDS.map((k) => [k, { type: 'array', items: { type: 'integer' } }])),
      required: FIELDS
    },
    confidence_flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          word: { type: 'string' },
          confidence: { type: 'number' },
          reason: { type: 'string' }
        },
        required: ['field', 'word', 'confidence', 'reason']
      }
    }
  },
  required: ['first_name', 'last_name', 'email', 'institute', 'department', 'notes', 'newsletter_opt_in', 'boxes', 'confidence_flags']
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const endpoint = (Deno.env.get('AZURE_OPENAI_ENDPOINT') || '').replace(/\/+$/, '');
  const key = Deno.env.get('AZURE_OPENAI_KEY');
  const deployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT');
  const accessCode = Deno.env.get('SCAN_ACCESS_CODE');
  if (!endpoint || !key || !deployment || !accessCode) return json({ error: 'Function is not configured (missing secrets)' }, 500);

  if (req.headers.get('x-access-code') !== accessCode) return json({ error: 'Ongeldige toegangscode' }, 401);

  let image: string;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return json({ error: 'image must be a data URL' }, 400);

  const body: Record<string, unknown> = {
    model: deployment,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: image, detail: 'high' } }
        ]
      }
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'contact_form', strict: true, schema: SCHEMA } },
    max_completion_tokens: 4000,
    // Transcription needs little reasoning; keeps latency down on reasoning models.
    reasoning_effort: 'low'
  };

  const call = () =>
    fetch(`${endpoint}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50000)
    });

  try {
    let res = await call();
    // If the deployed model rejects reasoning_effort, retry once without it
    if (res.status === 400) {
      const text = await res.clone().text();
      if (/reasoning_effort/i.test(text)) {
        delete body.reasoning_effort;
        res = await call();
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return json({ error: `Azure ${res.status}: ${err?.error?.message || res.statusText}` }, 502);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Azure gaf geen resultaat terug' }, 502);
    return json(JSON.parse(content));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
