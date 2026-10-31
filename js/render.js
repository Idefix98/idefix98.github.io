// Motore video: disegna i fotogrammi su un canvas verticale 720x1280
// e registra il risultato con MediaRecorder, tutto sul telefono.

export const W = 720;
export const H = 1280;

export const FILTERS = {
  none:    { label: 'Originale',     css: '' },
  vivid:   { label: 'Vivido',        css: 'saturate(1.45) contrast(1.08)' },
  warm:    { label: 'Caldo',         css: 'sepia(0.22) saturate(1.3) brightness(1.03)' },
  cool:    { label: 'Freddo',        css: 'saturate(0.95) hue-rotate(10deg) brightness(1.04) contrast(1.05)' },
  bw:      { label: 'Bianco e nero', css: 'grayscale(1) contrast(1.15)' },
  vintage: { label: 'Vintage',       css: 'sepia(0.45) saturate(0.85) contrast(0.92) brightness(1.06)' },
  drama:   { label: 'Drammatico',    css: 'contrast(1.35) saturate(0.8) brightness(0.92)' },
};

export function filterString(name, adj = {}) {
  const parts = [(FILTERS[name] || FILTERS.none).css];
  if (adj.brightness && adj.brightness !== 100) parts.push(`brightness(${adj.brightness / 100})`);
  if (adj.contrast && adj.contrast !== 100) parts.push(`contrast(${adj.contrast / 100})`);
  if (adj.saturate && adj.saturate !== 100) parts.push(`saturate(${adj.saturate / 100})`);
  const s = parts.filter(Boolean).join(' ');
  return s || 'none';
}

export function fmtTime(s) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Canvas piccolo per lo sfondo sfocato: ingrandirlo costa pochissimo.
const blurCanvas = document.createElement('canvas');
blurCanvas.width = 72;
blurCanvas.height = 128;
const bctx = blurCanvas.getContext('2d');

function sourceSize(src) {
  if (!src) return [0, 0];
  if (src.videoWidth !== undefined) return [src.videoWidth, src.videoHeight];
  return [src.naturalWidth || src.width, src.naturalHeight || src.height];
}

/**
 * Disegna un fotogramma completo: sorgente (video o immagine), filtro e scritte.
 * opts: { fit: 'cover'|'contain', filter, zoom, overlays: [], background }
 */
export function drawFrame(ctx, src, { fit = 'cover', filter = 'none', zoom = 1, overlays = [], background = null } = {}) {
  ctx.save();
  ctx.filter = 'none';
  if (background) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, background);
    g.addColorStop(1, '#17102A');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#000';
  }
  ctx.fillRect(0, 0, W, H);
  const [sw, sh] = sourceSize(src);
  if (src && sw && sh) {
    if (fit === 'contain') {
      const s0 = Math.max(72 / sw, 128 / sh);
      bctx.filter = `blur(3px) ${filter === 'none' ? '' : filter}`.trim();
      bctx.drawImage(src, (72 - sw * s0) / 2, (128 - sh * s0) / 2, sw * s0, sh * s0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(blurCanvas, -8, -8, W + 16, H + 16);
      ctx.globalAlpha = 1;
      const s = Math.min(W / sw, H / sh) * zoom;
      ctx.filter = filter;
      ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    } else {
      const s = Math.max(W / sw, H / sh) * zoom;
      ctx.filter = filter;
      ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
    }
    ctx.filter = 'none';
  }
  for (const o of overlays) if (o && o.text && o.text.trim()) drawText(ctx, o);
  ctx.restore();
}

