import { solvePlanegcs } from './planegcs.js';

export function solve(sk) {
  const pgResult = solvePlanegcs(sk);
  if (pgResult !== null) {
    for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();
    return pgResult;
  }

  // Gauss-Seidel fallback
  const fs=new Set();
  for (const e of sk.reserved) if (e.type==='point') fs.add(e);
  for (const c of sk.constraints) if (c.type==='fixed'&&!c.driven&&!c.disabled) fs.add(c.refs[0]);
  if (sk._dragFixed) fs.add(sk._dragFixed);
  // Propagate fixedness through satisfied coincident constraints only.
  { let chg=true; while(chg){ chg=false; for(const c of sk.constraints){
    if(c.type!=='coincident'||c.disabled) continue;
    const[a,b]=c.refs;
    if(Math.hypot(a.x-b.x,a.y-b.y)>1) continue;
    if(fs.has(a)&&!fs.has(b)){fs.add(b);chg=true;}
    if(fs.has(b)&&!fs.has(a)){fs.add(a);chg=true;}
  } } }

  const snap=[...sk.points.values()].map(p=>({p,x:p.x,y:p.y}));

  for (let i=0;i<80;i++) for (const c of sk.constraints) { if (!c.disabled) c.apply(fs); }

  for (const c of sk.constraints) {
    if (c.type!=='point_on_circle'||c.disabled||c.driven) continue;
    const [pt, ci]=c.refs;
    if (!sk.constraints.some(r=>r.type==='radius'&&!r.disabled&&r.refs[0]===ci)) {
      const dx=pt.x-ci.centre.x, dy=pt.y-ci.centre.y, d=Math.sqrt(dx*dx+dy*dy);
      if (d>0) ci.radius=d;
    }
  }

  for (let i=0;i<40;i++) for (const c of sk.constraints) { if (!c.disabled) c.apply(fs); }
  for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();

  let residual=0;
  for (const {p,x,y} of snap) { const d=Math.sqrt((p.x-x)**2+(p.y-y)**2); if(d>residual) residual=d; }

  let dof=0;
  for (const p of sk.points.values()) if (!p.reserved) dof+=2;
  for (const ci of sk.circles.values()) dof+=1;
  for (const a of sk.arcs.values()) dof+=1;
  for (const c of sk.constraints) dof-=c.dofCost;

  const residualMM=residual*0.01;
  if (dof<0) return {status:'overconstrained',dof,residualMM};
  if (residualMM>=0.005) return {status:'near_miss',dof,residualMM};
  return {status:'ok',dof,residualMM};
}
