import { solve as _solve } from '../solver/index.js';
import { autoConstrainNewPoint } from '../geometry/pick.js';

export function applyConstraintFromSelection(type, sk, sel) {
  const pts   =[...sel].filter(id=>sk.points.has(id)&&!sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const lns   =[...sel].filter(id=>sk.lines.has(id) &&!sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const cis   =[...sel].filter(id=>sk.circles.has(id)).map(id=>sk.circles.get(id));
  const ars   =[...sel].filter(id=>sk.arcs.has(id)).map(id=>sk.arcs.get(id));
  const refPts=[...sel].filter(id=>sk.points.has(id)&& sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const refLns=[...sel].filter(id=>sk.lines.has(id) && sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const allPts=[...pts,...refPts], allLns=[...lns,...refLns];

  const NEEDS_VAL={distance:true,radius:true,angle:true};
  if (NEEDS_VAL[type]) {
    let refs=null, label='', defaultVal='';
    if (type==='distance'&&allLns.length) { refs=[allLns[0]]; label=`${allLns[0].name} length (units):`; defaultVal=Math.round(allLns[0].length).toString(); }
    else if (type==='distance'&&allPts.length>=2) { refs=[allPts[0],allPts[1]]; label='Distance (units):'; defaultVal=Math.round(Math.sqrt((allPts[1].x-allPts[0].x)**2+(allPts[1].y-allPts[0].y)**2)).toString(); }
    else if (type==='radius'&&cis.length) { refs=[cis[0]]; label=`${cis[0].name} radius (units):`; defaultVal=Math.round(cis[0].radius).toString(); }
    else if (type==='radius'&&ars.length) { refs=[ars[0]]; label=`${ars[0].name} radius (units):`; defaultVal=Math.round(ars[0].radius).toString(); }
    else if (type==='angle'&&allLns.length>=2) { refs=[allLns[0],allLns[1]]; label='Angle (°):'; defaultVal='90'; }
    if (refs) return {needsInput:true, type, refs, label, defaultVal};
    return null;
  }

  if (type==='attach') {
    if (allPts.length>=2)              sk.addConstraint('coincident',     [allPts[0], allPts[1]]);
    else if (pts.length&&allLns.length) sk.addConstraint('point_on_line',  [pts[0], allLns[0]]);
    else if (pts.length&&cis.length)    sk.addConstraint('point_on_circle',[pts[0], cis[0]]);
    return null;
  }
  if (type==='fixed'&&pts.length) { pts.forEach(p=>sk.addConstraint('fixed',[p])); return null; }
  if (type==='horizontal') {
    if (lns.length)       { sk.addConstraint('horizontal',[lns[0]]); return null; }
    if (allPts.length>=2) { sk.addConstraint('horizontal',[allPts[0],allPts[1]]); return null; }
  }
  if (type==='vertical') {
    if (lns.length)       { sk.addConstraint('vertical',[lns[0]]); return null; }
    if (allPts.length>=2) { sk.addConstraint('vertical',[allPts[0],allPts[1]]); return null; }
  }
  if (type==='coincident'&&allPts.length>=2) { sk.addConstraint('coincident',[allPts[0],allPts[1]]); return null; }
  if (type==='equal'&&lns.length>=2) { sk.addConstraint('equal',[lns[0],lns[1]]); return null; }
  if (type==='parallel'&&allLns.length>=2) { sk.addConstraint('parallel',[allLns[0],allLns[1]]); return null; }
  if (type==='perpendicular'&&allLns.length>=2) { sk.addConstraint('perpendicular',[allLns[0],allLns[1]]); return null; }
  if (type==='symmetric'&&pts.length>=2&&pts.length>=3) { sk.addConstraint('symmetric',[pts[0],pts[1],pts[2]]); return null; }
  if (type==='tangent') {
    const curves=[...cis,...ars];
    if (curves.length>=2) { sk.addConstraint('tangent',[curves[0],curves[1]]); return null; }
    if (curves.length>=1&&allLns.length>=1) { sk.addConstraint('tangent',[allLns[0],curves[0]]); return null; }
    return null;
  }
  if (type==='point_on_line'&&pts.length&&allLns.length) { sk.addConstraint('point_on_line',[pts[0],allLns[0]]); return null; }
  if (type==='point_on_circle'&&pts.length&&cis.length) { sk.addConstraint('point_on_circle',[pts[0],cis[0]]); return null; }
  return null;
}

export function autoConstrainPoints(pts, sk, snapR) {
  for (const p of pts) autoConstrainNewPoint(p, sk, snapR);
}

export function _sketchClosedPolygon(sk, corners, snapR=0) {
  const pts = corners.map(c => sk._mkPt(c.x, c.y));
  const lns = pts.map((p, i) => sk._mkLn(p, pts[(i+1) % pts.length]));
  if (snapR) for (const p of pts) autoConstrainNewPoint(p, sk, snapR);
  return {pts, lns};
}

export function projectOnEntity(entity, wx, wy) {
  if (entity.type==='line') {
    const{p1,p2}=entity, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if(!lsq) return {x:p1.x,y:p1.y};
    const t=((wx-p1.x)*dx+(wy-p1.y)*dy)/lsq;
    return {x:p1.x+t*dx, y:p1.y+t*dy};
  }
  const dx=wx-entity.centre.x, dy=wy-entity.centre.y, len=Math.sqrt(dx*dx+dy*dy)||1;
  return {x:entity.centre.x+dx/len*entity.radius, y:entity.centre.y+dy/len*entity.radius};
}

export function entityNormal(entity, pt) {
  if (entity.type==='line') {
    const dx=entity.p2.x-entity.p1.x, dy=entity.p2.y-entity.p1.y, len=Math.sqrt(dx*dx+dy*dy)||1;
    return {x:-dy/len, y:dx/len};
  }
  const dx=pt.x-entity.centre.x, dy=pt.y-entity.centre.y, len=Math.sqrt(dx*dx+dy*dy)||1;
  return {x:dx/len, y:dy/len};
}

export function rayIntersect2D(px,py,dx,dy,qx,qy,ex,ey) {
  const cross=dx*ey-dy*ex;
  if(Math.abs(cross)<1e-8) return null;
  const t=((qx-px)*ey-(qy-py)*ex)/cross;
  return {x:px+t*dx, y:py+t*dy};
}

export function addPointOnEntity(sk,pt,entity) {
  if(entity.type==='line') sk._mkC('point_on_line',[pt,entity]);
  else                      sk._mkC('point_on_circle',[pt,entity]);
}

export function addTangencyConstraint(sk,spoke,entity) {
  if(entity.type==='line') sk._mkC('perpendicular',[entity,spoke]);
  else                      sk._mkC('point_on_line',[entity.centre,spoke]);
}

export function findResolutions(sk) {
  const cs = sk.conflictState; if (!cs) return [];
  const trigger = cs.trigger;
  const results = [];
  const saved = sk._snapPos();
  const orig = [...sk.constraints];

  const test = (skip) => {
    sk.constraints = orig.filter(c => !skip.includes(c));
    const r = _solve(sk), d = sk._checkDegenerate();
    sk._restorePos(saved);
    sk.constraints = orig;
    return r.status !== 'overconstrained' && !d;
  };

  if (trigger && test([trigger]))
    results.push({ remove:[trigger], primary:true, label: trigger.description });

  for (const c of orig) {
    if (c === trigger || c.locked) continue;
    if (test([c]))
      results.push({ remove:[c], primary:false, label: c.description });
  }
  return results;
}
