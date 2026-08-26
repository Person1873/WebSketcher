import { solve } from '../solver/index.js';

export const C = {
  bg:'#0d1117', panel:'#090e18', border:'#1e2a3a',
  text:'#c9d1e0', muted:'#3d5068', dim:'#1a2438',
  axisX:'rgba(255,80,80,0.5)', axisY:'rgba(80,255,80,0.5)',
  origin:'#ffffff',
  geomFree:   '#e8eaf0',
  geomPartial:'#4488ff',
  geomFull:   '#3ddc84',
  geomOver:   '#ff6040',
  geom:       '#4488ff',
  sel:        '#ffd740',
  construction:'#2d4a7a',
  ghost:'rgba(255,60,60,0.45)', ghostPt:'rgba(255,80,80,0.7)',
  fixed:'#f0c040', driven:'#7b9fd4',
  conflict:'#ff5555',
  dofOk:'#3ddc84', dofUnder:'#ffd060', dofOver:'#ff5555', dofAmber:'#ff9922',
  cc:{ fixed:'#f0c040',horizontal:'#60d0ff',vertical:'#60d0ff',coincident:'#c080ff',
       equal:'#80ff80',parallel:'#80ff80',perpendicular:'#80ff80',distance:'#ff8040',
       radius:'#ff8040',angle:'#ff8040',tangent:'#80d0ff',symmetric:'#c080ff',
       point_on_line:'#a0a0ff',point_on_circle:'#a0a0ff',
       attach:'#c080ff' }
};

export const ENTITY_DOF_TYPES = new Set([
  'horizontal','vertical','parallel','perpendicular',
  'equal','distance','radius','angle','tangent','symmetric',
]);

export function computeEntityStates(sk) {
  if (!sk) return new Map();

  const JIGGLE = 12, EPS = 0.5;
  const result = new Map();
  const skFull = sk.solveResult?.status==='ok' && sk.solveResult?.dof===0;

  const dofOf = e => e.p1&&e.p2&&!e.centre ? 4 : e.centre&&!e.startPt ? 3 : 6;

  const naiveCost = e => {
    const pts = [e.p1, e.p2, e.centre, e.startPt, e.endPt].filter(Boolean);
    let c = 0;
    for (const con of (e._constraints??[])) if (!con.disabled&&!con.driven) c += con._dofCost??1;
    for (const pt of pts) for (const con of (pt._constraints??[])) if (!con.disabled&&!con.driven) c += con._dofCost??1;
    return c;
  };

  const jiggleTest = e => {
    const pts = [e.p1, e.p2, e.centre, e.startPt, e.endPt].filter(p => p&&!p.reserved);
    const saved      = sk._snapPos();
    const savedRes   = sk.solveResult;
    const savedConf  = sk.conflictState;
    const prevList   = sk._listeners; sk._listeners = [];

    pts.forEach(p => { p.x += JIGGLE; p.y += JIGGLE; });
    const hasR = 'radius' in e;
    if (hasR) e.radius = Math.max(1, e.radius + JIGGLE);

    solve(sk);

    let restored = true;
    for (const p of pts) {
      const s = saved[p.id];
      if (!s) continue;
      if ((p.x-s.x)**2+(p.y-s.y)**2 > EPS*EPS) { restored=false; break; }
    }
    if (restored && hasR && saved[e.id]) {
      if (Math.abs(e.radius - saved[e.id].r) > EPS) restored = false;
    }

    sk._restorePos(saved);
    sk.solveResult   = savedRes;
    sk.conflictState = savedConf;
    sk._listeners    = prevList;
    return restored;
  };

  const allEnts = [
    ...sk.lines.values(),
    ...sk.circles.values(),
    ...sk.arcs.values(),
  ].filter(e => !sk.reserved.has(e));

  for (const e of allEnts) {
    if (skFull) { result.set(e.id, 'blue'); continue; }
    const naive = naiveCost(e), dof = dofOf(e);
    if (naive < dof) { result.set(e.id, 'free'); continue; }
    if (jiggleTest(e)) {
      result.set(e.id, naive > dof ? 'over' : 'blue');
    } else {
      result.set(e.id, 'free');
    }
  }
  return result;
}

export function entityDOF(entity) {
  if (entity.p1 && entity.p2 && !entity.centre) return 4;
  if (entity.centre && !entity.startPt) return 3;
  return 6;
}

export function geomColor(entity, isSel, sk, states, dimmed=false) {
  if (dimmed) return entity.construction ? C.construction : '#2a3a4a';
  if (isSel) return C.sel;
  if (entity.construction) return C.construction;
  if (sk?.solveResult?.status === 'ok' && sk?.solveResult?.dof === 0) return C.geomFull;
  const s = states?.get(entity.id);
  if (s === 'blue' || s === 'over') return C.geomPartial;
  return C.geomFree;
}

export const CICONS = {
  fixed:'⚓',horizontal:'—',vertical:'|',coincident:'⊙',equal:'=',parallel:'∥',
  perpendicular:'⊥',distance:'↔',radius:'R',angle:'∠',tangent:'⌒',symmetric:'⇔',
  point_on_line:'∈',point_on_circle:'◎',point_on_arc:'⌢',
  attach:'⊙',
};
