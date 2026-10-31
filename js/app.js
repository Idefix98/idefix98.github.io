import { W, H, FILTERS, filterString, drawFrame, renderVideo, loadVideo, seekTo, fmtTime, makeThumb } from './render.js';
import { STYLES, renderBeat, toWav, drawWave, newSeed } from './music.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const overlayEl = $('#overlay');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 1) => Number(n).toFixed(d).replace('.', ',');

// Base musicale scelta nella sezione Audio, passata all'editor.
const state = { music: null };
let cleanup = null;

const ICON = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 19M8.6 16.4 20 5"/></svg>',
  template: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="11" rx="2"/><rect x="13.5" y="3" width="7.5" height="7" rx="2"/><rect x="13.5" y="13" width="7.5" height="8" rx="2"/><rect x="3" y="17" width="7.5" height="4" rx="1.5"/></svg>',
  audio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
};

// ---------- navigazione ----------

const routes = { '': viewHome, home: viewHome, trend: viewTrend, edit: viewEdit, template: viewTemplate, audio: viewAudio };

function route() {
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const fn = routes[name] || viewHome;
  if (cleanup) { try { cleanup(); } catch { /* niente */ } cleanup = null; }
  closeOverlay();
  view.innerHTML = '';
  const active = name || 'home';
  $$('.tabs a').forEach((a) => {
    if (a.dataset.route === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  Promise.resolve(fn(arg ? decodeURIComponent(arg) : undefined)).catch((e) => {
    console.error(e);
    view.innerHTML = `<h1>Qualcosa non ha funzionato</h1><p>Questa sezione non si è aperta. Torna alla <a href="#/">schermata iniziale</a> e riprova.</p>`;
  });
}

function setupTabs() {
  const icons = { home: ICON.home, trend: ICON.trend, edit: ICON.edit, template: ICON.template, audio: ICON.audio };
  $$('.tabs a').forEach((a) => a.insertAdjacentHTML('afterbegin', icons[a.dataset.route]));
}

async function getData(name) {
  const r = await fetch(`data/${name}.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(name);
  return r.json();
}

function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

let toastTimer = 0;
function toast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- finestra sopra la pagina ----------

let overlayCleanup = null;
function openOverlay(html) {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  overlayEl.innerHTML = html;
  overlayEl.hidden = false;
  document.body.classList.add('locked');
  const focusable = $('button, a, video', overlayEl);
  focusable?.focus({ preventScroll: true });
}
function closeOverlay() {
  if (overlayCleanup) { overlayCleanup(); overlayCleanup = null; }
  overlayEl.hidden = true;
  overlayEl.innerHTML = '';
  document.body.classList.remove('locked');
}

// ---------- home ----------

function viewHome() {
  const tile = (route, tone, title, sub) => `
    <a class="tile ${tone}" href="#/${route}">
      <span class="glyph">${ICON[route]}</span>
      <strong>${title}</strong>
      <span>${sub}</span>
    </a>`;
  view.innerHTML = `
    <section class="home">
      <h1 class="hero">Crea il tuo prossimo video</h1>
      <p class="lead">Scegli un'idea, montala in pochi tocchi e aggiungi una base musicale tutta tua. I video restano sul tuo telefono.</p>
      <div class="tiles">
        ${tile('trend', 'pink', 'Trend', 'Idee e formati da provare')}
        ${tile('edit', 'blue', 'Editing', 'Taglia, scrivi, colora')}
        ${tile('template', 'blue', 'Template', 'Video pronti da riempire')}
        ${tile('audio', 'pink', 'Audio', 'Basi musicali originali')}
      </div>
    </section>`;
}

// ---------- trend ----------

async function viewTrend() {
  view.innerHTML = '<h1>Idee e formati</h1><p class="muted">Carico le idee…</p>';
  let d;
  try { d = await getData('trends'); } catch {
    view.innerHTML = '<h1>Idee e formati</h1><p>Le idee non si sono caricate. Controlla la connessione e riapri la sezione.</p>';
    return;
  }
  const card = (it) => `
    <article class="card trend">
      <h2>${esc(it.title)}</h2>
      <p>${esc(it.description)}</p>
      ${it.ideas?.length ? `<p class="muted"><strong>Idee:</strong> ${esc(it.ideas.join('; '))}</p>` : ''}
      ${it.steps?.length ? `<ol class="steps">${it.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      ${it.hashtags?.length ? `<p class="tags">${it.hashtags.map((h) => `<span>${esc(h)}</span>`).join(' ')}</p>` : ''}
      <div class="actions">
        ${it.template ? `<a class="btn" href="#/template/${encodeURIComponent(it.template)}">Usa il template</a>` : ''}
        ${it.hashtags?.length ? `<button class="btn secondary" type="button" data-copy="${esc(it.hashtags.join(' '))}">Copia hashtag</button>` : ''}
        ${it.link ? `<a class="btn secondary" href="${esc(it.link)}" target="_blank" rel="noopener">Guarda un esempio</a>` : ''}
      </div>
    </article>`;
  view.innerHTML = `
    <h1>${esc(d.title || 'Idee e formati')}</h1>
    <p class="lead">${esc(d.intro || '')}</p>
    ${d.updated ? `<p class="small muted">Aggiornato il ${fmtDate(d.updated)}</p>` : ''}
    ${(d.items || []).map(card).join('')}`;
  const onCopy = async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Hashtag copiati'); } catch { toast('Copia non riuscita: tieni premuto sul testo per copiarlo'); }
  };
  view.addEventListener('click', onCopy);
  cleanup = () => view.removeEventListener('click', onCopy);
}

// ---------- editing ----------

function viewEdit() {
  const ed = {
    v: null, url: null, dur: 0, trimStart: 0, trimEnd: 0, speed: 1,
    filter: 'none', adj: { brightness: 100, contrast: 100, saturate: 100 }, fit: 'cover',
    text: { text: '', size: 68, color: '#ffffff', style: 'outline', y: 0.78 },
    keepAudio: true, origVolume: 1, music: state.music, musicVolume: 0.6, panel: 'trim',
  };
  let raf = 0;
  let playing = false;
  let actx = null;
  let musicNode = null;
  let canvas;
  let c2d;

  view.innerHTML = '<h1>Editing</h1><div id="ed"></div>';
  const root = $('#ed');
  const outDur = () => (ed.trimEnd - ed.trimStart) / ed.speed;

  cleanup = () => {
    pause();
    if (ed.v) { ed.v.removeAttribute('src'); ed.v.load(); }
    if (ed.url) URL.revokeObjectURL(ed.url);
    actx?.close();
  };

  renderEmpty();

  function renderEmpty() {
    root.innerHTML = `
      <div class="empty">
        <p>Scegli un video dalla galleria. Potrai tagliarlo, aggiungere una scritta, un filtro e una base musicale.</p>
        <label class="btn block">Scegli un video<input type="file" accept="video/*" hidden></label>
      </div>`;
    $('input', root).addEventListener('change', (e) => e.target.files[0] && openFile(e.target.files[0]));
  }

  async function openFile(file) {
    pause();
    root.innerHTML = '<p class="muted">Apro il video…</p>';
    if (ed.v) { ed.v.removeAttribute('src'); ed.v.load(); }
    if (ed.url) URL.revokeObjectURL(ed.url);
    ed.url = URL.createObjectURL(file);
    try {
      ed.v = await loadVideo(ed.url);
    } catch {
      toast('Questo video non si apre. Prova con un altro file.');
      renderEmpty();
      return;
    }
    ed.dur = ed.v.duration;
    ed.trimStart = 0;
    ed.trimEnd = ed.dur;
    ed.v.addEventListener('seeked', () => { if (!playing) redraw(); });
    renderEditor();
  }

  function renderEditor() {
    root.innerHTML = `
      <div class="stage"><canvas width="${W}" height="${H}" aria-label="Anteprima del video"></canvas></div>
      <div class="playbar">
        <button class="round" type="button" data-act="play" aria-label="Riproduci">${ICON.play}</button>
        <input type="range" class="scrub" min="0" max="1000" value="0" aria-label="Posizione nell'anteprima">
        <span class="time">0:00.0</span>
      </div>
      <div class="panel-tabs" role="tablist" aria-label="Strumenti">
        ${[['trim', 'Taglia'], ['text', 'Testo'], ['filter', 'Filtri'], ['speed', 'Velocità'], ['audio', 'Audio'], ['format', 'Formato']]
          .map(([k, l]) => `<button class="chip" type="button" role="tab" data-panel="${k}" aria-selected="${ed.panel === k}">${l}</button>`).join('')}
      </div>
      <div class="panel" role="tabpanel"></div>
      <p class="summary small muted"></p>
      <button class="btn block cta" type="button" data-act="export">Crea il video</button>
      <label class="btn secondary block">Cambia video<input type="file" accept="video/*" hidden></label>`;
    canvas = $('canvas', root);
    c2d = canvas.getContext('2d');
    $('[data-act=play]', root).onclick = () => (playing ? pause() : play());
    $('[data-act=export]', root).onclick = doExport;
    $('input[type=file]', root).addEventListener('change', (e) => e.target.files[0] && openFile(e.target.files[0]));
    $('.scrub', root).addEventListener('input', (e) => {
      const t = ed.trimStart + (e.target.value / 1000) * (ed.trimEnd - ed.trimStart);
      ed.v.currentTime = t;
      if (playing) restartMusic();
      updateTime();
    });
    $$('[data-panel]', root).forEach((b) => (b.onclick = () => { ed.panel = b.dataset.panel; renderPanel(); }));
    renderPanel();
    redraw();
    updateSummary();
  }

  function overlayText() {
    return ed.text.text.trim() ? { ...ed.text } : null;
  }

  function redraw() {
    if (!c2d || !ed.v) return;
    drawFrame(c2d, ed.v, { fit: ed.fit, filter: filterString(ed.filter, ed.adj), overlays: [overlayText()] });
  }

  function updateTime() {
    const pos = Math.max(0, (ed.v.currentTime - ed.trimStart) / ed.speed);
    $('.time', root).textContent = fmtTime(pos);
    const span = ed.trimEnd - ed.trimStart || 1;
    $('.scrub', root).value = Math.round(((ed.v.currentTime - ed.trimStart) / span) * 1000);
  }

  function updateSummary() {
    const s = $('.summary', root);
    if (s) s.textContent = `Durata del video finale: ${num(outDur())} secondi`;
  }

  function setPlayIcon() {
    const b = $('[data-act=play]', root);
    if (!b) return;
    b.innerHTML = playing ? ICON.pause : ICON.play;
    b.setAttribute('aria-label', playing ? 'Metti in pausa' : 'Riproduci');
  }

  function play() {
    if (!ed.v || playing) return;
    playing = true;
    if (ed.v.currentTime < ed.trimStart || ed.v.currentTime >= ed.trimEnd - 0.05) ed.v.currentTime = ed.trimStart;
    ed.v.playbackRate = ed.speed;
    ed.v.muted = !ed.keepAudio;
    ed.v.volume = ed.origVolume;
    ed.v.play().catch(() => { ed.v.muted = true; ed.v.play().catch(() => pause()); });
    startMusic();
    loop();
    setPlayIcon();
  }

  function loop() {
    redraw();
    updateTime();
    if (ed.v.currentTime >= ed.trimEnd - 0.03 || ed.v.ended) {
      ed.v.currentTime = ed.trimStart;
      if (ed.v.paused) ed.v.play().catch(() => {});
      restartMusic();
    }
    if (playing) raf = requestAnimationFrame(loop);
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    ed.v?.pause();
    stopMusic();
    setPlayIcon();
    redraw();
  }

  function startMusic() {
    if (!ed.music?.buffer) return;
    actx ||= new AudioContext();
    actx.resume();
    stopMusic();
    const src = actx.createBufferSource();
    src.buffer = ed.music.buffer;
    src.loop = true;
    const g = actx.createGain();
    g.gain.value = ed.musicVolume;
    src.connect(g).connect(actx.destination);
    const off = Math.max(0, ((ed.v.currentTime - ed.trimStart) / ed.speed) % ed.music.buffer.duration);
    src.start(0, off);
    musicNode = { src, g };
  }
  function stopMusic() {
    if (musicNode) { try { musicNode.src.stop(); } catch { /* ferma */ } musicNode = null; }
  }
  function restartMusic() {
    if (playing) startMusic();
  }

  function renderPanel() {
    $$('[data-panel]', root).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === ed.panel)));
    const p = $('.panel', root);
    const range = (k, label, min, max, step, val, fmt) => `
      <div class="field">
        <div class="row"><label for="r-${k}">${label}</label><span class="small muted" data-out="${k}">${fmt(val)}</span></div>
        <input id="r-${k}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-k="${k}">
      </div>`;
    const pct = (v) => `${Math.round(v)}%`;

    if (ed.panel === 'trim') {
      p.innerHTML = range('trimStart', 'Inizio', 0, ed.dur, 0.1, ed.trimStart, fmtTime)
        + range('trimEnd', 'Fine', 0, ed.dur, 0.1, ed.trimEnd, fmtTime)
        + '<p class="small muted">Sposta i cursori per tenere solo la parte che ti serve.</p>';
    } else if (ed.panel === 'text') {
      const colors = ['#ffffff', '#141018', '#FFD84D', '#E0246B', '#2AA6F2', '#3DDC97'];
      p.innerHTML = `
        <div class="field"><label for="t-text">Scritta</label>
          <textarea id="t-text" rows="2" placeholder="Scrivi una frase…" data-k="text">${esc(ed.text.text)}</textarea></div>
        <div class="field"><label>Colore</label>
          <div class="swatches">${colors.map((c) => `<button type="button" style="background:${c}" data-color="${c}" aria-label="Colore ${c}" aria-pressed="${ed.text.color === c}"></button>`).join('')}</div></div>
        <div class="field"><label>Stile</label>
          <div class="seg">${[['outline', 'Contorno'], ['box', 'Riquadro'], ['shadow', 'Ombra']].map(([k, l]) => `<button type="button" data-style="${k}" aria-pressed="${ed.text.style === k}">${l}</button>`).join('')}</div></div>
        ${range('size', 'Grandezza', 36, 120, 2, ed.text.size, (v) => `${v}`)}
        ${range('y', 'Posizione (dall\'alto in basso)', 0.08, 0.92, 0.01, ed.text.y, (v) => `${Math.round(v * 100)}%`)}`;
    } else if (ed.panel === 'filter') {
      p.innerHTML = `
        <div class="chips">${Object.entries(FILTERS).map(([k, f]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ed.filter === k}">${f.label}</button>`).join('')}</div>
        ${range('brightness', 'Luminosità', 50, 150, 1, ed.adj.brightness, pct)}
        ${range('contrast', 'Contrasto', 50, 150, 1, ed.adj.contrast, pct)}
        ${range('saturate', 'Saturazione', 0, 200, 1, ed.adj.saturate, pct)}`;
    } else if (ed.panel === 'speed') {
      p.innerHTML = `
        <div class="seg">${[0.5, 0.75, 1, 1.5, 2].map((s) => `<button type="button" data-speed="${s}" aria-pressed="${ed.speed === s}">${num(s, s % 1 ? (s === 0.75 ? 2 : 1) : 0)}x</button>`).join('')}</div>
        <p class="small muted">Rallenta per i momenti da gustare, accelera per i passaggi lunghi.</p>`;
    } else if (ed.panel === 'audio') {
      p.innerHTML = `
        <label class="check"><input type="checkbox" data-k="keepAudio" ${ed.keepAudio ? 'checked' : ''}> Tieni l'audio del video</label>
        ${range('origVolume', 'Volume dell\'audio del video', 0, 1, 0.05, ed.origVolume, (v) => `${Math.round(v * 100)}%`)}
        <div class="field"><label>Base musicale</label>
          <div class="chips">
            <button type="button" class="chip" data-beat="none" aria-pressed="${!ed.music}">Nessuna</button>
            ${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="chip" data-beat="${k}" aria-pressed="${ed.music?.style === k}">${s.label}</button>`).join('')}
          </div>
          <p class="small muted beat-note">${ed.music ? `Base ${STYLES[ed.music.style].label} pronta. Premi play per sentirla con il video.` : "Le basi sono create dall'app: puoi usarle liberamente nei tuoi video."}</p>
          ${ed.music ? '<button type="button" class="btn secondary" data-act="newbeat">Crea un\'altra base</button>' : ''}
        </div>
        ${ed.music ? range('musicVolume', 'Volume della base', 0, 1, 0.05, ed.musicVolume, (v) => `${Math.round(v * 100)}%`) : ''}`;
    } else if (ed.panel === 'format') {
      p.innerHTML = `
        <div class="seg">
          <button type="button" data-fit="cover" aria-pressed="${ed.fit === 'cover'}">Riempi lo schermo</button>
          <button type="button" data-fit="contain" aria-pressed="${ed.fit === 'contain'}">Intero con sfondo</button>
        </div>
        <p class="small muted">"Riempi lo schermo" taglia i bordi per occupare tutto il verticale. "Intero con sfondo" mostra tutto il video su uno sfondo sfocato, utile per i video orizzontali.</p>`;
    }
    bindPanel(p);
  }

  function bindPanel(p) {
    $$('input[type=range]', p).forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k;
      let v = parseFloat(inp.value);
      if (k === 'trimStart') { v = Math.min(v, ed.trimEnd - 0.5); ed.trimStart = Math.max(0, v); inp.value = ed.trimStart; seekTo(ed.v, ed.trimStart); }
      else if (k === 'trimEnd') { v = Math.max(v, ed.trimStart + 0.5); ed.trimEnd = Math.min(ed.dur, v); inp.value = ed.trimEnd; seekTo(ed.v, ed.trimEnd - 0.05); }
      else if (k === 'size' || k === 'y') ed.text[k] = v;
      else if (k in ed.adj) ed.adj[k] = v;
      else if (k === 'origVolume') { ed.origVolume = v; if (ed.v) ed.v.volume = v; }
      else if (k === 'musicVolume') { ed.musicVolume = v; if (musicNode) musicNode.g.gain.value = v; }
      const out = $(`[data-out="${k}"]`, p);
      if (out) {
        const fmts = { trimStart: fmtTime, trimEnd: fmtTime, size: (x) => `${x}`, y: (x) => `${Math.round(x * 100)}%`, origVolume: (x) => `${Math.round(x * 100)}%`, musicVolume: (x) => `${Math.round(x * 100)}%` };
        out.textContent = (fmts[k] || ((x) => `${Math.round(x)}%`))(parseFloat(inp.value));
      }
      updateSummary();
      if (!playing) redraw();
    }));
    const ta = $('textarea', p);
    if (ta) ta.addEventListener('input', () => { ed.text.text = ta.value; if (!playing) redraw(); });
    $$('[data-color]', p).forEach((b) => (b.onclick = () => { ed.text.color = b.dataset.color; renderPanel(); redraw(); }));
    $$('[data-style]', p).forEach((b) => (b.onclick = () => { ed.text.style = b.dataset.style; renderPanel(); redraw(); }));
    $$('[data-filter]', p).forEach((b) => (b.onclick = () => { ed.filter = b.dataset.filter; renderPanel(); redraw(); }));
    $$('[data-speed]', p).forEach((b) => (b.onclick = () => {
      ed.speed = parseFloat(b.dataset.speed);
      if (ed.v) ed.v.playbackRate = ed.speed;
      restartMusic();
      renderPanel();
      updateSummary();
    }));
    $$('[data-fit]', p).forEach((b) => (b.onclick = () => { ed.fit = b.dataset.fit; renderPanel(); redraw(); }));
    const cb = $('[data-k=keepAudio]', p);
    if (cb) cb.onchange = () => { ed.keepAudio = cb.checked; if (ed.v) ed.v.muted = !cb.checked; };
    $$('[data-beat]', p).forEach((b) => (b.onclick = () => chooseBeat(b.dataset.beat)));
    const nb = $('[data-act=newbeat]', p);
    if (nb) nb.onclick = () => chooseBeat(ed.music.style, true);
  }

  async function chooseBeat(style, fresh = false) {
    if (style === 'none') { ed.music = null; stopMusic(); renderPanel(); return; }
    if (!fresh && ed.music?.style === style) return;
    const note = $('.beat-note', root);
    if (note) note.textContent = 'Creo la base…';
    $$('[data-beat], [data-act=newbeat]', root).forEach((b) => (b.disabled = true));
    try {
      const seed = newSeed();
      const buffer = await renderBeat({ style, seed, duration: Math.min(180, Math.max(8, Math.ceil(outDur()) + 2)) });
      ed.music = { buffer, style, seed };
      state.music = ed.music;
      restartMusic();
    } catch (e) {
      console.error(e);
      toast('La base non è stata creata. Riprova.');
    }
    renderPanel();
  }

  async function doExport() {
    if (!ed.v) return;
    pause();
    await runExport({
      segments: [{ kind: 'video', url: ed.url, start: ed.trimStart, dur: outDur(), speed: ed.speed }],
      fit: ed.fit,
      filter: filterString(ed.filter, ed.adj),
      overlay: overlayText(),
      keepAudio: ed.keepAudio,
      origVolume: ed.origVolume,
      music: ed.music?.buffer || null,
      musicVolume: ed.musicVolume,
    });
  }
}

