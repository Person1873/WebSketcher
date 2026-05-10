/**
 * Sketch Visual Renderer
 * Renders before/after constraint application to PNG for visual scrutiny.
 *
 * Usage: node test/sketch-render.mjs
 * Output: test/renders/*.png
 */
import { createCanvas } from '/home/claude/.npm-global/lib/node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/index.js';
import { writeFileSync, mkdirSync } from 'fs';
import { Sketch, solve } from './sketch-engine.mjs';

mkdirSync('/home/claude/test/renders', { recursive: true });

// ── Colour palette (matches SketchTool) ───────────────────────────────────
const C = {
  bg:      '#0d1117',
  grid:    '#1a2233',
  axis:    '#1e3050',
  geom:    '#40a8ff',
  point:   '#40c0ff',
  sel:     '#ff8040',
  constr:  '#ffd060',
  text:    '#7a9ab8',
  before:  '#ff6644',   // "before" state — orange-red
  after:   '#40ff80',   // "after" state — green
  label:   '#c0d8f0',
};

const W = 800, H = 560, MARGIN = 60;
const FULL_W = W * 2 + 60;

// ── Fixed camera — never varies between test cases ───────────────────────
// All test cases must be designed to fit within ±250 world units (x) and
// ±185 world units (y). Scale 1.5 px/unit, origin at panel centre.
const SCALE = 1.5;
const CAM = {
  scale: SCALE,
  toS(wx, wy) {
    return { x: W/2 + wx * SCALE, y: H/2 - wy * SCALE };
  },
};

/** Draw a grid in the panel using the fixed camera. */
function drawGrid(ctx, cam, panelW, panelH) {
  const step = 50; // world units
  const xRange = Math.ceil((panelW/2) / (step*SCALE)) * step;
  const yRange = Math.ceil((panelH/2) / (step*SCALE)) * step;

  ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
  for (let x = -xRange; x <= xRange; x += step) {
    const s = cam.toS(x, 0);
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, panelH); ctx.stroke();
  }
  for (let y = -yRange; y <= yRange; y += step) {
    const s = cam.toS(0, y);
    ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(panelW, s.y); ctx.stroke();
  }
  // Axes
  ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
  const ox = cam.toS(0, 0);
  ctx.beginPath(); ctx.moveTo(0, ox.y); ctx.lineTo(panelW, ox.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox.x, 0); ctx.lineTo(ox.x, panelH); ctx.stroke();
}

/** Draw a sketch snapshot (Map<id,{x,y}>) as lines/circles/arcs/points. */
function drawSketch(ctx, sk, snap, cam, color, label) {
  ctx.strokeStyle = color; ctx.fillStyle = color;

  const pt = id => {
    const s = snap[id];
    return s ? cam.toS(s.x, s.y) : null;
  };

  const radius = (entity) => {
    const s = snap[entity.id];
    return s?.r ?? entity.radius;
  };

  // Lines
  ctx.lineWidth = 2.5;
  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln)) continue;
    const a = pt(ln.p1.id), b = pt(ln.p2.id);
    if (!a || !b) continue;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
    if (ln.construction) { ctx.setLineDash([4,3]); } else { ctx.setLineDash([]); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Circles
  for (const ci of sk.circles.values()) {
    const c = pt(ci.centre.id); if (!c) continue;
    const r = radius(ci) * cam.scale;
    if (ci.construction) { ctx.setLineDash([4,3]); } else { ctx.setLineDash([]); }
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, 2*Math.PI); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Arcs
  for (const a of sk.arcs.values()) {
    const cP = pt(a.centre.id), sP = pt(a.startPt.id), eP = pt(a.endPt.id);
    if (!cP || !sP || !eP) continue;
    const r = radius(a) * cam.scale;
    // Angles from snap positions
    const cSnap = snap[a.centre.id] || a.centre;
    const sSnap = snap[a.startPt.id] || a.startPt;
    const eSnap = snap[a.endPt.id]   || a.endPt;
    const sa = Math.atan2(sSnap.y-cSnap.y, sSnap.x-cSnap.x);
    const ea = Math.atan2(eSnap.y-cSnap.y, eSnap.x-cSnap.x);
    const span = ((ea-sa)+2*Math.PI) % (2*Math.PI);
    // Use throughPt if set (3P/3T arcs), otherwise fall back to a.inverted
    let inverted = a.inverted;
    if (a.throughPt) {
      const tSnap = snap[a.throughPt.id] || a.throughPt;
      const ta = Math.atan2(tSnap.y-cSnap.y, tSnap.x-cSnap.x);
      const tOnCCW = ((ta-sa)+2*Math.PI)%(2*Math.PI) <= span;
      inverted = tOnCCW !== (span <= Math.PI);
    }
    const drawCCW = inverted ? span > Math.PI : span <= Math.PI;
    const svgLarge = a.inverted ? 1 : 0;
    // Canvas arc: counterClockwise=false means clockwise in screen (Y-down)
    // sweep=0 in SVG = CCW in world = CCW in screen
    ctx.beginPath();
    ctx.arc(cP.x, cP.y, r, -ea, -sa, !drawCCW); // Y-flip: negate angles
    ctx.stroke();
  }

  // Points
  ctx.setLineDash([]);
  for (const p of sk.points.values()) {
    if (p.reserved || p.construction) continue;
    const s = pt(p.id); if (!s) continue;
    ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, 2*Math.PI); ctx.fill();
  }

  // Constraint value labels (distance, radius, angle) — shown only in AFTER panel
  if (label === 'AFTER') {
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    for (const c of sk.constraints) {
      if (c.type === 'distance') {
        const [ln] = c.refs;
        const s1 = snap[ln.p1.id], s2 = snap[ln.p2.id]; if (!s1||!s2) continue;
        const mx=(s1.x+s2.x)/2, my=(s1.y+s2.y)/2;
        const ms = cam.toS(mx, my);
        ctx.fillStyle = '#ffd060';
        ctx.fillText(`${Math.round(c.value)}u`, ms.x+8, ms.y-6);
      } else if (c.type === 'radius') {
        const ci = c.refs[0];
        const cs = snap[ci.centre.id]; if (!cs) continue;
        const r = (snap[ci.id]?.r ?? ci.radius) * cam.scale;
        const ms = cam.toS(cs.x, cs.y);
        ctx.fillStyle = '#ffd060';
        ctx.fillText(`r=${Math.round(c.value)}u`, ms.x + r*0.7 + 6, ms.y - 6);
      } else if (c.type === 'angle') {
        const [l1, l2] = c.refs;
        const os = snap[l1.p1.id]; if (!os) continue;
        const om = cam.toS(os.x, os.y);
        ctx.fillStyle = '#ffd060';
        ctx.fillText(`${Math.round(c.value)}°`, om.x + 12, om.y - 12);
      }
    }
  }

  // Panel label
  ctx.font = 'bold 16px monospace'; ctx.fillStyle = color;
  ctx.textAlign = 'left'; ctx.fillText(label, 10, 20);
}

