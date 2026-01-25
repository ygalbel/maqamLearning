export const DATA_URL = "./maqam-compact.json";
export const I18N_URL = "./i18n.json";
export const SUPPORTED_LANGS = ["en", "he", "ar"];
export const MIC_ENABLED = false;
export const USE_SOUNDFONT = true;
export const SOUNDFONT_NAME = "MusyngKite";
export const SOUNDFONT_INSTRUMENT = "acoustic_guitar_nylon";
export const SOUNDFONT_BASE_URL = "https://gleitz.github.io/midi-js-soundfonts/";
export const EXERCISES = [
  { id: "five_note", name: "Five Note Scale", pattern: [1, 2, 3, 2, 1] },
  {
    id: "full_scale",
    name: "Full Scale Up and Down",
    pattern: [1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7, 8]
  },
  {
    id: "broken_thirds",
    name: "Broken Thirds",
    pattern: [1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 8, 6, 7, 5, 6, 4, 5, 3, 4, 2, 3, 1]
  },
  { id: "arpeggio_octave", name: "Arpeggio with Octave", pattern: [1, 3, 5, 8, 5, 3, 1] },
  { id: "octave_leaps", name: "Octave Leap Descent", pattern: [1, 8, 7, 6, 5, 4, 3, 2, 1] },
  {
    id: "fourths",
    name: "Scale in Fourths",
    pattern: [1, 4, 2, 5, 3, 6, 4, 7, 5, 8, 6, 7, 5, 6, 4, 5, 3, 4, 2, 3, 1]
  },
  {
    id: "neighbor_tones",
    name: "Neighbor Tone Motion",
    pattern: [
      1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 6, 5, 6, 7, 6, 7, 8, 7, 8, 7, 6, 7, 5, 6, 4, 5,
      3, 4, 2, 3, 1
    ]
  },
  {
    id: "sequential_triads",
    name: "Sequential Triads",
    pattern: [1, 3, 5, 2, 4, 6, 3, 5, 7, 4, 6, 8, 5, 7, 8, 6, 8, 7, 5, 7, 4, 6, 3, 5, 2, 4, 1]
  },
  {
    id: "interval_slides",
    name: "Portamento Intervals",
    pattern: [1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 8, 8, 6, 7, 5, 6, 4, 5, 3, 4, 2, 3, 1]
  }
];
