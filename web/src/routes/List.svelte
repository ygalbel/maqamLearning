<script lang="ts">
  import { maqams, maqamKeys } from '../lib/data';
  import { t, maqamName, jinsName } from '../lib/i18n.svelte';
  import { getUpperJinsNames } from '../lib/maqam';
  import { buildHash } from '../lib/router.svelte';

  let query = $state('');
  let sort = $state<'alpha' | 'tonic' | 'lower'>('alpha');
  let dir = $state<'asc' | 'desc'>('asc');

  function upperNames(key: string): string[] {
    return getUpperJinsNames(maqams[key]?.upper_jins);
  }

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let keys = maqamKeys;
    if (q) {
      keys = keys.filter((k) => {
        const o = maqams[k] ?? ({} as (typeof maqams)[string]);
        const upper = upperNames(k);
        const haystack = [
          k,
          maqamName(k),
          o.tonic ?? '',
          o.lower_jins ?? '',
          upper.join(' / '),
          jinsName(o.lower_jins ?? ''),
          upper.map(jinsName).join(' / '),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    const val = (k: string) => {
      const o = maqams[k] ?? ({} as (typeof maqams)[string]);
      if (sort === 'tonic') return String(o.tonic ?? '');
      if (sort === 'lower') return String(o.lower_jins ?? '');
      return maqamName(k);
    };
    const mult = dir === 'desc' ? -1 : 1;
    return [...keys].sort((a, b) => {
      const primary = val(a).localeCompare(val(b));
      if (primary !== 0) return primary * mult;
      return maqamName(a).localeCompare(maqamName(b)) * mult;
    });
  });
</script>

<section class="intro">
  <p class="eyebrow">{t('maqam.label')}</p>
  <h1 class="display">{t('app.title')}</h1>
  <p class="lede muted">{t('header.tagline')}</p>
</section>

<div class="toolbar panel">
  <label class="field grow">
    <span class="lbl">{t('list.search')}</span>
    <input type="search" placeholder={t('list.searchPlaceholder')} bind:value={query} />
  </label>
  <label class="field">
    <span class="lbl">{t('list.order')}</span>
    <select bind:value={sort}>
      <option value="alpha">{t('list.alphabet')}</option>
      <option value="tonic">{t('list.tonic')}</option>
      <option value="lower">{t('list.lowerJins')}</option>
    </select>
  </label>
  <label class="field">
    <span class="lbl">{t('list.direction')}</span>
    <select bind:value={dir}>
      <option value="asc">{t('list.up')}</option>
      <option value="desc">{t('list.down')}</option>
    </select>
  </label>
</div>

<p class="count muted small">{t('list.showing', { shown: filtered.length, total: maqamKeys.length })}</p>

<div class="grid">
  {#each filtered as key, i (key)}
    {@const o = maqams[key]}
    {@const upper = upperNames(key)}
    <a class="card" href={buildHash(`/maqam/${encodeURIComponent(key)}`)} style="animation-delay:{Math.min(i * 24, 360)}ms">
      <div class="cardTop">
        <h2 class="cardTitle">{maqamName(key)}</h2>
        <span class="pill">{t('list.notesCount', { count: (o?.scale ?? []).length })}</span>
      </div>
      <dl class="meta">
        <div><dt>{t('maqam.tonicLabel')}</dt><dd>{o?.tonic ?? '?'}</dd></div>
        {#if o?.lower_jins}
          <div><dt>{t('maqam.lowerJinsLabel')}</dt><dd>{jinsName(o.lower_jins)}</dd></div>
        {/if}
        {#if upper.length}
          <div><dt>{t('maqam.upperJinsLabel')}</dt><dd>{upper.map(jinsName).join(' / ')}</dd></div>
        {/if}
      </dl>
    </a>
  {/each}
</div>

<style>
  .intro {
    margin: 8px 0 28px;
  }
  .display {
    font-size: clamp(2.4rem, 6vw, 3.6rem);
    line-height: 1.02;
    margin-top: 6px;
  }
  .lede {
    margin-top: 10px;
    max-width: 52ch;
    font-size: 1.05rem;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: end;
    padding: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field.grow {
    flex: 1 1 220px;
  }
  .field.grow input {
    width: 100%;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold);
  }

  .count {
    margin: 14px 2px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }
  .card {
    display: block;
    color: var(--ink);
    padding: 20px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--line);
    background: linear-gradient(165deg, rgba(48, 38, 27, 0.6), rgba(24, 19, 13, 0.72));
    box-shadow: var(--shadow-soft);
    transition: transform 0.18s ease, border-color 0.2s ease, box-shadow 0.22s ease;
    animation: rise 0.5s ease both;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 80% at 100% 0%, rgba(216, 166, 87, 0.12), transparent 60%);
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .card:hover {
    transform: translateY(-4px);
    border-color: var(--gold);
    box-shadow: 0 22px 48px -28px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(216, 166, 87, 0.18);
  }
  .card:hover::before {
    opacity: 1;
  }
  .cardTop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .cardTitle {
    font-size: 1.5rem;
  }
  .pill {
    flex: none;
    font-size: 0.72rem;
    color: var(--gold-bright);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 0.18em 0.7em;
    white-space: nowrap;
  }
  .meta {
    margin: 14px 0 0;
    display: grid;
    gap: 4px;
    font-size: 0.92rem;
  }
  .meta div {
    display: flex;
    gap: 8px;
  }
  .meta dt {
    color: var(--gold);
    margin: 0;
    font-size: 0.82rem;
    align-self: center;
  }
  .meta dd {
    margin: 0;
    color: var(--ink-dim);
  }
</style>
