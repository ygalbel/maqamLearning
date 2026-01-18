// app.js
// Static site player + live pitch detector for local maqam JSON.
//
// Expected JSON shape:
// {
//   "bayati": {
//     "tonic": "D",
//     "lower_jins": "Bayati",
//     "upper_jins": "Nahawand on A",
//     "scale": [ { "note": "D4", "frequency": 293.33 }, ... ]
//   },
//   ...
// }

const DATA_URL = "./maqam-compact.json";

let maqamsData = null;

// Audio playback
let audioCtx = null;
let masterGain = null;

// Loop playback
let isLooping = false;
let loopTimer = null;
let currentLoopStep = 0;

// Mic / pitch detection
let micStream = null;
let micSource = null;
let analyser = null;
let micData = null;
let pitchRaf = null;

let listSort = "alpha";
let listSortDir = "asc";
let listQuery = "";
let listSearchSelStart = 0;
let listSearchSelEnd = 0;

const appEl = document.getElementById("app");
const audioStatusEl = document.getElementById("audioStatus");

function setAudioStatus(text) {
  if (audioStatusEl) audioStatusEl.textContent = `Audio: ${text}`;
}

async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== "object") throw new Error("JSON is not an object");
  return json;
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.2;
    masterGain.connect(audioCtx.destination);
    setAudioStatus("ready");
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function stopLoop() {
  isLooping = false;
  currentLoopStep = 0;
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
}

function stopMic() {
  if (pitchRaf) {
    cancelAnimationFrame(pitchRaf);
    pitchRaf = null;
  }

  if (micSource) {
    try {
      micSource.disconnect();
    } catch {}
    micSource = null;
  }

  analyser = null;
  micData = null;

  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function playTone(frequency, durationMs) {
  ensureAudio();

  const now = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;

  // Envelope for click-free audio
  const attack = 0.01;
  const durSec = Math.max(0.05, durationMs / 1000);
  const release = Math.min(0.06, Math.max(0.02, durSec * 0.25));
  const releaseStart = Math.max(now + attack, now + durSec - release);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + attack);
  gain.gain.setValueAtTime(0.25, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

  osc.connect(gain);
  gain.connect(masterGain);

  osc.start(now);
  osc.stop(now + durSec + 0.02);
}

function parseRoute() {
  // #/ or #/maqam/bayati
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { page: "list" };
  if (parts[0] === "maqam" && parts[1]) return { page: "maqam", maqam: parts[1] };
  return { page: "list" };
}

function normalizeKey(k) {
  return String(k).toLowerCase();
}

function getBpmIntervalMs(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n) || n <= 0) return 600;
  return Math.round(60000 / n);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// --------------------
// Pitch detection helpers
// --------------------

function centsOff(detectedHz, targetHz) {
  return 1200 * Math.log2(detectedHz / targetHz);
}

// Simple autocorrelation pitch detector
// Returns frequency in Hz, or null if no stable pitch
function autoCorrelate(buffer, sampleRate) {
  // RMS for silence/noise rejection
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  const SIZE = buffer.length;
  const MAX_LAG = Math.floor(SIZE / 2);

  let bestLag = -1;
  let bestCorr = 0;

  // Lag bounds: skip very small lags (high freq noise)
  for (let lag = 20; lag < MAX_LAG; lag++) {
    let corr = 0;
    for (let i = 0; i < MAX_LAG; i++) {
      corr += buffer[i] * buffer[i + lag];
    }
    corr = corr / MAX_LAG;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag === -1 || bestCorr < 0.15) return null;

  // Parabolic interpolation around peak for better accuracy
  const lag = bestLag;
  const x0 = lag - 1;
  const x1 = lag;
  const x2 = lag + 1;

  if (x0 < 0 || x2 >= MAX_LAG) return sampleRate / lag;

  let c0 = 0,
    c1 = 0,
    c2 = 0;
  for (let i = 0; i < MAX_LAG; i++) {
    c0 += buffer[i] * buffer[i + x0];
    c1 += buffer[i] * buffer[i + x1];
    c2 += buffer[i] * buffer[i + x2];
  }
  c0 /= MAX_LAG;
  c1 /= MAX_LAG;
  c2 /= MAX_LAG;

  const denom = 2 * c1 - c0 - c2;
  const shift = denom === 0 ? 0 : (c2 - c0) / (2 * denom); // ~ -0.5..0.5
  const refinedLag = lag + shift;

  const freq = sampleRate / refinedLag;

  // sanity range
  if (freq < 50 || freq > 2000) return null;

  return freq;
}

