import Tesseract from 'tesseract.js';
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

// Helper to generate cropped images from an image using HTML Canvas
export async function generateFieldCrops(imageSource: string | HTMLImageElement): Promise<{
  first_name?: string;
  last_name?: string;
  email?: string;
  institute?: string;
  department?: string;
  notes?: string;
}> {
  return new Promise((resolve) => {
    const img = typeof imageSource === 'string' ? new Image() : imageSource;
    img.crossOrigin = 'anonymous';

    const performCrop = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) return resolve({});

      // Bounding boxes matching the Miltenyi Biotec standard contact form layout
      const boxes = {
        first_name: { x: 0.04, y: 0.13, w: 0.44, h: 0.08 },
        last_name: { x: 0.46, y: 0.13, w: 0.50, h: 0.08 },
        email: { x: 0.04, y: 0.19, w: 0.92, h: 0.07 },
        institute: { x: 0.04, y: 0.25, w: 0.92, h: 0.07 },
        department: { x: 0.04, y: 0.31, w: 0.92, h: 0.07 },
        notes: { x: 0.04, y: 0.42, w: 0.92, h: 0.45 } // Full context of the research box
      };

      const crops: Record<string, string> = {};

      for (const [key, box] of Object.entries(boxes)) {
        try {
          const canvas = document.createElement('canvas');
          const sx = Math.floor(box.x * width);
          const sy = Math.floor(box.y * height);
          const sw = Math.floor(box.w * width);
          const sh = Math.floor(box.h * height);

          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            crops[key] = canvas.toDataURL('image/jpeg', 0.85);
          }
        } catch (e) {
          console.warn('Crop failed for', key, e);
        }
      }

      resolve(crops);
    };

    if (typeof imageSource === 'string') {
      img.onload = performCrop;
      img.onerror = () => resolve({});
      img.src = imageSource;
    } else {
      if (img.complete) {
        performCrop();
      } else {
        img.onload = performCrop;
      }
    }
  });
}

// Clean extracted strings by stripping printed label prefixes
function cleanFieldValue(raw: string, labelPrefixes: string[]): string {
  let text = raw.replace(/\r?\n/g, ' ').trim();
  for (const prefix of labelPrefixes) {
    const reg = new RegExp(`^${prefix}\\s*[:*\\-\\s]*`, 'i');
    text = text.replace(reg, '');
  }
  return text.trim();
}

