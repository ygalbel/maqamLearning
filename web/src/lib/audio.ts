// Web Audio playback: a sampled instrument (soundfont) when loaded, otherwise a
// synthesized oud-like tone. Ported from the original audio.js.
import Soundfont, { type Player } from 'soundfont-player';

const USE_SOUNDFONT = true;
const SOUNDFONT_NAME = 'MusyngKite';
const SOUNDFONT_INSTRUMENT = 'acoustic_guitar_nylon';
const SOUNDFONT_BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts/';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sampleInstrument: Player | null = null;
let sampleInstrumentPromise: Promise<Player | null> | null = null;
const activeOscillators = new Set<OscillatorNode>();

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

export function ensureAudio(): boolean {
  let created = false;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
    created = true;
  }
  if (USE_SOUNDFONT) loadSampleInstrument();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return created;
}

function frequencyToMidiAndCents(frequency: number): { midi: number; cents: number } | null {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const midiFloat = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(midiFloat);
  const cents = (midiFloat - midi) * 100;
  return { midi, cents };
}

function loadSampleInstrument(): Promise<Player | null> | null {
  if (!audioCtx || !masterGain) return null;
  if (sampleInstrument) return Promise.resolve(sampleInstrument);
  if (!sampleInstrumentPromise) {
    sampleInstrumentPromise = Soundfont.instrument(audioCtx, SOUNDFONT_INSTRUMENT, {
      soundfont: SOUNDFONT_NAME,
      format: 'mp3',
      baseUrl: SOUNDFONT_BASE_URL,
      destination: masterGain,
    })
      .then((inst) => {
        sampleInstrument = inst;
        return inst;
      })
      .catch((err) => {
        console.warn('Soundfont load failed, falling back to synth.', err);
        sampleInstrumentPromise = null;
        return null;
      });
  }
  return sampleInstrumentPromise;
}

export function stopActiveOscillators(): void {
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
  }
  activeOscillators.clear();
}

export function playTone(frequency: number, durationMs: number, pitchOffsetSemitones = 0): void {
  ensureAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const offsetFactor = Math.pow(2, pitchOffsetSemitones / 12);
  const adjustedFrequency = frequency * offsetFactor;
  const durSec = Math.max(0.06, durationMs / 1000);

  if (USE_SOUNDFONT && sampleInstrument) {
    const midiData = frequencyToMidiAndCents(adjustedFrequency);
    if (midiData) {
      // soundfont-player honors `cents` (applied to playbackRate), NOT `detune`.
      // Passing cents is what renders quarter-tones (Koron/half-flat) correctly.
      sampleInstrument.play(midiData.midi, now, {
        gain: 0.7,
        duration: durSec,
        cents: midiData.cents,
      });
      return;
    }
  } else if (USE_SOUNDFONT) {
    loadSampleInstrument();
  }

  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  const gain2 = audioCtx.createGain();
  const amp = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc.type = 'triangle';
  osc.frequency.value = adjustedFrequency;

  osc2.type = 'sine';
  osc2.frequency.value = adjustedFrequency * 2;
  osc2.detune.value = 6;

  gain1.gain.value = 0.9;
  gain2.gain.value = 0.25;

  const attack = 0.005;
  const decay = Math.min(0.2, Math.max(0.06, durSec * 0.6));
  const endTime = now + durSec;

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.35, now + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, endTime);

  filter.type = 'lowpass';
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(1600, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + decay);

  osc.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(amp);
  gain2.connect(amp);
  amp.connect(filter);
  filter.connect(masterGain);

  const register = (node: OscillatorNode) => {
    activeOscillators.add(node);
    node.onended = () => activeOscillators.delete(node);
  };
  register(osc);
  register(osc2);

  osc.start(now);
  osc2.start(now);
  osc.stop(endTime + 0.02);
  osc2.stop(endTime + 0.02);
}

export function playClick(): void {
  ensureAudio();
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1200;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);
}

/** Unlock audio on first user gesture (mobile browsers suspend contexts). */
export function installAudioUnlock(): void {
  const events = ['touchstart', 'touchend', 'click', 'keydown'];
  const unlock = () => {
    try {
      ensureAudio();
      if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    } finally {
      events.forEach((e) => document.body.removeEventListener(e, unlock));
    }
  };
  events.forEach((e) => document.body.addEventListener(e, unlock, { once: true }));
}
