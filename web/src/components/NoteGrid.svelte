<script lang="ts">
  import type { Maqam } from '../lib/types';
  import { buildNoteSections, type RenderNote } from '../lib/maqam';
  import { t, jinsName } from '../lib/i18n.svelte';
  import NotePad from './NotePad.svelte';

  let {
    maqam,
    onplay,
    selectable = false,
    selected,
    ontoggle,
    active = null,
  }: {
    maqam: Maqam;
    onplay: (n: RenderNote) => void;
    selectable?: boolean;
    selected?: Set<number>;
    ontoggle?: (n: RenderNote) => void;
    active?: { idx: number; group: 'a' | 'b' | null } | null;
  } = $props();

  const sections = $derived(buildNoteSections(maqam));

  function isActive(note: RenderNote): boolean {
    if (!active || active.idx !== note.idx) return false;
    if (!active.group) return true;
    return note.upperGroup === active.group || note.upperGroup === '';
  }

  function title(labelKey: string | null, jins: string | null): string {
    if (!labelKey) return '';
    const base = t(labelKey);
    return jins ? `${base} ${jinsName(jins)}` : base;
  }
</script>

<div class="grid">
  {#each sections as section, si (si)}
    <section class="block">
      {#if section.labelKey}
        <h3 class="jinsTitle">{title(section.labelKey, section.jins)}</h3>
      {/if}
      <div class="pads">
        {#each section.notes as note (note.idx + '-' + si)}
          <NotePad
            {note}
            {onplay}
            {selectable}
            {ontoggle}
            selected={selected ? selected.has(note.idx) : true}
            active={isActive(note)}
          />
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    gap: 22px;
  }
  .jinsTitle {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--gold);
    font-family: var(--font-body);
    font-weight: 600;
    margin-bottom: 10px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--line);
  }
  :global(html[lang='ar']) .jinsTitle,
  :global(html[lang='he']) .jinsTitle {
    letter-spacing: 0.06em;
  }
  .pads {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 11px;
  }
  @media (max-width: 720px) {
    .pads {
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
  }
</style>