function textColorOn(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#141018' : '#ffffff';
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Scritta sopra il video. style: 'outline' | 'box' | 'shadow'. y: posizione da 0 (alto) a 1 (basso). */
export function drawText(ctx, { text, size = 64, color = '#ffffff', style = 'outline', y = 0.5 }) {
  ctx.save();
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, W * 0.82);
  const lh = size * 1.2;
  const total = lh * lines.length;
  const center = Math.min(H - total / 2 - 70, Math.max(total / 2 + 70, y * H));
  let cy = center - total / 2 + lh / 2;
  for (const line of lines) {
    if (!line) { cy += lh; continue; }
    if (style === 'box') {
      const w = ctx.measureText(line).width;
      const padX = size * 0.34;
      ctx.fillStyle = color;
      roundRect(ctx, W / 2 - w / 2 - padX, cy - size * 0.6, w + padX * 2, size * 1.2, size * 0.22);
      ctx.fill();
      ctx.fillStyle = textColorOn(color);
      ctx.fillText(line, W / 2, cy + size * 0.04);
    } else if (style === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(line, W / 2, cy);
      ctx.fillStyle = color;
      ctx.fillText(line, W / 2, cy);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = size * 0.3;
      ctx.shadowOffsetY = size * 0.05;
      ctx.fillStyle = color;
      ctx.fillText(line, W / 2, cy);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    cy += lh;
  }
  ctx.restore();
}

function once(el, ev, timeout = 6000) {
  return new Promise((resolve) => {
    let t = 0;
    const done = () => { clearTimeout(t); el.removeEventListener(ev, done); resolve(); };
    el.addEventListener(ev, done);
    t = setTimeout(done, timeout);
  });
}

export async function seekTo(v, time) {
  const target = Math.max(0, Math.min(time, (v.duration || time) - 0.05));
  if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) return;
  const p = once(v, 'seeked');
  v.currentTime = target;
  await p;
}

/** Apre un video locale (blob URL) e aspetta che il primo fotogramma sia pronto. */
export function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.src = url;
    const fail = () => reject(new Error('video'));
    v.addEventListener('error', fail, { once: true });
    v.addEventListener('loadedmetadata', async () => {
      v.removeEventListener('error', fail);
      try {
        if (!isFinite(v.duration)) {
          // Alcuni video registrati dal browser non dichiarano la durata.
          const p = once(v, 'durationchange', 4000);
          v.currentTime = 1e7;
          await p;
        }
        await seekTo(v, 0.01);
        if (!isFinite(v.duration) || !v.videoWidth) throw new Error('video');
        resolve(v);
      } catch (e) {
        reject(e);
      }
    }, { once: true });
    v.load();
  });
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = url;
  });
}

