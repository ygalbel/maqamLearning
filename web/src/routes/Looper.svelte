<script lang="ts">
  import { onDestroy } from 'svelte';
  import { maqams, maqamKeys } from '../lib/data';
  import { t, maqamName } from '../lib/i18n.svelte';
  import { getBpmIntervalMs, type RenderNote } from '../lib/maqam';
  import { playTone, playClick, ensureAudio, stopActiveOscillators } from '../lib/audio';
  import NoteGrid from '../components/NoteGrid.svelte';

  interface LoopEvent {
    t: number;
    note: string;
    frequency: number;
    idx: number;
    group: 'a' | 'b' | null;
  }

  let maqamKey = $state('');
  let tempo = $state(60);
  let noteLenMs = $state(800);
  let isRecording = $state(false);
  let isLooping = $state(false);
  let events = $state<LoopEvent[]>([]);
  let active = $state<{ idx: number; group: 'a' | 'b' | null } | null>(null);
  let activeEvent = $state(-1);
  let playheadPct = $state(0);
  let statusKey = $state('looper.status.ready');
  let statusVars = $state<Record<string, string | number> | undefined>(undefined);

  let recordStart = 0;
  let loopStart = 0;
  let loopDuration = 0;
  let loopTimers: ReturnType<typeof setTimeout>[] = [];
  let loopTimeout: ReturnType<typeof setTimeout> | null = null;
  let metronomeTimer: ReturnType<typeof setInterval> | null = null;
  let playheadRaf: number | null = null;

  const sortedKeys = $derived([...maqamKeys].sort((a, b) => maqamName(a).localeCompare(maqamName(b))));
  const maqam = $derived(maqamKey ? maqams[maqamKey] : null);

  function setStatus(key: string, vars?: Record<string, string | number>) {
    statusKey = key;
    statusVars = vars;
  }

  function effectiveDuration(): number {
    return Math.max(400, loopDuration || events[events.length - 1]?.t || 0);
  }

  function play(note: RenderNote) {
    const f = Number(note.entry.frequency);
    if (!Number.isFinite(f)) return;
    playTone(f, noteLenMs, 0);
    if (isRecording) {
      events = [
        ...events,
        {
          t: Math.max(0, performance.now() - recordStart),
          note: note.entry.note,
          frequency: f,
          idx: note.idx,
          group: note.upperGroup || null,
        },
      ];
    }
  }

  // ---- metronome ----
  function stopMetronome() {
    if (metronomeTimer) {
      clearInterval(metronomeTimer);
      metronomeTimer = null;
    }
  }
  function startMetronome() {
    stopMetronome();
    playClick();
    metronomeTimer = setInterval(playClick, getBpmIntervalMs(tempo));
  }

  // ---- playhead ----
  function tickPlayhead() {
    if (!isLooping) return;
    const dur = effectiveDuration();
    playheadPct = (((performance.now() - loopStart) % dur) / dur) * 100;
    playheadRaf = requestAnimationFrame(tickPlayhead);
  }
  function startPlayhead() {
    loopStart = performance.now();
    if (playheadRaf) cancelAnimationFrame(playheadRaf);
    playheadRaf = requestAnimationFrame(tickPlayhead);
  }
  function stopPlayhead() {
    if (playheadRaf) cancelAnimationFrame(playheadRaf);
    playheadRaf = null;
    activeEvent = -1;
  }

  // ---- loop playback ----
  function clearLoopTimers() {
    loopTimers.forEach((tm) => clearTimeout(tm));
    loopTimers = [];
    if (loopTimeout) {
      clearTimeout(loopTimeout);
      loopTimeout = null;
    }
  }
  function playLoopOnce(): number {
    if (events.length === 0) return 0;
    const dur = effectiveDuration();
    events.forEach((ev, i) => {
      loopTimers.push(
        setTimeout(() => {
          playTone(ev.frequency, noteLenMs, 0);
          active = { idx: ev.idx, group: ev.group };
          activeEvent = i;
        }, ev.t)
      );
    });
    return dur;
  }
  function startLoop() {
    if (events.length === 0) {
      setStatus('looper.status.empty');
      return;
    }
    ensureAudio();
    loopDuration = Math.max(400, events[events.length - 1]?.t || 0);
    stopActiveOscillators();
    clearLoopTimers();
    isLooping = true;
    setStatus('looper.status.playing');
    startPlayhead();
    const dur = playLoopOnce();
    loopTimeout = setTimeout(() => {
      if (isLooping) startLoop();
    }, dur + 60);
  }
  function stopLoop() {
    clearLoopTimers();
    isLooping = false;
    stopMetronome();
    stopPlayhead();
    active = null;
  }

  // ---- recording ----
  function startRecording() {
    ensureAudio();
    events = [];
    loopDuration = 0;
    isRecording = true;
    recordStart = performance.now();
    startMetronome();
    setStatus('looper.status.recording');
  }
  function stopRecording() {
    isRecording = false;
    stopMetronome();
    loopDuration = Math.max(400, events[events.length - 1]?.t || 0);
    setStatus('looper.status.recorded', { count: events.length });
  }
  function clearRecording() {
    events = [];
    loopDuration = 0;
    stopLoop();
    setStatus('looper.status.cleared');
  }

  function onMaqamChange() {
    stopLoop();
    clearRecording();
    setStatus('looper.status.ready');
  }

  function onTempoInput() {
    if (isRecording) startMetronome();
  }

  onDestroy(() => {
    clearLoopTimers();
    stopMetronome();
    if (playheadRaf) cancelAnimationFrame(playheadRaf);
  });
