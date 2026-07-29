import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEX_SRC = resolve(HERE, '../shared/agentdex.json');
const DEX_DEST = resolve(HERE, 'public/agentdex.json');

/** The dex is authored in `shared/` so the server can validate against it too. */
function syncDex(): Plugin {
  const copy = (): void => {
    mkdirSync(dirname(DEX_DEST), { recursive: true });
    copyFileSync(DEX_SRC, DEX_DEST);
  };
  return {
    name: 'agentmon-sync-dex',
    buildStart: copy,
    configureServer(server) {
      copy();
      server.watcher.add(DEX_SRC);
      server.watcher.on('change', (file) => { if (file === DEX_SRC) copy(); });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [syncDex()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.AGENTMON_API ?? 'http://localhost:8791',
        changeOrigin: true,
      },
    },
  },
});
