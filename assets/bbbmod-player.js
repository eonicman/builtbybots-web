// .bbbmod decoder + Web Audio playback engine + floating player widget.
// Phase 1 scope: decode + play a single hardcoded test file. No playlist/
// mods API yet -- that's Phase 2+, once there's real content and backend
// list/publish routes to back it.
//
// Note encoding: byte 0 = empty cell. Byte 1-255 = semitone offset from the
// instrument's recorded pitch, biased +48 (byte 49 = unison). Must match
// tools/make-test-bbbmod.js exactly.

function decodeBBBMOD(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let off = 0;

  function readString(len) {
    const slice = bytes.subarray(off, off + len);
    off += len;
    const nul = slice.indexOf(0);
    return new TextDecoder().decode(nul === -1 ? slice : slice.subarray(0, nul));
  }

  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  off = 8;
  if (magic !== 'BBBMOD01' && magic !== 'BBBMOD02') {
    throw new Error('not a valid .bbbmod file (bad magic: ' + magic + ')');
  }

  const songName = readString(32);
  // v02 adds a 16-byte author field right after songName. v01 files (the
  // original hand-crafted test fixture) predate this -- default to empty
  // rather than reject them, so old content keeps playing.
  const author = magic === 'BBBMOD02' ? readString(16) : '';
  const channelCount = view.getUint8(off); off += 1;
  const patternCount = view.getUint16(off, true); off += 2;
  const instrumentCount = view.getUint8(off); off += 1;
  const songLength = view.getUint16(off, true); off += 2;
  const tempo = view.getUint8(off); off += 1;
  const speed = view.getUint8(off); off += 1;

  const patternOrder = [];
  for (let i = 0; i < songLength; i++) { patternOrder.push(view.getUint8(off)); off += 1; }

  const instruments = [];
  for (let i = 0; i < instrumentCount; i++) {
    const name = readString(22);
    const length = view.getUint32(off, true); off += 4;
    const sampleRate = view.getUint32(off, true); off += 4;
    const bitDepth = view.getUint8(off); off += 1;
    const channels = view.getUint8(off); off += 1;
    const loopStart = view.getUint32(off, true); off += 4;
    const loopLength = view.getUint32(off, true); off += 4;
    const volume = view.getUint8(off); off += 1;
    const bytesPerSample = bitDepth / 8;
    const dataBytes = length * bytesPerSample * channels;
    const sampleBytes = bytes.subarray(off, off + dataBytes);
    off += dataBytes;
    instruments.push({ name, length, sampleRate, bitDepth, channels, loopStart, loopLength, volume, sampleBytes });
  }

  const patterns = [];
  for (let i = 0; i < patternCount; i++) {
    const rows = view.getUint8(off); off += 1;
    const cellCount = rows * channelCount * 5;
    const cells = bytes.subarray(off, off + cellCount);
    off += cellCount;
    patterns.push({ rows, cells });
  }

  return { songName, author, channelCount, tempo, speed, patternOrder, instruments, patterns };
}

// Converts raw PCM bytes (8 or 16-bit, signed) into a Web Audio AudioBuffer.
function instrumentToAudioBuffer(ctx, inst) {
  const buf = ctx.createBuffer(inst.channels, inst.length, inst.sampleRate);
  const bytesPerSample = inst.bitDepth / 8;
  for (let ch = 0; ch < inst.channels; ch++) {
    const channelData = buf.getChannelData(ch);
    for (let i = 0; i < inst.length; i++) {
      const byteOff = (i * inst.channels + ch) * bytesPerSample;
      let sample;
      if (inst.bitDepth === 16) {
        sample = (inst.sampleBytes[byteOff] | (inst.sampleBytes[byteOff + 1] << 8));
        if (sample >= 32768) sample -= 65536;
        channelData[i] = sample / 32768;
      } else {
        sample = inst.sampleBytes[byteOff];
        if (sample >= 128) sample -= 256;
        channelData[i] = sample / 128;
      }
    }
  }
  return buf;
}