// ---------- esportazione e risultato ----------

async function runExport(opts) {
  const ctrl = new AbortController();
  openOverlay(`
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ex-title">
      <h2 id="ex-title">Sto creando il video</h2>
      <div class="progress" aria-hidden="true"><i></i></div>
      <p class="pct" aria-live="polite">0%</p>
      <p class="small muted">Il video si registra in tempo reale, quindi ci vuole quanto la sua durata. Tieni l'app aperta e lo schermo acceso.</p>
      <button class="btn secondary block" type="button" data-act="cancel">Annulla</button>
    </div>`);
  const bar = $('.progress i', overlayEl);
  const pct = $('.pct', overlayEl);
  $('[data-act=cancel]', overlayEl).onclick = () => ctrl.abort();
  let lock = null;
  try { lock = await navigator.wakeLock?.request('screen'); } catch { /* non supportato */ }
  let last = -1;
  try {
    const res = await renderVideo({
      ...opts,
      signal: ctrl.signal,
      onProgress: (p) => {
        const v = Math.round(p * 100);
        if (v === last) return;
        last = v;
        bar.style.width = `${v}%`;
        pct.textContent = `${v}%`;
      },
    });
    showResult(res);
  } catch (e) {
    if (e.name === 'AbortError') { closeOverlay(); toast('Creazione annullata'); }
    else {
      console.error(e);
      openOverlay(`
        <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="err-title">
          <h2 id="err-title">Il video non è stato creato</h2>
          <p>${esc(e.message && e.message.length > 12 ? e.message : 'Prova con una clip più corta oppure aggiorna Chrome e riprova.')}</p>
          <button class="btn block" type="button" data-act="close">Chiudi</button>
        </div>`);
      $('[data-act=close]', overlayEl).onclick = closeOverlay;
    }
  } finally {
    lock?.release?.().catch(() => {});
  }
}

