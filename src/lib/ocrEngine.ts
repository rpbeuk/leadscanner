import type { Lead, ConfidenceFlag } from '../types';
import { matchCrmAccount } from './crmAccounts';
import { resizeImageForMobile } from './imageUtils';
import { supabaseUrl, supabaseAnonKey } from './supabase';

export const ENGINES = { azure: true, claude: false, gemini: false };

type FieldKey = 'first_name' | 'last_name' | 'email' | 'institute' | 'department' | 'notes';
const FIELD_KEYS: FieldKey[] = ['first_name', 'last_name', 'email', 'institute', 'department', 'notes'];
type Box = [number, number, number, number];

type Extracted = {
  first_name: string;
  last_name: string;
  email: string;
  institute: string;
  department: string;
  notes: string;
  newsletter_opt_in: boolean;
  confidence_flags: ConfidenceFlag[];
  boxes: Partial<Record<FieldKey, Box>>;
};

const KEY_GEMINI = 'miltenyi_gemini_api_key';
const KEY_ACCESS = 'miltenyi_scan_access_code';
const KEY_CLAUDE = 'miltenyi_claude_api_key';

export function getSavedGeminiKey(): string {
  return localStorage.getItem(KEY_GEMINI) || import.meta.env.VITE_GEMINI_API_KEY || '';
}
export function saveGeminiKey(key: string): void {
  localStorage.setItem(KEY_GEMINI, key.trim());
}

export function getSavedAccessCode(): string {
  return localStorage.getItem(KEY_ACCESS) || '';
}
export function saveAccessCode(code: string): void {
  localStorage.setItem(KEY_ACCESS, code.trim());
}

export function getSavedClaudeKey(): string {
  return localStorage.getItem(KEY_CLAUDE) || '';
}
export function saveClaudeKey(key: string): void {
  localStorage.setItem(KEY_CLAUDE, key.trim());
}

export function validateEmailMatch(
  email: string,
  firstName: string,
  lastName: string
): { warning: boolean; reason?: string } {
  if (!email || !email.includes('@')) {
    return { warning: true, reason: 'Geen geldig e-mailadres gedetecteerd' };
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanFirst = firstName.toLowerCase().trim().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().trim().replace(/[^a-z]/g, '');

  const [localPart, domain] = cleanEmail.split('@');
  if (!domain || !domain.includes('.')) {
    return { warning: true, reason: 'Domeinnaam van e-mailadres ontbreekt' };
  }

  const firstInitial = cleanFirst.length > 0 ? cleanFirst[0] : '';
  const hasLast = cleanLast.length > 2 && localPart.includes(cleanLast);
  const hasFirst = cleanFirst.length > 2 && localPart.includes(cleanFirst);
  const hasInitialAndLast = firstInitial && cleanLast.length > 2 && localPart.includes(firstInitial + cleanLast);

  if (cleanFirst && cleanLast && !hasLast && !hasFirst && !hasInitialAndLast) {
    return {
      warning: true,
      reason: `E-mail '${email}' lijkt af te wijken van ${firstName} ${lastName}. Controleer a.u.b.`
    };
  }

  return { warning: false };
}

async function generateFieldCrops(
  imageDataUrl: string,
  boxes: Partial<Record<FieldKey, Box>>
): Promise<Partial<Record<FieldKey, string>>> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve({});
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const crops: Partial<Record<FieldKey, string>> = {};

      for (const key of FIELD_KEYS) {
        const box = boxes[key];
        if (!box || box.length !== 4 || box.some((n) => typeof n !== 'number')) continue;

        const [ymin, xmin, ymax, xmax] = box;
        const padY = 12;
        const padX = 12;

        const sx = Math.max(0, Math.floor(((xmin - padX) / 1000) * width));
        const sy = Math.max(0, Math.floor(((ymin - padY) / 1000) * height));
        const ex = Math.min(width, Math.ceil(((xmax + padX) / 1000) * width));
        const ey = Math.min(height, Math.ceil(((ymax + padY) / 1000) * height));
        const sw = ex - sx;
        const sh = ey - sy;

        if (sw < 10 || sh < 10) continue;

        try {
          const canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          crops[key] = canvas.toDataURL('image/jpeg', 0.85);
        } catch (error) {
          console.warn('Crop failed for', key, error);
        }
      }

      resolve(crops);
    };
    img.src = imageDataUrl;
  });
}

