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
//   "rast": {
//     "upper_jins": [
//       { "name": "Rast on G", "scale": [ { "note": "G4", "frequency": 391.11, "index": 6 } ] },
//       { "name": "Nahawand on G", "scale": [] }
//     ]
//   },
//   ...
// }

import { SUPPORTED_LANGS, MIC_ENABLED, EXERCISES } from "./config.js";
import { loadData, loadTranslations } from "./data.js";
import {
  ensureAudio as ensureAudioCore,
  getAudioContext,
  playTone,
  playClick,
  stopActiveOscillators
} from "./audio.js";

let maqamsData = null;
let translations = null;

// Loop playback
let isLooping = false;
let loopTimer = null;
let currentLoopStep = 0;
let isPlayingSequence = false;
let isPaused = false;
let playSequenceToken = 0;

// Mic / pitch detection
let micStream = null;
let micSource = null;
let analyser = null;
let micData = null;
let pitchRaf = null;
let stopExercisesPlayback = null;
let stopLooperPlayback = null;

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
const navExercisesEl = document.getElementById("navExercises");
const navLooperEl = document.getElementById("navLooper");

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

function sortMaqamKeysByDisplay(keys) {
  const locale = currentLang || undefined;
  return [...keys].sort((a, b) => {
    const aName = getMaqamDisplayName(a) || a;
    const bName = getMaqamDisplayName(b) || b;
    const primary = aName.localeCompare(bName, locale, { sensitivity: "base" });
    if (primary !== 0) return primary;
    return String(a).localeCompare(String(b), locale, { sensitivity: "base" });
  });
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


function getUpperJinsNames(upperJins) {
  if (!upperJins) return [];
  if (Array.isArray(upperJins)) {
    return upperJins
      .map((entry) => {
        if (!entry) return "";
        if (typeof entry === "string") return entry;
        return String(entry.name || entry.jins || "");
      })
      .filter(Boolean);
  }
  return [String(upperJins)];
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
  if (navExercisesEl) navExercisesEl.setAttribute("href", buildHash("/exercises"));
  if (navExercisesEl) navExercisesEl.textContent = t("nav.exercises");
  if (navLooperEl) navLooperEl.setAttribute("href", buildHash("/looper"));
  if (navLooperEl) navLooperEl.textContent = t("nav.looper");
  document.title = t("app.title");
  setHeaderMaqam(currentMaqamKey);
  setAudioStatusByKey(audioStatusKey);
  updateLangSwitch();
}

function updateLangSwitch() {
  if (!langSwitchEl) return;
  const currentPath = getCurrentPathFromHash();
  const links = [...langSwitchEl.querySelectorAll("a[data-lang]")];
  links.forEach((a) => {
    const lang = a.getAttribute("data-lang");
    a.classList.toggle("active", lang === currentLang);
    a.setAttribute("href", buildLangHash(lang, currentPath));
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
  if (
    !document.body.classList.contains("pageMaqam") &&
    !document.body.classList.contains("pageExercises") &&
    !document.body.classList.contains("pageLooper")
  )
    return;
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

    const padRect = notePad.getBoundingClientRect();
    const styles = getComputedStyle(notesEl);
    const gap = parseFloat(styles.rowGap || styles.gap || "0");
    const count = notesEl.querySelectorAll(".notePad").length;

    const cols = 4;
    const rows1 = Math.ceil(count / cols);
    const total1 = rows1 * padRect.height + Math.max(0, rows1 - 1) * gap;

    const rootStyles = getComputedStyle(document.documentElement);
    const headerOffset = parseFloat(rootStyles.getPropertyValue("--header-offset") || "0");
    const safeTop = parseFloat(rootStyles.getPropertyValue("--safe-top") || "0");
    const available = window.innerHeight - (headerOffset + safeTop + 16);
    if (available <= 0 || total1 <= 0) return;

    const scale = Math.max(0.55, Math.min(1, available / total1));
    notesEl.style.setProperty("--noteScale", scale.toFixed(3));
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

function getCurrentPathFromHash() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length > 0 && SUPPORTED_LANGS.includes(parts[0])) {
    parts.shift();
  }
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function ensureAudio() {
  const created = ensureAudioCore();
  if (created) setAudioStatusByKey("audio.ready");
  return created;
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

function parseRoute() {
  // #/ or #/maqam/bayati
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  let lang = null;
  if (parts.length > 0 && SUPPORTED_LANGS.includes(parts[0])) {
    lang = parts.shift();
  }
  if (parts.length === 0) return { page: "list", lang };
  if (parts[0] === "exercises") return { page: "exercises", lang };
  if (parts[0] === "looper") return { page: "looper", lang };
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

function intervalLabelFromFrequencies(currentHz, nextHz, isRtl) {
  if (!Number.isFinite(currentHz) || !Number.isFinite(nextHz) || nextHz <= 0 || currentHz <= 0) {
    return "";
  }
  if (nextHz <= currentHz) return "";
  const cents = 1200 * Math.log2(nextHz / currentHz);
  const options = [
    { cents: 100, key: "interval.halfTone" },
    { cents: 150, key: "interval.threeQuarterTone" },
    { cents: 200, key: "interval.oneTone" },
    { cents: 300, key: "interval.oneAndHalfTone" }
  ];
  let best = options[0];
  let bestDiff = Math.abs(cents - best.cents);
  for (let i = 1; i < options.length; i++) {
    const diff = Math.abs(cents - options[i].cents);
    if (diff < bestDiff) {
      best = options[i];
      bestDiff = diff;
    }
  }
  return t(best.key);
}

function getTonicIndexFromScale(data, tonic) {
  const tonicStr = tonic ? String(tonic).trim() : "";
  if (!tonicStr) return -1;
  const target = tonicStr.toLowerCase();
  const directIndex = data.findIndex((n) => {
    const note = String(n?.note || "").toLowerCase();
    return note.startsWith(target);
  });
  if (directIndex >= 0) return directIndex;
  const match = tonicStr.match(/[A-G]/i);
  if (!match) return -1;
  const letter = match[0].toLowerCase();
  return data.findIndex((n) => {
    const note = String(n?.note || "").toLowerCase();
    return note.startsWith(letter);
  });
}

function findNoteIndexInScale(data, entry) {
  if (!entry) return -1;
  const idx = Number(entry.index);
  if (Number.isFinite(idx)) return idx;
  const note = entry.note ?? "";
  const freq = Number(entry.frequency);
  return data.findIndex((n) => {
    if (!n) return false;
    if (n.note !== note) return false;
    if (!Number.isFinite(freq)) return true;
    const f = Number(n.frequency);
    return Number.isFinite(f) && Math.abs(f - freq) < 0.01;
  });
}

function getGroupData(data, groups) {
  const normalized = Array.isArray(groups) ? groups : [];
  const result = normalized.map((entry) => ({
    name: entry?.name || entry?.jins || "",
    scale: Array.isArray(entry?.scale) ? entry.scale : [],
    indices: []
  }));
  const used = new Set();
  result.forEach((group) => {
    group.indices = group.scale
      .map((entry) => findNoteIndexInScale(data, entry))
      .filter((idx) => Number.isFinite(idx) && idx >= 0);
    group.indices.forEach((idx) => used.add(idx));
  });
  return { groups: result, used };
}

function getUpperGroupData(data, upperJins) {
  const groupData = getGroupData(data, upperJins);
  const all = data.map((_, i) => i);
  const lowerIndices = all.filter((idx) => !groupData.used.has(idx));
  return { groups: groupData.groups, lowerIndices };
}

function getLowerGroupData(data, lowerGroups) {
  const groupData = getGroupData(data, lowerGroups);
  const all = data.map((_, i) => i);
  const otherIndices = all.filter((idx) => !groupData.used.has(idx));
  return { groups: groupData.groups, otherIndices, used: groupData.used };
}

function buildScaleList(scale, tonicIndex, allowedSet) {
  if (!Number.isFinite(tonicIndex) || tonicIndex < 0) return [];
  const indices = [...allowedSet]
    .filter((idx) => idx >= tonicIndex)
    .sort((a, b) => a - b);
  return indices
    .map((idx) => {
      const entry = scale[idx];
      if (!entry) return null;
      return {
        note: entry.note,
        frequency: entry.frequency,
        index: idx
      };
    })
    .filter(Boolean);
}

function noteBaseKey(note) {
  const s = String(note || "");
  const match = s.match(/([A-Ga-g])(\d+)/);
  if (!match) return "";
  return `${match[1].toUpperCase()}${match[2]}`;
}

function buildDefaultSelectionSet(data, tonicIndex, upperJins = null) {
  const upperData = getUpperGroupData(data, upperJins);
  if (upperData.groups.length > 1) {
    const selected = new Set();
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(tonicIndex) || tonicIndex < 0 || i - tonicIndex < 0) continue;
      selected.add(i);
    }
    return selected;
  }
  const selected = new Set();
  const seen = new Set();
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(tonicIndex) || tonicIndex < 0 || i - tonicIndex < 0) continue;
    const key = noteBaseKey(data[i]?.note);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selected.add(i);
  }
  return selected;
}

function formatNoteSuffix(suffix) {
  if (!suffix) return "";
  if (window.innerWidth <= 720) {
    return suffix.replace(/Koron/gi, "Ko");
  }
  return suffix;
}

function noteLabelFontSize(label) {
  if (window.innerWidth > 720) return "";
  const len = String(label || "").length;
  if (len <= 4) return "1.85rem";
  if (len <= 6) return "1.65rem";
  if (len <= 8) return "1.5rem";
  if (len <= 10) return "1.35rem";
  return "1.2rem";
}

function buildNoteRows(
  data,
  tonicIndex,
  upperJins,
  lowerJinsDisplay,
  selectedSet = null,
  lowerJinsGroups = null
) {
  function renderNoteItem(n, idx, jinsOverride = "", upperGroupId = "") {
    const note = n?.note ?? "";
    const noteStr = String(note);
    const noteParts = noteStr.split("-");
    const noteBase = noteParts[0] || "";
    const noteSuffixRaw = noteParts.length > 1 ? noteParts.slice(1).join("-") : "";
    const noteSuffix = noteSuffixRaw ? `-${noteSuffixRaw}` : "";
    const noteSuffixDisplay = formatNoteSuffix(noteSuffix);
    const noteLabel = `${noteBase}${noteSuffixDisplay}`;
    const noteFont = noteLabelFontSize(noteLabel);
    const jins = jinsOverride || n?.jins || "";
    const jinsDisplay = jins ? getJinsDisplayName(jins) : "";
    const freq = Number(n?.frequency);
    const next = data[idx + 1];
    const intervalText = intervalLabelFromFrequencies(freq, Number(next?.frequency), isRtlLang(currentLang));
    const displayIndex = Number.isFinite(tonicIndex) && tonicIndex >= 0 ? idx - tonicIndex : idx;
    const isTonic = displayIndex === 0;
    const isSelected = displayIndex >= 0 && (!selectedSet || selectedSet.has(idx));
    const upperAttr = upperGroupId ? ` data-upper="${upperGroupId}"` : "";
    return `
      <div class="noteItem">
        <button class="notePad${isSelected ? " selected" : ""}" data-idx="${idx}" aria-pressed="${
      isSelected ? "true" : "false"
    }"${upperAttr}>
          <div class="noteTitle">
            <span class="noteIndex">[${displayIndex}]${isTonic ? ` <span class="noteKey" aria-hidden="true">🔑</span>` : ""}</span>
            <span class="noteName" style="${noteFont ? `font-size:${noteFont};` : ""}">${escapeHtml(noteBase)}${
      noteSuffixDisplay ? `<span class="noteSuffix">${escapeHtml(noteSuffixDisplay)}</span>` : ""
    }</span>
          </div>
          <div class="noteMeta"><span class="noteInterval">${escapeHtml(intervalText)}</span></div>
        </button>
        ${jinsDisplay ? `<div class="noteJinsOutside">${escapeHtml(jinsDisplay)}</div>` : ""}
      </div>
    `;
  }

  let noteRows = "";
  const upperGroupData = getUpperGroupData(data, upperJins);
  const upperGroups = upperGroupData.groups;
  const lowerGroupData = getLowerGroupData(data, lowerJinsGroups);
  const hasLowerGroups = lowerGroupData.groups.length > 0;

  if (upperGroups.length > 1 || hasLowerGroups) {
    const groupBlocks = [];

    if (hasLowerGroups) {
      for (const group of lowerGroupData.groups) {
        const label = group.name
          ? `${t("maqam.lowerJinsLabel")} ${getJinsDisplayName(group.name)}`
          : t("maqam.lowerJinsLabel");
        groupBlocks.push(`<div class="notesGroupTitle">${escapeHtml(label)}</div>`);
        groupBlocks.push(
          group.indices.map((idx, i) => renderNoteItem(data[idx], idx, i === 0 ? group.name : "")).join("")
        );
      }

      const extraLowerIndices = upperGroupData.lowerIndices.filter((idx) => !lowerGroupData.used.has(idx));
      if (extraLowerIndices.length > 0) {
        const label = lowerJinsDisplay
          ? `${t("maqam.lowerJinsLabel")} ${lowerJinsDisplay}`
          : t("maqam.lowerJinsLabel");
        groupBlocks.push(`<div class="notesGroupTitle">${escapeHtml(label)}</div>`);
        groupBlocks.push(extraLowerIndices.map((idx) => renderNoteItem(data[idx], idx)).join(""));
      }
    }

    if (upperGroups.length > 0) {
      for (const group of upperGroups) {
        const groupId = group === upperGroups[0] ? "a" : group === upperGroups[1] ? "b" : "";
        const label = group.name ? `${t("maqam.upperJinsLabel")} ${getJinsDisplayName(group.name)}` : "";
        if (label) {
          groupBlocks.push(`<div class="notesGroupTitle">${escapeHtml(label)}</div>`);
        }
        groupBlocks.push(
          group.indices
            .map((idx, i) => renderNoteItem(data[idx], idx, i === 0 ? group.name : "", groupId))
            .join("")
        );
      }
    } else if (!hasLowerGroups && upperGroupData.lowerIndices.length > 0) {
      const label = lowerJinsDisplay
        ? `${t("maqam.lowerJinsLabel")} ${lowerJinsDisplay}`
        : t("maqam.lowerJinsLabel");
      groupBlocks.push(`<div class="notesGroupTitle">${escapeHtml(label)}</div>`);
      groupBlocks.push(upperGroupData.lowerIndices.map((idx) => renderNoteItem(data[idx], idx)).join(""));
    }

    noteRows = groupBlocks.join("");
  } else {
    noteRows = data.map((n, idx) => renderNoteItem(n, idx)).join("");
  }

  return noteRows;
}

function getUpperGroupForIndex(idx, upperASet, upperBSet, preferGroup = null) {
  const inA = upperASet.has(idx);
  const inB = upperBSet.has(idx);
  if (inA && inB) return preferGroup;
  if (inA) return "a";
  if (inB) return "b";
  return null;
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
  if (stopExercisesPlayback) stopExercisesPlayback();
  if (stopLooperPlayback) stopLooperPlayback();
  setHeaderMaqam("");
  document.body.classList.remove("pageMaqam");
  document.body.classList.remove("pageExercises");
  document.body.classList.remove("pageLooper");

  const keys = Object.keys(maqamsData);

  const query = listQuery.trim().toLowerCase();
  const filteredKeys = query
    ? keys.filter((k) => {
        const obj = maqamsData[k] || {};
        const displayName = getMaqamDisplayName(k);
        const lower = obj.lower_jins || "";
        const upperNames = getUpperJinsNames(obj.upper_jins || "");
        const upper = upperNames.join(" / ");
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
      const upperNames = getUpperJinsNames(obj.upper_jins);
      const upper = upperNames.join(" / ");
      const lowerDisplay = getJinsDisplayName(lower);
      const upperDisplay = upperNames.map(getJinsDisplayName).join(" / ");

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
  if (stopExercisesPlayback) stopExercisesPlayback();
  if (stopLooperPlayback) stopLooperPlayback();
  document.body.classList.remove("pageExercises");
  document.body.classList.remove("pageLooper");
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
  const lowerJinsGroups = maqamObj.lower_jins_groups || null;
  const upperJins = maqamObj.upper_jins || "";
  const lowerJinsDisplay = getJinsDisplayName(lowerJins);
  const upperNames = getUpperJinsNames(upperJins);
  const upperJinsDisplay = upperNames.map(getJinsDisplayName).join(" / ");
  const data = Array.isArray(maqamObj.scale) ? maqamObj.scale : [];
  const tonicIndex = getTonicIndexFromScale(data, maqamObj.tonic);
  const defaultSelected = buildDefaultSelectionSet(data, tonicIndex, upperJins);
  const noteRows = buildNoteRows(
    data,
    tonicIndex,
    upperJins,
    lowerJinsDisplay,
    defaultSelected,
    lowerJinsGroups
  );
  const upperGroupData = getUpperGroupData(data, upperJins);

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
          <span id="tempoMiniValue"><strong>60</strong> BPM</span>
          <button id="tempoUp" class="miniBtn" aria-label="${escapeHtml(t("aria.increaseTempo"))}">+</button>
        </label>

        <label class="row miniGroup" style="gap:6px;">
          <span class="pill">${escapeHtml(t("controls.length"))}</span>
          <button id="noteLenDown" class="miniBtn" aria-label="${escapeHtml(t("aria.decreaseLength"))}">-</button>
          <span id="noteLenMiniValue"><strong>800</strong> ms</span>
          <button id="noteLenUp" class="miniBtn" aria-label="${escapeHtml(t("aria.increaseLength"))}">+</button>
        </label>
      </div>
      <div id="miniActions" class="row miniActions" style="margin-top:8px; width:100%;">
        <button id="btnPlaySelectedMini">${escapeHtml(t("controls.playSelected"))}</button>
        <button id="btnStartLoopMini">${escapeHtml(t("controls.loopShort"))}</button>
        <button id="btnStopMini" disabled>${escapeHtml(t("controls.stop"))}</button>
        <button id="btnPauseMini" disabled>${escapeHtml(t("controls.pause"))}</button>
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
            <input id="tempo" type="range" min="30" max="240" value="60" />
            <span id="tempoLabel"><strong>60</strong> BPM</span>
          </label>

          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("controls.noteLength"))}</span>
            <input id="noteLen" type="range" min="80" max="1200" value="800" />
            <span id="noteLenLabel"><strong>800</strong> ms</span>
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

          ${
            upperGroupData.groups.length > 1
              ? `
          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("upperJins.modeLabel"))}</span>
            <select id="upperJinsMode">
              <option value="a">${escapeHtml(
                t("upperJins.aOnly", {
                  name: getJinsDisplayName(upperGroupData.groups[0]?.name) || t("upperJins.groupA")
                })
              )}</option>
              <option value="b">${escapeHtml(
                t("upperJins.bOnly", {
                  name: getJinsDisplayName(upperGroupData.groups[1]?.name) || t("upperJins.groupB")
                })
              )}</option>
              <option value="mixed" selected>${escapeHtml(t("upperJins.mixed"))}</option>
            </select>
          </label>
          `
              : ""
          }

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
  const miniActions = document.getElementById("miniActions");
  const tempoDown = document.getElementById("tempoDown");
  const tempoUp = document.getElementById("tempoUp");
  const noteLenDown = document.getElementById("noteLenDown");
  const noteLenUp = document.getElementById("noteLenUp");
  const tempoMiniValue = document.getElementById("tempoMiniValue");
  const noteLenMiniValue = document.getElementById("noteLenMiniValue");
  const btnPlaySelectedMini = document.getElementById("btnPlaySelectedMini");
  const btnStartLoopMini = document.getElementById("btnStartLoopMini");
  const btnStopMini = document.getElementById("btnStopMini");
  const btnPauseMini = document.getElementById("btnPauseMini");
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
  const upperJinsMode = document.getElementById("upperJinsMode");
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
    if (!Number.isFinite(idx)) return;
    if (!playButtonsByIdx.has(idx)) playButtonsByIdx.set(idx, []);
    playButtonsByIdx.get(idx).push(btn);
  });

  let activeLoopBtn = null;
  function setActiveLoopIndex(entry) {
    if (activeLoopBtn) activeLoopBtn.classList.remove("active");
    activeLoopBtn = null;

    if (entry === null || entry === undefined) return;
    const idx = typeof entry === "object" ? Number(entry.idx) : Number(entry);
    const group = typeof entry === "object" ? entry.group : null;
    if (!Number.isFinite(idx)) return;
    const buttons = playButtonsByIdx.get(idx);
    if (!buttons || buttons.length === 0) return;
    const preferred =
      (group ? buttons.find((btn) => btn.getAttribute("data-upper") === group) : null) ||
      buttons.find((btn) => btn.classList.contains("selected")) ||
      buttons[0];
    preferred.classList.add("active");
    activeLoopBtn = preferred;
  }

  function getSelectedIndexes() {
    const pads = [...appEl.querySelectorAll(".notePad.selected")];
    const uniq = new Set(
      pads.map((c) => Number(c.getAttribute("data-idx"))).filter((n) => Number.isFinite(n))
    );
    return [...uniq].sort((a, b) => a - b);
  }

  const upperGroupA = upperGroupData.groups[0] || { indices: [] };
  const upperGroupB = upperGroupData.groups[1] || { indices: [] };
  const upperASet = new Set(upperGroupA.indices);
  const upperBSet = new Set(upperGroupB.indices);
  const lowerSet = new Set(upperGroupData.lowerIndices);

  function applyUpperMode() {
    if (!upperJinsMode) return;
    appEl.querySelectorAll(".notePad").forEach((btn) => {
      btn.classList.remove("blocked");
    });
    updateSelectedCount();
  }

  function getLoopSequence() {
    const idxs = getSelectedIndexes();
    if (idxs.length === 0) return [];
    const mode = loopOrder?.value || "upDown";

    if (!upperJinsMode) {
      if (mode === "down") return [...idxs].reverse().map((idx) => ({ idx, group: null }));
      if (mode === "up") return idxs.map((idx) => ({ idx, group: null }));
      return idxs
        .map((idx) => ({ idx, group: null }))
        .concat([...idxs].reverse().map((idx) => ({ idx, group: null })));
    }

    const upperMode = upperJinsMode.value;
    const lower = idxs.filter((idx) => lowerSet.has(idx));
    const upperA = idxs.filter((idx) => upperASet.has(idx));
    const upperB = idxs.filter((idx) => upperBSet.has(idx));

    const upSeq = [...lower, ...upperA].sort((a, b) => a - b);
    const downSeq = [...lower, ...upperB].sort((a, b) => a - b);
    const upEntries = upSeq.map((idx) => ({
      idx,
      group: getUpperGroupForIndex(idx, upperASet, upperBSet, "a")
    }));
    const downEntries = downSeq.map((idx) => ({
      idx,
      group: getUpperGroupForIndex(idx, upperASet, upperBSet, "b")
    }));

    if (upperMode === "mixed") {
      const up = upEntries.length > 0 ? upEntries : downEntries;
      const down = downEntries.length > 0 ? downEntries : upEntries;
      if (mode === "up") return up;
      if (mode === "down") return [...down].reverse();
      return up.concat([...down].reverse());
    }

    const single = upperMode === "b" ? downEntries : upEntries;
    if (mode === "down") return [...single].reverse();
    if (mode === "up") return single;
    return single.concat([...single].reverse());
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
    if (btnStopMini) btnStopMini.disabled = !isRunning && !isPlayingSequence;
    if (btnStartLoopMini) btnStartLoopMini.disabled = isRunning;
  }

  function setPauseButtonState(paused) {
    const label = paused ? t("controls.resume") : t("controls.pause");
    if (btnPause) btnPause.textContent = label;
    if (btnPauseMobile) btnPauseMobile.textContent = label;
    if (btnPauseMini) btnPauseMini.textContent = label;
  }

  function updatePauseAvailability() {
    const canPause = isLooping || isPlayingSequence;
    if (btnPause) btnPause.disabled = !canPause;
    if (btnPauseMobile) btnPauseMobile.disabled = !canPause;
    if (btnPauseMini) btnPauseMini.disabled = !canPause;
  }

  // --- Playback controls ---
  if (toggleControls && controlsPanel && miniControls) {
    toggleControls.onclick = () => {
      const isOpen = controlsPanel.style.display !== "none";
      controlsPanel.style.display = isOpen ? "none" : "block";
      miniControls.style.display = isOpen ? "flex" : "none";
      if (miniActions) miniActions.style.display = isOpen ? "flex" : "none";
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

  if (upperJinsMode) {
    upperJinsMode.onchange = () => {
      applyUpperMode();
      if (isLooping) {
        currentLoopStep = 0;
        loopTick();
        restartLoopTimer();
      }
    };
    applyUpperMode();
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
      if (btn.classList.contains("blocked")) {
        playTone(Number(note.frequency), getNoteDurationMs(), pitchOffsetSemitones);
        return;
      }
      const isSelected = btn.classList.toggle("selected");
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      updateSelectedCount();
      playTone(Number(note.frequency), getNoteDurationMs(), pitchOffsetSemitones);
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
    if (btnPlaySelectedMini) btnPlaySelectedMini.disabled = true;
    btnStopLoop.disabled = false;
    btnStopLoopMobile.disabled = false;
    if (btnStopMini) btnStopMini.disabled = false;
    setPauseButtonState(false);
    updatePauseAvailability();

    for (let i = 0; i < seq.length; i++) {
      if (playSequenceToken !== token) break;
      while (isPaused && playSequenceToken === token) {
        await sleep(80);
      }
      if (playSequenceToken !== token) break;
      const entry = seq[i];
      const noteIdx = typeof entry === "object" ? entry.idx : entry;
      const n = data[noteIdx];
      setActiveLoopIndex(entry);
      if (n && Number.isFinite(Number(n.frequency))) playTone(Number(n.frequency), dur, pitchOffsetSemitones);
      await sleep(intervalMs);
    }
    setActiveLoopIndex(null);
    isPlayingSequence = false;
    btnPlaySelected.disabled = false;
    btnPlaySelectedMobile.disabled = false;
    if (btnPlaySelectedMini) btnPlaySelectedMini.disabled = false;
    if (!isLooping) {
      btnStopLoop.disabled = true;
      btnStopLoopMobile.disabled = true;
      if (btnStopMini) btnStopMini.disabled = true;
    }
    updatePauseAvailability();
  };
  btnPlaySelectedMobile.onclick = () => btnPlaySelected.click();
  if (btnPlaySelectedMini) btnPlaySelectedMini.onclick = () => btnPlaySelected.click();

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
    const entry = seq[i];
    const noteIdx = typeof entry === "object" ? entry.idx : entry;
    const note = data[noteIdx];

    setActiveLoopIndex(entry);

    if (note && Number.isFinite(Number(note.frequency))) {
      playTone(Number(note.frequency), dur, pitchOffsetSemitones);
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
  if (btnStartLoopMini) btnStartLoopMini.onclick = () => btnStartLoop.click();

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
  if (btnStopMini) btnStopMini.onclick = () => btnStopLoop.click();

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
  if (btnPauseMini) btnPauseMini.onclick = () => togglePause();

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

    const ctx = getAudioContext();
    if (!ctx) return;
    micSource = ctx.createMediaStreamSource(micStream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    micData = new Float32Array(analyser.fftSize);

    micSource.connect(analyser);

    btnEnableMic.disabled = true;
    btnDisableMic.disabled = false;

    const tick = () => {
      if (!analyser) return;

      analyser.getFloatTimeDomainData(micData);
      const hz = autoCorrelate(micData, ctx.sampleRate);
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

function getMaqamKeyFromInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = normalizeKey(raw);
  if (maqamsData && maqamsData[normalized]) return normalized;

  const match = raw.match(/\(([^)]+)\)\s*$/);
  if (match) {
    const maybeKey = normalizeKey(match[1]);
    if (maqamsData && maqamsData[maybeKey]) return maybeKey;
  }

  const keys = Object.keys(maqamsData || {});
  for (const key of keys) {
    const display = getMaqamDisplayName(key);
    if (normalizeKey(display) === normalized) return key;
  }
  return "";
}

function renderExercisesPage() {
  stopLoop();
  stopMic();
  stopAllPlayback();
  if (stopLooperPlayback) stopLooperPlayback();
  setHeaderMaqam("");
  document.body.classList.remove("pageMaqam");
  document.body.classList.add("pageExercises");
  document.body.classList.remove("pageLooper");

  const maqamKeys = sortMaqamKeysByDisplay(Object.keys(maqamsData || {}));
  const maqamOptions = maqamKeys
    .map((k) => {
      const display = getMaqamDisplayName(k) || k;
      return `<option value="${escapeHtml(k)}">${escapeHtml(display)}</option>`;
    })
    .join("");
  const exerciseOptions = EXERCISES.map(
    (ex) => `<option value="${escapeHtml(ex.id)}">${escapeHtml(ex.name)}</option>`
  ).join("");
  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:8px;">
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("exercises.maqam"))}</span>
          <select id="exerciseMaqamInput">
            <option value="">${escapeHtml(t("exercises.maqamPlaceholder"))}</option>
            ${maqamOptions}
          </select>
        </label>
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("exercises.pickExercise"))}</span>
          <select id="exerciseSelect">
            <option value="">${escapeHtml(t("exercises.selectExercise"))}</option>
            ${exerciseOptions}
          </select>
        </label>
      </div>
      <div class="row" style="margin-top:8px;">
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("controls.tempo"))}</span>
          <input id="exerciseTempo" type="range" min="30" max="240" value="60" />
          <span id="exerciseTempoLabel"><strong>60</strong> BPM</span>
        </label>
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("controls.noteLength"))}</span>
          <input id="exerciseNoteLen" type="range" min="80" max="1200" value="800" />
          <span id="exerciseNoteLenLabel"><strong>800</strong> ms</span>
        </label>
        <span id="exerciseUpperJinsWrap"></span>
        <button id="exerciseStart">${escapeHtml(t("exercises.start"))}</button>
        <button id="exerciseStop" disabled>${escapeHtml(t("exercises.stop"))}</button>
      </div>
      <div class="muted small" id="exerciseStatus" style="margin-top:8px;">${escapeHtml(
        t("exercises.status.ready")
      )}</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="row" style="align-items:flex-start;">
        <div>
          <div class="muted small">${escapeHtml(t("exercises.nowPlaying"))}</div>
          <div id="exerciseNow" style="font-size:1.2rem; font-weight:700;">-</div>
        </div>
      </div>
      <div id="exerciseSteps" class="exerciseSteps"></div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <strong>${escapeHtml(t("exercises.notesTitle"))}</strong>
      </div>
      <div id="exerciseNotes" class="notes" style="margin-top:8px;"></div>
    </div>
  `;

  const maqamInput = document.getElementById("exerciseMaqamInput");
  const exerciseSelect = document.getElementById("exerciseSelect");
  const tempo = document.getElementById("exerciseTempo");
  const tempoLabel = document.getElementById("exerciseTempoLabel");
  const noteLen = document.getElementById("exerciseNoteLen");
  const noteLenLabel = document.getElementById("exerciseNoteLenLabel");
  const btnStart = document.getElementById("exerciseStart");
  const btnStop = document.getElementById("exerciseStop");
  const statusEl = document.getElementById("exerciseStatus");
  const nowEl = document.getElementById("exerciseNow");
  const stepsEl = document.getElementById("exerciseSteps");
  const notesEl = document.getElementById("exerciseNotes");
  const upperJinsWrap = document.getElementById("exerciseUpperJinsWrap");

  let exerciseTimer = null;
  let exerciseSequence = [];
  let activeStepEl = null;
  let exerciseData = [];
  let exerciseUpperData = { groups: [], lowerIndices: [] };
  let exerciseUpperMode = "a";
  let noteButtonsByIdx = new Map();
  let activeNoteBtn = null;

  function setStatus(key, vars = null) {
    statusEl.textContent = t(key, vars);
  }

  function setActiveStep(idx) {
    if (activeStepEl) activeStepEl.classList.remove("active");
    activeStepEl = null;
    if (!stepsEl || idx === null) return;
    const next = stepsEl.querySelector(`.exerciseStep[data-step="${idx}"]`);
    if (next) {
      next.classList.add("active");
      activeStepEl = next;
    }
  }

  function setActiveNoteIndex(idx) {
    if (activeNoteBtn) activeNoteBtn.classList.remove("active");
    activeNoteBtn = null;
    if (idx === null || idx === undefined) return;
    const noteIdx = typeof idx === "object" ? Number(idx.idx) : Number(idx);
    const group = typeof idx === "object" ? idx.group : null;
    if (!Number.isFinite(noteIdx)) return;
    const buttons = noteButtonsByIdx.get(noteIdx);
    if (!buttons || buttons.length === 0) return;
    const preferred =
      (group ? buttons.find((btn) => btn.getAttribute("data-upper") === group) : null) ||
      buttons.find((btn) => btn.classList.contains("selected")) ||
      buttons[0];
    preferred.classList.add("active");
    activeNoteBtn = preferred;
  }

  function mapNoteButtons() {
    noteButtonsByIdx = new Map();
    activeNoteBtn = null;
    if (!notesEl) return;
    notesEl.querySelectorAll(".notePad").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-idx"));
      if (!Number.isFinite(idx)) return;
      if (!noteButtonsByIdx.has(idx)) noteButtonsByIdx.set(idx, []);
      noteButtonsByIdx.get(idx).push(btn);
      btn.addEventListener("click", () => {
        const note = exerciseData[idx];
        if (!note || !Number.isFinite(Number(note.frequency))) return;
        if (!btn.classList.contains("blocked")) {
          const isSelected = btn.classList.toggle("selected");
          btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
        }
        playTone(Number(note.frequency), Number(noteLen.value) || 800, 0);
      });
    });
  }

  function applyUpperModeToNotes() {
    if (!notesEl) return;
    notesEl.querySelectorAll(".notePad").forEach((btn) => {
      btn.classList.remove("blocked");
    });
  }

  function refreshNotesPanel() {
    const maqamKey = String(maqamInput.value || "");
    if (!maqamKey) {
      if (notesEl) {
        notesEl.innerHTML = `<div class="muted small" style="grid-column:1/-1;">${escapeHtml(
          t("exercises.status.noMaqam")
        )}</div>`;
      }
      exerciseData = [];
      noteButtonsByIdx = new Map();
      activeNoteBtn = null;
      updateNotesScale();
      return;
    }

    const obj = maqamsData[maqamKey] || {};
    exerciseData = Array.isArray(obj.scale) ? obj.scale : [];
    const tonicIndex = getTonicIndexFromScale(exerciseData, obj.tonic);
    const lowerDisplay = getJinsDisplayName(obj.lower_jins || "");
    exerciseUpperData = getUpperGroupData(exerciseData, obj.upper_jins);
    const defaultSelected = buildDefaultSelectionSet(exerciseData, tonicIndex, obj.upper_jins);
    const noteRows = buildNoteRows(exerciseData, tonicIndex, obj.upper_jins, lowerDisplay, defaultSelected);
    if (notesEl) {
      notesEl.innerHTML = noteRows;
    }
    mapNoteButtons();
    if (upperJinsWrap) {
      if (exerciseUpperData.groups.length > 1) {
        const upperAName =
          getJinsDisplayName(exerciseUpperData.groups[0]?.name) || t("upperJins.groupA");
        const upperBName =
          getJinsDisplayName(exerciseUpperData.groups[1]?.name) || t("upperJins.groupB");
        upperJinsWrap.innerHTML = `
          <label class="row" style="gap:8px;">
            <span class="pill">${escapeHtml(t("upperJins.modeLabel"))}</span>
            <select id="exerciseUpperJinsMode">
              <option value="a">${escapeHtml(t("upperJins.aOnly", { name: upperAName }))}</option>
              <option value="b">${escapeHtml(t("upperJins.bOnly", { name: upperBName }))}</option>
              <option value="mixed" selected>${escapeHtml(t("upperJins.mixed"))}</option>
            </select>
          </label>
        `;
        const upperSelect = document.getElementById("exerciseUpperJinsMode");
        upperSelect.value = exerciseUpperMode;
        upperSelect.onchange = () => {
          exerciseUpperMode = upperSelect.value;
          stopExercise();
          refreshNotesPanel();
        };
      } else {
        upperJinsWrap.innerHTML = "";
        exerciseUpperMode = "a";
      }
    }
    applyUpperModeToNotes();
    updateNotesScale();
  }

  function stopExercise() {
    if (exerciseTimer) {
      clearInterval(exerciseTimer);
      exerciseTimer = null;
    }
    exerciseSequence = [];
    setActiveStep(null);
    setActiveNoteIndex(null);
    btnStart.disabled = false;
    btnStop.disabled = true;
    nowEl.textContent = "-";
    setStatus("exercises.status.stopped");
    stopAllPlayback();
  }

  stopExercisesPlayback = stopExercise;

  function buildSequence() {
    const maqamKey = String(maqamInput.value || "");
    if (!maqamKey) return { error: "exercises.status.noMaqam" };

    const exerciseId = String(exerciseSelect.value || "");
    const exercise = EXERCISES.find((ex) => ex.id === exerciseId);
    if (!exercise) return { error: "exercises.status.noExercise" };

    const obj = maqamsData[maqamKey] || {};
    const scale = Array.isArray(obj.scale) ? obj.scale : [];
    const tonicIndex = getTonicIndexFromScale(scale, obj.tonic);
    if (tonicIndex < 0) {
      return { error: "exercises.status.noTonic", vars: { tonic: obj.tonic || "" } };
    }

    const upperData = exerciseUpperData || getUpperGroupData(scale, obj.upper_jins);
    const lowerSet = new Set(upperData.lowerIndices);
    const upperASet = new Set(upperData.groups[0]?.indices || []);
    const upperBSet = new Set(upperData.groups[1]?.indices || []);
    const allowedA = new Set([...lowerSet, ...upperASet]);
    const allowedB = new Set([...lowerSet, ...upperBSet]);
    let scaleUp = buildScaleList(scale, tonicIndex, allowedA);
    let scaleDown = buildScaleList(scale, tonicIndex, allowedB);
    let pattern = exercise.pattern;

    if (exercise.id === "full_scale" && normalizeKey(maqamKey) === "nawah") {
      const selected = buildDefaultSelectionSet(scale, 0, null);
      const fullScale = buildScaleList(scale, 0, selected);
      scaleUp = fullScale;
      scaleDown = fullScale;
      pattern = [5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5];
    }

    const needed = Math.max(...pattern);
    if (exerciseUpperMode === "mixed") {
      const minCount = Math.min(scaleUp.length, scaleDown.length);
      if (minCount < needed) {
        return { error: "exercises.status.notEnoughNotes", vars: { count: minCount, needed } };
      }
    } else {
      const scaleMain = exerciseUpperMode === "b" ? scaleDown : scaleUp;
      if (scaleMain.length < needed) {
        return { error: "exercises.status.notEnoughNotes", vars: { count: scaleMain.length, needed } };
      }
    }

    let prevDegree = null;
    const seq = pattern
      .map((degree) => {
        let useScale = exerciseUpperMode === "b" ? scaleDown : scaleUp;
        let preferGroup = exerciseUpperMode === "b" ? "b" : "a";
        if (exerciseUpperMode === "mixed") {
          if (prevDegree !== null && degree < prevDegree) {
            useScale = scaleDown;
            preferGroup = "b";
          } else {
            useScale = scaleUp;
            preferGroup = "a";
          }
        }
        prevDegree = degree;
        const n = useScale[degree - 1];
        if (!n || !Number.isFinite(Number(n.frequency))) return null;
        const group = getUpperGroupForIndex(n.index, upperASet, upperBSet, preferGroup);
        return { degree, note: n.note, frequency: Number(n.frequency), index: n.index, group };
      })
      .filter(Boolean);

    if (seq.length === 0) return { error: "exercises.status.noNotes" };
    return { seq, exercise };
  }

  function renderSteps(seq) {
    if (!stepsEl) return;
    stepsEl.innerHTML = seq
      .map(
        (step, i) =>
          `<span class="exerciseStep" data-step="${i}" title="${escapeHtml(
            t("exercises.stepTitle", { degree: step.degree })
          )}">${escapeHtml(step.note)}</span>`
      )
      .join("");
  }

  function playStep(idx) {
    const step = exerciseSequence[idx];
    if (!step) return;
    setActiveStep(idx);
    setActiveNoteIndex({ idx: step.index, group: step.group });
    nowEl.innerHTML = `<strong>${escapeHtml(step.note)}</strong> <span class="pill">${step.frequency.toFixed(
      2
    )} Hz</span>`;
    playTone(step.frequency, Number(noteLen.value) || 800, 0);
  }

  function startExercise() {
    refreshNotesPanel();
    const built = buildSequence();
    if (built.error) {
      setStatus(built.error, built.vars);
      return;
    }
    const { seq, exercise } = built;
    exerciseSequence = seq;
    renderSteps(seq);
    ensureAudio();
    stopLoop();
    stopAllPlayback();

    const intervalMs = getBpmIntervalMs(tempo.value);
    let stepIndex = 0;

    setStatus("exercises.status.playing", { name: exercise.name });
    btnStart.disabled = true;
    btnStop.disabled = false;

    playStep(stepIndex);
    exerciseTimer = setInterval(() => {
      stepIndex = (stepIndex + 1) % exerciseSequence.length;
      playStep(stepIndex);
    }, intervalMs);
  }

  tempo.oninput = () => {
    tempoLabel.innerHTML = `<strong>${tempo.value}</strong> BPM`;
    if (exerciseTimer) {
      clearInterval(exerciseTimer);
      exerciseTimer = null;
      startExercise();
    }
  };

  noteLen.oninput = () => {
    noteLenLabel.innerHTML = `<strong>${noteLen.value}</strong> ms`;
  };

  btnStart.onclick = () => startExercise();
  btnStop.onclick = () => stopExercise();

  maqamInput.onchange = () => {
    stopExercise();
    refreshNotesPanel();
  };

  setStatus("exercises.status.ready");
  refreshNotesPanel();
}

