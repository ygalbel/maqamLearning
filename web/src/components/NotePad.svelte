<script lang="ts">
  import type { RenderNote } from '../lib/maqam';
  import { splitNoteLabel } from '../lib/maqam';
  import { t } from '../lib/i18n.svelte';

  let {
    note,
    onplay,
    selectable = false,
    selected = true,
    active = false,
    ontoggle,
  }: {
    note: RenderNote;
    onplay: (n: RenderNote) => void;
    selectable?: boolean;
    selected?: boolean;
    active?: boolean;
    ontoggle?: (n: RenderNote) => void;
  } = $props();

  const parts = $derived(splitNoteLabel(note.entry.note));
  const interval = $derived(note.intervalKey ? t(note.intervalKey) : '');

  let pulsing = $state(false);
  function hit() {
    pulsing = true;
    if (selectable && ontoggle) ontoggle(note);
    onplay(note);
    setTimeout(() => (pulsing = false), 320);
  }
</script>

<button
  class="pad"
  class:tonic={note.isTonic}
  class:groupB={note.upperGroup === 'b'}
  class:pulse={pulsing}
  class:active
  class:dim={selectable && !selected}
  onclick={hit}
  aria-pressed={selectable ? selected : undefined}
  aria-label={parts.base + parts.suffix}
>
  <span class="degree">
    {note.displayIndex}{#if note.isTonic}<span class="key" aria-hidden="true">✦</span>{/if}
  </span>
  <span class="name">
    {parts.base}{#if parts.suffix}<span class="suffix">{parts.suffix}</span>{/if}
  </span>
  {#if interval}<span class="interval">{interval}</span>{/if}
</button>

<style>
  .pad {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2em;
    min-height: 92px;
    padding: 0.7em 0.6em;
    border-radius: 16px;
    border: 1px solid var(--line);
    background:
      linear-gradient(180deg, rgba(60, 48, 33, 0.55), rgba(26, 20, 14, 0.65));
    box-shadow: inset 0 1px 0 rgba(255, 230, 190, 0.06), var(--shadow-soft);
    color: var(--ink);
    overflow: hidden;
    transition: transform 0.14s ease, border-color 0.18s ease, box-shadow 0.2s ease;
  }
  .pad::after {
    /* a thin gilded fret line across the top */
    content: '';
    position: absolute;
    inset: 0 0 auto 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--line-strong), transparent);
    opacity: 0.7;
  }
  .pad:hover {
    transform: translateY(-3px);
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(216, 166, 87, 0.1), var(--shadow);
  }
  .pad:active {
    transform: translateY(-1px) scale(0.985);
  }

  .degree {
    font-family: var(--font-body);
    font-size: 0.78rem;
    color: var(--gold);
    letter-spacing: 0.06em;
    opacity: 0.85;
  }
  .key {
    margin-inline-start: 0.2em;
    color: var(--gold-bright);
  }
  .name {
    font-family: var(--font-display);
    font-size: 1.55rem;
    font-weight: 600;
    line-height: 1;
  }
  .suffix {
    font-size: 0.62em;
    color: var(--jade);
    margin-inline-start: 0.08em;
    vertical-align: super;
  }
  .interval {
    font-size: 0.72rem;
    color: var(--muted-strong);
    letter-spacing: 0.02em;
  }

  /* Tonic pad: gilded, raised */
  .tonic {
    border-color: var(--gold);
    background: linear-gradient(180deg, rgba(216, 166, 87, 0.28), rgba(80, 56, 26, 0.4));
    box-shadow: 0 0 0 1px rgba(216, 166, 87, 0.25), var(--shadow);
  }
  .tonic .degree {
    color: var(--gold-bright);
  }

  /* Second upper-jins group gets a jade tint to distinguish it */
  .groupB {
    border-color: rgba(116, 178, 156, 0.32);
  }
  .groupB .suffix {
    color: var(--gold);
  }

  /* Play feedback: a gold ripple */
  .pulse {
    animation: padPulse 0.32s ease;
  }
  @keyframes padPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(241, 201, 127, 0.5);
    }
    100% {
      box-shadow: 0 0 0 14px rgba(241, 201, 127, 0);
    }
  }

  /* Selectable mode: unselected pads recede */
  .dim {
    opacity: 0.34;
    filter: saturate(0.5);
  }
  .dim:hover {
    opacity: 0.7;
  }

  /* Currently-sounding note during sequenced playback */
  .active {
    border-color: var(--gold-bright);
    box-shadow: 0 0 0 2px rgba(241, 201, 127, 0.55), 0 0 22px -4px rgba(241, 201, 127, 0.6);
    transform: translateY(-2px);
  }
</style>
