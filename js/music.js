// Basi musicali originali, sintetizzate al momento sul telefono.
// Nessun campione e nessun brano esterno: ogni suono nasce da oscillatori e rumore,
// quindi le basi create con l'app si possono usare liberamente nei propri video.

const SR = 44100;

export const STYLES = {
  lofi:  { label: 'Lo-fi', bpm: [76, 88],   mode: 'minor7', swing: 0.16 },
  pop:   { label: 'Pop',   bpm: [104, 118], mode: 'major',  swing: 0 },
  trap:  { label: 'Trap',  bpm: [132, 148], mode: 'minor',  swing: 0 },
  chill: { label: 'Chill', bpm: [88, 100],  mode: 'major7', swing: 0.08 },
};

// Giri di accordi espressi come semitoni sopra la tonica.
const PROGRESSIONS = {
  major: [
    [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]],
    [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]],
    [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
    [[5, 9, 12], [7, 11, 14], [4, 7, 11], [9, 12, 16]],
  ],
  major7: [
    [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]],
    [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [0, 4, 7, 11]],
    [[0, 4, 7, 11], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 17]],
  ],
  minor: [
    [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
    [[0, 3, 7], [5, 8, 12], [10, 14, 17], [3, 7, 10]],
    [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14]],
  ],
  minor7: [
    [[0, 3, 7, 10], [5, 8, 12, 15], [10, 14, 17, 21], [3, 7, 10, 14]],
    [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],
    [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 20]],
  ],
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const SAT_CURVE = (() => {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(2.2 * x);
  }
  return c;
})();

export function newSeed() {
  return Math.floor(Math.random() * 1e9);
}

/**
 * Crea una base musicale e restituisce un AudioBuffer stereo.
 * @param {{style?: string, seed?: number, duration?: number}} opts
 */
