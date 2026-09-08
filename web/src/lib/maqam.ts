// Pure music-theory helpers, ported from the original app.js. No DOM, no i18n —
// these return raw data / i18n keys that components resolve.
import type { JinsGroup, Maqam, NoteEntry, UpperJins } from './types';

export function getUpperJinsNames(upperJins: UpperJins | undefined): string[] {
  if (!upperJins) return [];
  if (Array.isArray(upperJins)) {
    return upperJins
      .map((entry) => {
        if (!entry) return '';
        if (typeof entry === 'string') return entry;
        return String(entry.name || entry.jins || '');
      })
      .filter(Boolean);
  }
  return [String(upperJins)];
}

export function getTonicIndexFromScale(scale: NoteEntry[], tonic: string | undefined): number {
  const tonicStr = tonic ? String(tonic).trim() : '';
  if (!tonicStr) return -1;
  const target = tonicStr.toLowerCase();
  const directIndex = scale.findIndex((n) => String(n?.note || '').toLowerCase().startsWith(target));
  if (directIndex >= 0) return directIndex;
  const match = tonicStr.match(/[A-G]/i);
  if (!match) return -1;
  const letter = match[0].toLowerCase();
  return scale.findIndex((n) => String(n?.note || '').toLowerCase().startsWith(letter));
}

function findNoteIndexInScale(scale: NoteEntry[], entry: NoteEntry): number {
  if (!entry) return -1;
  const idx = Number(entry.index);
  if (Number.isFinite(idx)) return idx;
  const note = entry.note ?? '';
  const freq = Number(entry.frequency);
  return scale.findIndex((n) => {
    if (!n) return false;
    if (n.note !== note) return false;
    if (!Number.isFinite(freq)) return true;
    const f = Number(n.frequency);
    return Number.isFinite(f) && Math.abs(f - freq) < 0.01;
  });
}

export interface ResolvedGroup {
  name: string;
  scale: NoteEntry[];
  indices: number[];
}

function getGroupData(scale: NoteEntry[], groups: JinsGroup[] | undefined): { groups: ResolvedGroup[]; used: Set<number> } {
  const normalized = Array.isArray(groups) ? groups : [];
  const result: ResolvedGroup[] = normalized.map((entry) => ({
    name: entry?.name || entry?.jins || '',
    scale: Array.isArray(entry?.scale) ? entry.scale : [],
    indices: [],
  }));
  const used = new Set<number>();
  result.forEach((group) => {
    group.indices = group.scale
      .map((entry) => findNoteIndexInScale(scale, entry))
      .filter((idx) => Number.isFinite(idx) && idx >= 0);
    group.indices.forEach((idx) => used.add(idx));
  });
  return { groups: result, used };
}

export function getUpperGroupData(scale: NoteEntry[], upperJins: UpperJins | undefined): { groups: ResolvedGroup[]; lowerIndices: number[] } {
  const groups = Array.isArray(upperJins) ? upperJins : undefined;
  const groupData = getGroupData(scale, groups);
  const all = scale.map((_, i) => i);
  const lowerIndices = all.filter((idx) => !groupData.used.has(idx));
  return { groups: groupData.groups, lowerIndices };
}

function getLowerGroupData(scale: NoteEntry[], lowerGroups: JinsGroup[] | undefined) {
  const groupData = getGroupData(scale, lowerGroups);
  const all = scale.map((_, i) => i);
  const otherIndices = all.filter((idx) => !groupData.used.has(idx));
  return { groups: groupData.groups, otherIndices, used: groupData.used };
}

/** Closest named interval (i18n key) between two consecutive frequencies, ascending only. */
export function intervalKeyFromFrequencies(currentHz: number, nextHz: number): string {
  if (!Number.isFinite(currentHz) || !Number.isFinite(nextHz) || nextHz <= 0 || currentHz <= 0) return '';
  if (nextHz <= currentHz) return '';
  const cents = 1200 * Math.log2(nextHz / currentHz);
  const options = [
    { cents: 100, key: 'interval.halfTone' },
    { cents: 150, key: 'interval.threeQuarterTone' },
    { cents: 200, key: 'interval.oneTone' },
    { cents: 300, key: 'interval.oneAndHalfTone' },
  ];
  let best = options[0];
  let bestDiff = Math.abs(cents - best.cents);
  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(cents - options[i].cents);
    if (diff < bestDiff) {
      best = options[i];
      bestDiff = diff;
    }
  }
  return best.key;
}

export interface RenderNote {
  entry: NoteEntry;
  idx: number;
  displayIndex: number;
  isTonic: boolean;
  intervalKey: string;
  upperGroup: 'a' | 'b' | '';
}

