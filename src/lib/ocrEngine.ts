import type { Lead, ConfidenceFlag } from '../types';
import { matchCrmAccount } from './crmAccounts';
import { resizeImageForMobile } from './imageUtils';

const KEY_GEMINI = 'miltenyi_gemini_api_key';

export function getSavedGeminiKey(): string {
  return localStorage.getItem(KEY_GEMINI) || import.meta.env.VITE_GEMINI_API_KEY || '';
}

export function saveGeminiKey(key: string): void {
  localStorage.setItem(KEY_GEMINI, key.trim());
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        lastError = `Gemini ${res.status}: ${body?.error?.message || res.statusText}`;
        // Retry only on rate limit / server errors
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        return { error: lastError };
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return { error: 'Gemini gaf geen resultaat terug (geblokkeerd of leeg)' };

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
  return { error: lastError };
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
  const geminiKey = getSavedGeminiKey();
  let extracted: Extracted = {
    first_name: '', last_name: '', email: '', institute: '', department: '',
    notes: '', newsletter_opt_in: false, confidence_flags: [], boxes: {}
  };
  let engineError: string | undefined;

  if (!geminiKey) {
    engineError = 'Geen Gemini API-sleutel ingesteld (Instellingen). Vul de velden handmatig in.';
  } else {
    const result = await extractWithGemini(safeImageDataUrl, geminiKey);
    if (result.data) extracted = result.data;
    else engineError = `Automatisch uitlezen mislukt (${result.error}). Vul de velden handmatig in.`;
  }

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