function showResult({ blob, type, ext, duration }) {
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  const name = `popjump-${stamp}.${ext}`;
  const file = new File([blob], name, { type });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  openOverlay(`
    <div class="sheet result" role="dialog" aria-modal="true" aria-labelledby="res-title">
      <h2 id="res-title">Il video è pronto</h2>
      <video src="${url}" controls playsinline></video>
      <p class="small muted">${num(duration)} secondi, ${num(blob.size / 1e6)} MB</p>
      <div class="stack">
        ${canShare ? '<button class="btn block" type="button" data-act="share">Condividi</button>' : ''}
        <a class="btn ${canShare ? 'secondary' : ''} block" href="${url}" download="${name}">Salva sul telefono</a>
        <button class="btn secondary block" type="button" data-act="close">Chiudi</button>
      </div>
      <p class="small muted">Per pubblicarlo tocca Condividi e scegli l'app in cui caricarlo, oppure salvalo e caricalo dalla galleria.</p>
    </div>`);
  overlayCleanup = () => URL.revokeObjectURL(url);
  $('[data-act=close]', overlayEl).onclick = closeOverlay;
  const sh = $('[data-act=share]', overlayEl);
  if (sh) sh.onclick = () => navigator.share({ files: [file], title: 'Il mio video' }).catch(() => {});
}