class BBBModPlayer {
  constructor() {
    this.ctx = null;
    this.analyser = null; // shared bus every voice routes through, for the VU meter
    this.song = null;
    this.audioBuffers = [];
    this.playing = false;
    this.startedAt = 0;
    this.scheduledSources = [];
    this.stopTimer = null;
  }

  async load(url) {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    this.song = decodeBBBMOD(buf);
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.connect(this.ctx.destination);
    }
    this.audioBuffers = this.song.instruments.map(inst => instrumentToAudioBuffer(this.ctx, inst));
    return this.song;
  }

  play() {
    if (!this.song || this.playing) return;
    this.playing = true;
    this.startedAt = this.ctx.currentTime;
    const rowSeconds = (this.song.speed * 2.5) / this.song.tempo; // classic tracker timing formula
    let t = this.ctx.currentTime + 0.05;
    this.scheduledSources = [];

    this.song.patternOrder.forEach(patternIdx => {
      const pattern = this.song.patterns[patternIdx];
      for (let row = 0; row < pattern.rows; row++) {
        for (let ch = 0; ch < this.song.channelCount; ch++) {
          const cellOff = (row * this.song.channelCount + ch) * 5;
          const note = pattern.cells[cellOff];
          const instrumentIdx = pattern.cells[cellOff + 1];
          const volume = pattern.cells[cellOff + 2];
          if (note > 0 && instrumentIdx > 0 && this.audioBuffers[instrumentIdx - 1]) {
            const semitoneOffset = (note - 1) - 48;
            const playbackRate = Math.pow(2, semitoneOffset / 12);
            const src = this.ctx.createBufferSource();
            src.buffer = this.audioBuffers[instrumentIdx - 1];
            src.playbackRate.value = playbackRate;
            const gain = this.ctx.createGain();
            gain.gain.value = Math.min(1, volume / 64);
            src.connect(gain).connect(this.analyser);
            src.start(t);
            this.scheduledSources.push(src);
          }
        }
        t += rowSeconds;
      }
    });

    this.totalDuration = t - this.ctx.currentTime;
    this.stopTimer = setTimeout(() => { this.playing = false; if (this.onStop) this.onStop(); }, this.totalDuration * 1000);
  }

  stop() {
    this.scheduledSources.forEach(src => { try { src.stop(); } catch {} });
    this.scheduledSources = [];
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.playing = false;
  }
}

