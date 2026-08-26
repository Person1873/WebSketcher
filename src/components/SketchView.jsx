import { C, CICONS, computeEntityStates, geomColor } from '../geometry/analysis.js';
import { arcDrawFlags } from '../geometry/helpers.js';
import { RID } from '../entities.js';
import { snapToPoint } from '../geometry/pick.js';

const ANN_TYPES = new Set(['distance','radius','angle']);
const DIM_COLOR = '#b08830'; // driving dimension amber

function dimAnnotations(sk, cam) {
  const out = [];
  for (const c of sk.constraints) {
    if (!ANN_TYPES.has(c.type) || c.disabled) continue;
    const color = c.driven ? C.driven : DIM_COLOR;
    const r = c.refs;

    // ── Distance ────────────────────────────────────────────────────────────
    if (c.type === 'distance') {
      let p1w, p2w;
      if      (r.length === 1 && r[0].p1) { p1w = r[0].p1; p2w = r[0].p2; }
      else if (r.length === 2 && r[0].x != null) { p1w = r[0]; p2w = r[1]; }
      else continue;

      const p1s = cam.toScreen(p1w.x, p1w.y);
      const p2s = cam.toScreen(p2w.x, p2w.y);
      const dx = p2s.x - p1s.x, dy = p2s.y - p1s.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len < 10) continue;
      const ux = dx/len, uy = dy/len;
      const nx = -uy, ny = ux; // 90° CCW of line direction
      const off = 28;
      const d1 = {x: p1s.x + nx*off, y: p1s.y + ny*off};
      const d2 = {x: p2s.x + nx*off, y: p2s.y + ny*off};
      const mid = {x: (d1.x+d2.x)/2, y: (d1.y+d2.y)/2};
      const displayMm = c.driven
        ? (Math.sqrt((p2w.x-p1w.x)**2+(p2w.y-p1w.y)**2)*0.01).toFixed(2)
        : (c.value*0.01).toFixed(2);
      const ta = Math.atan2(dy, dx)*180/Math.PI;
      const rot = Math.abs(ta) > 90 ? ta+180 : ta;

      out.push(
        <g key={`ann_${c.id}`} style={{pointerEvents:'none'}} opacity={0.9}>
          {/* extension lines */}
          <line x1={p1s.x+nx*2} y1={p1s.y+ny*2} x2={d1.x+nx*4} y2={d1.y+ny*4}
            stroke={color} strokeWidth={1} strokeDasharray="3 2"/>
          <line x1={p2s.x+nx*2} y1={p2s.y+ny*2} x2={d2.x+nx*4} y2={d2.y+ny*4}
            stroke={color} strokeWidth={1} strokeDasharray="3 2"/>
          {/* dimension line */}
          <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={color} strokeWidth={1.5}/>
          {/* end ticks */}
          <line x1={d1.x-nx*4} y1={d1.y-ny*4} x2={d1.x+nx*4} y2={d1.y+ny*4}
            stroke={color} strokeWidth={1.5}/>
          <line x1={d2.x-nx*4} y1={d2.y-ny*4} x2={d2.x+nx*4} y2={d2.y+ny*4}
            stroke={color} strokeWidth={1.5}/>
          <text x={mid.x} y={mid.y} dy={-5} fontSize={10} fill={color}
            textAnchor="middle" dominantBaseline="auto"
            transform={`rotate(${rot},${mid.x},${mid.y})`}
            style={{fontFamily:'monospace'}}>{displayMm}mm</text>
        </g>
      );
    }

    // ── Radius ───────────────────────────────────────────────────────────────
    if (c.type === 'radius') {
      const ent = r[0];
      const sc = cam.toScreen(ent.centre.x, ent.centre.y);
      const sr = ent.radius * cam.scale;
      const ang = -Math.PI/4; // upper-right
      const rx = Math.cos(ang), ry = Math.sin(ang);
      const rim = {x: sc.x + rx*sr, y: sc.y + ry*sr};
      const tip = {x: sc.x + rx*(sr+22), y: sc.y + ry*(sr+22)};
      const displayMm = (ent.radius*0.01).toFixed(2);

      out.push(
        <g key={`ann_${c.id}`} style={{pointerEvents:'none'}} opacity={0.9}>
          <line x1={sc.x} y1={sc.y} x2={tip.x} y2={tip.y}
            stroke={color} strokeWidth={1}/>
          <circle cx={rim.x} cy={rim.y} r={2.5} fill={color}/>
          <text x={tip.x+5} y={tip.y} fontSize={10} fill={color}
            dominantBaseline="middle" style={{fontFamily:'monospace'}}>
            R{displayMm}mm
          </text>
        </g>
      );
    }

    // ── Angle ────────────────────────────────────────────────────────────────
    if (c.type === 'angle') {
      const [l1, l2] = r;
      const p1s = cam.toScreen(l1.p1.x, l1.p1.y);
      const p2s = cam.toScreen(l1.p2.x, l1.p2.y);
      const p3s = cam.toScreen(l2.p1.x, l2.p1.y);
      const p4s = cam.toScreen(l2.p2.x, l2.p2.y);
      const dx1=p2s.x-p1s.x, dy1=p2s.y-p1s.y;
      const dx2=p4s.x-p3s.x, dy2=p4s.y-p3s.y;
      const det=dx1*dy2-dy1*dx2;
      if (Math.abs(det)<1e-3) continue;
      const t=((p3s.x-p1s.x)*dy2-(p3s.y-p1s.y)*dx2)/det;
      const ix=p1s.x+t*dx1, iy=p1s.y+t*dy1;
      const arcR=22;
      const a1=Math.atan2(dy1,dx1), a2=Math.atan2(dy2,dx2);
      const span=((a2-a1)+2*Math.PI)%(2*Math.PI);
      const largeArc=span>Math.PI?1:0;
      const startPt={x:ix+Math.cos(a1)*arcR, y:iy+Math.sin(a1)*arcR};
      const endPt={x:ix+Math.cos(a2)*arcR, y:iy+Math.sin(a2)*arcR};
      let bisA=(a1+a2)/2; if(span>Math.PI) bisA+=Math.PI;
      const textPt={x:ix+Math.cos(bisA)*(arcR+14), y:iy+Math.sin(bisA)*(arcR+14)};
      const displayDeg = c.driven
        ? (Math.atan2(Math.abs(dx1*dy2-dy1*dx2),dx1*dx2+dy1*dy2)*180/Math.PI).toFixed(1)
        : c.value?.toFixed(1);

      out.push(
        <g key={`ann_${c.id}`} style={{pointerEvents:'none'}} opacity={0.9}>
          <path d={`M ${startPt.x} ${startPt.y} A ${arcR} ${arcR} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`}
            fill="none" stroke={color} strokeWidth={1.5}/>
          <text x={textPt.x} y={textPt.y} fontSize={10} fill={color}
            textAnchor="middle" dominantBaseline="middle"
            style={{fontFamily:'monospace'}}>{displayDeg}°</text>
        </g>
      );
    }
  }
  return out;
}

