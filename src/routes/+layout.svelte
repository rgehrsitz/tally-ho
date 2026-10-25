<script lang="ts">
  import '../app.css';
  import type { LayoutProps } from './$types';
  let { children }: LayoutProps = $props();
</script>
<svelte:head><link rel="icon" href="/favicon.svg" /><meta name="theme-color" content="#f7f3eb" /></svelte:head>
{@render children()}