// Gemini Vision multimodal extraction (if API key is present)
async function extractWithGemini(
  base64Image: string,
  apiKey: string
): Promise<{
  first_name: string;
  last_name: string;
  email: string;
  institute: string;
  department: string;
  notes: string;
  newsletter_opt_in: boolean;
  confidence_flags: ConfidenceFlag[];
} | null> {
  try {
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const prompt = `You are an expert handwriting transcription model analyzing a photographed "Miltenyi Biotec Contact Form".
Extract the handwritten information strictly verbatim into structured JSON.
Do NOT paraphrase or invent information. Preserve abbreviations (like MACS, CAR-T, PBMC, REAfinity, etc.) exactly as written.

The form has these sections:
1. First Name*
2. Last Name*
3. Email*
4. University/Institution/Company
5. Department
6. "How can we support you with your research?" (the big rectangle box)
7. Newsletter checkbox at the bottom (checked or unchecked)

Output ONLY valid raw JSON with this exact structure (no markdown, no backticks):
{
  "first_name": "...",
  "last_name": "...",
  "email": "...",
  "institute": "...",
  "department": "...",
  "notes": "...",
  "newsletter_opt_in": true,
  "confidence_flags": [
    { "field": "notes", "word": "example", "confidence": 0.6, "reason": "unclear writing" }
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: cleanBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn('Gemini vision API error:', res.statusText);
      return null;
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return null;

    const parsed = JSON.parse(candidateText.trim());
    return {
      first_name: parsed.first_name || '',
      last_name: parsed.last_name || '',
      email: parsed.email || '',
      institute: parsed.institute || '',
      department: parsed.department || '',
      notes: parsed.notes || '',
      newsletter_opt_in: !!parsed.newsletter_opt_in,
      confidence_flags: parsed.confidence_flags || []
    };
  } catch (err) {
    console.warn('Gemini extraction failed, falling back to Tesseract:', err);
    return null;
  }
}

// Client-side OCR extraction with Tesseract.js
async function extractWithTesseract(
  imageSource: string,
  crops: { [key: string]: string | undefined }
): Promise<{
  first_name: string;
  last_name: string;
  email: string;
  institute: string;
  department: string;
  notes: string;
  newsletter_opt_in: boolean;
  confidence_flags: ConfidenceFlag[];
}> {
  // If field crops exist, run OCR targeted per crop for higher accuracy!
  let firstName = '';
  let lastName = '';
  let email = '';
  let institute = '';
  let department = '';
  let notes = '';

  const flags: ConfidenceFlag[] = [];

  try {
    // 1. OCR on individual crops
    if (crops.first_name) {
      const res = await Tesseract.recognize(crops.first_name, 'eng');
      firstName = cleanFieldValue(res.data.text, ['first name', 'first', 'voornaam']);
    }

    if (crops.last_name) {
      const res = await Tesseract.recognize(crops.last_name, 'eng');
      lastName = cleanFieldValue(res.data.text, ['last name', 'last', 'achternaam']);
    }

    if (crops.email) {
      const res = await Tesseract.recognize(crops.email, 'eng');
      const text = cleanFieldValue(res.data.text, ['email', 'e-mail']);
      const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      email = match ? match[0] : text;
    }

    if (crops.institute) {
      const res = await Tesseract.recognize(crops.institute, 'eng');
      institute = cleanFieldValue(res.data.text, ['university', 'institution', 'company', 'instituut']);
    }

    if (crops.department) {
      const res = await Tesseract.recognize(crops.department, 'eng');
      department = cleanFieldValue(res.data.text, ['department', 'afdeling']);
    }

    if (crops.notes) {
      const res = await Tesseract.recognize(crops.notes, 'eng');
      notes = cleanFieldValue(res.data.text, [
        'how can we support you with your research',
        'how can we support',
        'research'
      ]);

      // Collect low confidence words from Tesseract
      const wordsList = (res.data as any).words || [];
      wordsList.forEach((w: any) => {
        if (w.confidence < 70 && w.text && w.text.length > 2) {
          flags.push({
            field: 'notes',
            word: w.text,
            confidence: (w.confidence || 50) / 100,
            reason: 'Lage herkenningszekerheid'
          });
        }
      });
    }
  } catch (err) {
    console.warn('Individual crop OCR failed, attempting full page recognition:', err);
    // Fallback: run on whole image
    const fullRes = await Tesseract.recognize(imageSource, 'eng');
    notes = fullRes.data.text;
  }

  return {
    first_name: firstName,
    last_name: lastName,
    email: email,
    institute: institute,
    department: department,
    notes: notes,
    newsletter_opt_in: false,
    confidence_flags: flags
  };
}

// Main entry point for processing any photographed/uploaded form
export async function processFormImage(
  rawImageDataUrl: string,
  campaignId: string,
  collectedBy: string
): Promise<Lead> {
  // 1. Resize/compress image to protect mobile browser memory
  const safeImageDataUrl = await resizeImageForMobile(rawImageDataUrl);

  // 2. Generate field crops
  const crops = await generateFieldCrops(safeImageDataUrl);

  // 3. Check if Gemini API Key is available for high-accuracy vision AI
  const geminiKey = getSavedGeminiKey();
  let extracted: {
    first_name: string;
    last_name: string;
    email: string;
    institute: string;
    department: string;
    notes: string;
    newsletter_opt_in: boolean;
    confidence_flags: ConfidenceFlag[];
  } | null = null;

  if (geminiKey) {
    extracted = await extractWithGemini(safeImageDataUrl, geminiKey);
  }

  // 4. If no Gemini or Gemini failed, use Tesseract client-side OCR
  if (!extracted) {
    extracted = await extractWithTesseract(safeImageDataUrl, crops);
  }

  // 5. Run validation & CRM matching
  const emailCheck = validateEmailMatch(extracted.email, extracted.first_name, extracted.last_name);
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
