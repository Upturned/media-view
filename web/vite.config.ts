import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const SERVER = `http://127.0.0.1:${process.env.PORT ?? 4321}`;

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 2080,
    strictPort: true,
    host: '127.0.0.1',
    proxy: { '/api': SERVER, '/media': SERVER },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
