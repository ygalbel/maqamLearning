<script lang="ts">
  import { onDestroy } from 'svelte';
  import { maqams, maqamKeys } from '../lib/data';
  import { t, maqamName } from '../lib/i18n.svelte';
  import { getTonicIndexFromScale, buildDefaultSelectionSet, buildScaleList, getBpmIntervalMs, type PlayableNote } from '../lib/maqam';
  import { playTone, ensureAudio } from '../lib/audio';
  import { sleep, shuffle } from '../lib/util';

  const QUIZ_TOTAL = 10;
  const SCALE_LEN = 6;
  const BASIC = new Set(['bayat', 'rast', 'hijaz', 'kurd', 'ajam', 'nahawand']);

  interface Question {
    key: string;
    scaleSeq: PlayableNote[];
    options: string[];
  }

  // Precompute which maqams have a playable scale of at least SCALE_LEN notes.
  const playableCache = new Map<string, PlayableNote[] | null>();
  function playable(key: string): PlayableNote[] | null {
    if (playableCache.has(key)) return playableCache.get(key)!;
    const o = maqams[key] ?? ({} as (typeof maqams)[string]);
    const scale = o.scale ?? [];
    const ti = getTonicIndexFromScale(scale, o.tonic);
    let result: PlayableNote[] | null = null;
    if (ti >= 0) {
      const list = buildScaleList(scale, ti, buildDefaultSelectionSet(scale, ti, o.upper_jins)).filter((n) =>
        Number.isFinite(n.frequency)
      );
      result = list.length >= SCALE_LEN ? list : null;
    }
    playableCache.set(key, result);
    return result;
  }
  const playableKeys = maqamKeys.filter((k) => playable(k));

  let level = $state<'basic' | 'all'>('basic');
  let tempo = $state(60);
  let noteLenMs = $state(800);

  let active = $state(false);
  let index = $state(0);
  let score = $state(0);
  let locked = $state(false);
  let current: Question | null = $state(null);
  let optionStates = $state<Record<string, 'correct' | 'incorrect' | ''>>({});
  let statusKey = $state('quiz.status.ready');
  let statusVars = $state<Record<string, string | number> | undefined>(undefined);
  let isPlaying = $state(false);
  let playToken = 0;

  function setStatus(key: string, vars?: Record<string, string | number>) {
    statusKey = key;
    statusVars = vars;
  }

  const levelKeys = $derived(level === 'basic' ? playableKeys.filter((k) => BASIC.has(k)) : playableKeys);
  const progress = $derived(t('quiz.progress', { current: active ? index + 1 : 0, total: QUIZ_TOTAL }));
  const scoreText = $derived(t('quiz.score', { score, total: QUIZ_TOTAL }));

  function buildQuestion(): Question | null {
    if (levelKeys.length < 4) return null;
    const correct = levelKeys[Math.floor(Math.random() * levelKeys.length)];
    const scale = playable(correct);
    if (!scale) return null;
    const up = scale.slice(0, Math.min(SCALE_LEN, scale.length));
    const down = up.length > 1 ? up.slice(0, -1).reverse() : [];
    const distractors = shuffle(levelKeys.filter((k) => k !== correct)).slice(0, 3);
    return { key: correct, scaleSeq: up.concat(down), options: shuffle([correct, ...distractors]) };
  }

  async function playQuestion(q: Question | null) {
    if (!q) return;
    ensureAudio();
    const intervalMs = getBpmIntervalMs(tempo);
    const token = ++playToken;
    isPlaying = true;
    setStatus('quiz.status.listening');
    for (const note of q.scaleSeq) {
      if (playToken !== token) return;
      playTone(note.frequency, noteLenMs, 0);
      await sleep(intervalMs);
    }
    if (playToken !== token) return;
    isPlaying = false;
    if (!locked) setStatus('quiz.status.choose');
  }

  function loadQuestion() {
    locked = false;
    current = buildQuestion();
    optionStates = {};
    if (!current) {
      setStatus('quiz.status.notEnoughMaqams');
      return;
    }
    playQuestion(current);
  }

  function answer(key: string) {
    if (!active || locked || !current) return;
    const correct = key === current.key;
    locked = true;
    if (correct) score += 1;
    const states: Record<string, 'correct' | 'incorrect' | ''> = {};
    for (const opt of current.options) states[opt] = opt === current.key ? 'correct' : '';
    if (!correct) states[key] = 'incorrect';
    optionStates = states;
    const name = maqamName(current.key);
    if (index >= QUIZ_TOTAL - 1) setStatus('quiz.status.complete', { score, total: QUIZ_TOTAL });
    else setStatus(correct ? 'quiz.status.correct' : 'quiz.status.wrong', { name });
  }

  function start() {
    if (levelKeys.length < 4) {
      setStatus('quiz.status.notEnoughMaqams');
      return;
    }
    active = true;
    index = 0;
    score = 0;
    locked = false;
    playToken++;
    loadQuestion();
  }

  function next() {
    if (!active || index >= QUIZ_TOTAL - 1) return;
    index += 1;
    playToken++;
    loadQuestion();
  }

  function reset() {
    playToken++;
    active = false;
    index = 0;
    score = 0;
    locked = false;
    current = null;
    optionStates = {};
    setStatus('quiz.status.ready');
  }

  function onLevelChange() {
    reset();
  }

  const atEnd = $derived(active && locked && index >= QUIZ_TOTAL - 1);

  onDestroy(() => {
    playToken++;
  });
