# SketchTool Roadmap

## In Progress
- [x] planegcs WASM solver integration (branch: planegcs-solver)

## Constraint System
- [ ] **Midpoint constraint** — selecting a point + line applies symmetric constraint automatically,
      locking the point to the midpoint of the line without requiring manual point selection ordering
- [ ] **Horizontal/Vertical for arc endpoints** — extend 2-point H/V to arc startPt/endPt
- [ ] **Angle constraint (absolute)** — single-line angle relative to X axis (currently only line-to-line)
- [ ] **Fix tests after planegcs** — 3T inscribed circle tests use throughPt arcs, verify solver handles them

## Tools
- [ ] **Midpoint snap** — snap cursor to midpoint of lines during drawing
- [ ] **Subdivide tool** — select a line/arc/circle, split into N equal segments:
      - Equal length (equal constraint between segments)
      - Coincident endpoints (point-on-point between adjacent segments)
      - End segments inherit applicable constraints from original (horizontal, vertical, angle, tangent, perpendicular)
      - Middle segments inherit parallel/equal constraints
      - Circles/arcs: subdivide into N equal arcs
- [ ] **Trim/extend** — trim a line to a selected intersection point
- [ ] **Offset** — offset a line/circle/arc by a given distance
- [ ] **Mirror** — mirror selected geometry about a line

## UI / Interaction
- [ ] **Conflict highlighting** — when solver reports conflict, highlight the conflicting entities in red
      (currently red is unused, reserved for this purpose)
- [ ] **Constraint picker on overlap** — when multiple constraints could apply to a selection, show a picker
- [ ] **Drag with planegcs** — use planegcs temporary constraints for drag (avoids GS fallback during drag)
- [ ] **Undo across pages** — currently undo is per-sketch, not per-document

## Architecture
- [ ] **Parameter nodes** — refactor entity properties (circle.radius, point.x/y) into Parameter objects
      with dependency graph, enabling proper top-down constraint propagation
- [ ] **Multi-page rendering** — composite visible pages in Z order on the canvas
- [ ] **Varset editor modal** — replace prompt()-based variable creation with a proper modal UI
- [ ] **DXF export** — currently stubbed

## Android / Packaging
- [ ] **Capacitor storage adapter** — swap localStorage for Capacitor Filesystem plugin
- [ ] **Android WebView bridge** — wire window.__sketchExports to native file sharing
- [ ] **Offline WASM** — planegcs.wasm already vendored; verify loads correctly in Android WebView