// --------------------
// UI rendering
// --------------------

function renderListPage(keepSearchFocus = false) {
  stopLoop();
  stopMic();

  const keys = Object.keys(maqamsData);

  const query = listQuery.trim().toLowerCase();
  const filteredKeys = query
    ? keys.filter((k) => {
        const obj = maqamsData[k] || {};
        const haystack = [
          k,
          obj.tonic || "",
          obj.lower_jins || "",
          obj.upper_jins || ""
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : keys;

  function getSortValue(key) {
    const obj = maqamsData[key] || {};
    if (listSort === "tonic") return String(obj.tonic || "");
    if (listSort === "lower") return String(obj.lower_jins || "");
    return String(key);
  }

  filteredKeys.sort((a, b) => {
    const av = getSortValue(a);
    const bv = getSortValue(b);
    const primary = av.localeCompare(bv);
    const dir = listSortDir === "desc" ? -1 : 1;
    if (primary !== 0) return primary * dir;
    return String(a).localeCompare(String(b)) * dir;
  });

  const cards = filteredKeys
    .map((k) => {
      const obj = maqamsData[k] || {};
      const scale = Array.isArray(obj.scale) ? obj.scale : [];
      const tonic = obj.tonic ? String(obj.tonic) : "?";
      const lower = obj.lower_jins ? String(obj.lower_jins) : "";
      const upper = obj.upper_jins ? String(obj.upper_jins) : "";

      return `
        <a class="card" href="#/maqam/${encodeURIComponent(k)}" style="color:inherit;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${escapeHtml(k)}</strong>
            <span class="pill">${scale.length} notes</span>
          </div>
          <div class="muted small" style="margin-top:6px;">
            <div><strong>Tonic:</strong> ${escapeHtml(tonic)}</div>
            ${lower ? `<div><strong>Lower jins:</strong> ${escapeHtml(lower)}</div>` : ""}
            ${upper ? `<div><strong>Upper jins:</strong> ${escapeHtml(upper)}</div>` : ""}
          </div>
        </a>
      `;
    })
    .join("");

  appEl.innerHTML = `
    <div class="row" style="margin-bottom:8px;">
      <label class="row" style="gap:8px;">
        <span class="pill">Search</span>
        <input id="listSearch" type="search" placeholder="Maqam, tonic, jins" value="${escapeHtml(listQuery)}" />
      </label>
      <span class="spacer"></span>
      <label class="row" style="gap:8px;">
        <span class="pill">Order</span>
        <select id="listSort">
          <option value="alpha">Alphabet</option>
          <option value="tonic">Tonic</option>
          <option value="lower">Lower jins</option>
        </select>
      </label>
      <label class="row" style="gap:8px;">
        <span class="pill">Direction</span>
        <select id="listSortDir">
          <option value="asc">Up</option>
          <option value="desc">Down</option>
        </select>
      </label>
    </div>
    <div class="muted small" style="margin-bottom:12px;">Showing ${filteredKeys.length} of ${keys.length} maqams.</div>
    <div class="grid">${cards}</div>
  `;

  const listSortEl = document.getElementById("listSort");
  if (listSortEl) {
    listSortEl.value = listSort;
    listSortEl.onchange = () => {
      listSort = listSortEl.value;
      renderListPage();
    };
  }

  const listSortDirEl = document.getElementById("listSortDir");
  if (listSortDirEl) {
    listSortDirEl.value = listSortDir;
    listSortDirEl.onchange = () => {
      listSortDir = listSortDirEl.value;
      renderListPage();
    };
  }

  const listSearchEl = document.getElementById("listSearch");
  if (listSearchEl) {
    listSearchEl.oninput = () => {
      listQuery = listSearchEl.value;
      listSearchSelStart = listSearchEl.selectionStart ?? listQuery.length;
      listSearchSelEnd = listSearchEl.selectionEnd ?? listQuery.length;
      renderListPage(true);
    };

    if (keepSearchFocus) {
      const safeEnd = Math.min(listSearchSelEnd, listSearchEl.value.length);
      const safeStart = Math.min(listSearchSelStart, safeEnd);
      listSearchEl.focus();
      try {
        listSearchEl.setSelectionRange(safeStart, safeEnd);
      } catch {}
    }
  }
}

function renderMaqamPage(maqamKeyRaw) {
  stopLoop();
  stopMic();

  const key = decodeURIComponent(maqamKeyRaw);
  const maqamObj = maqamsData[key];

  if (!maqamObj) {
    appEl.innerHTML = `
      <div class="card danger">
        <strong>Unknown maqam:</strong> ${escapeHtml(key)}
        <div style="margin-top:10px;"><a href="#/">Back</a></div>
      </div>
    `;
    return;
  }

  const tonic = maqamObj.tonic ? String(maqamObj.tonic) : "";
  const lowerJins = maqamObj.lower_jins ? String(maqamObj.lower_jins) : "";
  const upperJins = maqamObj.upper_jins ? String(maqamObj.upper_jins) : "";
  const data = Array.isArray(maqamObj.scale) ? maqamObj.scale : [];

  const noteRows = data
    .map((n, idx) => {
      const note = n?.note ?? "";
      const freq = Number(n?.frequency);
      const freqText = Number.isFinite(freq) ? `${freq.toFixed(2)} Hz` : "—";
      return `
        <div class="noteItem">
          <button class="notePad selected" data-idx="${idx}" aria-pressed="true">
            <div class="noteTitle"><strong>[${idx}]</strong> ${escapeHtml(note)}</div>
            <div class="noteMeta"><span class="pill">${escapeHtml(freqText)}</span></div>
          </button>
        </div>
      `;
    })
    .join("");

  appEl.innerHTML = `
    <div class="row" style="margin-bottom: 10px;">
      <a href="#/">← All maqams</a>
      <span class="pill">Maqam</span>
      <h2 style="margin:0;">${escapeHtml(key)}</h2>
    </div>

    <div class="card" style="margin:10px 0;">
      ${tonic ? `<div><strong>Tonic:</strong> ${escapeHtml(tonic)}</div>` : ""}
      ${lowerJins ? `<div><strong>Lower jins:</strong> ${escapeHtml(lowerJins)}</div>` : ""}
      ${upperJins ? `<div><strong>Upper jins:</strong> ${escapeHtml(upperJins)}</div>` : ""}
    </div>

    <div class="controls">
      <div class="row controlsHeader" style="align-items:center; justify-content:space-between; width:100%;">
        <div>
          <strong>Playback Controls</strong>
          <span class="muted small">(tempo, loop, selection)</span>
        </div>
        <button id="toggleControls" class="miniToggle" aria-label="Toggle controls">▼</button>
      </div>

      <div id="miniControls" class="row miniControls" style="margin-top:8px; width:100%;">
        <label class="row miniGroup" style="gap:6px;">
          <span class="pill">Tempo</span>
          <button id="tempoDown" class="miniBtn" aria-label="Decrease tempo">-</button>
          <span id="tempoMiniValue"><strong>120</strong> BPM</span>
          <button id="tempoUp" class="miniBtn" aria-label="Increase tempo">+</button>
        </label>

        <label class="row miniGroup" style="gap:6px;">
          <span class="pill">Length</span>
          <button id="noteLenDown" class="miniBtn" aria-label="Decrease note length">-</button>
          <span id="noteLenMiniValue"><strong>220</strong> ms</span>
          <button id="noteLenUp" class="miniBtn" aria-label="Increase note length">+</button>
        </label>
      </div>

      <div id="controlsPanel" style="display:none; width:100%;">
        <div class="row" style="margin-top:8px;">
          <button id="btnInitAudio">Enable Audio</button>
          <button id="btnPlaySelected">Play Selected (Once)</button>
          <button id="btnStartLoop">Start Loop</button>
          <button id="btnStopLoop" disabled>Stop</button>
        </div>

        <div class="row" style="margin-top:8px;">
          <label class="row" style="gap:8px;">
            <span class="pill">Tempo</span>
            <input id="tempo" type="range" min="30" max="240" value="120" />
            <span id="tempoLabel"><strong>120</strong> BPM</span>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">Note length</span>
            <input id="noteLen" type="range" min="80" max="1200" value="220" />
            <span id="noteLenLabel"><strong>220</strong> ms</span>
          </label>

          <label class="row" style="gap:8px;">
            <input id="repeat" type="checkbox" checked />
            <span class="pill">Repeat</span>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">Loop order</span>
            <select id="loopOrder">
              <option value="upDown" selected>Up then down</option>
              <option value="up">Up only</option>
              <option value="down">Down only</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <div class="mobileBar">
      <button id="btnPlaySelectedMobile">Play Selected</button>
      <button id="btnStartLoopMobile">Loop</button>
      <button id="btnStopLoopMobile" disabled>Stop</button>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <div>
          <strong>Live Pitch</strong>
          <span class="muted small">(sing or play a note)</span>
        </div>
        <button id="toggleMicPanel" class="small">Show</button>
      </div>

      <div id="micPanel" style="display:none; margin-top:10px;">
        <div class="row" style="margin-top:6px;">
          <button id="btnEnableMic">Enable Mic</button>
          <button id="btnDisableMic" disabled>Disable Mic</button>
        </div>

        <div style="margin-top:10px;">
          <div class="muted small">Detected</div>
          <div id="detectedHz" style="font-size:1.3rem;"><strong>-</strong></div>

          <div class="muted small" style="margin-top:10px;">Nearest selected note</div>
          <div id="nearestNote" style="font-size:1.3rem;"><strong>-</strong></div>

          <div class="muted small" style="margin-top:10px;">Offset</div>
          <div id="centsOffset" style="font-size:1.3rem;"><strong>-</strong></div>
        </div>
      </div>
    </div>

    <div class="row" style="margin-top: 10px;">
      <button id="selectAll">Select all</button>
      <button id="selectNone">Select none</button>
      <span class="muted small" id="selectedCount"></span>
    </div>

    <div class="notes">${noteRows}</div>
  `;

  // --- DOM refs (playback) ---
  const toggleControls = document.getElementById("toggleControls");
  const controlsPanel = document.getElementById("controlsPanel");
  const miniControls = document.getElementById("miniControls");
  const tempoDown = document.getElementById("tempoDown");
  const tempoUp = document.getElementById("tempoUp");
  const noteLenDown = document.getElementById("noteLenDown");
  const noteLenUp = document.getElementById("noteLenUp");
  const tempoMiniValue = document.getElementById("tempoMiniValue");
  const noteLenMiniValue = document.getElementById("noteLenMiniValue");
  const btnInitAudio = document.getElementById("btnInitAudio");
  const btnPlaySelected = document.getElementById("btnPlaySelected");
  const btnStartLoop = document.getElementById("btnStartLoop");
  const btnStopLoop = document.getElementById("btnStopLoop");
  const btnPlaySelectedMobile = document.getElementById("btnPlaySelectedMobile");
  const btnStartLoopMobile = document.getElementById("btnStartLoopMobile");
  const btnStopLoopMobile = document.getElementById("btnStopLoopMobile");
  const tempo = document.getElementById("tempo");
  const tempoLabel = document.getElementById("tempoLabel");
  const repeat = document.getElementById("repeat");
  const noteLen = document.getElementById("noteLen");
  const noteLenLabel = document.getElementById("noteLenLabel");
  const loopOrder = document.getElementById("loopOrder");
  const selectedCount = document.getElementById("selectedCount");
  const selectAll = document.getElementById("selectAll");
  const selectNone = document.getElementById("selectNone");

  // --- DOM refs (mic/pitch) ---
  const toggleMicPanel = document.getElementById("toggleMicPanel");
  const micPanel = document.getElementById("micPanel");
  const btnEnableMic = document.getElementById("btnEnableMic");
  const btnDisableMic = document.getElementById("btnDisableMic");
  const detectedHzEl = document.getElementById("detectedHz");
  const nearestNoteEl = document.getElementById("nearestNote");
  const centsOffsetEl = document.getElementById("centsOffset");

  const playButtonsByIdx = new Map();
  appEl.querySelectorAll(".notePad").forEach((btn) => {
    const idx = Number(btn.getAttribute("data-idx"));
    if (Number.isFinite(idx)) playButtonsByIdx.set(idx, btn);
  });

  let activeLoopBtn = null;
  function setActiveLoopIndex(idx) {
    if (activeLoopBtn) activeLoopBtn.classList.remove("active");
    activeLoopBtn = null;

    if (!Number.isFinite(idx)) return;
    const btn = playButtonsByIdx.get(idx);
    if (!btn) return;
    btn.classList.add("active");
    activeLoopBtn = btn;
  }

  function getSelectedIndexes() {
    const pads = [...appEl.querySelectorAll(".notePad.selected")];
    return pads
      .map((c) => Number(c.getAttribute("data-idx")))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function getLoopSequence() {
    const idxs = getSelectedIndexes();
    if (idxs.length === 0) return [];
    const mode = loopOrder?.value || "upDown";

    if (mode === "down") return [...idxs].reverse();
    if (mode === "up") return idxs;
    return idxs.concat([...idxs].reverse());
  }

  function updateSelectedCount() {
    selectedCount.textContent = `${getSelectedIndexes().length} selected`;
  }

  function getNoteDurationMs() {
    const v = Number(noteLen.value);
    return Number.isFinite(v) ? v : 220;
  }

  function getSelectedNotes() {
    const idxs = getSelectedIndexes();
    return idxs
      .map((i) => data[i])
      .filter((n) => n && Number.isFinite(Number(n.frequency)))
      .map((n) => ({ note: n.note, frequency: Number(n.frequency) }));
  }

  function setLoopButtonState(isRunning) {
    btnStopLoop.disabled = !isRunning;
    btnStartLoop.disabled = isRunning;
    btnStopLoopMobile.disabled = !isRunning;
    btnStartLoopMobile.disabled = isRunning;
  }

  // --- Playback controls ---
  if (toggleControls && controlsPanel && miniControls) {
    toggleControls.onclick = () => {
      const isOpen = controlsPanel.style.display !== "none";
      controlsPanel.style.display = isOpen ? "none" : "block";
      miniControls.style.display = isOpen ? "flex" : "none";
      toggleControls.textContent = isOpen ? "▼" : "▲";
    };
  }

  btnInitAudio.onclick = () => ensureAudio();

  tempo.oninput = () => {
    tempoLabel.innerHTML = `<strong>${tempo.value}</strong> BPM`;
    if (tempoMiniValue) tempoMiniValue.innerHTML = `<strong>${tempo.value}</strong> BPM`;
    if (isLooping) restartLoopTimer();
  };

  noteLen.oninput = () => {
    noteLenLabel.innerHTML = `<strong>${noteLen.value}</strong> ms`;
    if (noteLenMiniValue) noteLenMiniValue.innerHTML = `<strong>${noteLen.value}</strong> ms`;
  };

  function stepRange(input, delta) {
    const min = Number(input.min);
    const max = Number(input.max);
    const current = Number(input.value);
    const next = Math.min(max, Math.max(min, current + delta));
    if (next === current) return;
    input.value = String(next);
    input.oninput();
  }

  if (tempoDown && tempoUp && noteLenDown && noteLenUp) {
    tempoDown.onclick = () => stepRange(tempo, -5);
    tempoUp.onclick = () => stepRange(tempo, 5);
    noteLenDown.onclick = () => stepRange(noteLen, -20);
    noteLenUp.onclick = () => stepRange(noteLen, 20);
  }

  if (loopOrder) {
    loopOrder.onchange = () => {
      if (!isLooping) return;
      currentLoopStep = 0;
      loopTick();
      restartLoopTimer();
    };
  }

  selectAll.onclick = () => {
    [...appEl.querySelectorAll(".notePad")].forEach((btn) => {
      btn.classList.add("selected");
      btn.setAttribute("aria-pressed", "true");
    });
    updateSelectedCount();
  };

  selectNone.onclick = () => {
    [...appEl.querySelectorAll(".notePad")].forEach((btn) => {
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
    updateSelectedCount();
  };

  appEl.querySelectorAll(".notePad").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const note = data[idx];
      if (!note || !Number.isFinite(Number(note.frequency))) return;
      const isSelected = btn.classList.toggle("selected");
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      updateSelectedCount();
      playTone(Number(note.frequency), getNoteDurationMs());
    });
  });

  updateSelectedCount();

  btnPlaySelected.onclick = async () => {
    ensureAudio();
    stopLoop();

    const seq = getLoopSequence();
    if (seq.length === 0) return;

    const intervalMs = getBpmIntervalMs(tempo.value);
    const dur = getNoteDurationMs();

    for (let i = 0; i < seq.length; i++) {
      const noteIdx = seq[i];
      const n = data[noteIdx];
      setActiveLoopIndex(noteIdx);
      if (n && Number.isFinite(Number(n.frequency))) playTone(Number(n.frequency), dur);
      await sleep(intervalMs);
    }
    setActiveLoopIndex(null);
  };
  btnPlaySelectedMobile.onclick = () => btnPlaySelected.click();

  function restartLoopTimer() {
    if (!isLooping) return;
    if (loopTimer) clearInterval(loopTimer);

    const intervalMs = getBpmIntervalMs(tempo.value);
    loopTimer = setInterval(loopTick, intervalMs);
  }

  function loopTick() {
    const seq = getLoopSequence();
    if (seq.length === 0) {
      setActiveLoopIndex(null);
      return;
    }

    const dur = getNoteDurationMs();
    const i = currentLoopStep % seq.length;
    const noteIdx = seq[i];
    const note = data[noteIdx];

    setActiveLoopIndex(noteIdx);

    if (note && Number.isFinite(Number(note.frequency))) {
      playTone(Number(note.frequency), dur);
    }

    currentLoopStep += 1;

    if (!repeat.checked && currentLoopStep >= seq.length) {
      stopLoop();
      setLoopButtonState(false);
      setActiveLoopIndex(null);
    }
  }

  btnStartLoop.onclick = () => {
    ensureAudio();
    stopLoop();

    const idxs = getSelectedIndexes();
    if (idxs.length === 0) return;

    isLooping = true;
    currentLoopStep = 0;

    setLoopButtonState(true);

    loopTick();
    restartLoopTimer();
  };
  btnStartLoopMobile.onclick = () => btnStartLoop.click();

  btnStopLoop.onclick = () => {
    stopLoop();
    setLoopButtonState(false);
    setActiveLoopIndex(null);
  };
  btnStopLoopMobile.onclick = () => btnStopLoop.click();

  // --- Live pitch UI ---
  function setPitchUI({ detectedHz, noteName, targetHz, cents }) {
    detectedHzEl.innerHTML = detectedHz ? `<strong>${detectedHz.toFixed(2)} Hz</strong>` : `<strong>—</strong>`;

    if (!noteName) {
      nearestNoteEl.innerHTML = `<strong>—</strong>`;
      centsOffsetEl.innerHTML = `<strong>—</strong>`;
      return;
    }

    nearestNoteEl.innerHTML = `<strong>${escapeHtml(noteName)}</strong> ${
      Number.isFinite(targetHz) ? `<span class="pill">${targetHz.toFixed(2)} Hz</span>` : ""
    }`;

    const rounded = Math.round(cents);
    const sign = rounded > 0 ? "+" : ""; // negative already has '-'
    const label = rounded === 0 ? "(in tune)" : rounded > 0 ? "(sharp)" : "(flat)";

    centsOffsetEl.innerHTML = `<strong>${sign}${rounded} cents</strong> <span class="muted small">${label}</span>`;
  }

  async function enableMic() {
    ensureAudio();
    if (micStream) return;

    const holdMs = 900;
    let lastPitch = null;
    let lastPitchAt = 0;

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    micSource = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    micData = new Float32Array(analyser.fftSize);

    micSource.connect(analyser);

    btnEnableMic.disabled = true;
    btnDisableMic.disabled = false;

    const tick = () => {
      if (!analyser) return;

      analyser.getFloatTimeDomainData(micData);
      const hz = autoCorrelate(micData, audioCtx.sampleRate);
      const now = performance.now();

      if (!hz) {
        if (lastPitch && now - lastPitchAt < holdMs) {
          setPitchUI(lastPitch);
        } else {
          setPitchUI({ detectedHz: null, noteName: null, targetHz: null, cents: 0 });
        }
        pitchRaf = requestAnimationFrame(tick);
        return;
      }

      const selected = getSelectedNotes();
      if (selected.length === 0) {
        lastPitch = { detectedHz: hz, noteName: "(no notes selected)", targetHz: hz, cents: 0 };
        lastPitchAt = now;
        setPitchUI(lastPitch);
        pitchRaf = requestAnimationFrame(tick);
        return;
      }

      let best = null;
      let bestAbs = Infinity;

      for (const n of selected) {
        const c = centsOff(hz, n.frequency);
        const abs = Math.abs(c);
        if (abs < bestAbs) {
          bestAbs = abs;
          best = { noteName: n.note, targetHz: n.frequency, cents: c };
        }
      }

      lastPitch = {
        detectedHz: hz,
        noteName: best.noteName,
        targetHz: best.targetHz,
        cents: best.cents
      };
      lastPitchAt = now;
      setPitchUI(lastPitch);

      pitchRaf = requestAnimationFrame(tick);
    };

    tick();
  }

  function disableMic() {
    stopMic();
    btnEnableMic.disabled = false;
    btnDisableMic.disabled = true;
    setPitchUI({ detectedHz: null, noteName: null, targetHz: null, cents: 0 });
  }

  btnEnableMic.onclick = () =>
    enableMic().catch((e) => {
      console.error(e);
      alert(`Mic failed: ${e.message}`);
    });

  btnDisableMic.onclick = () => disableMic();

  if (toggleMicPanel && micPanel) {
    toggleMicPanel.onclick = () => {
      const isOpen = micPanel.style.display !== "none";
      micPanel.style.display = isOpen ? "none" : "block";
      toggleMicPanel.textContent = isOpen ? "Show" : "Hide";
    };
  }

  // Stop mic if user navigates away
  window.addEventListener("hashchange", disableMic, { once: true });
}

function render() {
  const route = parseRoute();
  if (route.page === "list") return renderListPage();
  if (route.page === "maqam") return renderMaqamPage(normalizeKey(route.maqam));
  renderListPage();
}

async function boot() {
  try {
    maqamsData = await loadData();
    window.addEventListener("hashchange", render);
    render();
  } catch (err) {
    appEl.innerHTML = `
      <div class="card danger">
        <strong>Failed to load data</strong>
        <div class="muted small" style="margin-top:6px;">${escapeHtml(err.message)}</div>
        <div class="muted small" style="margin-top:6px;">
          Run a local server (not file://). Example: <code>python3 -m http.server 8080</code>
        </div>
      </div>
    `;
  }
}

boot();