const GEMINI_PROMPT = `You are an expert handwriting transcription model analyzing a photographed "Miltenyi Biotec Contact Form" (printed labels, handwritten answers).
The photo may be rotated, skewed or taken at an angle. Locate the fields yourself.
Transcribe ONLY the handwritten answers, verbatim. NEVER include the printed labels
(e.g. "First Name", "Email", "University/Institution/Company", "Department", "How can we support you with your research?").
Do NOT paraphrase, correct or invent. Preserve abbreviations (MACS, CAR-T, PBMC, REAfinity, ...) and line breaks in the notes.
If a field is empty or unreadable, return an empty string.
Emails: no spaces, lowercase. Newsletter: true only if the checkbox is clearly ticked.
For every field also return in "boxes" the tight bounding box of the HANDWRITTEN answer only (not the printed label), as [ymin, xmin, ymax, xmax] on a 0-1000 scale relative to the photo.
In confidence_flags list individual words you are unsure about (confidence 0-1).`;

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    first_name: { type: 'STRING' },
    last_name: { type: 'STRING' },
    email: { type: 'STRING' },
    institute: { type: 'STRING' },
    department: { type: 'STRING' },
    notes: { type: 'STRING' },
    newsletter_opt_in: { type: 'BOOLEAN' },
    boxes: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        ['first_name', 'last_name', 'email', 'institute', 'department', 'notes'].map((k) => [
          k,
          { type: 'ARRAY', items: { type: 'INTEGER' } }
        ])
      )
    },
    confidence_flags: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          field: { type: 'STRING' },
          word: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          reason: { type: 'STRING' }
        },
        required: ['field', 'word', 'confidence']
      }
    }
  },
  required: ['first_name', 'last_name', 'email', 'institute', 'department', 'notes', 'newsletter_opt_in']
};

type OcrAttemptResult = { data?: Extracted; error?: string };

async function extractWithGemini(
  base64Image: string,
  apiKey: string
): Promise<OcrAttemptResult> {
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const models = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: GEMINI_PROMPT },
                    { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }
                  ]
                }
              ],
              generationConfig: {
                response_mime_type: 'application/json',
                response_schema: GEMINI_SCHEMA,
                temperature: 0,
                thinkingConfig: { thinkingBudget: 0 }
              }
            }),
            signal: AbortSignal.timeout(25000)
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = `Gemini ${res.status}: ${body?.error?.message || res.statusText}`;
          if (res.status === 401 || res.status === 403) return { error: message };
          if (res.status === 404) break;
          if (res.status === 400) {
            if ((res as any).bodyUsed === false) {
              // handled by re-trying after dropping thinkingConfig if needed
            }
            break;
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          break;
        }

        const parsed = JSON.parse(text.trim());
        return {
          data: {
            first_name: parsed.first_name || '',
            last_name: parsed.last_name || '',
            email: parsed.email || '',
            institute: parsed.institute || '',
            department: parsed.department || '',
            notes: parsed.notes || '',
            newsletter_opt_in: !!parsed.newsletter_opt_in,
            confidence_flags: parsed.confidence_flags || [],
            boxes: parsed.boxes || {}
          }
        };
      } catch (err) {
        console.warn('Gemini OCR failed', err);
      }
    }
  }

  return { error: 'Gemini extraction failed' };
}

async function extractWithClaude(
  base64Image: string,
  apiKey: string
): Promise<OcrAttemptResult> {
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const models = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'];

  const schema = {
    type: 'object',
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
        properties: Object.fromEntries(
          FIELD_KEYS.map((k) => [k, { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 }])
        )
      },
      confidence_flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            word: { type: 'string' },
            confidence: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['field', 'word', 'confidence']
        }
      }
    },
    required: ['first_name', 'last_name', 'email', 'institute', 'department', 'notes', 'newsletter_opt_in']
  };

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            temperature: 0,
            tool_choice: { type: 'tool', name: 'record_form' },
            tools: [
              {
                name: 'record_form',
                description: 'Record the transcribed contact form',
                input_schema: schema
              }
            ],
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: cleanBase64 } },
                  { type: 'text', text: GEMINI_PROMPT }
                ]
              }
            ]
          }),
          signal: AbortSignal.timeout(40000)
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = `Claude ${res.status}: ${body?.error?.message || res.statusText}`;
          if (res.status === 401 || res.status === 403) return { error: message };
          if (res.status === 404 || res.status === 400) break;
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        const data = await res.json();
        const parsed = data?.content?.find((c: { type: string }) => c.type === 'tool_use')?.input;
        if (!parsed) {
          break;
        }

        return {
          data: {
            first_name: parsed.first_name || '',
            last_name: parsed.last_name || '',
            email: parsed.email || '',
            institute: parsed.institute || '',
            department: parsed.department || '',
            notes: parsed.notes || '',
            newsletter_opt_in: !!parsed.newsletter_opt_in,
            confidence_flags: parsed.confidence_flags || [],
            boxes: parsed.boxes || {}
          }
        };
      } catch (err) {
        console.warn('Claude OCR failed', err);
      }
    }
  }

  return { error: 'Claude extraction failed' };
}

const OCR_FUNCTION_NAME = import.meta.env.VITE_OCR_FUNCTION_NAME || 'smooth-worker';

