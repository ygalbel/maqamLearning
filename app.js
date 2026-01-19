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
const I18N_URL = "./i18n.json";
const SUPPORTED_LANGS = ["en", "he", "ar"];
const MIC_ENABLED = false;

let maqamsData = null;
let translations = null;

// Audio playback
let audioCtx = null;
let masterGain = null;

// Loop playback
let isLooping = false;
let loopTimer = null;
let currentLoopStep = 0;
let isPlayingSequence = false;
let isPaused = false;
let playSequenceToken = 0;
const activeOscillators = new Set();

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
let currentLang = "en";
let currentMaqamName = "";
let currentMaqamKey = "";
let audioStatusKey = "";
let pitchOffsetSemitones = 0;

const appEl = document.getElementById("app");
const audioStatusEl = document.getElementById("audioStatus");
const headerMaqamEl = document.getElementById("headerMaqam");
const siteHeaderEl = document.getElementById("siteHeader");
const headerTitleEl = document.getElementById("headerTitle");
const headerTaglineEl = document.getElementById("headerTagline");
const langSwitchEl = document.getElementById("langSwitch");

function t(key, vars = null) {
  const dict = (translations && translations[currentLang]) || (translations && translations.en) || {};
  let str = dict[key] || (translations && translations.en && translations.en[key]) || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

function getMaqamDisplayName(key) {
  if (!key) return "";
  const dict = translations && translations[currentLang];
  const fallback = translations && translations.en;
  const translated =
    (dict && dict.maqamNames && dict.maqamNames[key]) ||
    (fallback && fallback.maqamNames && fallback.maqamNames[key]) ||
    "";
  return translated || key;
}

function getJinsDisplayName(name) {
  if (!name) return "";
  const dict = translations && translations[currentLang];
  const fallback = translations && translations.en;
  const translated =
    (dict && dict.jinsNames && dict.jinsNames[name]) ||
    (fallback && fallback.jinsNames && fallback.jinsNames[name]) ||
    "";
  return translated || name;
}

function isRtlLang(lang) {
  return lang === "he" || lang === "ar";
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = isRtlLang(currentLang) ? "rtl" : "ltr";
  if (headerTitleEl) headerTitleEl.textContent = t("app.title");
  if (headerTitleEl) headerTitleEl.setAttribute("href", buildHash());
  if (headerTaglineEl) headerTaglineEl.textContent = t("header.tagline");
  document.title = t("app.title");
  setHeaderMaqam(currentMaqamKey);
  setAudioStatusByKey(audioStatusKey);
  updateLangSwitch();
}

function updateLangSwitch() {
  if (!langSwitchEl) return;
  const links = [...langSwitchEl.querySelectorAll("a[data-lang]")];
  links.forEach((a) => {
    const lang = a.getAttribute("data-lang");
    a.classList.toggle("active", lang === currentLang);
    a.setAttribute("href", buildLangHash(lang));
  });
}

function setAudioStatusByKey(key) {
  audioStatusKey = key;
  if (!key) {
    setAudioStatusText("");
    return;
  }
  setAudioStatusText(t(key));
}

function setAudioStatusText(text) {
  if (!audioStatusEl) return;
  if (!text) {
    audioStatusEl.textContent = "";
    return;
  }
  audioStatusEl.textContent = t("audio.label", { status: text });
}

function setHeaderMaqam(text) {
  if (!headerMaqamEl) return;
  currentMaqamKey = text;
  const display = getMaqamDisplayName(text);
  headerMaqamEl.textContent = display ? t("header.maqamLabel", { name: display }) : "";
}

function updateHeaderCompact() {
  if (!siteHeaderEl) return;
  const compact = window.scrollY > 20;
  siteHeaderEl.classList.toggle("compactHeader", compact);
  updateHeaderOffset();
}

function updateNotesScale() {
  if (!document.body.classList.contains("pageMaqam")) return;
  if (window.innerWidth > 720) {
    const notesEl = appEl && appEl.querySelector(".notes");
    if (notesEl) notesEl.style.setProperty("--noteScale", "1");
    return;
  }

  const notesEl = appEl && appEl.querySelector(".notes");
  if (!notesEl) return;

  notesEl.style.setProperty("--noteScale", "1");

  requestAnimationFrame(() => {
    const notePad = notesEl.querySelector(".notePad");
    if (!notePad) return;

    const notesRect = notesEl.getBoundingClientRect();
    const padRect = notePad.getBoundingClientRect();
    const styles = getComputedStyle(notesEl);
    const gap = parseFloat(styles.rowGap || styles.gap || "0");
    const count = notesEl.querySelectorAll(".notePad").length;

    const minCol = 150;
    const cols1 = Math.max(1, Math.floor(notesRect.width / minCol));
    const rows1 = Math.ceil(count / cols1);
    const total1 = rows1 * padRect.height + Math.max(0, rows1 - 1) * gap;

    const available = window.innerHeight - notesRect.top - 16;
    if (available <= 0 || total1 <= 0) return;

    const scale1 = Math.max(0.55, Math.min(1, available / total1));
    const cols2 = Math.max(1, Math.floor(notesRect.width / (minCol * scale1)));
    const rows2 = Math.ceil(count / cols2);
    const total2 = rows2 * padRect.height * scale1 + Math.max(0, rows2 - 1) * gap * scale1;
    const scale2 = Math.max(0.55, Math.min(1, available / total2));

    notesEl.style.setProperty("--noteScale", scale2.toFixed(3));
  });
}

function updateHeaderOffset() {
  if (!siteHeaderEl) return;
  const vv = window.visualViewport;
  const safeTop = vv ? Math.max(0, vv.offsetTop || 0) : 0;
  document.documentElement.style.setProperty("--safe-top", `${safeTop}px`);
  const height = siteHeaderEl.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--header-offset", `${height}px`);
}

async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== "object") throw new Error("JSON is not an object");
  return json;
}

