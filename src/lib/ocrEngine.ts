import type { Lead, ConfidenceFlag } from '../types';
import { matchCrmAccount } from './crmAccounts';
import { resizeImageForMobile } from './imageUtils';
import { supabaseUrl, supabaseAnonKey } from './supabase';

const KEY_GEMINI = 'miltenyi_gemini_api_key';

export function getSavedGeminiKey(): string {
  return localStorage.getItem(KEY_GEMINI) || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function saveGeminiKey(key: string): void {
  localStorage.setItem(KEY_GEMINI, key.trim());
}

const KEY_ACCESS = 'miltenyi_scan_access_code';

export function getSavedAccessCode(): string {
  return localStorage.getItem(KEY_ACCESS) || '';
}

export function saveAccessCode(code: string): void {
  localStorage.setItem(KEY_ACCESS, code.trim());
}

const KEY_CLAUDE = 'miltenyi_claude_api_key';

export function getSavedClaudeKey(): string {
  return localStorage.getItem(KEY_CLAUDE) || '';
}

export function saveClaudeKey(key: string): void {
  localStorage.setItem(KEY_CLAUDE, key.trim());
}

// Check email validity and match with scientist's name
export function validateEmailMatch(email: string, firstName: string, lastName: string): { warning: boolean; reason?: string } {
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

type FieldKey = 'first_name' | 'last_name' | 'email' | 'institute' | 'department' | 'notes';
const FIELD_KEYS: FieldKey[] = ['first_name', 'last_name', 'email', 'institute', 'department', 'notes'];
// [ymin, xmin, ymax, xmax] on a 0-1000 scale (Gemini's native box format)
type Box = [number, number, number, number];

// Crop each field out of the photo using the boxes Gemini located on the actual image,
// so crops stay correct when the photo is rotated, skewed or taken from a distance.
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
        // Pad a little so descenders/ascenders are not cut off
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
        } catch (e) {
          console.warn('Crop failed for', key, e);
        }
      }
      resolve(crops);
    };
    img.src = imageDataUrl;
  });
}

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

const GEMINI_PROMPT = `You are an expert handwriting transcription model analyzing a photographed "Miltenyi Biotec Contact Form" (printed labels, handwritten answers).
The photo may be rotated, skewed or taken at an angle. Locate the fields yourself.

Transcribe ONLY the handwritten answers, verbatim. NEVER include the printed labels
(e.g. "First Name", "Email", "University/Institution/Company", "Department", "How can we support you with your research?").
Do NOT paraphrase, correct or invent. Preserve abbreviations (MACS, CAR-T, PBMC, REAfinity, ...) and line breaks in the notes.
If a field is empty or unreadable, return an empty string.
Emails: no spaces, lowercase. Newsletter: true only if the checkbox is clearly ticked.
For every field also return in "boxes" the tight bounding box of the HANDWRITTEN answer only (not the printed label), as [ymin, xmin, ymax, xmax] on a 0-1000 scale relative to the photo. For notes, box the whole handwritten text area inside the rectangle. Omit a box for an empty field.
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

// Gemini Vision multimodal extraction. Returns the reason on failure so the UI can show it.
async function extractWithGemini(
  base64Image: string,
  apiKey: string
): Promise<{ data?: Extracted; error?: string }> {
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  // Tried in order; on 503/429 (overload) we back off briefly, on 404 (retired model) we move on
  const MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  const urlFor = (model: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    contents: [{ parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: cleanBase64 } }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: GEMINI_SCHEMA,
      temperature: 0,
      // Transcription needs no reasoning pass; skipping it cuts latency a lot
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  let lastError = 'onbekende fout';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(urlFor(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(25000)
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          lastError = `Gemini ${res.status}: ${body?.error?.message || res.statusText}`;
          if (res.status === 401 || res.status === 403) return { error: lastError }; // bad key: no point retrying
          if (res.status === 404) break; // model retired/unavailable: next model
          if (res.status === 400) {
            // Some models reject the thinking setting: drop it and retry once
            if (payload.generationConfig.thinkingConfig) {
              delete (payload.generationConfig as Record<string, unknown>).thinkingConfig;
              continue;
            }
            break;
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          lastError = 'Gemini gaf geen resultaat terug (geblokkeerd of leeg)';
          break; // try next model
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
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return { error: lastError };
}

// Claude Vision extraction (test setup: key lives in this browser only; move behind a server proxy for production)
async function extractWithClaude(
  base64Image: string,
  apiKey: string
): Promise<{ data?: Extracted; error?: string }> {
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const MODELS = ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'];
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

  let lastError = 'onbekende fout';
  for (const model of MODELS) {
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
            tools: [{ name: 'record_form', description: 'Record the transcribed contact form', input_schema: schema }],
            tool_choice: { type: 'tool', name: 'record_form' },
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
          lastError = `Claude ${res.status}: ${body?.error?.message || res.statusText}`;
          if (res.status === 401 || res.status === 403) return { error: lastError };
          if (res.status === 404 || res.status === 400) break; // model unavailable / bad request: next model
          if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
          continue;
        }

        const data = await res.json();
        const parsed = data?.content?.find((c: { type: string }) => c.type === 'tool_use')?.input;
        if (!parsed) {
          lastError = 'Claude gaf geen resultaat terug';
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
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }
  return { error: lastError };
}

// Azure OpenAI via the "scan-form" Supabase Edge Function (the Azure key stays server-side)
async function extractWithAzure(
  base64Image: string,
  accessCode: string
): Promise<{ data?: Extracted; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/scan-form`, {
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
    if (!res.ok || !body) return { error: `Azure ${res.status}: ${body?.error || res.statusText}` };
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
    // A network-level failure means the request never got an answer from the function:
    // not deployed, "Verify JWT" still on (blocks the CORS preflight), or no connection.
    return {
      error: /failed to fetch|networkerror|load failed/i.test(msg)
        ? 'Azure: function niet bereikt (niet uitgerold, "Verify JWT" staat aan, of geen internet)'
        : `Azure: ${msg}`
    };
  }
}

