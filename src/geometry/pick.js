import { SELECTABLE_RESERVED } from '../entities.js';
import { arcDrawFlags } from './helpers.js';

export function getEntitiesInRect(sk, x0, y0, x1, y1) {
  const minX=Math.min(x0,x1), maxX=Math.max(x0,x1);
  const minY=Math.min(y0,y1), maxY=Math.max(y0,y1);
  const ids=new Set();
  for (const pt of sk.points.values()) {
    if (pt.reserved) continue;
    if (pt.x>=minX&&pt.x<=maxX&&pt.y>=minY&&pt.y<=maxY) ids.add(pt.id);
  }
  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln) && !SELECTABLE_RESERVED.has(ln.id)) continue;
    if ((ln.p1.x>=minX&&ln.p1.x<=maxX&&ln.p1.y>=minY&&ln.p1.y<=maxY)||
        (ln.p2.x>=minX&&ln.p2.x<=maxX&&ln.p2.y>=minY&&ln.p2.y<=maxY))
      ids.add(ln.id);
  }
  for (const ci of sk.circles.values()) {
    if (ci.centre.x>=minX&&ci.centre.x<=maxX&&ci.centre.y>=minY&&ci.centre.y<=maxY)
      ids.add(ci.id);
  }
  for (const a of sk.arcs.values()) {
    for (const pt of [a.centre,a.startPt,a.endPt]) {
      if (pt.x>=minX&&pt.x<=maxX&&pt.y>=minY&&pt.y<=maxY){ ids.add(a.id); break; }
    }
  }
  return ids;
}

export function autoConstrainNewPoint(pt, sk, snapR) {
  for (const q of sk.points.values()) {
    if (q===pt) continue;
    if (q.reserved && !SELECTABLE_RESERVED.has(q.id)) continue;
    const dx=q.x-pt.x, dy=q.y-pt.y;
    if (dx*dx+dy*dy < snapR*snapR) {
      sk.addConstraint('coincident',[pt,q]);
      return;
    }
  }
  for (const ln of sk.lines.values()) {
    if (ln.p1===pt||ln.p2===pt) continue;
    if (sk.reserved.has(ln) && !SELECTABLE_RESERVED.has(ln.id)) continue;
    const{p1,p2}=ln, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if (!lsq) continue;
    const t=Math.max(0,Math.min(1,((pt.x-p1.x)*dx+(pt.y-p1.y)*dy)/lsq));
    const d=Math.sqrt((p1.x+t*dx-pt.x)**2+(p1.y+t*dy-pt.y)**2);
    if (d<snapR) {
      sk.addConstraint('point_on_line',[pt,ln]);
      return;
    }
  }
}

export function pick(wx,wy,sk,snapR) {
  for (const p of sk.points.values()) {
    if (p.reserved && !SELECTABLE_RESERVED.has(p.id)) continue;
    if (Math.sqrt((p.x-wx)**2+(p.y-wy)**2)<snapR) return {type:'point',entity:p};
  }
  for (const l of sk.lines.values()) {
    if (sk.reserved.has(l) && !SELECTABLE_RESERVED.has(l.id)) continue;
    const{p1,p2}=l, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if (!lsq) continue;
    const t=Math.max(0,Math.min(1,((wx-p1.x)*dx+(wy-p1.y)*dy)/lsq));
    const d=Math.sqrt((wx-p1.x-t*dx)**2+(wy-p1.y-t*dy)**2);
    if (d<snapR) return {type:'line',entity:l};
  }
  for (const c of sk.circles.values()) {
    if (Math.abs(Math.sqrt((wx-c.centre.x)**2+(wy-c.centre.y)**2)-c.radius)<snapR)
      return {type:'circle',entity:c};
  }
  for (const a of sk.arcs.values()) {
    const dx=wx-a.centre.x, dy=wy-a.centre.y;
    if (Math.abs(Math.sqrt(dx*dx+dy*dy)-a.radius)<snapR) {
      const angle=Math.atan2(dy,dx);
      const {sa,span,drawCCW}=arcDrawFlags(a);
      const hit = drawCCW
        ? (((angle-sa)+2*Math.PI)%(2*Math.PI)) <= span
        : (((sa-angle)+2*Math.PI)%(2*Math.PI)) <= (2*Math.PI-span);
      if (hit) return {type:'arc',entity:a};
    }
  }
  return null;
}

export function snapToPoint(wx,wy,sk,snapR,exclude=null) {
  let best=null, bd=snapR*snapR;
  for (const p of sk.points.values()) {
    if (p.reserved||p===exclude) continue;
    const d=(p.x-wx)**2+(p.y-wy)**2;
    if (d<bd){bd=d;best=p;}
  }
  return best;
}
