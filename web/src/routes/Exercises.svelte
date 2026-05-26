<script lang="ts">
  import { onDestroy } from 'svelte';
  import { maqams, maqamKeys } from '../lib/data';
  import { t, maqamName, jinsName } from '../lib/i18n.svelte';
  import { EXERCISES } from '../lib/exercises';
  import {
    getTonicIndexFromScale,
    getUpperGroupData,
    buildScaleList,
    buildDefaultSelectionSet,
    getUpperGroupForIndex,
    getBpmIntervalMs,
    type RenderNote,
  } from '../lib/maqam';
  import { playTone, ensureAudio } from '../lib/audio';
  import NoteGrid from '../components/NoteGrid.svelte';

  interface Step {
    rest?: boolean;
    degree?: number;
    note?: string;
    frequency?: number;
    index?: number;
    group?: 'a' | 'b' | null;
  }

  let maqamKey = $state('');
  let exerciseId = $state('');
  let tempo = $state(60);
  let noteLenMs = $state(800);
  let upperMode = $state<'a' | 'b' | 'mixed'>('a');
  let selected = $state<Set<number>>(new Set());
  let running = $state(false);
  let statusKey = $state('exercises.status.ready');
  let statusVars = $state<Record<string, string | number> | undefined>(undefined);
  let nowNote = $state('');
  let nowHz = $state('');
  let active = $state<{ idx: number; group: 'a' | 'b' | null } | null>(null);
  let steps = $state<Step[]>([]);
  let activeStep = $state(-1);

  let timer: ReturnType<typeof setInterval> | null = null;
  let sequence: Step[] = [];
  let stepIndex = 0;

  const sortedKeys = $derived([...maqamKeys].sort((a, b) => maqamName(a).localeCompare(maqamName(b))));
  const maqam = $derived(maqamKey ? maqams[maqamKey] : null);
  const upperData = $derived(
    maqam ? getUpperGroupData(maqam.scale ?? [], maqam.upper_jins) : { groups: [], lowerIndices: [] }
  );
  const hasTwoUpper = $derived(upperData.groups.length > 1);

  function setStatus(key: string, vars?: Record<string, string | number>) {
    statusKey = key;
    statusVars = vars;
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function stop(statusAfter: string | null = null) {
    stopTimer();
    sequence = [];
    steps = [];
    activeStep = -1;
    active = null;
    running = false;
    nowNote = '';
    nowHz = '';
    if (statusAfter) setStatus(statusAfter);
  }

  function onMaqamChange() {
    stop('exercises.status.ready');
    upperMode = 'a';
    if (!maqam) {
      selected = new Set();
      return;
    }
    const scale = maqam.scale ?? [];
    const ti = getTonicIndexFromScale(scale, maqam.tonic);
    selected = buildDefaultSelectionSet(scale, ti, maqam.upper_jins);
  }

  function toggle(note: RenderNote) {
    const s = new Set(selected);
    if (s.has(note.idx)) s.delete(note.idx);
    else s.add(note.idx);
    selected = s;
  }

  function play(note: RenderNote) {
    const f = Number(note.entry.frequency);
    if (Number.isFinite(f)) playTone(f, noteLenMs, 0);
  }

  function buildSequence(): { seq?: Step[]; error?: string; vars?: Record<string, string | number>; name?: string } {
    if (!maqam) return { error: 'exercises.status.noMaqam' };
    const exercise = EXERCISES.find((ex) => ex.id === exerciseId);
    if (!exercise) return { error: 'exercises.status.noExercise' };

    const scale = maqam.scale ?? [];
    const tonicIndex = getTonicIndexFromScale(scale, maqam.tonic);
    if (tonicIndex < 0) return { error: 'exercises.status.noTonic', vars: { tonic: maqam.tonic ?? '' } };

    const lowerSet = new Set(upperData.lowerIndices);
    const upperASet = new Set(upperData.groups[0]?.indices ?? []);
    const upperBSet = new Set(upperData.groups[1]?.indices ?? []);
    if (selected.size === 0) return { error: 'exercises.status.noNotes' };

    const filteredA = new Set([...new Set([...lowerSet, ...upperASet])].filter((i) => selected.has(i)));
    const filteredB = new Set([...new Set([...lowerSet, ...upperBSet])].filter((i) => selected.has(i)));
    let scaleUp = buildScaleList(scale, tonicIndex, filteredA);
    let scaleDown = buildScaleList(scale, tonicIndex, filteredB);
    let pattern: (number | 'p')[] = exercise.pattern;

    if (exercise.id === 'full_scale' && maqamKey === 'nawah') {
      const full = buildScaleList(scale, 0, buildDefaultSelectionSet(scale, 0));
      scaleUp = full;
      scaleDown = full;
      pattern = [5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5];
    }

    const needed = Math.max(...pattern.filter((d): d is number => typeof d === 'number'));
    if (upperMode === 'mixed') {
      const minCount = Math.min(scaleUp.length, scaleDown.length);
      if (minCount < needed) return { error: 'exercises.status.notEnoughNotes', vars: { count: minCount, needed } };
    } else {
      const main = upperMode === 'b' ? scaleDown : scaleUp;
      if (main.length < needed) return { error: 'exercises.status.notEnoughNotes', vars: { count: main.length, needed } };
    }

    let prevDegree: number | null = null;
    const seq: Step[] = [];
    for (const degree of pattern) {
      if (degree === 'p') {
        seq.push({ rest: true });
        continue;
      }
      let useScale = upperMode === 'b' ? scaleDown : scaleUp;
      let prefer: 'a' | 'b' = upperMode === 'b' ? 'b' : 'a';
      if (upperMode === 'mixed') {
        if (prevDegree !== null && degree < prevDegree) {
          useScale = scaleDown;
          prefer = 'b';
        } else {
          useScale = scaleUp;
          prefer = 'a';
        }
      }
      prevDegree = degree;
      const n = useScale[degree - 1];
      if (!n || !Number.isFinite(n.frequency)) continue;
      seq.push({
        degree,
        note: n.note,
        frequency: n.frequency,
        index: n.index,
        group: getUpperGroupForIndex(n.index, upperASet, upperBSet, prefer),
      });
    }

    if (seq.length === 0) return { error: 'exercises.status.noNotes' };
    return { seq, name: exercise.name };
  }

  function playStep(i: number) {
    const step = sequence[i];
    if (!step) return;
    activeStep = i;
    if (step.rest) {
      active = null;
      nowNote = 'Rest';
      nowHz = '';
      return;
    }
    active = { idx: step.index!, group: step.group ?? null };
    nowNote = step.note ?? '';
    nowHz = `${step.frequency!.toFixed(2)} Hz`;
    playTone(step.frequency!, noteLenMs, 0);
  }

  function start() {
    const built = buildSequence();
    if (built.error) {
      setStatus(built.error, built.vars);
      return;
    }
    sequence = built.seq!;
    steps = sequence;
    ensureAudio();
    const intervalMs = getBpmIntervalMs(tempo);
    stepIndex = 0;
    running = true;
    setStatus('exercises.status.playing', { name: built.name ?? '' });
    playStep(0);
    timer = setInterval(() => {
      stepIndex = (stepIndex + 1) % sequence.length;
      playStep(stepIndex);
    }, intervalMs);
  }

  function onTempoInput() {
    if (running && sequence.length) {
      stopTimer();
      const intervalMs = getBpmIntervalMs(tempo);
      timer = setInterval(() => {
        stepIndex = (stepIndex + 1) % sequence.length;
        playStep(stepIndex);
      }, intervalMs);
    }
  }

  onDestroy(() => stopTimer());
</script>

<header class="head">
  <p class="eyebrow">{t('nav.exercises')}</p>
  <h1>{t('nav.exercises')}</h1>
</header>

<div class="panel controls">
  <label class="field">
    <span class="lbl">{t('exercises.maqam')}</span>
    <select bind:value={maqamKey} onchange={onMaqamChange}>
      <option value="">{t('exercises.maqamPlaceholder')}</option>
      {#each sortedKeys as k}
        <option value={k}>{maqamName(k)}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span class="lbl">{t('exercises.pickExercise')}</span>
    <select bind:value={exerciseId}>
      <option value="">{t('exercises.selectExercise')}</option>
      {#each EXERCISES as ex}
        <option value={ex.id}>{ex.name}</option>
      {/each}
    </select>
  </label>

  <label class="field">
    <span class="lbl">{t('controls.tempo')}</span>
    <span class="slider">
      <input type="range" min="30" max="240" bind:value={tempo} oninput={onTempoInput} />
      <b>{tempo}</b> BPM
    </span>
  </label>

  <label class="field">
    <span class="lbl">{t('controls.noteLength')}</span>
    <span class="slider">
      <input type="range" min="80" max="1200" bind:value={noteLenMs} />
      <b>{noteLenMs}</b> ms
    </span>
  </label>

  {#if hasTwoUpper}
    <label class="field">
      <span class="lbl">{t('upperJins.modeLabel')}</span>
      <select bind:value={upperMode} onchange={() => stop('exercises.status.ready')}>
        <option value="a">{t('upperJins.aOnly', { name: jinsName(upperData.groups[0]?.name ?? '') || t('upperJins.groupA') })}</option>
        <option value="b">{t('upperJins.bOnly', { name: jinsName(upperData.groups[1]?.name ?? '') || t('upperJins.groupB') })}</option>
        <option value="mixed">{t('upperJins.mixed')}</option>
      </select>
    </label>
  {/if}

  <div class="actions">
    <button class="btn btn-primary" onclick={start} disabled={running}>{t('exercises.start')}</button>
    <button class="btn" onclick={() => stop('exercises.status.stopped')} disabled={!running}>{t('exercises.stop')}</button>
  </div>

  <p class="status muted small">{t(statusKey, statusVars)}</p>
</div>

<div class="panel now">
  <div class="nowHead">
    <span class="lbl">{t('exercises.nowPlaying')}</span>
    <span class="nowNote">{nowNote || '—'}{#if nowHz}<span class="hz">{nowHz}</span>{/if}</span>
  </div>
  {#if steps.length}
    <div class="steps">
      {#each steps as step, i (i)}
        <span class="step" class:active={i === activeStep} class:rest={step.rest}>
          {step.rest ? '·' : step.note}
        </span>
      {/each}
    </div>
  {/if}
</div>

{#if maqam}
  <div class="panel notes">
    <h2 class="notesTitle">{t('exercises.notesTitle')}</h2>
    <NoteGrid {maqam} onplay={play} selectable selected={selected} ontoggle={toggle} {active} />
  </div>
{:else}
  <p class="muted empty">{t('exercises.status.noMaqam')}</p>
{/if}

<style>
  .head {
    margin-bottom: 18px;
  }
  .head h1 {
    font-size: clamp(2rem, 5vw, 3rem);
  }
  .controls,
  .now,
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
    gap: 10px;
    align-items: end;
  }
  .status {
    width: 100%;
    margin: 0;
  }
  .now {
    margin-bottom: 14px;
  }
  .nowHead {
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .nowNote {
    font-family: var(--font-display);
    font-size: 1.5rem;
  }
  .hz {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--muted-strong);
    margin-inline-start: 10px;
  }
  .steps {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 14px;
  }
  .step {
    font-size: 0.82rem;
    padding: 0.25em 0.6em;
    border-radius: 8px;
    border: 1px solid var(--line);
    color: var(--ink-dim);
    background: rgba(0, 0, 0, 0.2);
    transition: all 0.12s ease;
  }
  .step.rest {
    opacity: 0.5;
  }
  .step.active {
    border-color: var(--gold-bright);
    color: #1a130a;
    background: linear-gradient(180deg, var(--gold-bright), var(--gold-deep));
    font-weight: 600;
  }
  .notesTitle {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold);
    font-family: var(--font-body);
    margin-bottom: 14px;
  }
  .empty {
    padding: 30px;
    text-align: center;
  }
</style>
