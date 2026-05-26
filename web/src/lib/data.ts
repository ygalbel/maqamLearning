// Single source of truth: the repo-root JSON files, imported (and bundled) as-is.
import maqamsRaw from '@data/maqam-compact.json';
import translationsRaw from '@data/i18n.json';
import type { MaqamData, Translations } from './types';

export const maqams = maqamsRaw as unknown as MaqamData;
export const translations = translationsRaw as unknown as Translations;

export const maqamKeys: string[] = Object.keys(maqams);
