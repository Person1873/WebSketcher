import { C, CICONS, computeEntityStates, geomColor } from '../geometry/analysis.js';
import { arcDrawFlags } from '../geometry/helpers.js';
import { RID } from '../entities.js';
import { snapToPoint } from '../geometry/pick.js';

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
        const ix=idx++;
        const cx=mp.x+nx*(1+ix*1.8), cy=mp.y+ny*(1+ix*1.8);
        elems.push(constraintIcon(c, cx, cy, `ci${c.id}`));
      });
    }
    if (isSel) {
      elems.push(<text key={`len${ln.id}`} x={mp.x+nx*2.5} y={mp.y+ny*2.5}
        fontSize={9} fill={C.muted} textAnchor="middle" dominantBaseline="middle"
        style={{pointerEvents:'none'}}>{(ln.length*0.01).toFixed(2)}mm</text>);
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
      const ix=cidx++;
      elems.push(constraintIcon(c, sc.x+Math.abs(sr)+20+ix*24, sc.y, `ci2${c.id}`));
    });
  }

  for (const arc of sk.arcs.values()) {
    const ss=cam.toScreen(arc.startPt.x,arc.startPt.y);
    const se=cam.toScreen(arc.endPt.x,arc.endPt.y);
    const sr=arc.radius*cam.scale;
    const isSel=sel.has(arc.id)||sel.has(arc.centre.id)||sel.has(arc.startPt.id)||sel.has(arc.endPt.id);
    const stroke=geomColor(arc, inConstraintMode?false:isSel, sk, states, inConstraintMode);
    const {largeArc,sweepFlag,drawCCW,sa:arcSa,span:arcSpan}=arcDrawFlags(arc);
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
      const ix=aidx++;
      elems.push(constraintIcon(c, sm.x+20+ix*24, sm.y, `arc_c${c.id}`));
    });
  }

  for (const pt of sk.points.values()) {
    if (pt.reserved) continue;
    const sp=cam.toScreen(pt.x,pt.y);
    const isSel=sel.has(pt.id);
    const isFixed=sk.constraints.some(c=>c.type==='fixed'&&c.refs[0]===pt&&!c.disabled);
    const isActive=pt===lineStart||pt===circleCenter;
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
      const ix=ptIconIdx++;
      elems.push(constraintIcon(c, sp.x+14+ix*24, sp.y-14, `ptci${c.id}_${pt.id}`));
    });
  }

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

  return <>{elems}</>;
}
