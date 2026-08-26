import { genId } from './utils.js';

export class SketchPoint {
  constructor(x, y, {construction=false,reserved=false,name=null}={}) {
    this.id=genId(); this.x=x; this.y=y; this.construction=construction;
    this.reserved=reserved; this.name=name; this.lines=new Set(); this.circles=new Set();
    this._constraints=new Set(); this._sketch=null; this.type='point';
    this._consumedDof=new Map();
  }
  get dof() {
    if (this.reserved) return 0;
    let c=0; for (const v of this._consumedDof.values()) c+=v; return 2-c;
  }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch || this.reserved) return;
    const sk = this._sketch; this._sketch = null;
    sk._beginBatch();
    for (const ln of [...this.lines])   ln.delete();
    for (const ci of [...this.circles]) ci.delete();
    for (const c  of [...this._constraints]) c._refDeleted(this);
    sk.points.delete(this.id);
    sk._endBatch();
  }
}

export class SketchLine {
  constructor(p1, p2, {construction=false,name=null}={}) {
    this.id=genId(); this.p1=p1; this.p2=p2; this.construction=construction;
    this.name=name; this._constraints=new Set(); this._sketch=null; this.type='line';
    p1.lines.add(this); p2.lines.add(this);
  }
  get length(){ return Math.sqrt((this.p2.x-this.p1.x)**2+(this.p2.y-this.p1.y)**2); }
  get midpoint(){ return {x:(this.p1.x+this.p2.x)/2, y:(this.p1.y+this.p2.y)/2}; }
  // Lines have no intrinsic DOF — derived from their endpoints for display purposes
  get dof(){ return this.p1.dof + this.p2.dof; }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    const sk = this._sketch; this._sketch = null;
    sk._beginBatch();
    this.p1.lines.delete(this); this.p2.lines.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    sk.lines.delete(this.id);
    sk._endBatch();
  }
}

export class SketchCircle {
  constructor(centre, radius, {construction=false,name=null}={}) {
    this.id=genId(); this.centre=centre; this.radius=radius; this.construction=construction;
    this.name=name; this._constraints=new Set(); this._sketch=null; this.type='circle';
    this._consumedDof=new Map();
    centre.circles.add(this);
  }
  // Own DOF = radius slot only; centre position is tracked via the centre point
  get dof(){ let c=0; for (const v of this._consumedDof.values()) c+=v; return 1-c; }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    const sk = this._sketch; this._sketch = null;
    sk._beginBatch();
    this.centre.circles.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    sk.circles.delete(this.id);
    sk._endBatch();
  }
}

export class SketchArc {
  constructor(centre, radius, startPt, endPt, {construction=false,name=null,inverted=false}={}) {
    this.id=genId(); this.centre=centre; this.radius=radius;
    this.startPt=startPt; this.endPt=endPt; this.inverted=inverted;
    this.throughPt=null;
    this.construction=construction; this.name=name;
    this._constraints=new Set(); this._sketch=null; this.type='arc';
    this._consumedDof=new Map();
    centre.circles.add(this);
    startPt.circles.add(this);
    endPt.circles.add(this);
  }
  get startAngle(){ return Math.atan2(this.startPt.y-this.centre.y, this.startPt.x-this.centre.x); }
  get endAngle(){   return Math.atan2(this.endPt.y-this.centre.y,   this.endPt.x-this.centre.x); }
  // Own DOF = radius slot only; start/endPt each have 1 DOF consumed at arc creation (arc-internal)
  get dof(){ let c=0; for (const v of this._consumedDof.values()) c+=v; return 1-c; }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    const sk = this._sketch; this._sketch = null;
    sk._beginBatch();
    this.centre.circles.delete(this);
    this.startPt.circles.delete(this);
    this.endPt.circles.delete(this);
    // Release arc-internal DOF consumed on startPt/endPt at creation
    this.startPt._consumedDof.delete(this);
    this.endPt._consumedDof.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    sk.arcs.delete(this.id);
    sk._endBatch();
  }
}

export function deleteArcWithDeps(arc, sk) {
  const centre = arc.centre;
  const throughPt = arc.throughPt;
  const arcPts = new Set([arc.startPt, arc.endPt]);
  if (throughPt) arcPts.add(throughPt);
  for (const c of sk.constraints)
    if (c.type==='point_on_circle' && c.refs[1]===arc) arcPts.add(c.refs[0]);

  const spokes = [...sk.lines.values()].filter(l =>
    l.construction && l.name==='spoke' &&
    (l.p1===centre || l.p2===centre) &&
    (arcPts.has(l.p1) || arcPts.has(l.p2))
  );

  sk._beginBatch();
  sk.deleteEntity(arc);
  for (const sp of spokes) if (sk.lines.has(sp.id)) sk.deleteEntity(sp);

  const ptOrphaned = p => !p.reserved && sk.points.has(p.id) &&
    ![...sk.lines.values()].some(l => l.p1===p || l.p2===p) &&
    ![...sk.circles.values()].some(c => c.centre===p) &&
    ![...sk.arcs.values()].some(a => a.centre===p || a.startPt===p || a.endPt===p) &&
    p._constraints.size === 0;

  if (ptOrphaned(centre)) sk.deleteEntity(centre);
  if (throughPt && ptOrphaned(throughPt)) sk.deleteEntity(throughPt);
  sk._endBatch();
}

export function circumcentre(a, b, c) {
  const D=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
  if (Math.abs(D)<1e-8) return null;
  const A2=a.x*a.x+a.y*a.y, B2=b.x*b.x+b.y*b.y, C2=c.x*c.x+c.y*c.y;
  return {
    x:(A2*(b.y-c.y)+B2*(c.y-a.y)+C2*(a.y-b.y))/D,
    y:(A2*(c.x-b.x)+B2*(a.x-c.x)+C2*(b.x-a.x))/D
  };
}

export const RID = {O:'ro',XA:'rxa',XB:'rxb',YA:'rya',YB:'ryb',XAXIS:'rxaxis',YAXIS:'ryaxis'};
export const SELECTABLE_RESERVED = new Set([RID.O, RID.XAXIS, RID.YAXIS]);

export function initOrigin(sk) {
  const L=100000;
  const mkP=(x,y,name,id)=>{ const p=new SketchPoint(x,y,{reserved:true,construction:true,name}); p.id=id;p._sketch=sk;sk.points.set(id,p);sk.reserved.add(p); return p; };
  const mkL=(p1,p2,name,id)=>{ const l=new SketchLine(p1,p2,{construction:true,name}); l.id=id;l._sketch=sk;sk.lines.set(id,l);sk.reserved.add(l); return l; };
  const O=mkP(0,0,'O',RID.O);
  mkL(mkP(-L,0,'XA',RID.XA),mkP(L,0,'XB',RID.XB),'X Axis',RID.XAXIS);
  mkL(mkP(0,-L,'YA',RID.YA),mkP(0,L,'YB',RID.YB),'Y Axis',RID.YAXIS);
  return O;
}