async function extractWithAzure(
  base64Image: string,
  accessCode: string
): Promise<OcrAttemptResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${OCR_FUNCTION_NAME}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: supabaseAnonKey,
        'x-access-code': accessCode
      },
      body: JSON.stringify({ image: base64Image }),
      signal: AbortSignal.timeout(55000)
    });

    const body = await res.json().catch(() => null);

    if (!res.ok || !body) {
      return { error: `Azure ${res.status}: ${body?.error || res.statusText}` };
    }

    return {
      data: {
        first_name: body.first_name || '',
        last_name: body.last_name || '',
        email: body.email || '',
        institute: body.institute || '',
        department: body.department || '',
        notes: body.notes || '',
        newsletter_opt_in: !!body.newsletter_opt_in,
        confidence_flags: body.confidence_flags || [],
        boxes: body.boxes || {}
      }
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      error: /failed to fetch|networkerror|load failed/i.test(msg)
        ? 'Azure: function niet bereikt (niet uitgerold, "Verify JWT" staat aan, of geen internet)'
        : `Azure: ${msg}`
    };
  }
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LABEL_PREFIXES: Record<string, RegExp> = {
  first_name: /^\s*first\s*name\s*\*?\s*[:\-]?\s*/i,
  last_name: /^\s*last\s*name\s*\*?\s*[:\-]?\s*/i,
  email: /^\s*e-?mail\s*\*?\s*[:\-]?\s*/i,
  institute: /^\s*(university\s*\/?\s*institution\s*\/?\s*company|university|institution|company)\s*[:\-]?\s*/i,
  department: /^\s*department\s*[:\-]?\s*/i,
  notes: /^\s*how can we support you with your research\s*\??\s*/i
};

function sanitizeExtracted(extracted: Extracted): Extracted {
  const out = { ...extracted };

  for (const key of Object.keys(LABEL_PREFIXES) as Array<keyof typeof LABEL_PREFIXES>) {
    const k = key as FieldKey;
    out[k] = (out[k] || '').replace(LABEL_PREFIXES[key], '').trim();
  }

  if (!EMAIL_RE.test(out.email)) {
    for (const k of ['notes', 'institute', 'department', 'first_name', 'last_name'] as const) {
      const match = out[k].match(EMAIL_RE);
      if (match) {
        out.email = match[0];
        out[k] = out[k].replace(match[0], '').trim();
        break;
      }
    }
  }

  return out;
}

function getOcrAttempts(imageDataUrl: string): Array<() => Promise<OcrAttemptResult>> {
  const attempts: Array<() => Promise<OcrAttemptResult>> = [];
  const accessCode = getSavedAccessCode();
  const claudeKey = getSavedClaudeKey();
  const geminiKey = getSavedGeminiKey();

  if (ENGINES.azure && accessCode) attempts.push(() => extractWithAzure(imageDataUrl, accessCode));
  if (ENGINES.claude && claudeKey) attempts.push(() => extractWithClaude(imageDataUrl, claudeKey));
  if (ENGINES.gemini && geminiKey) attempts.push(() => extractWithGemini(imageDataUrl, geminiKey));

  return attempts;
}

async function extractLeadFromImage(rawImageDataUrl: string): Promise<{ extracted: Extracted; engineError?: string }> {
  const safeImageDataUrl = await resizeImageForMobile(rawImageDataUrl, 1536);
  const attempts = getOcrAttempts(safeImageDataUrl);
  const errors: string[] = [];

  let extracted: Extracted = {
    first_name: '',
    last_name: '',
    email: '',
    institute: '',
    department: '',
    notes: '',
    newsletter_opt_in: false,
    confidence_flags: [],
    boxes: {}
  };

  for (const attempt of attempts) {
    const result = await attempt();
    if (result.data) {
      extracted = result.data;
      break;
    }
    if (result.error) {
      errors.push(result.error);
    }
  }

  const engineError =
    attempts.length === 0
      ? 'Geen toegangscode of API-sleutel ingesteld (Instellingen). Vul de velden handmatig in.'
      : errors.length > 0
        ? `Automatisch uitlezen mislukt (${errors.join(' | ')}). Vul de velden handmatig in.`
        : undefined;

  const normalized = sanitizeExtracted(extracted);
  normalized.email = normalized.email.replace(/\s+/g, '').toLowerCase();

  return {
    extracted: normalized,
    engineError
  };
}

export async function processFormImage(
  rawImageDataUrl: string,
  campaignId: string,
  collectedBy: string
): Promise<Lead> {
  const { extracted, engineError } = await extractLeadFromImage(rawImageDataUrl);
  const emailCheck = engineError
    ? { warning: true, reason: engineError }
    : validateEmailMatch(extracted.email, extracted.first_name, extracted.last_name);

  const crops = await generateFieldCrops(rawImageDataUrl, extracted.boxes);
  const crmMatch = matchCrmAccount(extracted.institute, extracted.department);

  return {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    collected_by: collectedBy,
    first_name: extracted.first_name,
    last_name: extracted.last_name,
    email: extracted.email,
    institute: extracted.institute,
    department: extracted.department,
    notes: extracted.notes,
    newsletter_opt_in: extracted.newsletter_opt_in,
    account_id: crmMatch?.account.id,
    matched_account_level: crmMatch?.matchLevel || null,
    email_warning: emailCheck.warning,
    email_warning_reason: emailCheck.reason,
    confidence_flags: extracted.confidence_flags,
    field_crops: crops,
    image_url: rawImageDataUrl,
    status: 'draft',
    synced_to_cloud: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}
