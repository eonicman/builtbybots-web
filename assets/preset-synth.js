// Shared preset-instrument synthesis library for .bbbmod content.
//
// Two families, per Peter's ask (2026-08-11): "preset sounds such as one
// would find on a Casio keyboard or mod player from then" --
//   - Casio-style keyboard patches: Piano, Organ, Strings, Brass, Flute, Bell
//   - Classic tracker/chiptune extras: SawLead, Sub, Clap, Tom
// (Kick/Snare/Hihat/Bass/Lead/Pad already exist in make-mod.js -- these are
// additive, not replacements.)
//
// Every preset returns { name, volume, samples: Float32Array (-1..1, mono,
// 44100Hz) } built at a 440Hz (A4 / MIDI 69) reference pitch -- same
// convention as make-mod.js's REF_MIDI=69, so pitch-shifting via playbackRate
// in the player (and instrument transposition in the tracker) behaves
// consistently across every instrument, hand-built or preset.
//
// Runs unmodified in Node (tools/, for QA rendering) and in the browser (the
// tracker editor) -- no Buffer/AudioContext calls in the core generators,
// only plain Float32Array math. Each environment's thin wrapper (see bottom)
// converts the shared Float32Array into whatever that side actually needs.

const SR = 44100;
const REF_FREQ = 440; // A4, matches REF_MIDI=69 convention used elsewhere

function frames(dur) { return Math.floor(SR * dur); }

function makeSamples(dur, fn) {
  const n = frames(dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = fn(i / SR, i, n);
    out[i] = Math.max(-1, Math.min(1, s));
  }
  return out;
}

function saw(phase) { return 2 * (phase - Math.floor(phase + 0.5)); }

// --- Casio-keyboard-style patches ------------------------------------------

function presetPiano() {
  // Two slightly detuned sine partials (chorus-ish beating) over a quick
  // percussive amplitude envelope -- the classic cheap-keyboard "piano" that
  // is obviously a synth piano, not a sampled one. That's the point.
  const samples = makeSamples(1.1, (t) => {
    const o1 = Math.sin(2 * Math.PI * REF_FREQ * t);
    const o2 = Math.sin(2 * Math.PI * REF_FREQ * 1.003 * t);
    const env = Math.exp(-t * 3.2) * (t < 0.004 ? t / 0.004 : 1);
    return (o1 * 0.6 + o2 * 0.4) * env * 0.85;
  });
  return { name: 'Piano', volume: 56, samples };
}

function presetOrgan() {
  // Drawbar-style additive harmonics (fundamental + octave + fifth-ish 3rd
  // partial), flat sustain, gentle tremolo -- the "Pipe Organ" preset every
  // 80s home keyboard had.
  const samples = makeSamples(1.4, (t) => {
    const h1 = Math.sin(2 * Math.PI * REF_FREQ * t);
    const h2 = Math.sin(2 * Math.PI * REF_FREQ * 2 * t) * 0.5;
    const h3 = Math.sin(2 * Math.PI * REF_FREQ * 3 * t) * 0.25;
    const trem = 1 + 0.08 * Math.sin(2 * Math.PI * 5.5 * t);
    const env = (t < 0.02 ? t / 0.02 : 1) * Math.exp(-t * 0.6);
    return ((h1 + h2 + h3) / 1.75) * trem * env * 0.6;
  });
  return { name: 'Organ', volume: 46, samples };
}

function presetStrings() {
  // Two detuned sawtooths for a chorus-y sustain -- slow attack, long tail.
  const samples = makeSamples(1.8, (t) => {
    const s1 = saw(REF_FREQ * t);
    const s2 = saw(REF_FREQ * 1.006 * t);
    const env = (t < 0.25 ? t / 0.25 : 1) * Math.exp(-t * 0.5);
    return (s1 * 0.5 + s2 * 0.5) * env * 0.5;
  });
  return { name: 'Strings', volume: 42, samples };
}

