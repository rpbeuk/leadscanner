import type { Lead } from '../types';
import { supabase } from './supabase';

const PERSONAL_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'institute',
  'department',
  'notes'
] as const;

type PersonalField = typeof PERSONAL_FIELDS[number];
type Correction = { field: PersonalField; source_text: string; corrected_text: string };
type Suggestions = Partial<Record<PersonalField, string>>;
const SHARED_FIELDS = ['institute', 'department', 'notes'] as const;
type SharedCorrection = Pick<Correction, 'source_text' | 'corrected_text'>;
const WORD_PATTERN = /[\p{L}\p{N}_]+(?:['’\-][\p{L}\p{N}_]+)*/gu;

async function fetchCorrections(userId: string): Promise<Correction[]> {
  const corrections: Correction[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('user_ocr_corrections')
      .select('field, source_text, corrected_text')
      .eq('user_id', userId)
      .order('field')
      .order('source_text')
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    corrections.push(...(data || []).filter((row): row is Correction =>
      PERSONAL_FIELDS.includes(row.field as PersonalField) &&
      typeof row.source_text === 'string' &&
      typeof row.corrected_text === 'string'
    ));
    if (!data || data.length < 1000) return corrections;
  }
}

async function fetchSharedCorrections(): Promise<SharedCorrection[]> {
  const corrections: SharedCorrection[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('shared_ocr_corrections')
      .select('source_text, corrected_text')
      .order('source_text')
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    corrections.push(...(data || []));
    if (!data || data.length < 1000) return corrections;
  }
}

export async function applyPersonalOcrCorrections(
  userId: string,
  extracted: Pick<Lead, PersonalField>
): Promise<Pick<Lead, PersonalField>> {
  const [personal, shared] = await Promise.all([
    fetchCorrections(userId),
    fetchSharedCorrections()
  ]);
  const corrections: Correction[] = [
    ...SHARED_FIELDS.flatMap((field) => shared.map((correction) => ({ ...correction, field }))),
    ...personal
  ];
  const result = { ...extracted };

  const replacements = new Map<PersonalField, Map<string, string>>();
  for (const { field, source_text, corrected_text } of corrections) {
    if (!source_text || !corrected_text) continue;
    if (!replacements.has(field)) replacements.set(field, new Map());
    replacements.get(field)!.set(source_text.toLowerCase(), corrected_text);
  }
  for (const [field, words] of replacements) {
    // Apply once to the raw text so one learned correction cannot trigger another.
    result[field] = field === 'email'
      ? words.get(extracted.email.toLowerCase()) || extracted.email
      : extracted[field].replace(WORD_PATTERN, (word) => words.get(word.toLowerCase()) || word);
  }

  return result;
}

function deriveCorrections(suggestions: Suggestions, edited: Suggestions): Correction[] {
  const corrections: Correction[] = [];

  for (const field of PERSONAL_FIELDS) {
    const source = (suggestions[field] || '').trim();
    const target = (edited[field] || '').trim();
    if (!source || !target || source === target) continue;

    if (field === 'email') {
      corrections.push({
        field,
        source_text: source.toLowerCase(),
        corrected_text: target.toLowerCase()
      });
      continue;
    }

    const sourceWords = source.match(WORD_PATTERN) || [];
    const targetWords = target.match(WORD_PATTERN) || [];
    if (sourceWords.length !== targetWords.length) continue;

    sourceWords.forEach((sourceWord, index) => {
      const targetWord = targetWords[index];
      if (
        (SHARED_FIELDS.some((sharedField) => sharedField === field)
          ? sourceWord === targetWord
          : sourceWord.toLowerCase() === targetWord.toLowerCase()) ||
        sourceWord.length < 2 ||
        targetWord.length < 1
      ) return;
      corrections.push({
        field,
        source_text: sourceWord.toLowerCase(),
        corrected_text: targetWord
      });
    });
  }

  return corrections;
}

export async function learnPersonalOcrCorrections(
  userId: string,
  lead: Lead
): Promise<number> {
  if (!lead.ocr_suggestions) return 0;
  const suggestions = lead.ocr_suggestions as Suggestions;
  const edited: Suggestions = Object.fromEntries(
    PERSONAL_FIELDS.map((field) => [field, lead[field]])
  );
  const corrections = deriveCorrections(suggestions, edited);
  if (corrections.length === 0) return 0;

  const { error } = await supabase
    .from('user_ocr_corrections')
    .upsert(
      corrections.map((correction) => ({
        user_id: userId,
        ...correction,
        updated_at: new Date().toISOString()
      })),
      { onConflict: 'user_id,field,source_text' }
    );
  if (error) throw new Error(error.message);
  return corrections.length;
}