export interface NoteSection {
  /** i18n key for the section label, or null for an unlabeled flat section. */
  labelKey: 'maqam.lowerJinsLabel' | 'maqam.upperJinsLabel' | null;
  /** Raw jins name to translate alongside the label, or null. */
  jins: string | null;
  notes: RenderNote[];
}

/**
 * Group a maqam's scale into render-ready sections (lower jins / upper jins
 * groups). Mirrors the original buildNoteRows grouping, but returns data.
 */
export function buildNoteSections(maqam: Maqam): NoteSection[] {
  const scale = Array.isArray(maqam.scale) ? maqam.scale : [];
  const tonicIndex = getTonicIndexFromScale(scale, maqam.tonic);
  const upperGroupData = getUpperGroupData(scale, maqam.upper_jins);
  const upperGroups = upperGroupData.groups;
  const lowerGroupData = getLowerGroupData(scale, maqam.lower_jins_groups);
  const hasLowerGroups = lowerGroupData.groups.length > 0;

  const upperASet = new Set(upperGroups[0]?.indices ?? []);
  const upperBSet = new Set(upperGroups[1]?.indices ?? []);

  const makeNote = (idx: number): RenderNote => {
    const entry = scale[idx];
    const next = scale[idx + 1];
    const displayIndex = tonicIndex >= 0 ? idx - tonicIndex : idx;
    let upperGroup: 'a' | 'b' | '' = '';
    if (upperASet.has(idx) && upperBSet.has(idx)) upperGroup = 'a';
    else if (upperASet.has(idx)) upperGroup = 'a';
    else if (upperBSet.has(idx)) upperGroup = 'b';
    return {
      entry,
      idx,
      displayIndex,
      isTonic: displayIndex === 0,
      intervalKey: intervalKeyFromFrequencies(Number(entry?.frequency), Number(next?.frequency)),
      upperGroup,
    };
  };

  const sections: NoteSection[] = [];

  if (upperGroups.length > 1 || hasLowerGroups) {
    if (hasLowerGroups) {
      for (const group of lowerGroupData.groups) {
        sections.push({ labelKey: 'maqam.lowerJinsLabel', jins: group.name || null, notes: group.indices.map(makeNote) });
      }
      const extraLower = upperGroupData.lowerIndices.filter((idx) => !lowerGroupData.used.has(idx));
      if (extraLower.length > 0) {
        sections.push({ labelKey: 'maqam.lowerJinsLabel', jins: maqam.lower_jins || null, notes: extraLower.map(makeNote) });
      }
    } else if (upperGroupData.lowerIndices.length > 0) {
      sections.push({ labelKey: 'maqam.lowerJinsLabel', jins: maqam.lower_jins || null, notes: upperGroupData.lowerIndices.map(makeNote) });
    }

    for (const group of upperGroups) {
      sections.push({ labelKey: 'maqam.upperJinsLabel', jins: group.name || null, notes: group.indices.map(makeNote) });
    }
  } else {
    sections.push({ labelKey: null, jins: null, notes: scale.map((_, idx) => makeNote(idx)) });
  }

  return sections;
}

/** Split a note label like "B4-Koron" into base + suffix for styling. */
export function splitNoteLabel(note: string): { base: string; suffix: string } {
  const parts = String(note ?? '').split('-');
  const base = parts[0] || '';
  const suffix = parts.length > 1 ? `-${parts.slice(1).join('-')}` : '';
  return { base, suffix };
}

// ---- Helpers used by the sequencing pages (Exercises / Quiz / Looper) ----

export function noteBaseKey(note: string): string {
  const m = String(note ?? '').match(/([A-Ga-g])(\d+)/);
  return m ? `${m[1].toUpperCase()}${m[2]}` : '';
}

export interface PlayableNote {
  note: string;
  frequency: number;
  index: number;
}

/** Ordered, playable notes at/above the tonic, restricted to `allowed` indices. */
export function buildScaleList(scale: NoteEntry[], tonicIndex: number, allowed: Set<number>): PlayableNote[] {
  if (!Number.isFinite(tonicIndex) || tonicIndex < 0) return [];
  const out: PlayableNote[] = [];
  for (const idx of [...allowed].filter((i) => i >= tonicIndex).sort((a, b) => a - b)) {
    const e = scale[idx];
    if (!e) continue;
    out.push({ note: e.note, frequency: Number(e.frequency), index: idx });
  }
  return out;
}