export async function renderBeat({ style = 'lofi', seed = newSeed(), duration = 30 } = {}) {
  const cfg = STYLES[style] || STYLES.lofi;
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const len = Math.min(180, Math.max(4, duration));
  const bpm = Math.round(cfg.bpm[0] + r() * (cfg.bpm[1] - cfg.bpm[0]));
  const beat = 60 / bpm;
  const bar = beat * 4;
  // Si sintetizza un giro di 4 o 8 battute e poi lo si ripete: molto più veloce sul telefono.
  const loopBars = bar > 2.2 ? 4 : 8;
  const loopLen = loopBars * bar;
  const TAIL = 1.2;
  const renderLen = Math.min(loopLen, len) + TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(renderLen * SR), SR);

  const out = ctx.createGain();
  out.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  out.connect(comp);
  comp.connect(ctx.destination);

  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(out);
  const music = ctx.createGain();
  music.gain.value = 0.55;
  music.connect(out);

  const S = { ctx, noise: noiseBuffer(ctx), r, drums, music };
  const key = 45 + Math.floor(r() * 7);
  const prog = pick(PROGRESSIONS[cfg.mode]);
  const bars = Math.min(loopBars, Math.ceil(len / bar));
  const at8 = (b, i) => b * bar + (i * beat) / 2 + (i % 2 ? (cfg.swing * beat) / 2 : 0);
  const at16 = (b, i) => b * bar + (i * beat) / 4;

  const kickPat = {
    lofi: pick([[1, 0, 0, 1, 0, 1, 0, 0], [1, 0, 0, 0, 0, 1, 1, 0]]),
    pop: [1, 0, 1, 0, 1, 0, 1, 0],
    chill: pick([[1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 1, 0, 0, 1, 0]]),
  }[style];
  const trapKick = pick([
    [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
  ]);

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    const chord = prog[b % prog.length];
    const fill = b % 4 === 3;
    const tone = (n, oct) => mtof(key + oct + n);

    if (style === 'trap') {
      trapKick.forEach((on, i) => {
        if (!on) return;
        kick(S, at16(b, i), 1);
        bass808(S, at16(b, i), mtof(key - 12 + chord[0]), i === 0 ? beat * 1.8 : beat * 0.9);
      });
      snare(S, at16(b, 8), 0.8);
      for (let i = 0; i < 16; i++) {
        if (fill && i >= 12 && r() < 0.7) {
          hat(S, at16(b, i), 0.2);
          hat(S, at16(b, i) + beat / 8, 0.15);
        } else {
          hat(S, at16(b, i), i % 4 === 0 ? 0.24 : 0.15);
        }
      }
      pad(S, t, bar, chord.map((n) => tone(n, 12)), { type: 'sawtooth', cutoff: 700, vol: 0.045 });
      for (let q = 0; q < 4; q++) {
        if (r() < 0.5) pluck(S, t + q * beat, tone(chord[Math.floor(r() * chord.length)], 24), 0.06);
      }
      continue;
    }

    kickPat.forEach((on, i) => on && kick(S, at8(b, i), style === 'pop' ? 1 : 0.85));
    if (style === 'pop') {
      clap(S, at8(b, 2), 0.7);
      clap(S, at8(b, 6), 0.7);
    } else {
      const v = style === 'lofi' ? 0.55 : 0.32;
      snare(S, at8(b, 2), v);
      snare(S, at8(b, 6), v);
    }
    for (let i = 0; i < 8; i++) {
      if (style === 'pop') hat(S, at8(b, i), i % 2 ? 0.2 : 0.1, i % 2 === 1);
      else hat(S, at8(b, i), (i % 2 ? 0.09 : 0.15) * (0.8 + r() * 0.4));
    }

    if (style === 'lofi') {
      pad(S, t, bar, chord.map((n) => tone(n, 12)), { type: 'triangle', cutoff: 1100, vol: 0.09 });
      bass(S, t, tone(chord[0], 0), beat * 1.8, 0.16, 'triangle');
      bass(S, t + beat * 2, tone(chord[0], 0), beat * 1.6, 0.13, 'triangle');
      const notes = 2 + Math.floor(r() * 2);
      for (let k = 0; k < notes; k++) {
        pluck(S, at8(b, Math.floor(r() * 8)), tone(chord[Math.floor(r() * chord.length)], 24), 0.07);
      }
    } else if (style === 'pop') {
      pad(S, t, bar, chord.map((n) => tone(n, 12)), { type: 'sawtooth', cutoff: 1800, vol: 0.045 });
      const arp = [0, 1, 2, 1, 0, 1, 2, 1];
      for (let i = 0; i < 8; i++) {
        bass(S, at8(b, i), tone(chord[0], 0), (beat / 2) * 0.85, 0.15);
        pluck(S, at8(b, i), tone(chord[arp[i] % chord.length], 24), 0.055);
      }
    } else {
      pad(S, t, bar, chord.map((n) => tone(n, 12)), { type: 'sine', cutoff: 2000, vol: 0.08 });
      const arp = [0, 1, 2, 3, 2, 1, 2, 3];
      for (let i = 0; i < 8; i++) pluck(S, at8(b, i), tone(chord[arp[i] % chord.length], 24), 0.085);
      for (let i = 0; i < 16; i++) shaker(S, at16(b, i), 0.05 + (i % 2) * 0.03);
      bass(S, t, tone(chord[0], 0), bar * 0.9, 0.14, 'sine');
    }
  }

  if (style === 'lofi') crackle(S, Math.min(loopLen, len));
  const loop = await ctx.startRendering();
  return assemble(loop, len, loopLen);
}

// Ripete il giro fino alla durata richiesta (sovrapponendo le code delle note),
// porta il volume a un livello uniforme tra gli stili e aggiunge dissolvenze.
function assemble(loop, len, loopLen) {
  const outLen = Math.ceil(len * SR);
  const step = Math.round(loopLen * SR);
  const result = new AudioBuffer({ numberOfChannels: 2, length: outLen, sampleRate: SR });
  const chans = [result.getChannelData(0), result.getChannelData(1)];
  for (let c = 0; c < 2; c++) {
    const src = loop.getChannelData(c);
    const dst = chans[c];
    for (let off = 0; off < outLen; off += step) {
      const n = Math.min(src.length, outLen - off);
      for (let i = 0; i < n; i++) dst[off + i] += src[i];
    }
  }
  let peak = 0;
  let sq = 0;
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sq += d[i] * d[i];
    }
  }
  const rmsDb = 20 * Math.log10(Math.sqrt(sq / (outLen * 2)) || 1e-9);
  const gain = Math.min(0.89 / (peak || 1), 10 ** ((-16 - rmsDb) / 20));
  const fadeIn = Math.round(0.04 * SR);
  const fadeOut = Math.round(Math.min(1.5, len / 4) * SR);
  for (const d of chans) {
    for (let i = 0; i < outLen; i++) {
      let g = gain;
      if (i < fadeIn) g *= i / fadeIn;
      const fromEnd = outLen - i;
      if (fromEnd < fadeOut) g *= fromEnd / fadeOut;
      d[i] *= g;
    }
  }
  return result;
}

