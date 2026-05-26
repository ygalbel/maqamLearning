// Shapes for the maqam dataset (maqam-compact.json) and translations (i18n.json).
// These mirror the existing data exactly — the JSON is unchanged.

export interface NoteEntry {
  note: string;
  frequency: number;
  jins?: string;
  index?: number;
}

export interface JinsGroup {
  name?: string;
  jins?: string;
  scale: NoteEntry[];
}

/** Either a single jins name, or a list of jins groups (e.g. Rast's two upper ajnas). */
export type UpperJins = string | JinsGroup[];

export interface Maqam {
  tonic?: string;
  lower_jins?: string;
  lower_jins_groups?: JinsGroup[];
  upper_jins?: UpperJins;
  scale: NoteEntry[];
}

export type MaqamData = Record<string, Maqam>;

export type Lang = 'en' | 'he' | 'ar';

export interface LangDict {
  maqamNames?: Record<string, string>;
  jinsNames?: Record<string, string>;
  [key: string]: unknown;
}

export type Translations = Record<string, LangDict>;