async function loadTranslations() {
  const res = await fetch(I18N_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${I18N_URL}: ${res.status}`);
  const json = await res.json();
  if (!json || typeof json !== "object") throw new Error("i18n JSON is not an object");
  return json;
}

function getStoredLang() {
  const stored = localStorage.getItem("lang");
  return SUPPORTED_LANGS.includes(stored) ? stored : null;
}

function buildLangHash(lang, path = "") {
  const prefix = lang === "en" ? "" : `/${lang}`;
  if (!path) return `#${prefix || "/"}`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `#${prefix}${clean}`;
}

function buildHash(path = "") {
  return buildLangHash(currentLang, path);
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.2;
    masterGain.connect(audioCtx.destination);
    setAudioStatusByKey("audio.ready");
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

function stopAllPlayback() {
  playSequenceToken += 1;
  isPlayingSequence = false;
  stopActiveOscillators();
}

function stopActiveOscillators() {
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {}
  }
  activeOscillators.clear();
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
  const offsetFactor = Math.pow(2, pitchOffsetSemitones / 12);
  const adjustedFrequency = frequency * offsetFactor;

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
  const durSec = Math.max(0.06, durationMs / 1000);
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

function parseRoute() {
  // #/ or #/maqam/bayati
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let lang = null;
  if (parts.length > 0 && SUPPORTED_LANGS.includes(parts[0])) {
    lang = parts.shift();
  }
  if (parts.length === 0) return { page: "list", lang };
  if (parts[0] === "maqam" && parts[1]) return { page: "maqam", maqam: parts[1], lang };
  return { page: "list", lang };
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
  setHeaderMaqam("");
  document.body.classList.remove("pageMaqam");

  const keys = Object.keys(maqamsData);

  const query = listQuery.trim().toLowerCase();
  const filteredKeys = query
    ? keys.filter((k) => {
        const obj = maqamsData[k] || {};
        const displayName = getMaqamDisplayName(k);
        const lower = obj.lower_jins || "";
        const upper = obj.upper_jins || "";
        const haystack = [
          k,
          displayName,
          obj.tonic || "",
          lower,
          upper,
          getJinsDisplayName(lower),
          getJinsDisplayName(upper)
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
      const displayName = getMaqamDisplayName(k);
      const scale = Array.isArray(obj.scale) ? obj.scale : [];
      const tonic = obj.tonic ? String(obj.tonic) : "?";
      const lower = obj.lower_jins ? String(obj.lower_jins) : "";
      const upper = obj.upper_jins ? String(obj.upper_jins) : "";
      const lowerDisplay = getJinsDisplayName(lower);
      const upperDisplay = getJinsDisplayName(upper);

      return `
        <a class="card" href="${buildHash(`/maqam/${encodeURIComponent(k)}`)}" style="color:inherit;">
          <div class="cardHeaderRow">
            <strong class="cardTitle">${escapeHtml(displayName)}</strong>
            <span class="pill cardPill">${escapeHtml(t("list.notesCount", { count: scale.length }))}</span>
          </div>
          <div class="muted small" style="margin-top:6px;">
            <div><strong>${escapeHtml(t("maqam.tonicLabel"))}</strong> ${escapeHtml(tonic)}</div>
            ${lower ? `<div><strong>${escapeHtml(t("maqam.lowerJinsLabel"))}</strong> ${escapeHtml(lowerDisplay)}</div>` : ""}
            ${upper ? `<div><strong>${escapeHtml(t("maqam.upperJinsLabel"))}</strong> ${escapeHtml(upperDisplay)}</div>` : ""}
          </div>
        </a>
      `;
    })
    .join("");

  appEl.innerHTML = `
    <div class="row" style="margin-bottom:8px;">
      <label class="row" style="gap:8px;">
        <span class="pill">${escapeHtml(t("list.search"))}</span>
        <input id="listSearch" type="search" placeholder="${escapeHtml(t("list.searchPlaceholder"))}" value="${escapeHtml(listQuery)}" />
      </label>
      <span class="spacer"></span>
      <label class="row" style="gap:8px;">
        <span class="pill">${escapeHtml(t("list.order"))}</span>
        <select id="listSort">
          <option value="alpha">${escapeHtml(t("list.alphabet"))}</option>
          <option value="tonic">${escapeHtml(t("list.tonic"))}</option>
          <option value="lower">${escapeHtml(t("list.lowerJins"))}</option>
        </select>
      </label>
      <label class="row" style="gap:8px;">
        <span class="pill">${escapeHtml(t("list.direction"))}</span>
        <select id="listSortDir">
          <option value="asc">${escapeHtml(t("list.up"))}</option>
          <option value="desc">${escapeHtml(t("list.down"))}</option>
        </select>
      </label>
    </div>
    <div class="muted small" style="margin-bottom:12px;">${escapeHtml(
      t("list.showing", { shown: filteredKeys.length, total: keys.length })
    )}</div>
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
  document.body.classList.add("pageMaqam");

  const key = decodeURIComponent(maqamKeyRaw);
  const maqamObj = maqamsData[key];
  setHeaderMaqam(key);

  if (!maqamObj) {
    appEl.innerHTML = `
      <div class="card danger">
        <strong>${escapeHtml(t("maqam.unknown"))}</strong> ${escapeHtml(key)}
        <div style="margin-top:10px;"><a href="${buildHash()}">${escapeHtml(t("maqam.back"))}</a></div>
      </div>
    `;
    return;
  }

  const tonic = maqamObj.tonic ? String(maqamObj.tonic) : "";
  const lowerJins = maqamObj.lower_jins ? String(maqamObj.lower_jins) : "";
  const upperJins = maqamObj.upper_jins ? String(maqamObj.upper_jins) : "";
  const lowerJinsDisplay = getJinsDisplayName(lowerJins);
  const upperJinsDisplay = getJinsDisplayName(upperJins);
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

  const displayName = getMaqamDisplayName(key);
  appEl.innerHTML = `
    <div class="row" style="margin-bottom: 10px;">
      <a href="${buildHash()}">&larr; ${escapeHtml(t("maqam.all"))}</a>
      <span class="pill">${escapeHtml(t("maqam.label"))}</span>
      <h2 style="margin:0;">${escapeHtml(displayName)}</h2>
    </div>

    <div class="card" style="margin:10px 0;">
      ${tonic ? `<div><strong>${escapeHtml(t("maqam.tonicLabel"))}</strong> ${escapeHtml(tonic)}</div>` : ""}
      ${lowerJins ? `<div><strong>${escapeHtml(t("maqam.lowerJinsLabel"))}</strong> ${escapeHtml(lowerJinsDisplay)}</div>` : ""}
      ${upperJins ? `<div><strong>${escapeHtml(t("maqam.upperJinsLabel"))}</strong> ${escapeHtml(upperJinsDisplay)}</div>` : ""}
    </div>

    <div class="controls">
      <div class="row controlsHeader" style="align-items:center; justify-content:space-between; width:100%;">
        <div>
          <strong>${escapeHtml(t("controls.playbackTitle"))}</strong>
          <span class="muted small">${escapeHtml(t("controls.playbackSubtitle"))}</span>
        </div>
        <button id="toggleControls" class="miniToggle" aria-label="${escapeHtml(t("aria.toggleControls"))}">v</button>
      </div>

      <div id="miniControls" class="row miniControls" style="margin-top:8px; width:100%;">
        <label class="row miniGroup" style="gap:6px;">
          <span class="pill">${escapeHtml(t("controls.tempo"))}</span>
          <button id="tempoDown" class="miniBtn" aria-label="${escapeHtml(t("aria.decreaseTempo"))}">-</button>
          <span id="tempoMiniValue"><strong>120</strong> BPM</span>
          <button id="tempoUp" class="miniBtn" aria-label="${escapeHtml(t("aria.increaseTempo"))}">+</button>
        </label>

        <label class="row miniGroup" style="gap:6px;">
          <span class="pill">${escapeHtml(t("controls.length"))}</span>
          <button id="noteLenDown" class="miniBtn" aria-label="${escapeHtml(t("aria.decreaseLength"))}">-</button>
          <span id="noteLenMiniValue"><strong>220</strong> ms</span>
          <button id="noteLenUp" class="miniBtn" aria-label="${escapeHtml(t("aria.increaseLength"))}">+</button>
        </label>
      </div>

      <div id="controlsPanel" style="display:none; width:100%;">
        <div class="row" style="margin-top:8px;">
          <button id="btnInitAudio">${escapeHtml(t("controls.enableAudio"))}</button>
          <button id="btnPlaySelected">${escapeHtml(t("controls.playSelectedOnce"))}</button>
          <button id="btnStartLoop">${escapeHtml(t("controls.startLoop"))}</button>
          <button id="btnStopLoop" disabled>${escapeHtml(t("controls.stop"))}</button>
          <button id="btnPause" disabled>${escapeHtml(t("controls.pause"))}</button>
        </div>

        <div class="row" style="margin-top:8px;">
          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("controls.tempo"))}</span>
            <input id="tempo" type="range" min="30" max="240" value="120" />
            <span id="tempoLabel"><strong>120</strong> BPM</span>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("controls.noteLength"))}</span>
            <input id="noteLen" type="range" min="80" max="1200" value="220" />
            <span id="noteLenLabel"><strong>220</strong> ms</span>
          </label>

          <label class="row" style="gap:8px;">
            <input id="repeat" type="checkbox" checked />
            <span class="pill">${escapeHtml(t("controls.repeat"))}</span>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("controls.loopOrder"))}</span>
            <select id="loopOrder">
              <option value="upDown" selected>${escapeHtml(t("controls.loopUpDown"))}</option>
              <option value="up">${escapeHtml(t("controls.loopUp"))}</option>
              <option value="down">${escapeHtml(t("controls.loopDown"))}</option>
            </select>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("controls.pitchOffset"))}</span>
            <input id="pitchOffset" type="range" min="-2" max="2" value="0" step="0.5" />
            <span id="pitchOffsetLabel"><strong>0</strong> ${escapeHtml(t("controls.semitones"))}</span>
          </label>
        </div>
      </div>
    </div>

    <div class="mobileBar">
      <button id="btnPlaySelectedMobile">${escapeHtml(t("controls.playSelected"))}</button>
      <button id="btnStartLoopMobile">${escapeHtml(t("controls.loopShort"))}</button>
      <button id="btnStopLoopMobile" disabled>${escapeHtml(t("controls.stop"))}</button>
      <button id="btnPauseMobile" disabled>${escapeHtml(t("controls.pause"))}</button>
    </div>

    ${MIC_ENABLED ? `
    <div class="card" style="margin-top:12px;">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <div>
          <strong>${escapeHtml(t("live.title"))}</strong>
          <span class="muted small">${escapeHtml(t("live.subtitle"))}</span>
        </div>
        <button id="toggleMicPanel" class="small">${escapeHtml(t("common.show"))}</button>
      </div>

      <div id="micPanel" style="display:none; margin-top:10px;">
        <div class="row" style="margin-top:6px;">
          <button id="btnEnableMic">${escapeHtml(t("live.enableMic"))}</button>
          <button id="btnDisableMic" disabled>${escapeHtml(t("live.disableMic"))}</button>
        </div>

        <div style="margin-top:10px;">
          <div class="muted small">${escapeHtml(t("live.detected"))}</div>
          <div id="detectedHz" style="font-size:1.3rem;"><strong>-</strong></div>

          <div class="muted small" style="margin-top:10px;">${escapeHtml(t("live.nearest"))}</div>
          <div id="nearestNote" style="font-size:1.3rem;"><strong>-</strong></div>

          <div class="muted small" style="margin-top:10px;">${escapeHtml(t("live.offset"))}</div>
          <div id="centsOffset" style="font-size:1.3rem;"><strong>-</strong></div>
        </div>
      </div>
    </div>
    ` : ""}

    <div class="row" style="margin-top: 10px;">
      <button id="selectAll">${escapeHtml(t("selection.selectAll"))}</button>
      <button id="selectNone">${escapeHtml(t("selection.selectNone"))}</button>
      <span class="muted small" id="selectedCount"></span>
    </div>

    <div class="muted small" style="margin-top:8px;">${escapeHtml(t("notes.toggleHint"))}</div>

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
  const btnPause = document.getElementById("btnPause");
  const btnPlaySelectedMobile = document.getElementById("btnPlaySelectedMobile");
  const btnStartLoopMobile = document.getElementById("btnStartLoopMobile");
  const btnStopLoopMobile = document.getElementById("btnStopLoopMobile");
  const btnPauseMobile = document.getElementById("btnPauseMobile");
  const tempo = document.getElementById("tempo");
  const tempoLabel = document.getElementById("tempoLabel");
  const repeat = document.getElementById("repeat");
  const noteLen = document.getElementById("noteLen");
  const noteLenLabel = document.getElementById("noteLenLabel");
  const loopOrder = document.getElementById("loopOrder");
  const pitchOffset = document.getElementById("pitchOffset");
  const pitchOffsetLabel = document.getElementById("pitchOffsetLabel");
  const selectedCount = document.getElementById("selectedCount");
  const selectAll = document.getElementById("selectAll");
  const selectNone = document.getElementById("selectNone");

  // --- DOM refs (mic/pitch) ---
  const toggleMicPanel = MIC_ENABLED ? document.getElementById("toggleMicPanel") : null;
  const micPanel = MIC_ENABLED ? document.getElementById("micPanel") : null;
  const btnEnableMic = MIC_ENABLED ? document.getElementById("btnEnableMic") : null;
  const btnDisableMic = MIC_ENABLED ? document.getElementById("btnDisableMic") : null;
  const detectedHzEl = MIC_ENABLED ? document.getElementById("detectedHz") : null;
  const nearestNoteEl = MIC_ENABLED ? document.getElementById("nearestNote") : null;
  const centsOffsetEl = MIC_ENABLED ? document.getElementById("centsOffset") : null;

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
    selectedCount.textContent = t("selection.selectedCount", { count: getSelectedIndexes().length });
  }

  function getNoteDurationMs() {
    const v = Number(noteLen.value);
    return Number.isFinite(v) ? v : 220;
  }

  function getSelectedNotes() {
    const idxs = getSelectedIndexes();
    const offsetFactor = Math.pow(2, pitchOffsetSemitones / 12);
    return idxs
      .map((i) => data[i])
      .filter((n) => n && Number.isFinite(Number(n.frequency)))
      .map((n) => ({ note: n.note, frequency: Number(n.frequency) * offsetFactor }));
  }

  function setLoopButtonState(isRunning) {
    btnStopLoop.disabled = !isRunning;
    btnStartLoop.disabled = isRunning;
    btnStopLoopMobile.disabled = !isRunning;
    btnStartLoopMobile.disabled = isRunning;
  }

  function setPauseButtonState(paused) {
    const label = paused ? t("controls.resume") : t("controls.pause");
    if (btnPause) btnPause.textContent = label;
    if (btnPauseMobile) btnPauseMobile.textContent = label;
  }

  function updatePauseAvailability() {
    const canPause = isLooping || isPlayingSequence;
    if (btnPause) btnPause.disabled = !canPause;
    if (btnPauseMobile) btnPauseMobile.disabled = !canPause;
  }

  // --- Playback controls ---
  if (toggleControls && controlsPanel && miniControls) {
    toggleControls.onclick = () => {
      const isOpen = controlsPanel.style.display !== "none";
      controlsPanel.style.display = isOpen ? "none" : "block";
      miniControls.style.display = isOpen ? "flex" : "none";
      toggleControls.textContent = isOpen ? "v" : "^";
      updateNotesScale();
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

  if (pitchOffset && pitchOffsetLabel) {
    pitchOffset.oninput = () => {
      pitchOffsetSemitones = Number(pitchOffset.value) || 0;
      const sign = pitchOffsetSemitones > 0 ? "+" : "";
      pitchOffsetLabel.innerHTML = `<strong>${sign}${pitchOffsetSemitones}</strong> ${escapeHtml(t("controls.semitones"))}`;
    };
  }

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
  if (pitchOffset && pitchOffsetLabel) pitchOffset.oninput();
  updateNotesScale();

  btnPlaySelected.onclick = async () => {
    if (isPlayingSequence) return;
    ensureAudio();
    stopLoop();
    stopAllPlayback();

    const seq = getLoopSequence();
    if (seq.length === 0) return;

    const intervalMs = getBpmIntervalMs(tempo.value);
    const dur = getNoteDurationMs();

    isPlayingSequence = true;
    isPaused = false;
    const token = playSequenceToken + 1;
    playSequenceToken = token;
    btnPlaySelected.disabled = true;
    btnPlaySelectedMobile.disabled = true;
    btnStopLoop.disabled = false;
    btnStopLoopMobile.disabled = false;
    setPauseButtonState(false);
    updatePauseAvailability();

    for (let i = 0; i < seq.length; i++) {
      if (playSequenceToken !== token) break;
      while (isPaused && playSequenceToken === token) {
        await sleep(80);
      }
      if (playSequenceToken !== token) break;
      const noteIdx = seq[i];
      const n = data[noteIdx];
      setActiveLoopIndex(noteIdx);
      if (n && Number.isFinite(Number(n.frequency))) playTone(Number(n.frequency), dur);
      await sleep(intervalMs);
    }
    setActiveLoopIndex(null);
    isPlayingSequence = false;
    btnPlaySelected.disabled = false;
    btnPlaySelectedMobile.disabled = false;
    if (!isLooping) {
      btnStopLoop.disabled = true;
      btnStopLoopMobile.disabled = true;
    }
    updatePauseAvailability();
  };
  btnPlaySelectedMobile.onclick = () => btnPlaySelected.click();

  function restartLoopTimer() {
    if (!isLooping) return;
    if (isPaused) return;
    if (loopTimer) clearInterval(loopTimer);

    const intervalMs = getBpmIntervalMs(tempo.value);
    loopTimer = setInterval(loopTick, intervalMs);
  }

  function loopTick() {
    if (isPaused) return;
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
    stopAllPlayback();

    const idxs = getSelectedIndexes();
    if (idxs.length === 0) return;

    isLooping = true;
    currentLoopStep = 0;

    setLoopButtonState(true);
    setPauseButtonState(false);
    updatePauseAvailability();

    loopTick();
    restartLoopTimer();
  };
  btnStartLoopMobile.onclick = () => btnStartLoop.click();

  btnStopLoop.onclick = () => {
    stopLoop();
    stopAllPlayback();
    setLoopButtonState(false);
    setActiveLoopIndex(null);
    isPaused = false;
    setPauseButtonState(false);
    updatePauseAvailability();
  };
  btnStopLoopMobile.onclick = () => btnStopLoop.click();

  function togglePause() {
    if (!isLooping && !isPlayingSequence) return;
    isPaused = !isPaused;
    setPauseButtonState(isPaused);
    if (isPaused) {
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
      stopActiveOscillators();
    } else if (isLooping) {
      loopTick();
      restartLoopTimer();
    }
  }

  if (btnPause) btnPause.onclick = () => togglePause();
  if (btnPauseMobile) btnPauseMobile.onclick = () => togglePause();

  // --- Live pitch UI ---
  function setPitchUI({ detectedHz, noteName, targetHz, cents }) {
    if (!MIC_ENABLED) return;
    detectedHzEl.innerHTML = detectedHz ? `<strong>${detectedHz.toFixed(2)} Hz</strong>` : `<strong>-</strong>`;

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
    const label =
      rounded === 0 ? t("live.inTune") : rounded > 0 ? t("live.sharp") : t("live.flat");

    centsOffsetEl.innerHTML = `<strong>${sign}${rounded} cents</strong> <span class="muted small">${escapeHtml(label)}</span>`;
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
        lastPitch = { detectedHz: hz, noteName: t("live.noNotesSelected"), targetHz: hz, cents: 0 };
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

  if (MIC_ENABLED) {
    btnEnableMic.onclick = () =>
      enableMic().catch((e) => {
        console.error(e);
        alert(t("errors.micFailed", { error: e.message }));
      });

    btnDisableMic.onclick = () => disableMic();

    if (toggleMicPanel && micPanel) {
      toggleMicPanel.onclick = () => {
        const isOpen = micPanel.style.display !== "none";
        micPanel.style.display = isOpen ? "none" : "block";
        toggleMicPanel.textContent = isOpen ? t("common.show") : t("common.hide");
      };
    }

    // Stop mic if user navigates away
    window.addEventListener("hashchange", disableMic, { once: true });
  }
}

function render() {
  const route = parseRoute();
  const nextLang = route.lang || "en";
  if (nextLang !== currentLang) {
    currentLang = nextLang;
    localStorage.setItem("lang", currentLang);
    applyLang();
  }
  if (route.page === "list") return renderListPage();
  if (route.page === "maqam") return renderMaqamPage(normalizeKey(route.maqam));
  renderListPage();
}

async function boot() {
  try {
    [maqamsData, translations] = await Promise.all([loadData(), loadTranslations()]);
    currentLang = getStoredLang() || "en";
    applyLang();
    setAudioStatusByKey("");
    window.addEventListener("hashchange", render);
    window.addEventListener("scroll", updateHeaderCompact, { passive: true });
    window.addEventListener("resize", updateNotesScale, { passive: true });
    window.addEventListener("resize", updateHeaderOffset, { passive: true });

/**
 * IOS & MOBILE AUDIO UNLOCK
 * Mobile browsers suspend audio contexts until a user interaction occurs.
 * This snippet listens for the first touch/click and resumes the context.
 */

function unlockAudioContext() {
    // 1. Identify your AudioContext
    // Check if 'audioCtx' exists (from your existing code), or find the global one
    const context = window.audioCtx || window.AudioContext || window.webkitAudioContext;
    
    // If we found a context and it's suspended, try to resume it
    if (context && context.state === 'suspended') {
        context.resume().then(() => {
            console.log('AudioContext resumed successfully by user interaction.');
            
            // Clean up: remove the event listeners so this only runs once
            ['touchstart', 'touchend', 'click', 'keydown'].forEach(event => {
                document.body.removeEventListener(event, unlockAudioContext);
            });
        });
    }
}

// 2. Attach the unlock function to all major interaction events
['touchstart', 'touchend', 'click', 'keydown'].forEach(event => {
    document.body.addEventListener(event, unlockAudioContext);
});
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateHeaderOffset, { passive: true });
      window.visualViewport.addEventListener("scroll", updateHeaderOffset, { passive: true });
    }
    render();
    updateHeaderCompact();
    updateHeaderOffset();
  } catch (err) {
    appEl.innerHTML = `
      <div class="card danger">
        <strong>${escapeHtml(t("errors.loadFailed"))}</strong>
        <div class="muted small" style="margin-top:6px;">${escapeHtml(err.message)}</div>
        <div class="muted small" style="margin-top:6px;">
          ${escapeHtml(t("errors.runServer"))} <code>python3 -m http.server 8080</code>
        </div>
      </div>
    `;
  }
}

boot();