// ---------- template ----------

const slotTone = (i) => (i % 2 ? '#2AA6F2' : '#E0246B');
const tplTotal = (t) => t.slots.reduce((s, x) => s + x.dur, 0);
function bars(t) {
  return `<div class="bars" aria-hidden="true">${t.slots.map((s, i) => `<i style="flex:${s.dur};background:${slotTone(i)}"></i>`).join('')}</div>`;
}

async function viewTemplate(id) {
  let d;
  view.innerHTML = '<h1>Template</h1><p class="muted">Carico i template…</p>';
  try { d = await getData('templates'); } catch {
    view.innerHTML = '<h1>Template</h1><p>I template non si sono caricati. Controlla la connessione e riapri la sezione.</p>';
    return;
  }
  const list = d.templates || [];
  if (!id) {
    view.innerHTML = `
      <h1>Template</h1>
      <p class="lead">Scegli una struttura, metti le tue clip o foto negli spazi e il video si monta da solo.</p>
      ${list.map((t) => `
        <a class="card tpl" href="#/template/${encodeURIComponent(t.id)}">
          <h2>${esc(t.name)}</h2>
          <p class="muted">${esc(t.description)}</p>
          ${bars(t)}
          <p class="small muted">${t.slots.length} ${t.slots.length === 1 ? 'spazio' : 'spazi'}, ${num(tplTotal(t))} secondi</p>
        </a>`).join('')}`;
    return;
  }
  const t = list.find((x) => x.id === id);
  if (!t) {
    view.innerHTML = '<h1>Template non trovato</h1><p>Questo template non esiste più. <a href="#/template">Guarda tutti i template</a>.</p>';
    return;
  }
  templateEditor(t);
}