</script>

<header class="head">
  <p class="eyebrow">{t('nav.quiz')}</p>
  <div class="titleRow">
    <h1>{t('quiz.title')}</h1>
    <div class="meta">
      <span class="pill">{progress}</span>
      <span class="pill">{scoreText}</span>
    </div>
  </div>
  <p class="muted">{t('quiz.subtitle')}</p>
</header>

<div class="panel controls">
  <label class="field">
    <span class="lbl">{t('quiz.level')}</span>
    <select bind:value={level} onchange={onLevelChange}>
      <option value="basic">{t('quiz.level.basic')}</option>
      <option value="all">{t('quiz.level.all')}</option>
    </select>
  </label>
  <label class="field">
    <span class="lbl">{t('controls.tempo')}</span>
    <span class="slider"><input type="range" min="30" max="240" bind:value={tempo} /><b>{tempo}</b> BPM</span>
  </label>
  <label class="field">
    <span class="lbl">{t('controls.noteLength')}</span>
    <span class="slider"><input type="range" min="80" max="1200" bind:value={noteLenMs} /><b>{noteLenMs}</b> ms</span>
  </label>
  <div class="actions">
    <button class="btn btn-primary" onclick={start} disabled={active && !atEnd}>{t('quiz.start')}</button>
    <button class="btn" onclick={() => playQuestion(current)} disabled={!active || !current || isPlaying}>{t('quiz.replay')}</button>
    <button class="btn" onclick={next} disabled={!active || !locked || atEnd}>{t('quiz.next')}</button>
    <button class="btn" onclick={reset} disabled={!active}>{t('quiz.reset')}</button>
  </div>
  <p class="status muted small">{t(statusKey, statusVars)}</p>
</div>

<div class="panel options">
  {#if current}
    <div class="optGrid">
      {#each current.options as key (key)}
        <button
          class="opt"
          class:correct={optionStates[key] === 'correct'}
          class:incorrect={optionStates[key] === 'incorrect'}
          disabled={locked}
          onclick={() => answer(key)}
        >
          {maqamName(key)}
        </button>
      {/each}
    </div>
  {:else}
    <p class="muted empty">{t('quiz.empty')}</p>
  {/if}
</div>

<style>
  .head {
    margin-bottom: 18px;
  }
  .titleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .head h1 {
    font-size: clamp(2rem, 5vw, 3rem);
  }
  .meta {
    display: flex;
    gap: 8px;
  }
  .pill {
    font-size: 0.78rem;
    color: var(--gold-bright);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 0.25em 0.8em;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: end;
    padding: 18px;
    margin: 14px 0;
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
  .options {
    padding: 18px;
  }
  .optGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .opt {
    padding: 1.1em 1em;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: linear-gradient(180deg, rgba(60, 48, 33, 0.5), rgba(26, 20, 14, 0.6));
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 1.25rem;
    transition: transform 0.14s ease, border-color 0.18s ease, box-shadow 0.2s ease;
  }
  .opt:hover:not(:disabled) {
    transform: translateY(-3px);
    border-color: var(--gold);
    box-shadow: var(--shadow);
  }
  .opt:disabled {
    cursor: default;
  }
  .opt.correct {
    border-color: var(--jade);
    background: linear-gradient(180deg, rgba(116, 178, 156, 0.4), rgba(63, 111, 96, 0.3));
    color: #eafff7;
  }
  .opt.incorrect {
    border-color: var(--danger);
    background: linear-gradient(180deg, rgba(217, 133, 101, 0.35), rgba(120, 60, 40, 0.3));
  }
  .empty {
    padding: 30px;
    text-align: center;
  }
</style>
