import React from 'react';
import { createRoot } from 'react-dom/client';
import SketcherApp from './SketcherApp.jsx';

const base = import.meta.env.BASE_URL;

async function boot() {
  try {
    // Vite dev server blocks import() from /public; a native <script type="module">
    // bypasses that check while letting the browser resolve relative sub-imports.
    const pgMod = await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.textContent = [
        `import * as pg from '${base}planegcs/index.js';`,
        `window.__pgResolve(pg);`,
      ].join('\n');
      window.__pgResolve = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    const { init_planegcs_module, GcsWrapper } = pgMod;
    const mod = await init_planegcs_module({
      locateFile: () => base + 'planegcs/planegcs_dist/planegcs.wasm',
    });
    window.__planegcs = { mod, GcsWrapper, Algorithm: pgMod.Algorithm };
    console.log('[planegcs] solver ready');
  } catch (e) {
    window.__planegcs = null;
    window.__planegcsError = e.message;
    console.warn('[planegcs] unavailable, using Gauss-Seidel fallback:', e.message);
  }

  createRoot(document.getElementById('root')).render(<SketcherApp />);
}

boot();