function templateEditor(t) {
  const st = {
    slots: t.slots.map((s, i) => ({ ...s, kind: null, url: null, thumb: null, start: 0, mediaDur: 0, color: slotTone(i) })),
    musicStyle: t.music && STYLES[t.music] ? t.music : 'pop',
    music: null,
    keepAudio: false,
    filter: 'none',
  };
  const cap = { style: 'box', color: '#ffffff', size: 58, y: 0.2, ...(t.captionStyle || {}) };
  cleanup = () => st.slots.forEach((s) => s.url && URL.revokeObjectURL(s.url));

  const slotHTML = (s, i) => `
    <div class="slot" data-i="${i}">
      <label class="thumb ${s.thumb ? 'filled' : ''}" style="${s.thumb ? `background-image:url('${s.thumb}')` : ''}">
        ${s.thumb ? '<span class="sr">Cambia</span>' : '<span>Aggiungi</span>'}
        <input type="file" accept="video/*,image/*" hidden data-file="${i}" aria-label="Scegli clip o foto per ${esc(s.label)}">
      </label>
      <div class="slot-body">
        <div class="row"><strong>${esc(s.label)}</strong><span class="small muted">${num(s.dur)} s</span></div>
        <input type="text" value="${esc(s.caption || '')}" placeholder="${esc(s.hint || 'Scritta (facoltativa)')}" data-cap="${i}" aria-label="Scritta per ${esc(s.label)}">
        ${s.kind === 'video' && s.mediaDur > s.dur + 0.3 ? `
          <div class="row small"><label for="st-${i}">Parti da</label><span class="muted" data-startout="${i}">${fmtTime(s.start)}</span></div>
          <input id="st-${i}" type="range" min="0" max="${(s.mediaDur - s.dur).toFixed(1)}" step="0.1" value="${s.start}" data-start="${i}">` : ''}
        ${s.kind ? `<button type="button" class="link" data-clear="${i}">Togli ${s.kind === 'video' ? 'la clip' : 'la foto'}</button>` : ''}
      </div>
    </div>`;

  function render() {
    view.innerHTML = `
      <a class="back" href="#/template">Tutti i template</a>
      <h1>${esc(t.name)}</h1>
      <p class="muted">${esc(t.description)}</p>
      ${bars(t)}
      <p class="small muted">${num(tplTotal(t))} secondi in tutto. Gli spazi vuoti diventano schermate colorate con la scritta.</p>
      <div class="slots">${st.slots.map(slotHTML).join('')}</div>
      <h2>Musica</h2>
      <div class="chips">
        <button type="button" class="chip" data-beat="none" aria-pressed="${st.musicStyle === 'none'}">Nessuna</button>
        ${Object.entries(STYLES).map(([k, s]) => `<button type="button" class="chip" data-beat="${k}" aria-pressed="${st.musicStyle === k}">${s.label}</button>`).join('')}
      </div>
      <p class="small muted">La base viene creata dall'app quando premi "Crea il video".</p>
      <h2>Filtro</h2>
      <div class="chips">${Object.entries(FILTERS).map(([k, f]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${st.filter === k}">${f.label}</button>`).join('')}</div>
      <label class="check"><input type="checkbox" data-k="keepAudio" ${st.keepAudio ? 'checked' : ''}> Tieni l'audio delle clip</label>
      <button class="btn block cta" type="button" data-act="make">Crea il video</button>`;
    bind();
  }

  function bind() {
    $$('[data-file]', view).forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      const i = +inp.dataset.file;
      const s = st.slots[i];
      const kind = f.type.startsWith('image/') ? 'image' : 'video';
      if (s.url) URL.revokeObjectURL(s.url);
      const url = URL.createObjectURL(f);
      try {
        const { thumb, duration } = await makeThumb(url, kind);
        Object.assign(s, { kind, url, thumb, mediaDur: duration, start: 0 });
      } catch {
        URL.revokeObjectURL(url);
        toast('Questo file non si apre. Prova con un altro.');
        return;
      }
      render();
    }));
    $$('[data-cap]', view).forEach((inp) => inp.addEventListener('input', () => { st.slots[+inp.dataset.cap].caption = inp.value; }));
    $$('[data-start]', view).forEach((inp) => inp.addEventListener('input', () => {
      const i = +inp.dataset.start;
      st.slots[i].start = parseFloat(inp.value);
      $(`[data-startout="${i}"]`, view).textContent = fmtTime(st.slots[i].start);
    }));
    $$('[data-clear]', view).forEach((b) => (b.onclick = () => {
      const s = st.slots[+b.dataset.clear];
      if (s.url) URL.revokeObjectURL(s.url);
      Object.assign(s, { kind: null, url: null, thumb: null, mediaDur: 0, start: 0 });
      render();
    }));
    $$('[data-beat]', view).forEach((b) => (b.onclick = () => { st.musicStyle = b.dataset.beat; st.music = null; render(); }));
    $$('[data-filter]', view).forEach((b) => (b.onclick = () => { st.filter = b.dataset.filter; render(); }));
    const cb = $('[data-k=keepAudio]', view);
    cb.onchange = () => { st.keepAudio = cb.checked; };
    $('[data-act=make]', view).onclick = make;
  }

  async function make() {
    const btn = $('[data-act=make]', view);
    const total = tplTotal(t);
    let music = null;
    if (st.musicStyle !== 'none') {
      btn.disabled = true;
      btn.textContent = 'Creo la base…';
      try { music = await renderBeat({ style: st.musicStyle, seed: newSeed(), duration: Math.ceil(total) + 2 }); } catch (e) { console.error(e); }
      btn.disabled = false;
      btn.textContent = 'Crea il video';
    }
    const segments = st.slots.map((s) => {
      const caption = s.caption && s.caption.trim() ? { ...cap, text: s.caption } : null;
      if (s.kind === 'video') return { kind: 'video', url: s.url, start: s.start, dur: s.dur, speed: 1, caption };
      if (s.kind === 'image') return { kind: 'image', url: s.url, dur: s.dur, caption };
      return { kind: 'color', color: s.color, dur: s.dur, caption };
    });
    await runExport({
      segments, fit: 'cover', filter: filterString(st.filter), keepAudio: st.keepAudio, origVolume: 1, music, musicVolume: 0.7,
    });
  }

  render();
}

// ---------- audio ----------

async function viewAudio() {
  const a = { style: state.music?.style || 'lofi', dur: 30, music: state.music };
  let actx = null;
  let node = null;
  let wavUrl = null;
  cleanup = () => { stop(); actx?.close(); if (wavUrl) URL.revokeObjectURL(wavUrl); };

  view.innerHTML = `
    <h1>Audio</h1>
    <p class="lead">Crea una base musicale originale in pochi secondi. La genera l'app sul tuo telefono, quindi puoi usarla nei tuoi video senza problemi di copyright.</p>
    <div class="card">
      <div class="field"><label>Stile</label><div class="chips" id="styles"></div></div>
      <div class="field">
        <div class="row"><label for="dur">Durata</label><span class="small muted" id="durv">30 secondi</span></div>
        <input id="dur" type="range" min="10" max="90" step="5" value="30">
      </div>
      <button class="btn block" type="button" id="gen">Crea la base</button>
      <div id="out"></div>
    </div>
    <div id="sounds"></div>`;

  const stylesEl = $('#styles');
  const renderStyles = () => {
    stylesEl.innerHTML = Object.entries(STYLES).map(([k, s]) => `<button type="button" class="chip" data-style="${k}" aria-pressed="${a.style === k}">${s.label}</button>`).join('');
    $$('[data-style]', stylesEl).forEach((b) => (b.onclick = () => { a.style = b.dataset.style; renderStyles(); }));
  };
  renderStyles();
  $('#dur').addEventListener('input', (e) => { a.dur = +e.target.value; $('#durv').textContent = `${a.dur} secondi`; });
  $('#gen').onclick = () => generate();

  function stop() {
    if (node) { try { node.stop(); } catch { /* ferma */ } node = null; }
    const pb = $('[data-act=listen]');
    if (pb) pb.textContent = 'Ascolta';
  }

  async function generate() {
    stop();
    const gen = $('#gen');
    gen.disabled = true;
    gen.textContent = 'Creo la base…';
    try {
      const seed = newSeed();
      const buffer = await renderBeat({ style: a.style, seed, duration: a.dur });
      a.music = { buffer, style: a.style, seed };
      showOut();
    } catch (e) {
      console.error(e);
      toast('La base non è stata creata. Riprova.');
    }
    gen.disabled = false;
    gen.textContent = 'Crea un\'altra base';
  }

  function showOut() {
    const out = $('#out');
    out.innerHTML = `
      <canvas class="wave" aria-label="Forma d'onda della base"></canvas>
      <p class="small muted">Base ${STYLES[a.music.style].label}, ${Math.round(a.music.buffer.duration)} secondi</p>
      <div class="stack">
        <button class="btn blue block" type="button" data-act="listen">Ascolta</button>
        <button class="btn secondary block" type="button" data-act="use">Usa nel montaggio</button>
        <a class="btn secondary block" data-act="wav" download="base-${a.music.style}-${a.music.seed}.wav">Scarica la base (WAV)</a>
      </div>`;
    drawWave($('canvas', out), a.music.buffer, '#2AA6F2');
    if (wavUrl) URL.revokeObjectURL(wavUrl);
    wavUrl = URL.createObjectURL(toWav(a.music.buffer));
    $('[data-act=wav]', out).href = wavUrl;
    $('[data-act=listen]', out).onclick = () => {
      if (node) return stop();
      actx ||= new AudioContext();
      actx.resume();
      node = actx.createBufferSource();
      node.buffer = a.music.buffer;
      node.connect(actx.destination);
      node.onended = () => { node = null; const pb = $('[data-act=listen]'); if (pb) pb.textContent = 'Ascolta'; };
      node.start();
      $('[data-act=listen]', out).textContent = 'Ferma';
    };
    $('[data-act=use]', out).onclick = () => {
      state.music = a.music;
      location.hash = '#/edit';
    };
  }

  if (a.music) showOut();

  try {
    const d = await getData('sounds');
    if (d.items?.length) {
      $('#sounds').innerHTML = `
        <h2>${esc(d.title || 'Suoni del momento')}</h2>
        <p class="small muted">${esc(d.note || 'Questi suoni appartengono ai loro autori: aggiungili direttamente nell\'app in cui pubblichi il video.')}</p>
        ${d.items.map((s) => `
          <article class="card sound">
            <strong>${esc(s.title)}</strong>
            ${s.artist ? `<span class="muted"> di ${esc(s.artist)}</span>` : ''}
            ${s.idea ? `<p class="small">${esc(s.idea)}</p>` : ''}
            ${s.link ? `<a class="btn secondary" href="${esc(s.link)}" target="_blank" rel="noopener">Apri il suono</a>` : ''}
          </article>`).join('')}`;
    }
  } catch { /* lista facoltativa */ }
}

// ---------- avvio ----------

setupTabs();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
