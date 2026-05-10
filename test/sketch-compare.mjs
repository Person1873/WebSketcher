/**
 * Visual regression comparison
 * Run: node test/sketch-compare.mjs
 *
 * 1. Re-runs sketch-visual.mjs to regenerate all renders
 * 2. Crops the "after" panel from each render
 * 3. Pixel-diffs against baseline
 * 4. Reports PASS / FAIL per test, writes diff images for failures
 */

import { createCanvas, loadImage } from '/home/claude/node_modules/@napi-rs/canvas/index.js';
import { writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const AFTER_X = 860, PW = 800, PH = 560;
const PASS_THRESHOLD_PCT   = 0.05;
const PASS_THRESHOLD_DELTA = 4;

const baselineDir = '/home/claude/test/baseline';
const renderDir   = '/home/claude/test/renders';
const diffDir     = '/home/claude/test/diffs';
mkdirSync(diffDir, { recursive: true });

// Step 1: regenerate renders
console.log('Rendering…');
execSync('node /home/claude/test/sketch-visual.mjs', { stdio: 'inherit' });

async function afterPanel(fullPath) {
  const full = await loadImage(fullPath);
  const c = createCanvas(PW, PH);
  c.getContext('2d').drawImage(full, AFTER_X, 0, PW, PH, 0, 0, PW, PH);
  return c;
}

function diffImages(aCanvas, bImg) {
  const w = aCanvas.width, h = aCanvas.height;
  const dataA = aCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const tmp = createCanvas(w, h);
  tmp.getContext('2d').drawImage(bImg, 0, 0);
  const dataB = tmp.getContext('2d').getImageData(0, 0, w, h).data;

  const diffCanvas = createCanvas(w, h);
  const dCtx = diffCanvas.getContext('2d');
  const diffData = dCtx.createImageData(w, h);
  const d = diffData.data;

  let changed = 0, maxDelta = 0;
  for (let i = 0; i < dataA.length; i += 4) {
    const delta = Math.max(
      Math.abs(dataA[i]   - dataB[i]),
      Math.abs(dataA[i+1] - dataB[i+1]),
      Math.abs(dataA[i+2] - dataB[i+2])
    );
    if (delta > maxDelta) maxDelta = delta;
    if (delta > PASS_THRESHOLD_DELTA) {
      changed++;
      d[i]=255; d[i+1]=60; d[i+2]=60; d[i+3]=255;
    } else {
      d[i]   = dataA[i]   >> 1;
      d[i+1] = dataA[i+1] >> 1;
      d[i+2] = dataA[i+2] >> 1;
      d[i+3] = 255;
    }
  }
  dCtx.putImageData(diffData, 0, 0);
  return { pct: (changed / (dataA.length / 4)) * 100, maxDelta, diffCanvas };
}

// Step 2: compare
const baselines = readdirSync(baselineDir)
  .filter(f => f.endsWith('.png') && !f.startsWith('_')).sort();

let passed = 0, failed = 0, failures = [];
console.log('\n── Visual Regression ──────────────────────────────────────────\n');

for (const file of baselines) {
  const name = file.replace('.png', '');
  const renderPath = `${renderDir}/${file}`;
  if (!existsSync(renderPath)) { console.log(`  SKIP  ${name}`); continue; }

  const [current, baseline] = await Promise.all([
    afterPanel(renderPath),
    loadImage(`${baselineDir}/${file}`),
  ]);
  const { pct, maxDelta, diffCanvas } = diffImages(current, baseline);
  const pass = pct <= PASS_THRESHOLD_PCT;

  if (pass) {
    passed++;
    console.log(`  ✓  ${name}  (${pct.toFixed(2)}% Δ${maxDelta})`);
  } else {
    failed++;
    failures.push(name);
    writeFileSync(`${diffDir}/${file}`, diffCanvas.toBuffer('image/png'));
    console.log(`  ✗  ${name}  (${pct.toFixed(2)}% Δ${maxDelta})  → diffs/${file}`);
  }
}

console.log(`\n── ${passed} passed · ${failed} failed`);
if (failed) { console.log(`   Failed: ${failures.join(', ')}`); process.exit(1); }
