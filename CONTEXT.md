# SketchTool Session Context
_Last updated: 2026-05-10_

## Project Overview
Parametric 2D CAD sketcher — single-file React app (`SketchTool.jsx`) targeting Android/web.
FreeCAD-compatible (FCStd/SVG export), touch-first, constraint solver via planegcs WASM.
Goal: FreeCAD-level constraint solving without a full native port.

## Working Files
- `SketchTool.jsx` — main app (~4500+ lines)
- `index.html` — no-build entry, loads vendored React/Babel/planegcs, Babel-transforms JSX at runtime
- `serve.sh` / `devserver.mjs` — Node.js dev server (port 3000), handles static files + `POST /log`
- `vendor/planegcs/` — planegcs WASM (~497KB), vendored as `@salusoft89/planegcs`
- `vendor/` — React, ReactDOM, Babel (all vendored, no CDN, no build step)
- `test/sketch-engine.mjs` — headless constraint engine for tests, now includes planegcs
- `test/sketch-visual.mjs` — 33 visual test cases, renders PNG sheet
- `test/sketch-render.mjs` — Canvas rendering for test harness
- `ROADMAP.md` — planned features

## Git
- Branch: `planegcs-solver` (main preserves pre-planegcs state)
- No remote push possible from Claude's environment (network allowlist blocks all git hosts)
- Workflow: Claude outputs files → user drops into local repo → user pushes to GitHub
- Remote: https://github.com/Person1873/WebSketcher

## Architecture

### Solver
`solve(sk)` tries `solvePlanegcs(sk)` first; falls back to Gauss-Seidel (120 iter) if null returned.

planegcs is loaded in `index.html` as an ES module before SketchTool.jsx runs:
```javascript
window.__planegcs = { mod, GcsWrapper };   // or null on failure
window.__planegcsError = e.message;         // set on failure
```

planegcs fails to load in the Claude viewer (iframe sandbox blocks WASM/ES modules).
Must test locally via `node devserver.mjs` (or `./serve.sh`).

### Constrained Drag — Current Implementation
```
onPointerMove:
  pt.x = tx; pt.y = ty;          ← pre-move to mouse position
  sk._dragFixed  = pt;
  sk._dragTarget = {x:tx, y:ty};
  sk.markDirty() → solve(sk)

solvePlanegcs (if available):
  - Push all points/constraints to planegcs
  - If _dragFixed: push temporary p2p_coincident (temporary:true) between pt and anchor at _dragTarget
  - gcs.solve() → pt moves to nearest constraint-manifold point
  - Read back positions

GS fallback (if planegcs unavailable):
  - pt is pre-moved to mouse position
  - _dragFixed pins pt there during GS iterations
  - Other points adjust to maintain constraints
  - Less accurate for multi-DOF constrained systems but produces movement
```

Key: `temporary:true` on the coincident constraint tells planegcs to use drag-optimised algorithm.
Pre-move is required for GS fallback to produce any movement at all.

### Document Model
`SketchDocument` → `SketchPage` → `SketchGroup` → `Sketch`
`SketchVarset` / `SketchVariable` — parametric variables
All persisted to localStorage.

### DOF Analysis
Jiggle-test approach (not constraint graph propagation — that caused overcounting/infinite loops).
Per-entity DOF determined by perturbing each entity and measuring solver response.

### Color Scheme
- `#e8eaf0` — unconstrained (white-ish)
- `#4488ff` — partially constrained (blue), cost===DOF exactly
- `#3ddc84` — fully constrained (green), sketch DOF=0
- `#ffd740` — selected (amber)
- red/orange — reserved for conflict highlighting (not yet implemented)

### Scale Convention
1 world unit = 0.01mm. Display values shown in mm. Grid spacing: 50 world units.

## toGcsConstraint Mappings (must stay in sync between SketchTool.jsx and test/sketch-engine.mjs)
```javascript
'circle_radius' → { type:'circle_radius', c_id: circle.id, radius: value }
'arc_radius'    → { type:'arc_radius',    a_id: arc.id,    radius: value }
'tangent' (cc)  → { type:'tangent_circumf', p1_id:a.centre.id, p2_id:b.centre.id,
                     rd1:{o_id:a.id,prop:'radius'}, rd2:{o_id:b.id,prop:'radius'} }
'coincident'    → { type:'p2p_coincident', ..., temporary: !!c.temporary }
```

## Debug Logging
Module-level in SketchTool.jsx:
```javascript
const _debugLog = [];   // capped at 2000 lines
function dbg(msg) { _debugLog.push(`[${timestamp}] ${msg}`); }
```

Log points:
1. Drag handler fires: `drag handler: pt=<id> target=(<x>,<y>)`
2. planegcs unavailable: `solvePlanegcs: no planegcs — init error: <msg>`
3. planegcs throws: `solvePlanegcs THREW: <msg>`
4. After drag solve (if _dragFixed): `drag status=<N> pt=(<x>,<y>) conflict=[...] target=(<x>,<y>)`

UI: hamburger → 🪲 Debug log → shows first 5 + last 20 lines inline.
Download (data URI approach) may not work in iframe contexts.

## Current Status / Open Issues

### Drag Bug — likely fixed but untested locally
Root cause was two-fold:
1. Pre-move (`pt.x = tx; pt.y = ty`) was removed — GS fallback then had nothing to do
2. planegcs not loading in viewer context (WASM sandbox restriction)
Fix: pre-move restored. Must verify locally with planegcs loading correctly.

### Known Issues
- Undo system doesn't handle deletions
- Conflict highlighting not yet implemented (red reserved)
- Midpoint constraint not implemented
- Subdivide tool not implemented
- H/V constraints for 2 points not implemented
- Parameter node architecture (top-down constraint propagation) not implemented

### Test Case Discrepancy
Test 32 (constrained drag): result is 300×200 rectangle
Test 33 (reference): 250×200 rectangle
These should match — either update test 32 setup or test 33 reference.

## Varset Export Note
Varsets should export as `App::FeaturePython`, not `Spreadsheet`.

## Console Debug
`window.__sketchDebug()` — dumps current sketch state
`window.__skDebug()` — alias with more detail

## Key Principles (hard-won)
- Always read source files before making changes
- Targeted edits (str_replace) over full rewrites
- Separation of concerns: fix in the right file, not where the symptom appears
- Jiggle-test is correct for DOF analysis; constraint graph propagation overcounts
- Blue = cost===DOF exactly; orange/red reserved for conflicts only
- Output tar: plain uncompressed `.tar`, excluded from git via `.git/info/exclude`