export default function SketchView({sk, cam, sel, lineStart, circleCenter, mouseWorld, W, H, selectMode='tap', onConstraintTap}) {
  const states = computeEntityStates(sk);
  const inConstraintMode = selectMode==='constraints';

  const constraintIcon = (c, x, y, key) => {
    const color = C.cc[c.type]||'#aaa';
    const isSelected = sel.has(c.id);
    if (inConstraintMode) {
      return (
        <g key={key}
          onPointerDown={e=>{ e.stopPropagation(); onConstraintTap?.(c.id); }}
          style={{cursor:'pointer'}}>
          <circle cx={x} cy={y} r={20}
            fill={isSelected?'#0d2a50':'#0a1525'}
            stroke={isSelected?'#4488ff':color}
            strokeWidth={isSelected?2:1.5} opacity={0.92}/>
          <text x={x} y={y} fontSize={22} fill={isSelected?'#a0c8f0':color}
            textAnchor="middle" dominantBaseline="middle"
            style={{pointerEvents:'none'}}>{CICONS[c.type]||'?'}</text>
        </g>
      );
    }
    return (
      <text key={key} x={x} y={y}
        fontSize={11} fill={color} textAnchor="middle" dominantBaseline="middle"
        style={{pointerEvents:'none'}}>{CICONS[c.type]||'?'}</text>
    );
  };
  const elems=[];
  const cIconElems=[], selCIconElems=[];
  const pushCI=(c,x,y,key)=>(sel.has(c.id)?selCIconElems:cIconElems).push(constraintIcon(c,x,y,key));

  const xAxis=sk.lines.get(RID.XAXIS), yAxis=sk.lines.get(RID.YAXIS);
  const xSel=sel.has(RID.XAXIS), ySel=sel.has(RID.YAXIS), oSel=sel.has(RID.O);
  if (xAxis) {
    const s1=cam.toScreen(xAxis.p1.x,0), s2=cam.toScreen(xAxis.p2.x,0);
    elems.push(<line key="xax" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke={xSel?C.sel:C.axisX} strokeWidth={xSel?2.5:1}
      opacity={xSel?1:0.7}/>);
  }
  if (yAxis) {
    const s1=cam.toScreen(0,yAxis.p1.y), s2=cam.toScreen(0,yAxis.p2.y);
    elems.push(<line key="yax" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke={ySel?C.sel:C.axisY} strokeWidth={ySel?2.5:1}
      opacity={ySel?1:0.7}/>);
  }
  const o=cam.toScreen(0,0);
  elems.push(<g key="orig" opacity={oSel?1:0.5}>
    <line x1={o.x-7} y1={o.y} x2={o.x+7} y2={o.y}
      stroke={oSel?C.sel:'#ffffff'} strokeWidth={oSel?2:1}/>
    <line x1={o.x} y1={o.y-7} x2={o.x} y2={o.y+7}
      stroke={oSel?C.sel:'#ffffff'} strokeWidth={oSel?2:1}/>
    {oSel&&<circle cx={o.x} cy={o.y} r={5} fill="none" stroke={C.sel} strokeWidth={1.5}/>}
  </g>);

  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln)) continue;
    const s1=cam.toScreen(ln.p1.x,ln.p1.y), s2=cam.toScreen(ln.p2.x,ln.p2.y);
    const isSel=sel.has(ln.id)||sel.has(ln.p1.id)||sel.has(ln.p2.id);
    const stroke=geomColor(ln, inConstraintMode?false:isSel, sk, states, inConstraintMode);
    elems.push(
      <line key={ln.id} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
        stroke={stroke} strokeWidth={isSel?2.5:1.5}
        strokeDasharray={ln.construction?'5 3':undefined}/>
    );
    const mp=cam.toScreen(ln.midpoint.x,ln.midpoint.y);
    const ang=Math.atan2(s2.y-s1.y,s2.x-s1.x);
    const nx=Math.sin(ang)*14, ny=-Math.cos(ang)*14;
    if (!ln.construction) {
      let idx=0;
      ln._constraints.forEach(c=>{
        if (ANN_TYPES.has(c.type) && !c.disabled) return;
        const ix=idx++;
        const cx=mp.x+nx*(1+ix*1.8), cy=mp.y+ny*(1+ix*1.8);
        pushCI(c, cx, cy, `ci${c.id}`);
      });
    }
    if (isSel) {
      const hasDimAnn = [...ln._constraints].some(c=>c.type==='distance'&&!c.disabled);
      if (!hasDimAnn) elems.push(
        <text key={`len${ln.id}`} x={mp.x+nx*3} y={mp.y+ny*3}
          fontSize={12} fill="#c8d8f0" textAnchor="middle" dominantBaseline="middle"
          style={{pointerEvents:'none',fontFamily:'monospace',fontWeight:600}}>
          {(ln.length*0.01).toFixed(2)}mm
        </text>
      );
    }
  }

  for (const ci of sk.circles.values()) {
    const sc=cam.toScreen(ci.centre.x,ci.centre.y);
    const sr=ci.radius*cam.scale;
    const isSel=sel.has(ci.id)||sel.has(ci.centre.id);
    const stroke=geomColor(ci, inConstraintMode?false:isSel, sk, states, inConstraintMode);
    elems.push(
      <circle key={ci.id} cx={sc.x} cy={sc.y} r={sr}
        fill="none" stroke={stroke} strokeWidth={isSel?2.5:1.5}
        strokeDasharray={ci.construction?'5 3':undefined}/>
    );
    const cs=ci._constraints;
    let cidx=0;
    cs.forEach(c=>{
      if(c.type==='point_on_circle') return;
      if(ANN_TYPES.has(c.type) && !c.disabled) return;
      const ix=cidx++;
      pushCI(c, sc.x+Math.abs(sr)+20+ix*24, sc.y, `ci2${c.id}`);
    });
  }

  for (const arc of sk.arcs.values()) {
    const sa=Math.atan2(arc.startPt.y-arc.centre.y, arc.startPt.x-arc.centre.x);
    const ea=Math.atan2(arc.endPt.y-arc.centre.y,   arc.endPt.x-arc.centre.x);
    const ss=cam.toScreen(arc.startPt.x, arc.startPt.y);
    const se=cam.toScreen(arc.endPt.x,   arc.endPt.y);
    const sr=arc.radius*cam.scale;
    const isSel=sel.has(arc.id)||sel.has(arc.centre.id)||sel.has(arc.startPt.id)||sel.has(arc.endPt.id);
    const stroke=geomColor(arc, inConstraintMode?false:isSel, sk, states, inConstraintMode);
    const {largeArc,sweepFlag,drawCCW,sa:arcSa,span:arcSpan}=arcDrawFlags(arc,sa,ea);
    const midAngle = drawCCW ? arcSa+arcSpan/2 : arcSa-(2*Math.PI-arcSpan)/2;
    const mx=arc.centre.x+arc.radius*Math.cos(midAngle);
    const my=arc.centre.y+arc.radius*Math.sin(midAngle);
    const sm=cam.toScreen(mx,my);
    elems.push(
      <path key={arc.id}
        d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 ${largeArc} ${sweepFlag} ${se.x} ${se.y}`}
        fill="none" stroke={stroke} strokeWidth={isSel?2.5:1.5}
        strokeDasharray={arc.construction?'5 3':undefined}/>
    );
    let aidx=0;
    arc._constraints.forEach(c=>{
      if(c.type==='point_on_arc') return;
      if(c.type==='point_on_circle') return;
      if(c.type==='tangent' && c.refs.some(r=>r.type==='line')) return;
      if(ANN_TYPES.has(c.type) && !c.disabled) return;
      const ix=aidx++;
      pushCI(c, sm.x+20+ix*24, sm.y, `arc_c${c.id}`);
    });
  }

  for (const pt of sk.points.values()) {
    if (pt.reserved) continue;
    const sp=cam.toScreen(pt.x,pt.y);
    const isSel=sel.has(pt.id);
    const isFixed=sk.constraints.some(c=>c.type==='fixed'&&c.refs[0]===pt&&!c.disabled);
    const isActive=pt===(lineStart?.pt??lineStart)||pt===circleCenter;
    const skFull = sk?.solveResult?.status==='ok' && sk?.solveResult?.dof===0;
    const ptCost = [...(pt._constraints??[])].reduce((s,c)=>
      s+(!c.disabled&&!c.driven ? c._dofCost??1 : 0), 0);
    const fill = isSel    ? C.sel
               : isFixed  ? C.fixed
               : isActive ? C.geomFull
               : skFull   ? C.geomFull
               : ptCost>=2 ? C.geomPartial
               : C.geomFree;
    if (isFixed) elems.push(<rect key={`fp${pt.id}`} x={sp.x-7} y={sp.y-7} width={14} height={14} fill="none" stroke={C.fixed} strokeWidth={1} opacity={0.6}/>);
    elems.push(<circle key={pt.id} cx={sp.x} cy={sp.y} r={isSel||isActive?7:5} fill={fill}/>);
    if (isSel) elems.push(<text key={`pn${pt.id}`} x={sp.x+9} y={sp.y-8} fontSize={9} fill={C.muted} style={{pointerEvents:'none'}}>{pt.name}</text>);
    let ptIconIdx=0;
    pt._constraints.forEach(c=>{
      if(c.type==='point_on_line') return;
      if(ANN_TYPES.has(c.type) && !c.disabled) return;
      const ix=ptIconIdx++;
      pushCI(c, sp.x+14+ix*24, sp.y-14, `ptci${c.id}_${pt.id}`);
    });
  }

  elems.push(...cIconElems, ...dimAnnotations(sk, cam), ...selCIconElems);

  if (lineStart&&mouseWorld) {
    const s1=cam.toScreen(lineStart.x,lineStart.y), s2=cam.toScreen(mouseWorld.x,mouseWorld.y);
    elems.push(<line key="prev_line" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke={C.geom} strokeWidth={1} strokeDasharray="5 4" opacity={0.5}/>);
    const snap=snapToPoint(mouseWorld.x,mouseWorld.y,sk,20/cam.scale,null);
    if (snap) {
      const ss=cam.toScreen(snap.x,snap.y);
      elems.push(<circle key="snap_ring" cx={ss.x} cy={ss.y} r={10} fill="none" stroke={C.dofOk} strokeWidth={1.5} opacity={0.7}/>);
    }
  }
  if (circleCenter&&mouseWorld) {
    const sc=cam.toScreen(circleCenter.x,circleCenter.y);
    const r=Math.sqrt((mouseWorld.x-circleCenter.x)**2+(mouseWorld.y-circleCenter.y)**2)*cam.scale;
    elems.push(<circle key="prev_circle" cx={sc.x} cy={sc.y} r={Math.max(1,r)}
      fill="none" stroke={C.geom} strokeWidth={1} strokeDasharray="5 4" opacity={0.5}/>);
  }

  return <g>{elems}</g>;
}
