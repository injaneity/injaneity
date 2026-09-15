import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { aliases } from './scripts/site-metadata.mjs';
import { createAuthHandler } from './server/auth.mjs';

export default defineConfig({
  // Missing documents must return 404 instead of the homepage with status 200.
  appType: 'mpa',
  resolve: {
    // This package's browser export needs document; a worker has no DOM.
    alias: { 'decode-named-character-reference': fileURLToPath(import.meta.resolve('decode-named-character-reference')) },
  },
  build: {
    rollupOptions: { input: { reader: 'index.html', editor: 'editor/index.html' } },
  },
  worker: { format: 'es' },
  plugins: [{
    name: 'canonical-static-paths',
    configurePreviewServer(server) {
      const auth = createAuthHandler({ env: { ...loadEnv(server.config.mode, server.config.envDir, ''), ...process.env } });
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0].startsWith('/api/auth/')) return auth(req, res);
        if (!['GET', 'HEAD'].includes(req.method)) return next();
        const url = new URL(req.url, 'http://localhost');
        if (!/^\/[a-z0-9_-]+\/?$/i.test(url.pathname)) return next();
        const slug = url.pathname.replace(/^\/|\/$/g, '');
        let target = aliases[`/${slug}`];
        if (!target && !url.pathname.endsWith('/')) {
          try {
            const file = await stat(path.resolve(server.config.root, server.config.build.outDir, slug, 'index.html'));
            if (file.isFile()) target = `/${slug}/`;
          } catch { /* Let the static server return 404. */ }
        }
        if (!target) return next();
        res.writeHead(308, { Location: `${target}${url.search}` });
        res.end();
      });
    },
  }],
});
