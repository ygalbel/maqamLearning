<script lang="ts">
  import { maqams } from '../lib/data';
  import { t, maqamName, jinsName } from '../lib/i18n.svelte';
  import { buildHash } from '../lib/router.svelte';
  import { buildNoteSections, getUpperJinsNames, type RenderNote } from '../lib/maqam';
  import { playTone } from '../lib/audio';
  import NotePad from '../components/NotePad.svelte';

  let { maqamKey }: { maqamKey: string } = $props();

  const key = $derived(decodeURIComponent(maqamKey).toLowerCase());
  const maqam = $derived(maqams[key]);
  const sections = $derived(maqam ? buildNoteSections(maqam) : []);
  const upper = $derived(maqam ? getUpperJinsNames(maqam.upper_jins) : []);

  // The only control on the explore page: transpose the whole maqam up/down.
  let semitones = $state(0);
  const NOTE_MS = 760;

  const offsetLabel = $derived(`${semitones > 0 ? '+' : ''}${semitones}`);

  function play(note: RenderNote) {
    const f = Number(note.entry.frequency);
    if (Number.isFinite(f)) playTone(f, NOTE_MS, semitones);
  }

  function sectionTitle(labelKey: string | null, jins: string | null): string {
    if (!labelKey) return '';
    const base = t(labelKey);
    return jins ? `${base} ${jinsName(jins)}` : base;
  }
</script>

{#if !maqam}
  <div class="notFound panel">
    <h2>{t('maqam.unknown')} <span class="muted">{key}</span></h2>
    <a class="btn" href={buildHash()}>{t('maqam.back')}</a>
  </div>
{:else}
  <header class="head">
    <a class="back" href={buildHash()}>← {t('maqam.all')}</a>
    <p class="eyebrow">{t('maqam.label')}</p>
    <h1 class="name">{maqamName(key)}</h1>

    <div class="facts">
      {#if maqam.tonic}
        <span class="fact"><b>{t('maqam.tonicLabel')}</b> {maqam.tonic}</span>
      {/if}
      {#if maqam.lower_jins}
        <span class="fact"><b>{t('maqam.lowerJinsLabel')}</b> {jinsName(maqam.lower_jins)}</span>
      {/if}
      {#if upper.length}
        <span class="fact"><b>{t('maqam.upperJinsLabel')}</b> {upper.map(jinsName).join(' / ')}</span>
      {/if}
    </div>
  </header>

  <div class="transpose panel">
    <span class="lbl">{t('controls.pitchOffset')}</span>
    <input type="range" min="-2" max="2" step="0.5" bind:value={semitones} aria-label={t('controls.pitchOffset')} />
    <span class="val">{offsetLabel} <span class="unit">{t('controls.semitones')}</span></span>
  </div>

  <p class="hint muted small">{t('header.tagline')}</p>

  <div class="sections">
    {#each sections as section, si (si)}
      <section class="jinsBlock">
        {#if section.labelKey}
          <h2 class="jinsTitle">{sectionTitle(section.labelKey, section.jins)}</h2>
        {/if}
        <div class="pads">
          {#each section.notes as note (note.idx + '-' + si)}
            <NotePad {note} onplay={play} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .head {
    margin-bottom: 18px;
  }
  .back {
    font-size: 0.9rem;
    color: var(--muted-strong);
  }
  .back:hover {
    color: var(--gold-bright);
  }
  .eyebrow {
    margin-top: 14px;
  }
  .name {
    font-size: clamp(2.2rem, 6vw, 3.4rem);
    margin-top: 4px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 12px;
    color: var(--ink-dim);
  }
  .fact b {
    color: var(--gold);
    font-weight: 600;
    margin-inline-end: 4px;
  }

  .transpose {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    margin-bottom: 16px;
  }
  .transpose .lbl {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold);
    white-space: nowrap;
  }
  .transpose input[type='range'] {
    flex: 1;
    accent-color: var(--gold);
  }
  .transpose .val {
    font-family: var(--font-display);
    font-size: 1.2rem;
    min-width: 4ch;
    text-align: end;
  }
  .transpose .unit {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--muted-strong);
  }

  .hint {
    margin: 0 2px 18px;
  }

  .sections {
    display: grid;
    gap: 26px;
  }
  .jinsTitle {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--gold);
    font-family: var(--font-body);
    font-weight: 600;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
  }
  :global(html[lang='ar']) .jinsTitle,
  :global(html[lang='he']) .jinsTitle {
    letter-spacing: 0.06em;
  }
  .pads {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 12px;
  }

  @media (max-width: 720px) {
    .pads {
      grid-template-columns: repeat(4, 1fr);
      gap: 9px;
    }
  }
</style>
