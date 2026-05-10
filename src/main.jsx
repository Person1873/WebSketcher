import React from 'react';
import { createRoot } from 'react-dom/client';
import SketcherApp from './SketcherApp.jsx';

const base = import.meta.env.BASE_URL;

async function boot() {
  try {
    const { init_planegcs_module, GcsWrapper } =
      await import(/* @vite-ignore */ base + 'planegcs/index.js');
    const mod = await init_planegcs_module({
      locateFile: () => base + 'planegcs/planegcs_dist/planegcs.wasm',
    });
    window.__planegcs = { mod, GcsWrapper };
    console.log('[planegcs] solver ready');
  } catch (e) {
    window.__planegcs = null;
    window.__planegcsError = e.message;
    console.warn('[planegcs] unavailable, using Gauss-Seidel fallback:', e.message);
  }

  createRoot(document.getElementById('root')).render(<SketcherApp />);
}

boot();
