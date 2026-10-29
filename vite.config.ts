import nodeAdapter from '@sveltejs/adapter-node';
import netlifyAdapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
// Parallel local servers need separate generated env modules as well as caches.
const runtimeDir = process.env.TALLY_RUNTIME_DIR;
export default defineConfig({
  ...(runtimeDir ? { cacheDir: `${runtimeDir}/vite-cache` } : {}),
  plugins: [tailwindcss(), sveltekit({ adapter: process.env.TALLY_ADAPTER === 'netlify' ? netlifyAdapter() : nodeAdapter(), ...(runtimeDir ? { outDir: runtimeDir } : {}) })]
});
