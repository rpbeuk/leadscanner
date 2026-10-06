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

const PROMPT = `You are an expert handwriting transcription model analyzing a photographed "Miltenyi Biotec Contact Form" (printed labels, handwritten answers).
The photo may be rotated, skewed or taken at an angle. Locate the fields yourself.

Transcribe ONLY the handwritten answers, verbatim. NEVER include the printed labels
(e.g. "First Name", "Email", "University/Institution/Company", "Department", "How can we support you with your research?").
Do NOT paraphrase, correct or invent. Preserve abbreviations (MACS, CAR-T, PBMC, REAfinity, ...) and line breaks in the notes.
If a field is empty or unreadable, return an empty string.
Emails: no spaces, lowercase. Newsletter: true only if the checkbox is clearly ticked.
For every field also return in "boxes" the tight bounding box of the HANDWRITTEN answer only (not the printed label), as [ymin, xmin, ymax, xmax] on a 0-1000 scale relative to the photo. For notes, box the whole handwritten text area inside the rectangle. Use an empty array for an empty field.
In confidence_flags list individual words you are unsure about (confidence 0-1).`;

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