export function pickMime() {
  const list = [
    // H.264 + AAC in MP4 è il formato accettato da tutte le app: si prova per primo.
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=avc3',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  if (!window.MediaRecorder) return null;
  for (const m of list) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea il video finale.
 * segments: [{kind:'video', url, start, dur, speed, caption} | {kind:'image', url, dur, caption} | {kind:'color', color, dur, caption}]
 * dur è sempre la durata nel video finale, in secondi.
 */
export async function renderVideo({
  segments, fit = 'cover', filter = 'none', overlay = null,
  keepAudio = true, origVolume = 1, music = null, musicVolume = 0.6,
  onProgress = () => {}, signal,
}) {
  const mime = pickMime();
  if (mime === null) {
    throw new Error('Su questo telefono il browser non permette di creare video. Aggiorna Chrome e riprova.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state !== 'running') await actx.resume();
  const dest = actx.createMediaStreamDestination();
  // Una traccia audio silenziosa garantisce che il file abbia sempre l'audio.
  const keepAlive = actx.createOscillator();
  const kg = actx.createGain();
  kg.gain.value = 0;
  keepAlive.connect(kg).connect(dest);
  keepAlive.start();

  const items = [];
  try {
    for (const seg of segments) {
      if (seg.kind === 'video') {
        const v = await loadVideo(seg.url);
        v.muted = !keepAudio;
        if (keepAudio) {
          const node = actx.createMediaElementSource(v);
          const g = actx.createGain();
          g.gain.value = origVolume;
          node.connect(g).connect(dest);
        }
        await seekTo(v, seg.start || 0);
        items.push({ seg, v });
      } else if (seg.kind === 'image') {
        items.push({ seg, img: await loadImage(seg.url) });
      } else {
        items.push({ seg });
      }
    }
  } catch (e) {
    keepAlive.stop();
    actx.close();
    throw new Error('Una delle clip non si apre. Prova a sostituirla con un altro file.');
  }

  const total = segments.reduce((s, x) => s + x.dur, 0);
  const vtrack = canvas.captureStream(30).getVideoTracks()[0];
  const stream = new MediaStream([vtrack, ...dest.stream.getAudioTracks()]);
  const recOpts = { videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 };
  if (mime) recOpts.mimeType = mime;
  const rec = new MediaRecorder(stream, recOpts);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });

  let aborted = false;
  const onAbort = () => { aborted = true; };
  signal?.addEventListener('abort', onAbort);

  const paint = (it, p) => {
    const overlays = [it.seg.caption, overlay].filter(Boolean);
    if (it.v) drawFrame(ctx, it.v, { fit, filter, overlays });
    else if (it.img) drawFrame(ctx, it.img, { fit, filter, overlays, zoom: 1 + 0.08 * p });
    else drawFrame(ctx, null, { overlays, background: it.seg.color || '#E0246B' });
  };

  paint(items[0], 0);
  await wait(60);
  rec.start(500);

  let musicSrc = null;
  if (music) {
    musicSrc = actx.createBufferSource();
    musicSrc.buffer = music;
    musicSrc.loop = music.duration < total;
    const mg = actx.createGain();
    const t0 = actx.currentTime;
    mg.gain.setValueAtTime(musicVolume, t0);
    mg.gain.setValueAtTime(musicVolume, t0 + Math.max(0, total - 0.6));
    mg.gain.linearRampToValueAtTime(0.0001, t0 + total);
    musicSrc.connect(mg).connect(dest);
    musicSrc.start();
  }

  let done = 0;
  try {
    for (const it of items) {
      if (aborted) break;
      const draw = (p) => {
        paint(it, p);
        onProgress(Math.min(1, (done + p * it.seg.dur) / total));
      };
      if (it.v) await playSegment(it.v, it.seg, draw, () => aborted);
      else await holdSegment(it.seg, draw, () => aborted);
      done += it.seg.dur;
    }
  } finally {
    await wait(150);
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    signal?.removeEventListener('abort', onAbort);
    try { musicSrc?.stop(); } catch { /* già finita */ }
    try { keepAlive.stop(); } catch { /* già fermo */ }
    vtrack.stop();
    for (const it of items) {
      if (it.v) { it.v.pause(); it.v.removeAttribute('src'); it.v.load(); }
    }
    actx.close();
  }

  if (aborted) throw new DOMException('Annullato', 'AbortError');
  const type = (mime || chunks[0]?.type || 'video/webm').split(';')[0];
  onProgress(1);
  return {
    blob: new Blob(chunks, { type }),
    type,
    ext: type.includes('mp4') ? 'mp4' : 'webm',
    duration: total,
  };
}

// Riproduce una clip disegnandola fotogramma per fotogramma.
// La durata segue l'orologio: se la clip finisce prima, resta fermo l'ultimo fotogramma.
function playSegment(v, seg, draw, isAborted) {
  return new Promise((resolve) => {
    const speed = seg.speed || 1;
    const start = seg.start || 0;
    const end = start + seg.dur * speed;
    let finished = false;
    let t0 = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      v.pause();
      resolve();
    };
    const safety = setTimeout(finish, seg.dur * 1000 + 5000);
    const loop = (now) => {
      if (finished) return;
      if (isAborted()) return finish();
      if (!t0) t0 = now;
      const p = (now - t0) / (seg.dur * 1000);
      draw(Math.min(1, p));
      if (p >= 1 || v.currentTime >= end - 0.02) return finish();
      requestAnimationFrame(loop);
    };
    v.playbackRate = speed;
    v.play()
      .then(() => requestAnimationFrame(loop))
      .catch(() => {
        v.muted = true;
        v.play().then(() => requestAnimationFrame(loop)).catch(finish);
      });
  });
}

function holdSegment(seg, draw, isAborted) {
  return new Promise((resolve) => {
    let t0 = 0;
    const loop = (now) => {
      if (isAborted()) return resolve();
      if (!t0) t0 = now;
      const p = (now - t0) / (seg.dur * 1000);
      draw(Math.min(1, p));
      if (p >= 1) return resolve();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

/** Miniatura JPEG di una clip o di una foto, per le schede dei template. */
export async function makeThumb(url, kind) {
  const c = document.createElement('canvas');
  c.width = 144;
  c.height = 256;
  const x = c.getContext('2d');
  let src;
  if (kind === 'video') {
    src = await loadVideo(url);
    await seekTo(src, Math.min(0.5, src.duration / 2));
  } else {
    src = await loadImage(url);
  }
  const [sw, sh] = sourceSize(src);
  const s = Math.max(144 / sw, 256 / sh);
  x.drawImage(src, (144 - sw * s) / 2, (256 - sh * s) / 2, sw * s, sh * s);
  const duration = kind === 'video' ? src.duration : 0;
  if (kind === 'video') { src.removeAttribute('src'); src.load(); }
  return { thumb: c.toDataURL('image/jpeg', 0.75), duration };
}
