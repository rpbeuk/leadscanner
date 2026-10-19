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
const WORD_PATTERN = /[\p{L}\p{N}_]+(?:['’\-][\p{L}\p{N}_]+)*/gu;

async function fetchCorrections(userId: string): Promise<Correction[]> {
  const { data, error } = await supabase
    .from('user_ocr_corrections')
    .select('field, source_text, corrected_text')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return (data || []).filter((row): row is Correction =>
    PERSONAL_FIELDS.includes(row.field as PersonalField) &&
    typeof row.source_text === 'string' &&
    typeof row.corrected_text === 'string'
  );
}

export async function applyPersonalOcrCorrections(
  userId: string,
  extracted: Pick<Lead, PersonalField>
): Promise<Pick<Lead, PersonalField>> {
  const corrections = await fetchCorrections(userId);
  const result = { ...extracted };

  for (const { field, source_text, corrected_text } of corrections) {
    if (!source_text || !corrected_text) continue;
    const value = result[field];
    if (!value) continue;

    if (field === 'email') {
      if (value.toLowerCase() === source_text.toLowerCase()) {
        result.email = corrected_text;
      }
      continue;
    }

    const escaped = source_text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result[field] = value.replace(
      new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu'),
      corrected_text
    );
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
        sourceWord.toLowerCase() === targetWord.toLowerCase() ||
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
