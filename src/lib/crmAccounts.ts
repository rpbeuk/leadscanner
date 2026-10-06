import Fuse from 'fuse.js';
import type { AccountLevel } from '../types';

// Initial representative set of major Benelux and European research institutes & university medical centers
export const INITIAL_CRM_ACCOUNTS: AccountLevel[] = [
  // Amsterdam
  { id: '1', level_1: 'Amsterdam UMC', level_2: 'Locatie AMC', level_3: 'Department of Hematology', country: 'NL' },
  { id: '2', level_1: 'Amsterdam UMC', level_2: 'Locatie VUmc', level_3: 'Department of Immunology', country: 'NL' },
  { id: '3', level_1: 'Amsterdam UMC', level_2: 'Cancer Center Amsterdam', level_3: 'Experimental Oncology', country: 'NL' },
  { id: '4', level_1: 'Stichting Het Nederlands Kanker Instituut - Antoni van Leeuwenhoek (NKI-AVL)', level_2: 'Division of Immunology', level_3: 'Tumor Biology', country: 'NL' },
  { id: '5', level_1: 'Sanquin Research', level_2: 'Center for Cell Therapy', level_3: 'Hematopoiesis Lab', country: 'NL' },
  
  // Rotterdam
  { id: '6', level_1: 'Erasmus Universitair Medisch Centrum (Erasmus MC)', level_2: 'Erasmus MC Kanker Instituut', level_3: 'Department of Hematology & CAR-T', country: 'NL' },
  { id: '7', level_1: 'Erasmus Universitair Medisch Centrum (Erasmus MC)', level_2: 'Biomedical Sciences', level_3: 'Cell Biology', country: 'NL' },
  { id: '8', level_1: 'Erasmus Universitair Medisch Centrum (Erasmus MC)', level_2: 'Sophia Kinderziekenhuis', level_3: 'Pediatric Oncology', country: 'NL' },
  
  // Leiden
  { id: '9', level_1: 'Leids Universitair Medisch Centrum (LUMC)', level_2: 'Center for Infectious Diseases', level_3: 'Department of Immunology', country: 'NL' },
  { id: '10', level_1: 'Leids Universitair Medisch Centrum (LUMC)', level_2: 'Regenerative Medicine', level_3: 'Cell Separation & Flow Core', country: 'NL' },
  
  // Utrecht
  { id: '11', level_1: 'Universitair Medisch Centrum Utrecht (UMC Utrecht)', level_2: 'Center for Molecular Medicine', level_3: 'Immunotherapy', country: 'NL' },
  { id: '12', level_1: 'Prinses Máxima Centrum voor kinderoncologie', level_2: 'Research Facility', level_3: 'Pediatric Immuno-Oncology', country: 'NL' },
  { id: '13', level_1: 'Hubrecht Institute (KNAW)', level_2: 'Stem Cell Biology', level_3: 'Organoid Technology Group', country: 'NL' },
  
  // Nijmegen & Groningen
  { id: '14', level_1: 'Radboud Universitair Medisch Centrum (Radboudumc)', level_2: 'Radboud Institute for Molecular Life Sciences', level_3: 'Laboratory of Tumor Immunology', country: 'NL' },
  { id: '15', level_1: 'Universitair Medisch Centrum Groningen (UMCG)', level_2: 'Eriks Institute', level_3: 'Hematology & Bone Marrow', country: 'NL' },

  // Belgium / France
  { id: '16', level_1: 'KU Leuven', level_2: 'VIB-KU Leuven Center for Cancer Biology', level_3: 'Cellular Immunity Lab', country: 'BE' },
  { id: '17', level_1: 'Universiteit Gent (UGent)', level_2: 'VIB Center for Inflammation Research', level_3: 'Flow Cytometry Core', country: 'BE' },
  { id: '18', level_1: 'Institut National de la Santé et de la Recherche Médicale (INSERM)', level_2: 'Institut Curie', level_3: 'Immunology & Cellular Assays', country: 'FR' },
  { id: '19', level_1: 'Institut Pasteur', level_2: 'Department of Cell Biology', level_3: 'Immune Regulation Unit', country: 'FR' },
  { id: '20', level_1: 'Deutsches Krebsforschungszentrum (DKFZ)', level_2: 'Heidelberg Research', level_3: 'Translational Immunology', country: 'DE' }
];

export interface MatchResult {
  account: AccountLevel;
  matchLevel: 'level_3' | 'level_2' | 'fallback_level_1';
  score: number;
  explanation: string;
}

export function matchCrmAccount(rawInstitute: string, rawDepartment: string, accounts: AccountLevel[] = INITIAL_CRM_ACCOUNTS): MatchResult | null {
  if (!rawInstitute && !rawDepartment) return null;

  // 1. Try matching Level 3 (Institute + Department combination)
  const fuseBoth = new Fuse(accounts, {
    keys: [
      { name: 'level_3', weight: 0.6 },
      { name: 'level_1', weight: 0.3 },
      { name: 'level_2', weight: 0.1 }
    ],
    threshold: 0.4
  });

  const queryCombined = `${rawInstitute} ${rawDepartment}`.trim();
  const resultsBoth = fuseBoth.search(queryCombined);

  if (resultsBoth.length > 0 && resultsBoth[0].score !== undefined && resultsBoth[0].score < 0.35) {
    return {
      account: resultsBoth[0].item,
      matchLevel: 'level_3',
      score: resultsBoth[0].score,
      explanation: `Exacte match op afdeling & instituut: ${resultsBoth[0].item.level_1} → ${resultsBoth[0].item.level_3}`
    };
  }

  // 2. Fallback rule from the meeting:
  // "Op het moment dat die combinatie niet bestaat, dan gaan we één niveau omhoog en voeren we lead form op niveau 1 in"
  const fuseLevel1 = new Fuse(accounts, {
    keys: ['level_1', 'level_2'],
    threshold: 0.45
  });

  const resultsLevel1 = fuseLevel1.search(rawInstitute);
  if (resultsLevel1.length > 0) {
    return {
      account: resultsLevel1[0].item,
      matchLevel: 'fallback_level_1',
      score: resultsLevel1[0].score || 0.4,
      explanation: `Combinatie niet gevonden → Terugval naar Niveau 1: ${resultsLevel1[0].item.level_1}`
    };
  }

  return null;
}
