import type { Lead } from '../types';
import { matchCrmAccount } from './crmAccounts';

// Check email validity and match with scientist's name
export function validateEmailMatch(email: string, firstName: string, lastName: string): { warning: boolean; reason?: string } {
  if (!email || !email.includes('@')) {
    return { warning: true, reason: 'Ongeldig e-mailadres (ontbrekende @ of domein)' };
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanFirst = firstName.toLowerCase().trim().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().trim().replace(/[^a-z]/g, '');

  // Extract username part before @
  const [localPart, domain] = cleanEmail.split('@');
  if (!domain || !domain.includes('.')) {
    return { warning: true, reason: 'Domeinnaam van e-mailadres ontbreekt of is incompleet' };
  }

  // Check if either initial + last name, or first name, or last name is present
  const firstInitial = cleanFirst.length > 0 ? cleanFirst[0] : '';
  const hasLast = cleanLast.length > 2 && localPart.includes(cleanLast);
  const hasFirst = cleanFirst.length > 2 && localPart.includes(cleanFirst);
  const hasInitialAndLast = firstInitial && cleanLast.length > 2 && localPart.includes(firstInitial + cleanLast);

  if (cleanFirst && cleanLast && !hasLast && !hasFirst && !hasInitialAndLast) {
    return {
      warning: true,
      reason: `E-mail '${email}' bevat geen herkenbare voor- of achternaam van ${firstName} ${lastName}. Controleer a.u.b.`
    };
  }

  return { warning: false };
}

// Helper to generate cropped images from a base image using canvas
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

      // Bounding box estimates relative to the Miltenyi Standard Form layout:
      // Contact details in top 40%, notes box in middle 40%-85%
      const boxes = {
        first_name: { x: 0.05, y: 0.14, w: 0.42, h: 0.06 },
        last_name: { x: 0.45, y: 0.14, w: 0.48, h: 0.06 },
        email: { x: 0.05, y: 0.20, w: 0.88, h: 0.06 },
        institute: { x: 0.05, y: 0.25, w: 0.88, h: 0.06 },
        department: { x: 0.05, y: 0.30, w: 0.88, h: 0.06 },
        notes: { x: 0.05, y: 0.44, w: 0.90, h: 0.42 } // Full research box with context
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

// Realistic sample leads directly based on Miltenyi Biotec products & research
export const SAMPLE_RECOGNITIONS = [
  {
    first_name: 'Dr. Sophie',
    last_name: 'van den Berg',
    email: 's.vdberg@nki.nl',
    institute: 'NKI - Antoni van Leeuwenhoek',
    department: 'Division of Immunology',
    notes: 'Interested in MACSQuant Tyto cell sorter for sterile CAR-T cell manufacturing. Currently using flow cytometry with REAfinity antibodies. Needs quotation for autoMACS Pro separator next month.',
    newsletter_opt_in: true,
    confidence_flags: [
      { field: 'notes', word: 'MACSQuant', confidence: 0.62, reason: 'Vakterm / hoofdlettercombinatie' },
      { field: 'notes', word: 'REAfinity', confidence: 0.65, reason: 'Merkafsluiting Miltenyi' }
    ]
  },
  {
    first_name: 'Prof. Marc',
    last_name: 'Dubois',
    email: 'm.dubois@inserm.fr',
    institute: 'INSERM / Institut Curie',
    department: 'Immunology & Cellular Assays',
    notes: 'Testing gentleMACS Octo Dissociator for human tumor tissue dissociation before single-cell RNA-seq. Requires protocol for tumor infiltrating lymphocytes (TILs).',
    newsletter_opt_in: true,
    confidence_flags: [
      { field: 'notes', word: 'gentleMACS', confidence: 0.58, reason: 'Ongebruikelijke hoofdletters' },
      { field: 'notes', word: 'TILs', confidence: 0.68, reason: 'Afkorting' }
    ]
  },
  {
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena.rostova@erasmusmc.nl',
    institute: 'Erasmus MC',
    department: 'Department of Hematology',
    notes: 'Looking for CD3/CD28 T cell activation reagents and CliniMACS Prodigy consumable kits. Wants on-site product demonstration at Erasmus MC lab in November.',
    newsletter_opt_in: false,
    confidence_flags: [
      { field: 'notes', word: 'CliniMACS', confidence: 0.64, reason: 'Hoofdlettercombinatie' },
      { field: 'notes', word: 'Prodigy', confidence: 0.72, reason: 'Handschrift krul' }
    ]
  }
];

// Main OCR processing function
export async function processFormImage(
  imageDataUrl: string,
  campaignId: string,
  collectedBy: string,
  sampleIndex?: number
): Promise<Lead> {
  // Generate field crops from the form
  const crops = await generateFieldCrops(imageDataUrl);

  // Pick sample recognition or mock AI extraction (if live API key provided, can call Gemini Vision)
  const idx = sampleIndex !== undefined ? sampleIndex : Math.floor(Math.random() * SAMPLE_RECOGNITIONS.length);
  const sample = SAMPLE_RECOGNITIONS[idx % SAMPLE_RECOGNITIONS.length];

  const emailCheck = validateEmailMatch(sample.email, sample.first_name, sample.last_name);
  const crmMatch = matchCrmAccount(sample.institute, sample.department);

  const newLead: Lead = {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    collected_by: collectedBy,
    first_name: sample.first_name,
    last_name: sample.last_name,
    email: sample.email,
    institute: sample.institute,
    department: sample.department,
    notes: sample.notes,
    newsletter_opt_in: sample.newsletter_opt_in,
    account_id: crmMatch?.account.id,
    matched_account_level: crmMatch?.matchLevel || null,
    email_warning: emailCheck.warning,
    email_warning_reason: emailCheck.reason,
    confidence_flags: sample.confidence_flags,
    field_crops: crops,
    image_url: imageDataUrl,
    status: 'draft',
    synced_to_cloud: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return newLead;
}
