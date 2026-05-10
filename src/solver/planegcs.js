import { dbg } from '../debug.js';
import { toGcsConstraint } from '../constraints/gcs.js';

export function solvePlanegcs(sk) {
  const pg = typeof window!=='undefined' ? window.__planegcs : null;
  if (!pg) { dbg(`solvePlanegcs: no planegcs — init error: ${window.__planegcsError ?? 'unknown'}`); return null; }

  const {mod, GcsWrapper} = pg;

  function doSolve() {
    const gcs = new GcsWrapper(new mod.GcsSystem());
    try {
      const fixedIds=new Set();
      for (const p of sk.points.values()) if (p.reserved) fixedIds.add(p.id);
      for (const c of sk.constraints) if (c.type==='fixed'&&!c.disabled) fixedIds.add(c.refs[0].id);

      for (const [id,p] of sk.points)
        try { gcs.push_primitive({type:'point',id,x:p.x,y:p.y,fixed:fixedIds.has(id)}); } catch(e){console.warn('[planegcs] push_point',id,e.message);}
      for (const [id,l] of sk.lines)
        try { gcs.push_primitive({type:'line',id,p1_id:l.p1.id,p2_id:l.p2.id}); } catch(e){console.warn('[planegcs] push_line',id,e.message);}
      for (const [id,ci] of sk.circles)
        try { gcs.push_primitive({type:'circle',id,c_id:ci.centre.id,radius:ci.radius}); } catch(e){console.warn('[planegcs] push_circle',id,e.message);}
      for (const [id,arc] of sk.arcs) {
        try {
          const sa=Math.atan2(arc.startPt.y-arc.centre.y,arc.startPt.x-arc.centre.x);
          const ea=Math.atan2(arc.endPt.y-arc.centre.y,  arc.endPt.x-arc.centre.x);
          gcs.push_primitive({type:'arc',id,c_id:arc.centre.id,radius:arc.radius,
            start_angle:sa,end_angle:ea,start_id:arc.startPt.id,end_id:arc.endPt.id});
        } catch(e){console.warn('[planegcs] push_arc',id,e.message);}
      }
      for (const c of sk.constraints) {
        const gc=toGcsConstraint(c);
        if (gc) try { gcs.push_primitive(gc); } catch(e){console.warn('[planegcs] skip constraint',c.type,e.message);}
      }

      if (sk._dragFixed && sk._dragTarget) {
        const {x:tx, y:ty} = sk._dragTarget;
        gcs.push_primitive({type:'point', id:'__drag_pt__', x:tx, y:ty, fixed:true});
        gcs.push_primitive({type:'p2p_coincident', id:'__drag_c__',
          p1_id:sk._dragFixed.id, p2_id:'__drag_pt__', driving:true, temporary:true});
      }

      const status=gcs.solve();
      gcs.apply_solution();

      for (const [id,p] of sk.points) {
        if (fixedIds.has(id)) continue;
        try { const sp=gcs.sketch_index.get_sketch_point(id); p.x=sp.x; p.y=sp.y; } catch(_){}
      }
      for (const [id,ci] of sk.circles)
        try { const sc=gcs.sketch_index.get_sketch_circle(id); ci.radius=Math.abs(sc.radius)||ci.radius; } catch(_){}
      for (const [id,arc] of sk.arcs)
        try { const sa=gcs.sketch_index.get_sketch_arc(id); arc.radius=Math.abs(sa.radius)||arc.radius; } catch(_){}

      const conflicting=gcs.get_gcs_conflicting_constraints();
      let redundantIds=[];
      try{ redundantIds=Array.from(gcs.get_gcs_redundant_constraints?.()??[]); }catch(_){}

      if (sk._dragFixed) {
        const sp = (() => { try { return gcs.sketch_index.get_sketch_point(sk._dragFixed.id); } catch(_){ return null; } })();
        dbg(`drag status=${status} pt=(${sp?.x?.toFixed(2)},${sp?.y?.toFixed(2)}) conflict=[${conflicting.join(',')}] target=(${sk._dragTarget?.x?.toFixed(2)},${sk._dragTarget?.y?.toFixed(2)})`);
      }

      gcs.destroy_gcs_module();

      if (conflicting.length>0) return {status:'conflict', redundantIds};
      if (status===2)           return {status:'near_miss',  redundantIds};
      return {status:'ok', redundantIds};
    } catch(e) {
      try{gcs.destroy_gcs_module();}catch(_){}
      throw e;
    }
  }

  try {
    const r = doSolve();

    let dof=0;
    for (const p of sk.points.values()) if (!p.reserved) dof+=2;
    for (const ci of sk.circles.values()) dof+=1;
    for (const a  of sk.arcs.values())   dof+=1;
    for (const c  of sk.constraints)     dof-=c.dofCost;

    return {status: r.status==='conflict'?'conflict': r.status==='near_miss'?'near_miss':'ok',
            dof, residualMM:0, redundantIds: r.redundantIds};
  } catch(e) {
    dbg(`solvePlanegcs THREW: ${e.message}`);
    return null;
  }
}
