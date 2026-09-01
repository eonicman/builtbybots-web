// Shared pitch/key detection library -- Phase A of the Ghost Tracks project
// (AI-generated backing accompaniment for member recordings in the Tracker).
// Feeds both the future pitch-correction step (Phase C) and the Ghost Track
// generator (Phase D), which reads the detected key and writes chord/drum
// parts into spare channels using the existing preset instruments.
//
// Same dual Node/browser pattern as preset-synth.js: plain Float32Array +
// number math only, no Buffer/AudioContext calls in the core functions, so
// this file runs unmodified in Node (tools/, for QA) and in the browser
// (the tracker editor calls detectPitchContour(audioBuffer.getChannelData(0),
// audioBuffer.sampleRate)).

// Named PC_NAMES (pitch-class names), not NOTE_NAMES, at module scope --
// tracker/index.html's own inline <script> already declares a top-level
// `const NOTE_NAMES`, and since both files load as classic (non-module)
// scripts sharing one global lexical scope, a same-named top-level const
// here would be a SyntaxError on the live page (caught by the headless
// smoke test, not by the Node QA script -- Node has no shared scope to
// collide in). Still exported as `NOTE_NAMES` on the API object below,
// since that's a property access (BBBAudioAnalysis.NOTE_NAMES), which can't
// collide with anything.
const PC_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function midiToPitchClass(midi) {
  const pc = Math.round(midi) % 12;
  return pc < 0 ? pc + 12 : pc;
}

// --- YIN pitch detection -----------------------------------------------
// Classic difference-function method (de Cheveigne & Kawahara 2002) --
// chosen over plain autocorrelation because its cumulative-mean
// normalization sharply cuts octave errors, which would otherwise be the
// single biggest source of bad key estimates downstream.

const DEFAULT_MIN_FREQ = 65;    // ~C2 -- covers low male voice / bass instrument
const DEFAULT_MAX_FREQ = 1050;  // ~C6 -- covers soprano / high lead
const DEFAULT_FRAME = 2048;
const DEFAULT_HOP = 1024;       // 50% overlap
const YIN_THRESHOLD = 0.15;     // standard YIN absolute threshold

function yinFrame(buf, start, frameSize, minLag, maxLag) {
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      const diff = buf[start + j] - buf[start + j + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  // Absolute threshold: first dip below YIN_THRESHOLD, then walk downhill to
  // its local minimum (standard YIN step 4 -- avoids locking onto the very
  // first noisy dip past the threshold).
  let tauEstimate = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return null; // no clear periodicity -- unvoiced/silent frame

  // Parabolic interpolation around tauEstimate for sub-sample precision.
  let betterTau = tauEstimate;
  if (tauEstimate > minLag && tauEstimate < maxLag) {
    const s0 = cmnd[tauEstimate - 1], s1 = cmnd[tauEstimate], s2 = cmnd[tauEstimate + 1];
    const denom = 2 * s1 - s2 - s0;
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / (2 * denom);
  }
  return { tau: betterTau, confidence: 1 - cmnd[tauEstimate] };
}

// Returns [{ time (sec), freq (Hz), confidence (0-1) }, ...] for every voiced
// frame. Silent/unvoiced frames are simply omitted rather than emitted with
// a null freq -- callers that want a dense contour can interpolate.
function detectPitchContour(samples, sampleRate, opts = {}) {
  const frameSize = opts.frameSize || DEFAULT_FRAME;
  const hop = opts.hop || DEFAULT_HOP;
  const minFreq = opts.minFreq || DEFAULT_MIN_FREQ;
  const maxFreq = opts.maxFreq || DEFAULT_MAX_FREQ;
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.ceil(sampleRate / minFreq);
  const contour = [];
  for (let start = 0; start + frameSize + maxLag < samples.length; start += hop) {
    const result = yinFrame(samples, start, frameSize, minLag, maxLag);
    if (result) {
      contour.push({
        time: start / sampleRate,
        freq: sampleRate / result.tau,
        confidence: result.confidence,
      });
    }
  }
  return contour;
}

// --- Key estimation (Krumhansl-Schmuckler profile correlation) ---------

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// Confidence-weighted pitch-class histogram from a contour. Low-confidence
// (noisy/breathy) frames are excluded rather than down-weighted to zero --
// mixing them in at low weight still let noise skew short recordings during
// testing, so a hard cutoff is more predictable.
function buildChroma(contour, minConfidence = 0.5) {
  const chroma = new Array(12).fill(0);
  for (const { freq, confidence } of contour) {
    if (confidence < minConfidence || !isFinite(freq) || freq <= 0) continue;
    chroma[midiToPitchClass(freqToMidi(freq))] += confidence;
  }
  return chroma;
}

function correlate(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db; denA += da * da; denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// Correlates the chroma vector against all 24 rotations of the standard
// major/minor tonal profiles, returns the best match. Returns null if the
// contour has no frames confident enough to judge (e.g. pure silence).
function estimateKey(contour, minConfidence = 0.5) {
  const chroma = buildChroma(contour, minConfidence);
  if (chroma.every(v => v === 0)) return null;

  let best = { tonic: 0, mode: 'major', score: -Infinity };
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [['major', MAJOR_PROFILE], ['minor', MINOR_PROFILE]]) {
      const rotated = new Array(12);
      for (let i = 0; i < 12; i++) rotated[(tonic + i) % 12] = profile[i];
      const score = correlate(chroma, rotated);
      if (score > best.score) best = { tonic, mode, score };
    }
  }
  return {
    tonic: best.tonic,
    tonicName: PC_NAMES[best.tonic],
    mode: best.mode,
    confidence: best.score,
    chroma,
  };
}

const API = {
  NOTE_NAMES: PC_NAMES, freqToMidi, midiToPitchClass,
  detectPitchContour, buildChroma, estimateKey,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.BBBAudioAnalysis = API;
}