/** Default selected note indices for a maqam (octave-deduped unless it has split upper ajnas). */
export function buildDefaultSelectionSet(scale: NoteEntry[], tonicIndex: number, upperJins?: UpperJins): Set<number> {
  const selected = new Set<number>();
  const hasTonic = Number.isFinite(tonicIndex) && tonicIndex >= 0;
  const upper = getUpperGroupData(scale, upperJins);
  if (upper.groups.length > 1) {
    for (let i = 0; i < scale.length; i++) {
      if (!hasTonic || i - tonicIndex < 0) continue;
      selected.add(i);
    }
    return selected;
  }
  const seen = new Set<string>();
  for (let i = 0; i < scale.length; i++) {
    if (!hasTonic || i - tonicIndex < 0) continue;
    const key = noteBaseKey(scale[i]?.note ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.add(i);
  }
  return selected;
}

export function getUpperGroupForIndex(
  idx: number,
  aSet: Set<number>,
  bSet: Set<number>,
  prefer: 'a' | 'b' | null = null
): 'a' | 'b' | null {
  const inA = aSet.has(idx);
  const inB = bSet.has(idx);
  if (inA && inB) return prefer;
  if (inA) return 'a';
  if (inB) return 'b';
  return null;
}

export function getBpmIntervalMs(bpm: number | string): number {
  const n = Number(bpm);
  if (!Number.isFinite(n) || n <= 0) return 600;
  return Math.round(60000 / n);
}

// ---- Quarter-tone note-name arithmetic (used by the tonic selector) ----
//
// The dataset is tuned per-maqam in just ratios, not 12-TET: C4 is 260.74 Hz,
// "E4-Koron" is 320 Hz in sikah but 322 in huzam, and A4♭ spans 414–423 Hz
// across maqams. So a transposition cannot aim at an absolute equal-tempered
// pitch table — sikah's tonic alone sits 49 cents off the grid. Instead the
// grid is anchored on the maqam's *own* tonic and shifted in whole
// quarter-tones: playback keeps the native ratios (a uniform offset preserves
// every interval), and target names are derived by name arithmetic rather than
// by rounding frequencies, so they are exact by construction.

const LETTER_SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Canonical spelling per semitone, following how maqam-compact.json writes them. */
const SEMITONE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/**
 * Quarter-tone steps a note name sits above C-1 (24 per octave), or null when
 * the name cannot be parsed. Comma modifiers (the `↓` in `A4♮↓`) are ignored —
 * they are a tuning nuance below the naming grid.
 */
export function noteToQuarterSteps(note: string): number | null {
  const m = String(note ?? '').match(/^([A-Ga-g])(-?\d+)(.*)$/);
  if (!m) return null;
  const semitones = LETTER_SEMITONES[m[1].toLowerCase()];
  if (semitones === undefined) return null;
  const octave = Number(m[2]);
  if (!Number.isFinite(octave)) return null;
  const accidentals = m[3];
  let quarters = 0;
  if (accidentals.includes('♯')) quarters += 2;
  if (accidentals.includes('♭')) quarters -= 2;
  if (/koron/i.test(accidentals)) quarters -= 1;
  return (octave + 1) * 24 + semitones * 2 + quarters;
}

/**
 * Spell a quarter-step index back in the dataset's convention (`B4♭`,
 * `E4-Koron`). Odd steps sit a quarter-tone below the semitone above them, so
 * they are named after that note plus `-Koron` — which is exactly how the data
 * names its own koron degrees.
 */
export function quarterStepsToNote(steps: number): string {
  const s = Math.round(steps);
  const octave = Math.floor(s / 24) - 1;
  const within = ((s % 24) + 24) % 24;
  const isKoron = within % 2 === 1;
  const semitone = (isKoron ? (within + 1) / 2 : within / 2) % 12;
  // The B–C midpoint is spelled as C-Koron of the octave above.
  const carry = isKoron && within === 23 ? 1 : 0;
  const name = SEMITONE_NAMES[semitone];
  return `${name[0]}${octave + carry}${name.slice(1)}${isKoron ? '-Koron' : ''}`;
}

export interface TonicOption {
  /** Quarter-tone offset from the maqam's own tonic. */
  steps: number;
  /** Semitone offset to feed playTone(). */
  semitones: number;
  /** Target tonic in the dataset's note spelling, e.g. `E4-Koron`. */
  note: string;
  isOriginal: boolean;
}

/**
 * One octave of tonic choices centred on the maqam's own tonic, in quarter-tone
 * steps. Even steps land on plain/chromatic degrees, odd steps on koron ones —
 * so a maqam rooted on a koron degree (sikah, huzam, iraq, mustaar, bastanikar)
 * lists its real home first and can still be moved to a plain note, and one
 * rooted on a plain degree gets the mirror image.
 */
export function buildTonicOptions(tonicNote: string, span = 12): TonicOption[] {
  const base = noteToQuarterSteps(tonicNote);
  if (base === null) return [];
  const options: TonicOption[] = [];
  for (let steps = -span; steps <= span; steps++) {
    options.push({
      steps,
      semitones: steps / 2,
      // Keep the data's own spelling for home; enharmonics would rewrite it.
      note: steps === 0 ? tonicNote : quarterStepsToNote(base + steps),
      isOriginal: steps === 0,
    });
  }
  return options;
}