function renderLooperPage() {
  stopLoop();
  stopMic();
  stopAllPlayback();
  if (stopExercisesPlayback) stopExercisesPlayback();
  setHeaderMaqam("");
  document.body.classList.remove("pageMaqam");
  document.body.classList.remove("pageExercises");
  document.body.classList.add("pageLooper");

  const maqamKeys = sortMaqamKeysByDisplay(Object.keys(maqamsData || {}));
  const maqamOptions = maqamKeys
    .map((k) => {
      const display = getMaqamDisplayName(k) || k;
      return `<option value="${escapeHtml(k)}">${escapeHtml(display)}</option>`;
    })
    .join("");

  appEl.innerHTML = `
    <div class="card">
      <div class="row" style="margin-bottom:8px;">
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("looper.maqam"))}</span>
          <select id="looperMaqam">
            <option value="">${escapeHtml(t("looper.selectMaqam"))}</option>
            ${maqamOptions}
          </select>
        </label>
      </div>
      <div class="row" style="margin-top:8px;">
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("looper.metronome"))}</span>
          <input id="looperTempo" type="range" min="30" max="240" value="60" />
          <span id="looperTempoLabel"><strong>60</strong> BPM</span>
        </label>
        <label class="row" style="gap:8px;">
          <span class="pill">${escapeHtml(t("controls.noteLength"))}</span>
          <input id="looperNoteLen" type="range" min="80" max="1200" value="800" />
          <span id="looperNoteLenLabel"><strong>800</strong> ms</span>
        </label>
        <button id="looperRecord">${escapeHtml(t("looper.startRecording"))}</button>
        <button id="looperStopRecord" disabled>${escapeHtml(t("looper.stopRecording"))}</button>
        <button id="looperPlay" disabled>${escapeHtml(t("looper.playLoop"))}</button>
        <button id="looperStop" disabled>${escapeHtml(t("looper.stopLoop"))}</button>
        <button id="looperClear">${escapeHtml(t("looper.clear"))}</button>
      </div>
      <div class="muted small" id="looperStatus" style="margin-top:8px;">${escapeHtml(
        t("looper.status.ready")
      )}</div>
      <div id="looperTimeline" class="looperTimeline" style="margin-top:10px;">
        <div class="looperPlayhead" id="looperPlayhead" style="display:none;"></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <div class="row" style="align-items:center; justify-content:space-between;">
        <strong>${escapeHtml(t("looper.notesTitle"))}</strong>
        <span class="muted small" id="looperCount">0</span>
      </div>
      <div id="looperNotes" class="notes" style="margin-top:8px;"></div>
    </div>
  `;

  const maqamSelect = document.getElementById("looperMaqam");
  const btnRecord = document.getElementById("looperRecord");
  const btnStopRecord = document.getElementById("looperStopRecord");
  const btnPlay = document.getElementById("looperPlay");
  const btnStop = document.getElementById("looperStop");
  const btnClear = document.getElementById("looperClear");
  const tempo = document.getElementById("looperTempo");
  const tempoLabel = document.getElementById("looperTempoLabel");
  const noteLen = document.getElementById("looperNoteLen");
  const noteLenLabel = document.getElementById("looperNoteLenLabel");
  const statusEl = document.getElementById("looperStatus");
  const timelineEl = document.getElementById("looperTimeline");
  const playheadEl = document.getElementById("looperPlayhead");
  const notesEl = document.getElementById("looperNotes");
  const countEl = document.getElementById("looperCount");

  let looperData = [];
  let noteButtonsByIdx = new Map();
  let activeNoteBtn = null;
  let isRecording = false;
  let isLooping = false;
  let recordStart = 0;
  let recordedEvents = [];
  let loopTimeout = null;
  let loopTimers = [];
  let metronomeTimer = null;
  let loopDuration = 0;
  let playheadRaf = null;
  let loopStart = 0;

  function setStatus(key, vars = null) {
    statusEl.textContent = t(key, vars);
  }

  function updateCount() {
    countEl.textContent = String(recordedEvents.length);
  }

  function renderTimeline() {
    if (!timelineEl) return;
    timelineEl.innerHTML =
      '<div class="looperPlayhead" id="looperPlayhead" style="display:none;"></div>';
    const localPlayhead = document.getElementById("looperPlayhead");
    if (recordedEvents.length === 0) {
      if (localPlayhead) localPlayhead.style.display = "none";
      return;
    }
    const duration = Math.max(400, loopDuration || recordedEvents[recordedEvents.length - 1].t || 0);
    recordedEvents.forEach((ev, i) => {
      const left = Math.max(0, Math.min(100, (ev.t / duration) * 100));
      const el = document.createElement("div");
      el.className = "looperEvent";
      el.style.left = `${left}%`;
      el.textContent = ev.note;
      el.setAttribute("data-event-idx", String(i));
      timelineEl.appendChild(el);
    });
  }

  function setActiveTimelineEvent(idx) {
    if (!timelineEl) return;
    timelineEl.querySelectorAll(".looperEvent.active").forEach((el) => el.classList.remove("active"));
    if (idx === null || idx === undefined) return;
    const el = timelineEl.querySelector(`.looperEvent[data-event-idx="${idx}"]`);
    if (el) el.classList.add("active");
  }

  function updatePlayhead() {
    const localPlayhead = document.getElementById("looperPlayhead");
    if (!isLooping || !localPlayhead) return;
    const duration = Math.max(400, loopDuration || recordedEvents[recordedEvents.length - 1].t || 0);
    const elapsed = Math.max(0, performance.now() - loopStart);
    const pct = ((elapsed % duration) / duration) * 100;
    localPlayhead.style.left = `${pct}%`;
    playheadRaf = requestAnimationFrame(updatePlayhead);
  }

  function startPlayhead() {
    const localPlayhead = document.getElementById("looperPlayhead");
    if (!localPlayhead) return;
    localPlayhead.style.display = "block";
    loopStart = performance.now();
    if (playheadRaf) cancelAnimationFrame(playheadRaf);
    playheadRaf = requestAnimationFrame(updatePlayhead);
  }

  function stopPlayhead() {
    if (playheadRaf) cancelAnimationFrame(playheadRaf);
    playheadRaf = null;
    const localPlayhead = document.getElementById("looperPlayhead");
    if (localPlayhead) localPlayhead.style.display = "none";
    setActiveTimelineEvent(null);
  }

  function setActiveNoteIndex(entry) {
    if (activeNoteBtn) activeNoteBtn.classList.remove("active");
    activeNoteBtn = null;
    if (!entry) return;
    const idx = Number(entry.idx);
    const group = entry.group || null;
    if (!Number.isFinite(idx)) return;
    const buttons = noteButtonsByIdx.get(idx);
    if (!buttons || buttons.length === 0) return;
    const preferred = group
      ? buttons.find((btn) => btn.getAttribute("data-upper") === group)
      : buttons[0];
    if (preferred) {
      preferred.classList.add("active");
      activeNoteBtn = preferred;
    }
  }

  function mapNoteButtons() {
    noteButtonsByIdx = new Map();
    activeNoteBtn = null;
    notesEl.querySelectorAll(".notePad").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-idx"));
      if (!Number.isFinite(idx)) return;
      if (!noteButtonsByIdx.has(idx)) noteButtonsByIdx.set(idx, []);
      noteButtonsByIdx.get(idx).push(btn);
      btn.addEventListener("click", () => {
        const note = looperData[idx];
        if (!note || !Number.isFinite(Number(note.frequency))) return;
        const group = btn.getAttribute("data-upper") || null;
        playTone(Number(note.frequency), Number(noteLen.value) || 800, 0);
        if (isRecording) {
          const tms = Math.max(0, performance.now() - recordStart);
          recordedEvents.push({
            t: tms,
            note: note.note,
            frequency: Number(note.frequency),
            idx,
            group
          });
          updateCount();
          renderTimeline();
        }
      });
    });
  }

  function stopMetronome() {
    if (metronomeTimer) {
      clearInterval(metronomeTimer);
      metronomeTimer = null;
    }
  }

  function startMetronome() {
    stopMetronome();
    const intervalMs = getBpmIntervalMs(tempo.value);
    playClick();
    metronomeTimer = setInterval(playClick, intervalMs);
  }

  function refreshNotesPanel() {
    const maqamKey = String(maqamSelect.value || "");
    if (!maqamKey) {
      notesEl.innerHTML = `<div class="muted small" style="grid-column:1/-1;">${escapeHtml(
        t("looper.status.noMaqam")
      )}</div>`;
      looperData = [];
      noteButtonsByIdx = new Map();
      activeNoteBtn = null;
      updateNotesScale();
      return;
    }

    const obj = maqamsData[maqamKey] || {};
    looperData = Array.isArray(obj.scale) ? obj.scale : [];
    const tonicIndex = getTonicIndexFromScale(looperData, obj.tonic);
    const lowerDisplay = getJinsDisplayName(obj.lower_jins || "");
    const noteRows = buildNoteRows(looperData, tonicIndex, obj.upper_jins, lowerDisplay);
    notesEl.innerHTML = noteRows;
    mapNoteButtons();
    updateNotesScale();
  }

  function clearLoopTimers() {
    loopTimers.forEach((t) => clearTimeout(t));
    loopTimers = [];
    if (loopTimeout) {
      clearTimeout(loopTimeout);
      loopTimeout = null;
    }
  }

  function stopLoopPlayback() {
    clearLoopTimers();
    isLooping = false;
    stopMetronome();
    stopPlayhead();
    btnPlay.disabled = recordedEvents.length === 0;
    btnStop.disabled = true;
    setActiveNoteIndex(null);
  }

  function playLoopOnce() {
    if (recordedEvents.length === 0) return 0;
    const duration = Math.max(400, loopDuration || recordedEvents[recordedEvents.length - 1].t || 0);
    recordedEvents.forEach((ev, i) => {
      const timer = setTimeout(() => {
        playTone(ev.frequency, Number(noteLen.value) || 800, 0);
        setActiveNoteIndex(ev);
        setActiveTimelineEvent(i);
      }, ev.t);
      loopTimers.push(timer);
    });
    return duration;
  }

  function startLoopPlayback() {
    if (recordedEvents.length === 0) {
      setStatus("looper.status.empty");
      return;
    }
    loopDuration = Math.max(400, recordedEvents[recordedEvents.length - 1].t || 0);
    stopAllPlayback();
    clearLoopTimers();
    isLooping = true;
    btnPlay.disabled = true;
    btnStop.disabled = false;
    setStatus("looper.status.playing");
    startPlayhead();
    const duration = playLoopOnce();
    loopTimeout = setTimeout(() => {
      if (isLooping) startLoopPlayback();
    }, duration + 60);
  }

  function startRecording() {
    recordedEvents = [];
    updateCount();
    loopDuration = 0;
    renderTimeline();
    isRecording = true;
    recordStart = performance.now();
    startMetronome();
    btnRecord.disabled = true;
    btnStopRecord.disabled = false;
    btnPlay.disabled = true;
    setStatus("looper.status.recording");
  }

  function stopRecording() {
    isRecording = false;
    stopMetronome();
    btnRecord.disabled = false;
    btnStopRecord.disabled = true;
    btnPlay.disabled = recordedEvents.length === 0;
    loopDuration = Math.max(400, recordedEvents[recordedEvents.length - 1]?.t || 0);
    renderTimeline();
    setStatus("looper.status.recorded", { count: recordedEvents.length });
  }

  function clearRecording() {
    recordedEvents = [];
    updateCount();
    loopDuration = 0;
    renderTimeline();
    stopLoopPlayback();
    btnPlay.disabled = true;
    setStatus("looper.status.cleared");
  }

  maqamSelect.onchange = () => {
    stopLoopPlayback();
    clearRecording();
    refreshNotesPanel();
  };

  btnRecord.onclick = () => startRecording();
  btnStopRecord.onclick = () => stopRecording();
  btnPlay.onclick = () => startLoopPlayback();
  btnStop.onclick = () => stopLoopPlayback();
  btnClear.onclick = () => clearRecording();

  tempo.oninput = () => {
    tempoLabel.innerHTML = `<strong>${tempo.value}</strong> BPM`;
    if (isRecording) startMetronome();
  };
  noteLen.oninput = () => {
    noteLenLabel.innerHTML = `<strong>${noteLen.value}</strong> ms`;
  };

  stopLooperPlayback = () => {
    stopLoopPlayback();
    if (isRecording) stopRecording();
  };

  setStatus("looper.status.ready");
  refreshNotesPanel();
  renderTimeline();
}

function render() {
  const route = parseRoute();
  const nextLang = route.lang || "en";
  const prevLang = currentLang;
  if (nextLang !== currentLang) {
    currentLang = nextLang;
    localStorage.setItem("lang", currentLang);
    applyLang();
  }
  if (route.page === "exercises" && prevLang !== nextLang && stopExercisesPlayback) {
    stopExercisesPlayback();
  }
  if (route.page === "looper" && prevLang !== nextLang && stopLooperPlayback) {
    stopLooperPlayback();
  }
  if (route.page === "list") return renderListPage();
  if (route.page === "exercises") return renderExercisesPage();
  if (route.page === "looper") return renderLooperPage();
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

  // IOS & MOBILE AUDIO UNLOCK
  // Mobile browsers suspend audio contexts until a user interaction occurs.
  function unlockAudioContext() {
    try {
      ensureAudio();
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume();
      }
    } finally {
      ["touchstart", "touchend", "click", "keydown"].forEach((event) => {
        document.body.removeEventListener(event, unlockAudioContext);
      });
    }
  }

  ["touchstart", "touchend", "click", "keydown"].forEach((event) => {
    document.body.addEventListener(event, unlockAudioContext, { once: true });
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
