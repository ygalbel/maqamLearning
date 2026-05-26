<script lang="ts">
  import { onMount } from 'svelte';
  import { router, startRouter, buildHash, buildLangHash, routePath } from './lib/router.svelte';
  import { t, i18n, isRtl, SUPPORTED_LANGS, storedLang, setLang } from './lib/i18n.svelte';
  import { installAudioUnlock } from './lib/audio';
  import List from './routes/List.svelte';
  import Maqam from './routes/Maqam.svelte';
  import Exercises from './routes/Exercises.svelte';
  import Quiz from './routes/Quiz.svelte';
  import Looper from './routes/Looper.svelte';

  const langLabels: Record<string, string> = { en: 'EN', he: 'עב', ar: 'ع' };

  onMount(() => {
    const stored = storedLang();
    if (stored && !location.hash.replace(/^#\/?/, '')) setLang(stored);
    startRouter();
    installAudioUnlock();
  });

  // Keep <html> lang/dir in sync with the active language.
  $effect(() => {
    document.documentElement.lang = i18n.lang;
    document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
  });

  const navItems = $derived([
    { path: '', key: 'maqam.all', pages: ['list', 'maqam'] },
    { path: '/exercises', key: 'nav.exercises', pages: ['exercises'] },
    { path: '/quiz', key: 'nav.quiz', pages: ['quiz'] },
    { path: '/looper', key: 'nav.looper', pages: ['looper'] },
  ]);
</script>

<header class="site">
  <div class="bar shell">
    <a class="brand" href={buildHash()}>
      <span class="mark" aria-hidden="true">ع</span>
      <span class="brandText">
        <span class="title">{t('app.title')}</span>
        <span class="tagline">{t('header.tagline')}</span>
      </span>
    </a>

    <nav class="nav" aria-label="sections">
      {#each navItems as item}
        <a href={buildHash(item.path)} class="navLink" class:active={item.pages.includes(router.route.page)}>
          {t(item.key)}
        </a>
      {/each}
    </nav>

    <div class="langs" role="group" aria-label="language">
      {#each SUPPORTED_LANGS as lang}
        <a
          href={buildLangHash(lang, routePath(router.route))}
          class="lang"
          class:active={i18n.lang === lang}
          lang={lang}
        >
          {langLabels[lang]}
        </a>
      {/each}
    </div>
  </div>
</header>

<main class="shell">
  {#key router.route.page + (router.route.maqam ?? '')}
    <div class="page">
      {#if router.route.page === 'list'}
        <List />
      {:else if router.route.page === 'maqam'}
        <Maqam maqamKey={router.route.maqam ?? ''} />
      {:else if router.route.page === 'exercises'}
        <Exercises />
      {:else if router.route.page === 'quiz'}
        <Quiz />
      {:else if router.route.page === 'looper'}
        <Looper />
      {/if}
    </div>
  {/key}
</main>

<style>
  .site {
    position: sticky;
    top: 0;
    z-index: 20;
    padding-top: var(--safe-top);
    background: linear-gradient(180deg, rgba(21, 17, 13, 0.92), rgba(21, 17, 13, 0.7));
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 18px;
    padding-top: 14px;
    padding-bottom: 14px;
    padding-left: clamp(16px, 4vw, 36px);
    padding-right: clamp(16px, 4vw, 36px);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--ink);
    margin-inline-end: auto;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    font-family: 'Amiri', serif;
    font-size: 1.5rem;
    color: var(--gold-bright);
    background: radial-gradient(circle at 35% 25%, rgba(216, 166, 87, 0.35), rgba(63, 111, 96, 0.18));
    border: 1px solid var(--line-strong);
    box-shadow: inset 0 1px 0 rgba(255, 235, 200, 0.15);
  }
  .brandText {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.18rem;
    letter-spacing: -0.01em;
  }
  .tagline {
    font-size: 0.74rem;
    color: var(--muted-strong);
    max-width: 42ch;
  }

  .nav {
    display: flex;
    gap: 4px;
  }
  .navLink {
    color: var(--ink-dim);
    padding: 0.4em 0.85em;
    border-radius: 999px;
    font-size: 0.92rem;
    transition: background 0.18s ease, color 0.18s ease;
  }
  .navLink:hover {
    color: var(--ink);
    background: rgba(216, 166, 87, 0.1);
  }
  .navLink.active {
    color: var(--gold-bright);
    background: rgba(216, 166, 87, 0.14);
  }

  .langs {
    display: flex;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
  }
  .lang {
    min-width: 2em;
    text-align: center;
    padding: 0.25em 0.5em;
    border-radius: 999px;
    color: var(--muted-strong);
    font-size: 0.85rem;
  }
  .lang.active {
    color: #1a130a;
    background: linear-gradient(180deg, var(--gold-bright), var(--gold-deep));
    font-weight: 600;
  }

  main.shell {
    padding-top: 28px;
  }
  .page {
    animation: rise 0.4s ease both;
  }

  @media (max-width: 720px) {
    .tagline {
      display: none;
    }
    .bar {
      flex-wrap: wrap;
      gap: 10px 12px;
    }
    .nav {
      order: 3;
      width: 100%;
      justify-content: center;
      overflow-x: auto;
    }
    .navLink {
      font-size: 0.85rem;
      white-space: nowrap;
    }
  }
</style>
