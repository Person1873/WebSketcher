import { solvePlanegcs } from './planegcs.js';

function debugPost(sk) {
  if (typeof fetch === 'undefined') return;
  try {
    const payload = {
      arcs: [...sk.arcs.values()].map(a => ({
        id: a.id, name: a.name, inverted: a.inverted,
        radius: +a.radius.toFixed(2),
        centre:  {x:+a.centre.x.toFixed(2),  y:+a.centre.y.toFixed(2)},
        startPt: {x:+a.startPt.x.toFixed(2), y:+a.startPt.y.toFixed(2)},
        endPt:   {x:+a.endPt.x.toFixed(2),   y:+a.endPt.y.toFixed(2)},
        throughPt: a.throughPt ? {x:+a.throughPt.x.toFixed(2), y:+a.throughPt.y.toFixed(2)} : null,
        startAngle: +(a.startAngle*180/Math.PI).toFixed(1),
        endAngle:   +(a.endAngle*180/Math.PI).toFixed(1),
        distStartToCenter: +Math.hypot(a.startPt.x-a.centre.x, a.startPt.y-a.centre.y).toFixed(2),
        distThroughToCenter: a.throughPt ? +Math.hypot(a.throughPt.x-a.centre.x, a.throughPt.y-a.centre.y).toFixed(2) : null,
        constraints: [...(a._constraints??[])].map(c=>({type:c.type,disabled:c.disabled}))
      })),
      constraints: sk.constraints.map(c=>({type:c.type,disabled:c.disabled,refs:c.refs.map(r=>r.id)}))
    };
    fetch('/debug-state', {method:'POST', body: JSON.stringify(payload, null, 2),
      headers:{'Content-Type':'application/json'}}).catch(()=>{});
  } catch(_) {}
}

export function solve(sk) {
  const pgResult = solvePlanegcs(sk);
  if (pgResult !== null) {
    // planegcs doesn't resolve {o_id: arc.id, prop:'radius'} references in distance
    // constraints, so arc.radius is never driven by the solver. Recompute from startPt.
    for (const arc of sk.arcs.values()) {
      // Use distStart as the canonical radius so dragging endpoints updates the arc
      // size live. planegcs's internal r may lag behind when endpoints are dragged
      // radially (especially with angular-range constraints locking the point).
      const d = Math.hypot(arc.startPt.x - arc.centre.x, arc.startPt.y - arc.centre.y);
      if (d > 0.5) arc.radius = d;
      // Snap throughPt onto the arc surface so arcDrawFlags always gets a
      // geometrically correct angle (solver drift causes rendering flips).
      if (arc.throughPt && arc.radius > 0.5) {
        const ta = Math.atan2(arc.throughPt.y - arc.centre.y, arc.throughPt.x - arc.centre.x);
        arc.throughPt.x = arc.centre.x + arc.radius * Math.cos(ta);
        arc.throughPt.y = arc.centre.y + arc.radius * Math.sin(ta);
      }
    }
    for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();
    if (import.meta.env?.DEV) debugPost(sk);
    return pgResult;
  }
  // planegcs unavailable — return DOF from entity model, no geometry update
  return { status: 'ok', dof: sk.dof, residualMM: 0 };
}