</script>

<header class="head">
  <p class="eyebrow">{t('nav.looper')}</p>
  <h1>{t('looper.notesTitle')}</h1>
</header>

<div class="panel controls">
  <label class="field">
    <span class="lbl">{t('looper.maqam')}</span>
    <select bind:value={maqamKey} onchange={onMaqamChange}>
      <option value="">{t('looper.selectMaqam')}</option>
      {#each sortedKeys as k}
        <option value={k}>{maqamName(k)}</option>
      {/each}
    </select>
  </label>
  <label class="field">
    <span class="lbl">{t('looper.metronome')}</span>
    <span class="slider"><input type="range" min="30" max="240" bind:value={tempo} oninput={onTempoInput} /><b>{tempo}</b> BPM</span>
  </label>
  <label class="field">
    <span class="lbl">{t('controls.noteLength')}</span>
    <span class="slider"><input type="range" min="80" max="1200" bind:value={noteLenMs} /><b>{noteLenMs}</b> ms</span>
  </label>

  <div class="actions">
    <button class="btn btn-primary" onclick={startRecording} disabled={isRecording}>{t('looper.startRecording')}</button>
    <button class="btn" onclick={stopRecording} disabled={!isRecording}>{t('looper.stopRecording')}</button>
    <button class="btn" onclick={startLoop} disabled={isLooping || events.length === 0}>{t('looper.playLoop')}</button>
    <button class="btn" onclick={stopLoop} disabled={!isLooping}>{t('looper.stopLoop')}</button>
    <button class="btn" onclick={clearRecording}>{t('looper.clear')}</button>
  </div>
  <p class="status muted small">{t(statusKey, statusVars)}</p>

  <div class="timeline" class:recording={isRecording}>
    {#if isLooping}
      <div class="playhead" style="left:{playheadPct}%"></div>
    {/if}
    {#each events as ev, i (i)}
      <div class="event" class:active={i === activeEvent} style="left:{Math.max(0, Math.min(100, (ev.t / effectiveDuration()) * 100))}%">
        {ev.note}
      </div>
    {/each}
  </div>
</div>

{#if maqam}
  <div class="panel notes">
    <div class="notesHead">
      <h2 class="notesTitle">{t('looper.notesTitle')}</h2>
      <span class="muted small">{events.length}</span>
    </div>
    <NoteGrid {maqam} onplay={play} {active} />
  </div>
{:else}
  <p class="muted empty">{t('looper.status.noMaqam')}</p>
{/if}

<style>
  .head {
    margin-bottom: 18px;
  }
  .head h1 {
    font-size: clamp(2rem, 5vw, 3rem);
  }
  .controls,
  .notes {
    padding: 18px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: end;
    margin-bottom: 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lbl {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold);
  }
  .slider {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .slider input {
    accent-color: var(--gold);
  }
  .slider b {
    font-family: var(--font-display);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .status {
    width: 100%;
    margin: 0;
  }
  .timeline {
    position: relative;
    width: 100%;
    height: 54px;
    margin-top: 6px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.25) 0 1px, transparent 1px 56px), rgba(0, 0, 0, 0.2);
    overflow: hidden;
  }
  .timeline.recording {
    border-color: var(--danger);
    box-shadow: inset 0 0 0 1px rgba(217, 133, 101, 0.3);
  }
  .event {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.72rem;
    padding: 0.15em 0.45em;
    border-radius: 6px;
    background: linear-gradient(180deg, rgba(216, 166, 87, 0.3), rgba(80, 56, 26, 0.4));
    border: 1px solid var(--line-strong);
    white-space: nowrap;
    transition: box-shadow 0.1s ease;
  }
  .event.active {
    background: linear-gradient(180deg, var(--gold-bright), var(--gold-deep));
    color: #1a130a;
    box-shadow: 0 0 12px rgba(241, 201, 127, 0.7);
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--gold-bright);
    box-shadow: 0 0 10px rgba(241, 201, 127, 0.8);
    z-index: 2;
  }
  .notesHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .notesTitle {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold);
    font-family: var(--font-body);
  }
  .empty {
    padding: 30px;
    text-align: center;
  }
</style>