function presetBrass() {
  // Narrow pulse wave, medium attack, bright and a little buzzy.
  const samples = makeSamples(1.0, (t) => {
    const phase = (REF_FREQ * t) % 1;
    const pulse = phase < 0.25 ? 1 : -1;
    const env = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 2.2) * 0.85 + 0.1;
    return pulse * env * 0.6;
  });
  return { name: 'Brass', volume: 50, samples };
}

function presetFlute() {
  // Sine core, subtle vibrato, a whisper of filtered-ish noise for breath.
  const samples = makeSamples(1.2, (t) => {
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5 * t);
    const tone = Math.sin(2 * Math.PI * REF_FREQ * vib * t);
    const noise = (Math.random() * 2 - 1) * 0.06;
    const env = (t < 0.06 ? t / 0.06 : 1) * Math.exp(-t * 0.9);
    return (tone * 0.9 + noise) * env * 0.55;
  });
  return { name: 'Flute', volume: 44, samples };
}

function presetBell() {
  // Inharmonic partials (non-integer ratios) for that metallic FM-bell
  // character -- fast bright transient, long decay.
  const samples = makeSamples(1.6, (t) => {
    const p1 = Math.sin(2 * Math.PI * REF_FREQ * t);
    const p2 = Math.sin(2 * Math.PI * REF_FREQ * 2.41 * t) * 0.5;
    const p3 = Math.sin(2 * Math.PI * REF_FREQ * 3.9 * t) * 0.25;
    const env = Math.exp(-t * 2.8);
    return ((p1 + p2 + p3) / 1.75) * env * 0.6;
  });
  return { name: 'Bell', volume: 48, samples };
}

// --- Classic tracker/chiptune extras ---------------------------------------

function presetSawLead() {
  // Pure sawtooth, punchy short envelope -- the other classic Amiga lead
  // shape alongside the existing pulse "Lead".
  const samples = makeSamples(0.45, (t) => {
    const s = saw(REF_FREQ * t);
    const env = t < 0.008 ? t / 0.008 : Math.exp(-(t - 0.008) * 5) * 0.7 + 0.2;
    return s * env * 0.5;
  });
  return { name: 'SawLead', volume: 48, samples };
}

function presetSub() {
  // Near-pure sine, minimal harmonic content -- a deeper, rounder low end
  // than the existing triangle "Bass", for when a track wants sub weight.
  const samples = makeSamples(0.5, (t) => {
    const s = Math.sin(2 * Math.PI * REF_FREQ * t) + Math.sin(2 * Math.PI * REF_FREQ * 2 * t) * 0.05;
    const env = Math.exp(-t * 4) * (t < 0.005 ? t / 0.005 : 1);
    return s * env * 0.9;
  });
  return { name: 'Sub', volume: 58, samples };
}

function presetClap() {
  // Three short noise bursts a few ms apart, layered -- the classic
  // "hand clap" drum-machine trick (single hits sound too clean; the
  // slight smear is what reads as a clap).
  const samples = makeSamples(0.2, (t) => {
    const b1 = Math.exp(-Math.max(0, t) * 70);
    const b2 = t >= 0.012 ? Math.exp(-(t - 0.012) * 70) : 0;
    const b3 = t >= 0.024 ? Math.exp(-(t - 0.024) * 60) : 0;
    const noise = Math.random() * 2 - 1;
    return noise * (b1 + b2 + b3) * 0.6;
  });
  return { name: 'Clap', volume: 44, samples };
}

function presetTom() {
  // Pitch-swept sine like the existing Kick, but higher-pitched and shorter
  // decay -- rounds out the drum kit beyond kick/snare/hihat.
  const dur = 0.22;
  const n = frames(dur);
  const samples = new Float32Array(n);
  let phaseAcc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const freq = 220 * Math.exp(-t * 14) + 90;
    phaseAcc += freq / SR;
    const env = Math.exp(-t * 11);
    samples[i] = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * phaseAcc) * env));
  }
  return { name: 'Tom', volume: 52, samples };
}

