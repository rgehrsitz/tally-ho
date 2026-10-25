<script lang="ts">
  import '@fontsource/creepster/400.css';
  import '@fontsource/barlow-condensed/600.css';
  import '@fontsource/barlow-condensed/700.css';
  import '@fontsource/nunito-sans/400.css';
  import '@fontsource/nunito-sans/600.css';
  import '@fontsource/nunito-sans/700.css';
  import '../app.css';
  import type { LayoutProps } from './$types';
  let { children }: LayoutProps = $props();
</script>
<svelte:head><link rel="icon" href="/favicon.svg" /><meta name="theme-color" content="#fff1d6" /></svelte:head>
{@render children()}
