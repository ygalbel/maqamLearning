import {
  USE_SOUNDFONT,
  SOUNDFONT_NAME,
  SOUNDFONT_INSTRUMENT,
  SOUNDFONT_BASE_URL
} from "./config.js";

let audioCtx = null;
let masterGain = null;
let sampleInstrument = null;
let sampleInstrumentPromise = null;
const activeOscillators = new Set();

export function getAudioContext() {
  return audioCtx;
}

export function ensureAudio() {
  let created = false;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.6;
    masterGain.connect(audioCtx.destination);
    created = true;
  }
  if (USE_SOUNDFONT) loadSampleInstrument();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return created;
}

function frequencyToMidiAndDetune(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const midiFloat = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(midiFloat);
  const detune = (midiFloat - midi) * 100;
  return { midi, detune };
}

function loadSampleInstrument() {
  if (!window.Soundfont || !audioCtx || !masterGain) return null;
  if (sampleInstrument) return Promise.resolve(sampleInstrument);
  if (!sampleInstrumentPromise) {
    sampleInstrumentPromise = window.Soundfont.instrument(audioCtx, SOUNDFONT_INSTRUMENT, {
      soundfont: SOUNDFONT_NAME,
      format: "mp3",
      baseUrl: SOUNDFONT_BASE_URL,
      destination: masterGain
    })
      .then((inst) => {
        sampleInstrument = inst;
        return inst;
      })
      .catch((err) => {
        console.warn("Soundfont load failed, falling back to synth.", err);
        sampleInstrumentPromise = null;
        return null;
      });
  }
  return sampleInstrumentPromise;
}

export function stopActiveOscillators() {
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {}
  }
  activeOscillators.clear();
}

export function playTone(frequency, durationMs, pitchOffsetSemitones = 0) {
  ensureAudio();
  if (!audioCtx || !masterGain) return;

  const now = audioCtx.currentTime;
  const offsetFactor = Math.pow(2, pitchOffsetSemitones / 12);
  const adjustedFrequency = frequency * offsetFactor;
  const durSec = Math.max(0.06, durationMs / 1000);

  if (USE_SOUNDFONT && sampleInstrument) {
    const midiData = frequencyToMidiAndDetune(adjustedFrequency);
    if (midiData) {
      sampleInstrument.play(midiData.midi, now, {
        gain: 0.7,
        duration: durSec,
        detune: midiData.detune
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

  osc.type = "triangle";
  osc.frequency.value = adjustedFrequency;

  osc2.type = "sine";
  osc2.frequency.value = adjustedFrequency * 2;
  osc2.detune.value = 6;

  gain1.gain.value = 0.9;
  gain2.gain.value = 0.25;

  // Plucked envelope + gentle low-pass for an oud-like timbre
  const attack = 0.005;
  const decay = Math.min(0.2, Math.max(0.06, durSec * 0.6));
  const endTime = now + durSec;

  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.35, now + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, endTime);

  filter.type = "lowpass";
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(1600, now);
  filter.frequency.exponentialRampToValueAtTime(900, now + decay);

  osc.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(amp);
  gain2.connect(amp);
  amp.connect(filter);
  filter.connect(masterGain);

  function registerOscillator(node) {
    activeOscillators.add(node);
    node.onended = () => activeOscillators.delete(node);
  }

  registerOscillator(osc);
  registerOscillator(osc2);

  osc.start(now);
  osc2.start(now);
  osc.stop(endTime + 0.02);
  osc2.stop(endTime + 0.02);
}

export function playClick() {
  ensureAudio();
  if (!audioCtx || !masterGain) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = 1200;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.08);
}