// --- Original 6 (ported from make-mod.js's makeKick/makeSnare/makeHihat/
// makeBass/makeLead/makePad, same math, so presets picked in the tracker
// editor sound consistent with the official tracks built from those
// functions) -- included here so the editor's preset picker offers the full
// set, not just the newer additions.

function presetBass() {
  const samples = makeSamples(0.35, (t) => {
    const phase = (REF_FREQ * t) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = Math.exp(-t * 7) * (t < 0.005 ? t / 0.005 : 1);
    return tri * env * 0.9;
  });
  return { name: 'Bass', volume: 60, samples };
}

function presetLead() {
  const samples = makeSamples(0.4, (t) => {
    const phase = (REF_FREQ * t) % 1;
    const sq = phase < 0.5 ? 1 : -1;
    const env = t < 0.01 ? t / 0.01 : Math.exp(-(t - 0.01) * 4) * 0.8 + 0.15;
    return sq * env * 0.55;
  });
  return { name: 'Lead', volume: 48, samples };
}

function presetPad() {
  const samples = makeSamples(0.9, (t) => {
    const sine = Math.sin(2 * Math.PI * REF_FREQ * t);
    const phase = (REF_FREQ * t) % 1;
    const tri = 4 * Math.abs(phase - 0.5) - 1;
    const env = (t < 0.08 ? t / 0.08 : 1) * Math.exp(-t * 1.6);
    return (sine * 0.6 + tri * 0.4) * env * 0.5;
  });
  return { name: 'Pad', volume: 40, samples };
}

function presetKick() {
  const dur = 0.14;
  const n = frames(dur);
  const samples = new Float32Array(n);
  let phaseAcc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const freq = 150 * Math.exp(-t * 22) + 45;
    phaseAcc += freq / SR;
    const env = Math.exp(-t * 18);
    samples[i] = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * phaseAcc) * env));
  }
  return { name: 'Kick', volume: 60, samples };
}

function presetSnare() {
  const samples = makeSamples(0.16, (t) => {
    const noise = Math.random() * 2 - 1;
    const thump = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 40);
    const env = Math.exp(-t * 14);
    return (noise * 0.7 + thump * 0.5) * env;
  });
  return { name: 'Snare', volume: 50, samples };
}

function presetHihat() {
  const dur = 0.06;
  const n = frames(dur);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.random() * 2 - 1;
  const samples = makeSamples(dur, (t, i) => {
    const smoothed = i >= 2 ? (raw[i] + raw[i - 1] + raw[i - 2]) / 3 : raw[i];
    const hp = raw[i] - smoothed;
    const env = Math.exp(-t * 55);
    return hp * env * 2.2;
  });
  return { name: 'Hihat', volume: 34, samples };
}

const PRESETS = [
  presetPiano, presetOrgan, presetStrings, presetBrass, presetFlute, presetBell,
  presetSawLead, presetSub, presetClap, presetTom,
  presetBass, presetLead, presetPad, presetKick, presetSnare, presetHihat,
];

function listPresets() {
  return PRESETS.map(fn => fn());
}

// --- Environment wiring -----------------------------------------------------
// Node: used by tools/*.js for QA rendering and by make-mod.js if it wants to
// reuse a preset in a composed track. Browser: attached to window for the
// tracker editor's preset picker.
const PRESET_MAP = {
  Piano: presetPiano, Organ: presetOrgan, Strings: presetStrings, Brass: presetBrass,
  Flute: presetFlute, Bell: presetBell, SawLead: presetSawLead, Sub: presetSub,
  Clap: presetClap, Tom: presetTom, Bass: presetBass, Lead: presetLead, Pad: presetPad,
  Kick: presetKick, Snare: presetSnare, Hihat: presetHihat,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SR, REF_FREQ, listPresets, presets: PRESET_MAP };
}
if (typeof window !== 'undefined') {
  window.BBBPresetSynth = { SR, REF_FREQ, listPresets, presets: PRESET_MAP };
}