function noiseBuffer(ctx) {
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 22222;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    d[i] = s / 1073741823.5 - 1;
  }
  return b;
}

function envGain(ctx, t, attack, peak, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function kick({ ctx, drums }, t, vol) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
  const g = envGain(ctx, t, 0.002, vol, 0.38);
  o.connect(g).connect(drums);
  o.start(t);
  o.stop(t + 0.45);
}

function noiseHit({ ctx, noise, r }, dest, t, { type, freq, q = 0.7, vol, decay }) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = envGain(ctx, t, 0.001, vol, decay);
  s.connect(f).connect(g).connect(dest);
  s.start(t, r() * 1.5);
  s.stop(t + decay + 0.05);
}

function snare(S, t, vol) {
  noiseHit(S, S.drums, t, { type: 'bandpass', freq: 1900, q: 0.6, vol, decay: 0.17 });
  const o = S.ctx.createOscillator();
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
  const g = envGain(S.ctx, t, 0.001, vol * 0.5, 0.08);
  o.connect(g).connect(S.drums);
  o.start(t);
  o.stop(t + 0.12);
}

function clap(S, t, vol) {
  for (const d of [0, 0.011, 0.023]) {
    noiseHit(S, S.drums, t + d, {
      type: 'bandpass', freq: 1300, q: 0.9, vol: vol * (d ? 0.6 : 1), decay: d === 0.023 ? 0.16 : 0.03,
    });
  }
}

function hat(S, t, vol, open = false) {
  noiseHit(S, S.drums, t, { type: 'highpass', freq: 7500, q: 0.5, vol, decay: open ? 0.16 : 0.035 });
}

function shaker(S, t, vol) {
  noiseHit(S, S.drums, t, { type: 'bandpass', freq: 6000, q: 1.2, vol, decay: 0.05 });
}

function crackle(S, len) {
  const count = Math.floor(len * 5);
  for (let i = 0; i < count; i++) {
    noiseHit(S, S.music, S.r() * len, { type: 'highpass', freq: 3000, q: 0.5, vol: 0.05, decay: 0.004 });
  }
}

function pad({ ctx, music }, t, dur, freqs, { type, cutoff, vol }) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  f.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.3, dur * 0.2));
  g.gain.setValueAtTime(vol, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
  f.connect(g).connect(music);
  for (const fr of freqs) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }
}

function pluck({ ctx, music }, t, freq, vol) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(4000, t);
  f.frequency.exponentialRampToValueAtTime(800, t + 0.3);
  const g = envGain(ctx, t, 0.004, vol, 0.45);
  o.connect(f).connect(g).connect(music);
  o.start(t);
  o.stop(t + 0.5);
}

function bass({ ctx, music }, t, freq, dur, vol, type = 'sawtooth') {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.05));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function bass808({ ctx, drums }, t, freq, dur) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(freq * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  const sh = ctx.createWaveShaper();
  sh.curve = SAT_CURVE;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.008);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
  o.connect(sh).connect(g).connect(drums);
  o.start(t);
  o.stop(t + dur + 0.3);
}

/** Converte un AudioBuffer in un file WAV (16 bit). */
export function toWav(buffer) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const view = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  view.setUint32(4, 36 + len * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

/** Disegna la forma d'onda di un AudioBuffer su un canvas. */
export function drawWave(canvas, buffer, color = '#2AA6F2') {
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr)));
  const h = (canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr)));
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.fillStyle = color;
  const d = buffer.getChannelData(0);
  const gap = Math.max(3, Math.round(3 * dpr));
  const per = d.length / w;
  for (let x = 0; x < w; x += gap) {
    let m = 0;
    const from = Math.floor(x * per);
    const to = Math.min(d.length, Math.floor((x + gap) * per));
    for (let i = from; i < to; i += 32) m = Math.max(m, Math.abs(d[i]));
    const bh = Math.max(2, m * h * 0.92);
    c.fillRect(x, (h - bh) / 2, gap - Math.max(1, dpr), bh);
  }
}
