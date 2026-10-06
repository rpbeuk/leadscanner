import type { Lead } from '../types';
import { matchCrmAccount } from './crmAccounts';
import { resizeImageForMobile } from './imageUtils';

// Check email validity and match with scientist's name
export function validateEmailMatch(email: string, firstName: string, lastName: string): { warning: boolean; reason?: string } {
  if (!email || !email.includes('@')) {
    return { warning: true, reason: 'Ongeldig e-mailadres (ontbrekende @ of domein)' };
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanFirst = firstName.toLowerCase().trim().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().trim().replace(/[^a-z]/g, '');

  const [localPart, domain] = cleanEmail.split('@');
  if (!domain || !domain.includes('.')) {
    return { warning: true, reason: 'Domeinnaam van e-mailadres ontbreekt of is incompleet' };
  }

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
        first_name: { x: 0.05, y: 0.14, w: 0.42, h: 0.07 },
        last_name: { x: 0.45, y: 0.14, w: 0.48, h: 0.07 },
        email: { x: 0.05, y: 0.20, w: 0.88, h: 0.06 },
        institute: { x: 0.05, y: 0.26, w: 0.88, h: 0.06 },
        department: { x: 0.05, y: 0.32, w: 0.88, h: 0.06 },
        notes: { x: 0.05, y: 0.42, w: 0.90, h: 0.45 } // Full context of the research box!
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

// 4 Distinct Real-World Test Profiles
export const TEST_PROFILES = [
  {
    title: 'NKI Amsterdam — Dr. Sophie van den Berg',
    description: 'CAR-T celproductie, MACSQuant Tyto sorter & autoMACS',
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
    title: 'INSERM Parijs — Prof. Marc Dubois',
    description: 'Tumor weefsel dissociatie, gentleMACS Octo & TILs',
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
    title: 'Erasmus MC — Elena Rostova',
    description: 'CliniMACS Prodigy consumable kits, demo aanvraag',
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena.rostova@erasmusmc.nl',
    institute: 'Erasmus MC',
    department: 'Department of Hematology',
    notes: 'Looking for CD3/CD28 T cell activation reagents and CliniMACS Prodigy consumable kits. Wants on-site product demonstration at Erasmus MC lab in November.',
    newsletter_opt_in: false,
    confidence_flags: [
      { field: 'notes', word: 'CliniMACS', confidence: 0.64, reason: 'Hoofdlettercombinatie' }
    ]
  },
  {
    title: 'LUMC Leiden — Dr. Thomas Bakker (Met E-mail Warning)',
    description: 'Testcase met afwijkende e-mail voor waarschuwingstest',
    first_name: 'Dr. Thomas',
    last_name: 'Bakker',
    email: 'lab.research99@lumc.nl', // Does not match Thomas Bakker!
    institute: 'LUMC',
    department: 'Center for Infectious Diseases',
    notes: 'Requires magnetic cell isolation kits for human PBMC separation. Wants evaluation sample of MicroBeads for CD4+ and CD8+ T cells.',
    newsletter_opt_in: true,
    confidence_flags: [
      { field: 'notes', word: 'MicroBeads', confidence: 0.61, reason: 'Miltenyi handelsnaam' },
      { field: 'notes', word: 'PBMC', confidence: 0.70, reason: 'Biomedische afkorting' }
    ]
  }
];

// Generates an authentic canvas representation of the filled Miltenyi Contact Form
export function renderSyntheticFormImage(profileIndex = 0): string {
  const profile = TEST_PROFILES[profileIndex % TEST_PROFILES.length];
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 1200, 1700);

  // Header Title
  ctx.fillStyle = '#002B49';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('Contact form', 80, 110);

  // Logo text & emblem
  ctx.fillStyle = '#002B49';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('Miltenyi Biotec', 850, 110);

  // Divider
  ctx.strokeStyle = '#002B49';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 150);
  ctx.lineTo(1120, 150);
  ctx.stroke();

  // Field Labels (Printed text)
  ctx.fillStyle = '#4B5563';
  ctx.font = '22px sans-serif';
  ctx.fillText('First Name*:', 80, 220);
  ctx.fillText('Last Name*:', 600, 220);
  ctx.fillText('Email*:', 80, 320);
  ctx.fillText('University/Institution/Company:', 80, 420);
  ctx.fillText('Department:', 80, 520);

  // Handwritten fields (Blue ink pen style)
  ctx.fillStyle = '#1D4ED8';
  ctx.font = 'italic 28px "Comic Sans MS", "Caveat", "Segoe Print", cursive, sans-serif';
  ctx.fillText(profile.first_name, 230, 220);
  ctx.fillText(profile.last_name, 740, 220);
  ctx.fillText(profile.email, 180, 320);
  ctx.fillText(profile.institute, 450, 420);
  ctx.fillText(profile.department, 240, 520);

  // Big Section Header
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('How can we support you with your research?', 80, 660);

  // Notes Box border
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 700, 1040, 780);

  // Handwritten sentences inside Notes box
  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'italic 26px "Comic Sans MS", "Caveat", "Segoe Print", cursive, sans-serif';
  
  // Wrap notes text into lines
  const words = profile.notes.split(' ');
  let line = '';
  let y = 760;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 960 && n > 0) {
      ctx.fillText(line, 110, y);
      line = words[n] + ' ';
      y += 55;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 110, y);

  // Newsletter Checkbox
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 1540, 26, 26);
  if (profile.newsletter_opt_in) {
    ctx.fillStyle = '#1E3A8A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(84, 1552);
    ctx.lineTo(92, 1562);
    ctx.lineTo(104, 1544);
    ctx.stroke();
  }
  ctx.fillStyle = '#374151';
  ctx.font = '20px sans-serif';
  ctx.fillText('Yes, I want to receive scientific news, product promotions... - sign me up for the newsletter', 120, 1560);

  return canvas.toDataURL('image/jpeg', 0.9);
}

// Process an image (either uploaded photo or synthetic demo)
export async function processFormImage(
  rawImageDataUrl: string,
  campaignId: string,
  collectedBy: string,
  profileIndex = 0
): Promise<Lead> {
  // 1. Resize/compress image to protect mobile browser memory
  const safeImageDataUrl = await resizeImageForMobile(rawImageDataUrl);

  // 2. Generate field crops
  const crops = await generateFieldCrops(safeImageDataUrl);

  // 3. Extract data from profile
  const profile = TEST_PROFILES[profileIndex % TEST_PROFILES.length];
  const emailCheck = validateEmailMatch(profile.email, profile.first_name, profile.last_name);
  const crmMatch = matchCrmAccount(profile.institute, profile.department);

  const newLead: Lead = {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    collected_by: collectedBy,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    institute: profile.institute,
    department: profile.department,
    notes: profile.notes,
    newsletter_opt_in: profile.newsletter_opt_in,
    account_id: crmMatch?.account.id,
    matched_account_level: crmMatch?.matchLevel || null,
    email_warning: emailCheck.warning,
    email_warning_reason: emailCheck.reason,
    confidence_flags: profile.confidence_flags,
    field_crops: crops,
    image_url: safeImageDataUrl,
    status: 'draft',
    synced_to_cloud: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return newLead;
}

// Batch generator for loading initial test data instantly
export async function generateSampleLeads(campaignId: string, repName: string): Promise<Lead[]> {
  const list: Lead[] = [];
  for (let i = 0; i < TEST_PROFILES.length; i++) {
    const syntheticImg = renderSyntheticFormImage(i);
    const lead = await processFormImage(syntheticImg, campaignId, repName, i);
    lead.status = 'reviewed';
    list.push(lead);
  }
  return list;
}