// Main entry point for processing any photographed/uploaded form
export async function processFormImage(
  rawImageDataUrl: string,
  campaignId: string,
  collectedBy: string
): Promise<Lead> {
  // 1. Resize/compress image to protect mobile browser memory
  const safeImageDataUrl = await resizeImageForMobile(rawImageDataUrl, 1536);

  // 3. Gemini Vision is the only engine that can read handwriting. Tesseract only
  //    produces noise on handwriting (and mixes in printed labels), so it is not used
  //    to fill fields; the user gets an explicit reason and enters the data manually.
  const accessCode = getSavedAccessCode();
  const claudeKey = getSavedClaudeKey();
  const geminiKey = getSavedGeminiKey();
  let extracted: Extracted = {
    first_name: '', last_name: '', email: '', institute: '', department: '',
    notes: '', newsletter_opt_in: false, confidence_flags: [], boxes: {}
  };
  const errors: string[] = [];
  let ok = false;

  // Order: Azure (server-side, stable) -> Claude -> Gemini. First success wins.
  const attempts: Array<() => Promise<{ data?: Extracted; error?: string }>> = [];
  if (accessCode) attempts.push(() => extractWithAzure(safeImageDataUrl, accessCode));
  if (claudeKey) attempts.push(() => extractWithClaude(safeImageDataUrl, claudeKey));
  if (geminiKey) attempts.push(() => extractWithGemini(safeImageDataUrl, geminiKey));

  for (const attempt of attempts) {
    const result = await attempt();
    if (result.data) {
      extracted = result.data;
      ok = true;
      break;
    }
    if (result.error) errors.push(result.error);
  }

  const engineError = ok
    ? undefined
    : attempts.length === 0
      ? 'Geen toegangscode of API-sleutel ingesteld (Instellingen). Vul de velden handmatig in.'
      : `Automatisch uitlezen mislukt (${errors.join(' | ')}). Vul de velden handmatig in.`;

  // 4. Normalise email, then run validation & CRM matching
  extracted.email = extracted.email.replace(/\s+/g, '').toLowerCase();
  const emailCheck = engineError
    ? { warning: true, reason: engineError }
    : validateEmailMatch(extracted.email, extracted.first_name, extracted.last_name);
  const crops = await generateFieldCrops(safeImageDataUrl, extracted.boxes);
  const crmMatch = matchCrmAccount(extracted.institute, extracted.department);

  const newLead: Lead = {
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
    image_url: safeImageDataUrl,
    status: 'draft',
    synced_to_cloud: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return newLead;
}