/**
 * Render a test case: before and after constraints applied, side by side.
 * @param {string} name - output filename (no extension)
 * @param {function} setup - (sk) => void, adds points and constraints using _mkC/_mkLn etc.
 *                           Must NOT call _solveAndNotify — that's done here.
 */
export function renderCase(name, setup, postSolve=null) {
  const sk = new Sketch();

  // Phase 1: add geometry, capture positions BEFORE solve
  setup(sk);
  const beforeSnap = sk._snapPos();

  // Phase 2: solve, then optional post-solve fixup, capture AFTER
  sk._solveAndNotify();
  if (postSolve) postSolve(sk);
  const afterSnap = sk._snapPos();

  // Fixed camera — same for every test case
  const cam = CAM;

  // ── Canvas ──────────────────────────────────────────────────────────────
  const canvas = createCanvas(FULL_W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, FULL_W, H);

  // Divider
  ctx.fillStyle = '#1e2a3a';
  ctx.fillRect(W, 0, 60, H);
  ctx.font = '11px monospace'; ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.save(); ctx.translate(W+30, H/2); ctx.rotate(-Math.PI/2);
  ctx.fillText('→', 0, 0);
  ctx.restore();

  // Left panel: BEFORE
  ctx.save(); ctx.rect(0, 0, W, H); ctx.clip();
  drawGrid(ctx, cam, W, H);
  drawSketch(ctx, sk, beforeSnap, cam, C.before, 'BEFORE');
  ctx.restore();

  // Right panel: AFTER
  ctx.save(); ctx.translate(W+60, 0); ctx.rect(0, 0, W, H); ctx.clip();
  drawGrid(ctx, cam, W, H);
  drawSketch(ctx, sk, afterSnap, cam, C.after, 'AFTER');
  ctx.restore();

  // Title bar
  ctx.fillStyle = '#0a0f18';
  ctx.fillRect(0, H-36, FULL_W, 36);
  ctx.font = '14px monospace'; ctx.fillStyle = C.label; ctx.textAlign = 'center';
  ctx.fillText(name, FULL_W/2, H-12);

  // DOF badge
  const dof = sk.solveResult?.dof ?? '?';
  const conflict = !!sk.conflictState;
  ctx.fillStyle = conflict ? '#ff4444' : dof === 0 ? '#40c060' : '#ffaa20';
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'right';
  ctx.fillText(conflict ? 'CONFLICT' : `DOF ${dof}`, FULL_W-12, H-12);

  const buf = canvas.toBuffer('image/png');
  const path = `/home/claude/test/renders/${name.replace(/[^a-z0-9_-]/gi,'_')}.png`;
  writeFileSync(path, buf);
  return path;
}

// ── Contact sheet ─────────────────────────────────────────────────────────
// Composites the AFTER panel from every render into a single grid image.
// cols: number of columns; each cell shows the right-hand (solved) panel.
export async function renderSheet(paths, { cols = 4, outPath = '/home/claude/test/renders/_sheet.png' } = {}) {
  const { loadImage } = await import('/home/claude/.npm-global/lib/node_modules/pdfjs-dist/node_modules/@napi-rs/canvas/index.js');

  const AFTER_X = W + 60;   // x offset of the AFTER panel inside each full render
  const CW = W, CH = H;     // cell dimensions = one panel

  const rows = Math.ceil(paths.length / cols);
  const LABEL_H = 28;
  const sheet = createCanvas(cols * CW, rows * (CH + LABEL_H));
  const ctx = sheet.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let i = 0; i < paths.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = col * CW;
    const dy = row * (CH + LABEL_H);

    const img = await loadImage(paths[i]);
    // Draw only the AFTER panel
    ctx.drawImage(img, AFTER_X, 0, CW, CH, dx, dy, CW, CH);

    // Label
    const name = paths[i].replace(/.*\//, '').replace('.png', '');
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(dx, dy + CH, CW, LABEL_H);
    ctx.font = '11px monospace';
    ctx.fillStyle = C.label;
    ctx.textAlign = 'center';
    ctx.fillText(name, dx + CW / 2, dy + CH + 18);
  }

  writeFileSync(outPath, sheet.toBuffer('image/png'));
  return outPath;
}