// --- Floating chrome player widget (Winamp Classic x Amiga tracker vibe) ---
(function () {
  // Playlist is fetched live from /api/mods -- curated official tracks plus
  // any published community mods (see the /tracker/ page). Starts empty and
  // populates once the fetch resolves (see loadPlaylist() below); the
  // original single hardcoded test tone stays on disk as a decoder fixture
  // but is deliberately not part of the API response.
  let PLAYLIST = [];

  const style = document.createElement('style');
  style.textContent = `
    #bbbmod-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 9998;
      width: 56px; height: 56px; cursor: pointer; overflow: hidden;
      background: linear-gradient(145deg, #e8e8ec 0%, #9a9aa4 35%, #4a4a54 55%, #8a8a94 75%, #d8d8dc 100%);
      clip-path: polygon(20% 0%, 100% 0%, 100% 80%, 80% 100%, 0% 100%, 0% 20%);
      border: 1px solid rgba(255,255,255,.3);
      box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.5), 0 0 20px rgba(53,243,154,.15);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #bbbmod-fab:hover { transform: scale(1.08); box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 4px 20px rgba(0,0,0,.6), 0 0 28px rgba(53,243,154,.3); }
    #bbbmod-fab:active { transform: scale(0.96); box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.6), inset 0 2px 4px rgba(0,0,0,.4); }
    #bbbmod-fab svg { width: 32px; height: 32px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
    #bbbmod-fab::after {
      content: ''; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent);
      transform: skewX(-20deg); animation: bbbmod-sheen 6s ease-in-out infinite;
      pointer-events: none;
    }
    #bbbmod-panel {
      position: fixed; bottom: 92px; right: 24px; z-index: 9999;
      width: 300px; display: none;
      background: linear-gradient(180deg, #1a1a22 0%, #0d0d12 100%);
      clip-path: polygon(0% 8px, 8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 100%);
      border: 2px solid;
      border-image: linear-gradient(135deg, #e8e8ec, #6a6a74, #e8e8ec) 1;
      box-shadow: 0 8px 32px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.06),
                  0 4px 12px -2px rgba(53,243,154,.25);
      padding: 12px; font-family: 'Space Mono', monospace; color: #c8c8d4;
      overflow: hidden;
    }
    #bbbmod-panel.open { display: block; }
    #bbbmod-panel::before {
      content: ''; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
      transform: skewX(-20deg); animation: bbbmod-sheen 5s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes bbbmod-sheen { 0%, 85% { left: -60%; } 100% { left: 130%; } }

    /* -- LCD display, classic Winamp teal-on-black -- */
    #bbbmod-lcd {
      background: #0a1410; border: 1px solid #04150c; border-radius: 2px;
      box-shadow: inset 0 2px 6px rgba(0,0,0,.8), inset 0 0 0 1px rgba(53,243,154,.08);
      padding: 6px 8px; margin-bottom: 8px;
    }
    #bbbmod-marquee-wrap { overflow: hidden; white-space: nowrap; height: 16px; }
    #bbbmod-marquee {
      display: inline-block; color: #35f39a; font-size: 12px; letter-spacing: .04em;
      text-shadow: 0 0 6px rgba(53,243,154,.7); will-change: transform;
    }
    @keyframes bbbmod-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    #bbbmod-marquee.scrolling { animation: bbbmod-marquee-scroll linear infinite; }
    #bbbmod-lcd-meta { display: flex; justify-content: space-between; font-size: 10px; color: #2a8a5e; margin-top: 2px; }
    #bbbmod-vu { display: flex; gap: 2px; height: 14px; align-items: flex-end; margin-top: 4px; }
    #bbbmod-vu .bar { flex: 1; min-width: 2px; background: linear-gradient(180deg, #35f39a, #187a4a); height: 2px; transition: height .05s linear; }

    /* -- transport: brushed-chrome buttons, classic glyphs -- */
    #bbbmod-transport { display: flex; gap: 6px; margin-bottom: 8px; }
    .bbbmod-tbtn {
      flex: 1; padding: 7px 0; cursor: pointer; border-radius: 3px;
      background: linear-gradient(145deg, #e8e8ec 0%, #9a9aa4 40%, #6a6a74 60%, #d8d8dc 100%);
      border: 1px solid rgba(0,0,0,.5); color: #1a1a22; font-family: inherit; font-size: 13px;
      box-shadow: 0 2px 4px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.6);
      transition: transform .1s, box-shadow .1s;
    }
    .bbbmod-tbtn:hover { filter: brightness(1.08); }
    .bbbmod-tbtn:active { transform: translateY(1px) scale(0.97); box-shadow: inset 0 1px 3px rgba(0,0,0,.5); }
    .bbbmod-tbtn.play { color: #0d3a24; text-shadow: 0 0 4px rgba(53,243,154,.5); }

    /* -- playlist -- */
    #bbbmod-playlist { max-height: 132px; overflow-y: auto; margin-bottom: 4px; }
    .bbbmod-track {
      padding: 6px 8px; font-size: 11px; cursor: pointer; border-radius: 2px;
      border: 1px solid transparent; color: #9898a4; display: flex; justify-content: space-between; gap: 6px;
    }
    .bbbmod-track:hover { border-color: #4a4a54; color: #e8e8ec; }
    .bbbmod-track.active { border-color: #35f39a; color: #35f39a; background: rgba(53,243,154,.06); }
    .bbbmod-track .credit { color: #6a6a78; font-size: 10px; white-space: nowrap; }
    .bbbmod-track.active .credit { color: #2a8a5e; }

    #bbbmod-create {
      display: block; text-align: center; text-decoration: none; margin-top: 6px;
      padding: 6px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
      color: #6a6a78; border: 1px dashed #3a3a44; border-radius: 2px;
    }
    #bbbmod-create:hover { color: #35f39a; border-color: #35f39a; }

    #bbbmod-panel .underglow {
      position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
      background: linear-gradient(90deg, #35f39a 0%, #35f39a 45%, #4a9eea 55%, #4a9eea 100%);
      box-shadow: 0 0 8px rgba(53,243,154,.6), 0 0 8px rgba(74,158,234,.6);
    }
  `;
  document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.id = 'bbbmod-fab';
  fab.setAttribute('aria-label', 'Toggle audio player');
  fab.setAttribute('role', 'button');
  fab.setAttribute('tabindex', '0');
  fab.innerHTML = `<svg viewBox="0 0 24 24"><path fill="#4a9eea" d="M12 2l1.5 2.6 2.9-.9.6 3 3 .6-.9 2.9L21 12l-2.6 1.5.9 2.9-3 .6-.6 3-2.9-.9L12 22l-1.5-2.6-2.9.9-.6-3-3-.6.9-2.9L3 12l2.6-1.5-.9-2.9 3-.6.6-3 2.9.9z"/><circle cx="12" cy="12" r="4" fill="#0a0a12"/><path fill="#f5a623" d="M13.2 4.5l-4 5.2 2.6.3-2 4.8 5-5.5-2.6-.2z"/></svg>`;

  const panel = document.createElement('div');
  panel.id = 'bbbmod-panel';
  panel.innerHTML = `
    <div id="bbbmod-lcd">
      <div id="bbbmod-marquee-wrap"><span id="bbbmod-marquee">NOTHING LOADED</span></div>
      <div id="bbbmod-lcd-meta"><span id="bbbmod-time">00:00</span><span id="bbbmod-tracknum">--/--</span></div>
      <div id="bbbmod-vu"></div>
    </div>
    <div id="bbbmod-transport">
      <button class="bbbmod-tbtn" id="bbbmod-prev" title="Previous track" aria-label="Previous track">|&#9668;&#9668;</button>
      <button class="bbbmod-tbtn play" id="bbbmod-play" title="Play" aria-label="Play">&#9658;</button>
      <button class="bbbmod-tbtn" id="bbbmod-stop" title="Stop" aria-label="Stop">&#9632;</button>
      <button class="bbbmod-tbtn" id="bbbmod-next" title="Next track" aria-label="Next track">&#9658;&#9658;|</button>
    </div>
    <div id="bbbmod-playlist"></div>
    <a id="bbbmod-create" href="/tracker/">+ Create your own</a>
    <div class="underglow"></div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // 8 VU bars, heights driven by the analyser in the animation loop below.
  const vuEl = panel.querySelector('#bbbmod-vu');
  const VU_BARS = 8;
  for (let i = 0; i < VU_BARS; i++) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    vuEl.appendChild(bar);
  }
  const vuBarEls = Array.from(vuEl.children);

  const player = new BBBModPlayer();
  const marquee = panel.querySelector('#bbbmod-marquee');
  const timeEl = panel.querySelector('#bbbmod-time');
  const tracknumEl = panel.querySelector('#bbbmod-tracknum');
  const playlistEl = panel.querySelector('#bbbmod-playlist');
  const playBtn = panel.querySelector('#bbbmod-play');

  let currentIdx = -1;
  let rafId = null;

  function renderPlaylist() {
    playlistEl.innerHTML = '';
    if (PLAYLIST.length === 0) {
      playlistEl.innerHTML = '<div class="bbbmod-track" style="cursor:default">Loading playlist…</div>';
      return;
    }
    PLAYLIST.forEach((track, i) => {
      const row = document.createElement('div');
      row.className = 'bbbmod-track' + (i === currentIdx ? ' active' : '');
      row.innerHTML = `<span>${track.title}</span>${track.author ? `<span class="credit">Remixed by ${track.author}</span>` : ''}`;
      row.addEventListener('click', () => loadAndPlay(i));
      playlistEl.appendChild(row);
    });
  }

  async function loadPlaylist() {
    try {
      const resp = await fetch('/api/mods', { credentials: 'same-origin' });
      const data = await resp.json();
      PLAYLIST = [...(data.official || []), ...(data.community || [])];
    } catch (e) {
      // Offline/API-down fallback -- degrade to nothing playable rather than
      // a broken-looking empty click target; the playlist row makes the
      // state legible instead of just staying stuck on "Loading…".
      PLAYLIST = [];
    }
    renderPlaylist();
    if (PLAYLIST.length === 0) {
      playlistEl.innerHTML = '<div class="bbbmod-track" style="cursor:default">No tracks available right now.</div>';
    }
  }

  function setMarquee(text) {
    marquee.textContent = text;
    marquee.classList.remove('scrolling');
    // Only scroll if it actually overflows the LCD width; measure after paint.
    requestAnimationFrame(() => {
      const wrapWidth = marquee.parentElement.clientWidth;
      if (marquee.scrollWidth > wrapWidth) {
        marquee.textContent = text + '   •   ' + text; // duplicate for seamless loop
        const duration = Math.max(6, marquee.scrollWidth / 40);
        marquee.style.animationDuration = duration + 's';
        marquee.classList.add('scrolling');
      }
    });
  }

  function stopMeter() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    vuBarEls.forEach(b => { b.style.height = '2px'; });
    timeEl.textContent = '00:00';
  }

  function tickMeter() {
    if (!player.playing) { stopMeter(); return; }
    const data = new Uint8Array(player.analyser.frequencyBinCount);
    player.analyser.getByteFrequencyData(data);
    const step = Math.floor(data.length / VU_BARS) || 1;
    vuBarEls.forEach((bar, i) => {
      const v = data[i * step] || 0;
      bar.style.height = Math.max(2, Math.round((v / 255) * 14)) + 'px';
    });
    const elapsed = player.ctx.currentTime - player.startedAt;
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    rafId = requestAnimationFrame(tickMeter);
  }

  async function loadAndPlay(idx) {
    player.stop();
    stopMeter();
    currentIdx = idx;
    renderPlaylist();
    const track = PLAYLIST[idx];
    setMarquee('LOADING…');
    tracknumEl.textContent = `${idx + 1}/${PLAYLIST.length}`;
    await player.load(track.file);
    // Credit from the playlist/API data (track.title/track.author), not the
    // freshly-decoded file's own embedded songName/author fields. Those are
    // set client-side at encode time and are trivially spoofable by anyone
    // who crafts a raw .bbbmod and hits /api/mods/publish directly instead
    // of going through the Tracker UI -- caught by testing a real publish:
    // republishing an existing Ghost-authored file under a different
    // account still showed "Remixed by Ghost" because the file's own bytes
    // said so. track.author comes from the server's session-authenticated
    // publisher record (accounts.js author_name), which can't be forged the
    // same way.
    setMarquee(track.author ? `${track.title} — Remixed by ${track.author}` : track.title);
    player.play();
    rafId = requestAnimationFrame(tickMeter);
  }

  loadPlaylist();

  function toggle() {
    panel.classList.toggle('open');
  }
  fab.addEventListener('click', toggle);
  fab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

  playBtn.addEventListener('click', () => {
    if (PLAYLIST.length === 0) return;
    if (currentIdx === -1) { loadAndPlay(0); return; }
    if (!player.playing) { player.play(); rafId = requestAnimationFrame(tickMeter); }
  });
  panel.querySelector('#bbbmod-stop').addEventListener('click', () => { player.stop(); stopMeter(); });
  panel.querySelector('#bbbmod-prev').addEventListener('click', () => {
    if (PLAYLIST.length === 0) return;
    const idx = currentIdx <= 0 ? PLAYLIST.length - 1 : currentIdx - 1;
    loadAndPlay(idx);
  });
  panel.querySelector('#bbbmod-next').addEventListener('click', () => {
    if (PLAYLIST.length === 0) return;
    const idx = currentIdx >= PLAYLIST.length - 1 ? 0 : currentIdx + 1;
    loadAndPlay(idx);
  });
})();
