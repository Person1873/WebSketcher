import { useState, useRef, useEffect, useReducer, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

let _id = 0;
const genId = () => `e${++_id}`;

function adjLen(p1, p2, target, fs) {
  const dx = p2.x-p1.x, dy = p2.y-p1.y;
  const len = Math.max(0.001, Math.sqrt(dx*dx+dy*dy));
  const f1 = fs.has(p1), f2 = fs.has(p2);
  if (f1&&f2) return;
  if (f1)      { p2.x=p1.x+(dx/len)*target; p2.y=p1.y+(dy/len)*target; }
  else if (f2) { p1.x=p2.x-(dx/len)*target; p1.y=p2.y-(dy/len)*target; }
  else {
    const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
    p1.x=cx-(dx/len)*target/2; p1.y=cy-(dy/len)*target/2;
    p2.x=cx+(dx/len)*target/2; p2.y=cy+(dy/len)*target/2;
  }
}

function applyDir(rp1, rp2, p1, p2, fs, perp=false) {
  const dx=rp2.x-rp1.x, dy=rp2.y-rp1.y;
  const len1=Math.max(0.001,Math.sqrt(dx*dx+dy*dy));
  let tx=dx/len1, ty=dy/len1;
  if (perp) [tx,ty]=[-ty,tx];
  const dx2=p2.x-p1.x, dy2=p2.y-p1.y;
  const len2=Math.max(0.001,Math.sqrt(dx2*dx2+dy2*dy2));
  const f1=fs.has(p1), f2=fs.has(p2);
  if (f1&&f2) return;
  if (f1)      { p2.x=p1.x+tx*len2; p2.y=p1.y+ty*len2; }
  else if (f2) { p1.x=p2.x-tx*len2; p1.y=p2.y-ty*len2; }
  else {
    const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
    p1.x=cx-tx*len2/2; p1.y=cy-ty*len2/2;
    p2.x=cx+tx*len2/2; p2.y=cy+ty*len2/2;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONSTRAINT BASE CLASSES
// ═══════════════════════════════════════════════════════════════════

class Constraint {
  constructor({ refs, value=null, driven=false, locked=false }) {
    this.id=genId(); this.refs=refs; this.value=value;
    this.driven=driven; this.locked=locked; this.disabled=false;
    this.name=null; this._sketch=null; this.varRef=null;
    // Register back-refs on each entity
    for (const r of refs) r._constraints?.add(this);
  }
  get dofCost()    { return this.driven ? 0 : this._dofCost; }
  get _dofCost()   { return 1; }
  get description(){ return this.type; }
  get solvedValue(){ return null; }
  apply(fs) { if (!this.driven) this._apply(fs); }
  _apply(_fs) {}

  /** Minimum number of refs needed to remain valid. Default: all of them. */
  get _minRefs() { return this.refs.length; }

  /**
   * Called by an entity when it is being deleted.
   * Constraint checks if remaining refs meet the minimum — if not, self-destructs,
   * deregistering from all surviving entities in the process.
   */
  _refDeleted(deletedRef) {
    const remaining = this.refs.filter(r => r !== deletedRef).length;
    if (remaining < this._minRefs) this.delete();
  }

  delete() {
    if (!this._sketch) return;
    // Deregister back-refs before removing from sketch
    for (const r of this.refs) r._constraints?.delete(this);
    this._sketch.constraints = this._sketch.constraints.filter(c=>c!==this);
    this._sketch.markDirty();
    this._sketch = null;
  }
  _attachToSketch(sk) { this._sketch=sk; }
}

class DimensionalConstraint extends Constraint {
  constructor(a) { super(a); this._solvedValue=null; }
  get solvedValue() { return this.driven ? this._solvedValue : this.value; }
  updateSolvedValue() { if (this.driven) this._solvedValue=this._computeSolvedValue(); }
  _computeSolvedValue() { return null; }
}

class GeometricConstraint extends Constraint {
  constructor(a) { super({...a, driven:false, value:null}); }
}

// ═══════════════════════════════════════════════════════════════════
// GEOMETRIC CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

class CoincidentConstraint extends GeometricConstraint {
  get type(){ return 'coincident'; } get _dofCost(){ return 2; }
  get description(){ return `${this.refs[0].name} = ${this.refs[1].name}`; }
  _apply(fs) {
    const [p1,p2]=this.refs, f1=fs.has(p1), f2=fs.has(p2);
    if (f1&&f2) return;
    if (f1)      { p2.x=p1.x; p2.y=p1.y; }
    else if (f2) { p1.x=p2.x; p1.y=p2.y; }
    else { const mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2; p1.x=mx;p1.y=my;p2.x=mx;p2.y=my; }
  }
}

class HorizontalConstraint extends GeometricConstraint {
  get type(){ return 'horizontal'; }
  get description(){
    if (this.refs.length===2) return `${this.refs[0].name} ↔ ${this.refs[1].name} horizontal`;
    return `${this.refs[0].name} horizontal`;
  }
  _apply(fs) {
    // 2-point form: make both points share the same Y
    if (this.refs.length===2) {
      const [p1,p2]=this.refs, f1=fs.has(p1), f2=fs.has(p2);
      if (f1&&f2) return;
      const my=(p1.y+p2.y)/2;
      if (!f1) p1.y=f2?p2.y:my;
      if (!f2) p2.y=f1?p1.y:my;
      return;
    }
    // Line form
    const {p1,p2}=this.refs[0], f1=fs.has(p1), f2=fs.has(p2);
    if (f1&&f2) return;
    const my=(p1.y+p2.y)/2;
    if (!f1) p1.y=f2?p2.y:my;
    if (!f2) p2.y=f1?p1.y:my;
  }
}

class VerticalConstraint extends GeometricConstraint {
  get type(){ return 'vertical'; }
  get description(){
    if (this.refs.length===2) return `${this.refs[0].name} ↕ ${this.refs[1].name} vertical`;
    return `${this.refs[0].name} vertical`;
  }
  _apply(fs) {
    // 2-point form: make both points share the same X
    if (this.refs.length===2) {
      const [p1,p2]=this.refs, f1=fs.has(p1), f2=fs.has(p2);
      if (f1&&f2) return;
      const mx=(p1.x+p2.x)/2;
      if (!f1) p1.x=f2?p2.x:mx;
      if (!f2) p2.x=f1?p1.x:mx;
      return;
    }
    // Line form
    const {p1,p2}=this.refs[0], f1=fs.has(p1), f2=fs.has(p2);
    if (f1&&f2) return;
    const mx=(p1.x+p2.x)/2;
    if (!f1) p1.x=f2?p2.x:mx;
    if (!f2) p2.x=f1?p1.x:mx;
  }
}

class ParallelConstraint extends GeometricConstraint {
  get type(){ return 'parallel'; }
  get description(){ return `${this.refs[0].name} ∥ ${this.refs[1].name}`; }
  _apply(fs){ const[a,b]=this.refs; applyDir(a.p1,a.p2,b.p1,b.p2,fs,false); }
}

class PerpendicularConstraint extends GeometricConstraint {
  get type(){ return 'perpendicular'; }
  get description(){ return `${this.refs[0].name} ⊥ ${this.refs[1].name}`; }
  _apply(fs){ const[a,b]=this.refs; applyDir(a.p1,a.p2,b.p1,b.p2,fs,true); }
}

class EqualConstraint extends GeometricConstraint {
  get type(){ return 'equal'; }
  get description(){ return `${this.refs[0].name} = ${this.refs[1].name}`; }
  _apply(fs) {
    const[a,b]=this.refs;
    const dx1=a.p2.x-a.p1.x, dy1=a.p2.y-a.p1.y;
    const dx2=b.p2.x-b.p1.x, dy2=b.p2.y-b.p1.y;
    const avg=(Math.sqrt(dx1*dx1+dy1*dy1)+Math.sqrt(dx2*dx2+dy2*dy2))/2;
    adjLen(a.p1,a.p2,avg,fs); adjLen(b.p1,b.p2,avg,fs);
  }
}

class FixedConstraint extends GeometricConstraint {
  constructor(a){ super(a); this.fx=a.refs[0].x; this.fy=a.refs[0].y; }
  get type(){ return 'fixed'; } get _dofCost(){ return 2; }
  get description(){ return `${this.refs[0].name} fixed`; }
  _apply(){ this.refs[0].x=this.fx; this.refs[0].y=this.fy; }
}

class TangentConstraint extends GeometricConstraint {
  get type(){ return 'tangent'; }
  get description(){ return `${this.refs[0].name} ⌒ ${this.refs[1].name}`; }
  _apply(fs) {
    const[a,b]=this.refs, ta=a.type, tb=b.type;
    if (ta==='line'&&(tb==='circle'||tb==='arc')) this._lc(a,b,fs);
    else if ((ta==='circle'||ta==='arc')&&tb==='line') this._lc(b,a,fs);
    else if ((ta==='circle'||ta==='arc')&&(tb==='circle'||tb==='arc')) this._cc(a,b,fs);
  }
  _lc(line,curve,fs) {
    // Enforce dist(curve.centre, line) = curve.radius
    const{p1,p2}=line, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if(lsq<1e-10) return;
    const t=((curve.centre.x-p1.x)*dx+(curve.centre.y-p1.y)*dy)/lsq;
    const fx=p1.x+t*dx, fy=p1.y+t*dy;        // foot of perpendicular
    const cx=curve.centre.x-fx, cy=curve.centre.y-fy;
    const d=Math.sqrt(cx*cx+cy*cy); if(d<1e-10) return;
    const nx=cx/d, ny=cy/d;                    // unit normal line→centre
    const err=d-curve.radius;
    if(!fs.has(curve.centre)){ curve.centre.x-=nx*err; curve.centre.y-=ny*err; }
    else {                                     // centre fixed: translate line instead
      if(!fs.has(p1)){p1.x+=nx*err;p1.y+=ny*err;}
      if(!fs.has(p2)){p2.x+=nx*err;p2.y+=ny*err;}
    }
  }
  _cc(a,b,fs) {
    // Enforce dist(centres) = r1+r2 (external) or |r1-r2| (internal)
    const dx=b.centre.x-a.centre.x, dy=b.centre.y-a.centre.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;
    const ext=a.radius+b.radius, int=Math.abs(a.radius-b.radius);
    const target=Math.abs(dist-ext)<Math.abs(dist-int)?ext:int;
    const err=dist-target, ux=dx/dist, uy=dy/dist;
    if(!fs.has(a.centre)){a.centre.x+=ux*err*0.5;a.centre.y+=uy*err*0.5;}
    if(!fs.has(b.centre)){b.centre.x-=ux*err*0.5;b.centre.y-=uy*err*0.5;}
  }
}

class SymmetricConstraint extends GeometricConstraint {
  get type(){ return 'symmetric'; } get _dofCost(){ return 2; }
  get description(){ return `${this.refs[0].name} ↔ ${this.refs[1].name} about ${this.refs[2].name}`; }
  _apply(fs) {
    const[p1,p2,ax]=this.refs, f1=fs.has(p1), f2=fs.has(p2), fa=fs.has(ax);
    if (f1&&f2&&fa) return;
    if (fa) {
      // ax pinned — enforce symmetry of p1/p2 about ax
      if (f1&&f2) return;
      if (f1)      { p2.x=2*ax.x-p1.x; p2.y=2*ax.y-p1.y; }
      else if (f2) { p1.x=2*ax.x-p2.x; p1.y=2*ax.y-p2.y; }
      else {
        // both free, ax fixed → reflect p1 to place p2.
        // Translating both would displace whichever point was already correctly
        // placed by an earlier constraint (e.g. planegcs perpendicular/horizontal).
        p2.x=2*ax.x-p1.x; p2.y=2*ax.y-p1.y;
      }
    } else if (f1&&f2) {
      // both endpoints pinned → move ax to their midpoint
      ax.x=(p1.x+p2.x)/2; ax.y=(p1.y+p2.y)/2;
    } else if (f1) {
      // p1 pinned (dragged), p2 and ax free → reflect p1 about ax, update ax
      p2.x=2*ax.x-p1.x; p2.y=2*ax.y-p1.y;
      ax.x=(p1.x+p2.x)/2; ax.y=(p1.y+p2.y)/2;
    } else if (f2) {
      // p2 pinned (dragged), p1 and ax free → reflect p2 about ax, update ax
      p1.x=2*ax.x-p2.x; p1.y=2*ax.y-p2.y;
      ax.x=(p1.x+p2.x)/2; ax.y=(p1.y+p2.y)/2;
    } else {
      // all free → move ax to midpoint (partial update toward satisfaction)
      ax.x=(p1.x+p2.x)/2; ax.y=(p1.y+p2.y)/2;
    }
  }
}

class PointOnLineConstraint extends GeometricConstraint {
  get type(){ return 'point_on_line'; }
  get description(){ return `${this.refs[0].name} on ${this.refs[1].name}`; }
  _apply(fs) {
    const[pt,line]=this.refs; if (fs.has(pt)) return;
    const{p1,p2}=line, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if (lsq<1e-10) return;
    const t=((pt.x-p1.x)*dx+(pt.y-p1.y)*dy)/lsq;
    pt.x=p1.x+t*dx; pt.y=p1.y+t*dy;
  }
}

class PointOnCircleConstraint extends GeometricConstraint {
  get type(){ return 'point_on_circle'; }
  get description(){ return `${this.refs[0].name} on ${this.refs[1].name}`; }
  _apply(fs) {
    const[pt,ci]=this.refs;
    const dx=pt.x-ci.centre.x, dy=pt.y-ci.centre.y;
    const d=Math.sqrt(dx*dx+dy*dy); if (d<1e-10) return;
    if (fs.has(pt)) {
      // Point is pinned (drag or explicit fix): radius follows the point
      ci.radius=d;
    } else {
      // Normal case: point follows the circle
      pt.x=ci.centre.x+(dx/d)*ci.radius; pt.y=ci.centre.y+(dy/d)*ci.radius;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// DIMENSIONAL CONSTRAINTS
// ═══════════════════════════════════════════════════════════════════

class DistanceConstraint extends DimensionalConstraint {
  get type(){ return 'distance'; }
  get description() {
    const v=this.solvedValue, s=v==null?'?':`${(v*0.01).toFixed(2)}mm`;
    return this.refs.length===1?`${this.refs[0].name} = ${s}`:`${this.refs[0].name}↔${this.refs[1].name} = ${s}`;
  }
  _apply(fs) {
    if (this.refs.length===1) adjLen(this.refs[0].p1,this.refs[0].p2,this.value,fs);
    else adjLen(this.refs[0],this.refs[1],this.value,fs);
  }
  _computeSolvedValue() {
    if (this.refs.length===1){ const{p1,p2}=this.refs[0]; return Math.sqrt((p2.x-p1.x)**2+(p2.y-p1.y)**2); }
    const[a,b]=this.refs; return Math.sqrt((b.x-a.x)**2+(b.y-a.y)**2);
  }
}

class RadiusConstraint extends DimensionalConstraint {
  get type(){ return 'radius'; }
  get description() {
    const v=this.solvedValue, s=v==null?'?':`${(v*0.01).toFixed(2)}mm`;
    return `${this.refs[0].name} r=${s}`;
  }
  _apply()  { this.refs[0].radius=this.value; }
  _computeSolvedValue() { return this.refs[0].radius; }
}

class AngleConstraint extends DimensionalConstraint {
  get type(){ return 'angle'; }
  get description() {
    const v=this.solvedValue, s=v==null?'?':`${v.toFixed(1)}°`;
    return this.refs.length===1?`${this.refs[0].name} ∠${s}`:`${this.refs[0].name}∠${this.refs[1].name}=${s}`;
  }
  _apply(fs){ this.refs.length===1?this._abs(fs):this._rel(fs); }
  _abs(fs) {
    const{p1,p2}=this.refs[0], rad=this.value*Math.PI/180;
    const dx=p2.x-p1.x, dy=p2.y-p1.y, len=Math.max(0.001,Math.sqrt(dx*dx+dy*dy));
    const tx=Math.cos(rad), ty=Math.sin(rad);
    const f1=fs.has(p1), f2=fs.has(p2); if(f1&&f2) return;
    if(f1)      {p2.x=p1.x+tx*len; p2.y=p1.y+ty*len;}
    else if(f2) {p1.x=p2.x-tx*len; p1.y=p2.y-ty*len;}
    else { const cx=(p1.x+p2.x)/2,cy=(p1.y+p2.y)/2; p1.x=cx-tx*len/2;p1.y=cy-ty*len/2;p2.x=cx+tx*len/2;p2.y=cy+ty*len/2; }
  }
  _rel(fs) {
    const[l1,l2]=this.refs, rad=this.value*Math.PI/180;
    const dx1=l1.p2.x-l1.p1.x, dy1=l1.p2.y-l1.p1.y;
    const ta=Math.atan2(dy1,dx1)+rad;
    const dx2=l2.p2.x-l2.p1.x, dy2=l2.p2.y-l2.p1.y;
    const len2=Math.max(0.001,Math.sqrt(dx2*dx2+dy2*dy2));
    const tx=Math.cos(ta), ty=Math.sin(ta);
    const f1=fs.has(l2.p1), f2=fs.has(l2.p2); if(f1&&f2) return;
    if(f1)      {l2.p2.x=l2.p1.x+tx*len2;l2.p2.y=l2.p1.y+ty*len2;}
    else if(f2) {l2.p1.x=l2.p2.x-tx*len2;l2.p1.y=l2.p2.y-ty*len2;}
    else { const cx=(l2.p1.x+l2.p2.x)/2,cy=(l2.p1.y+l2.p2.y)/2; l2.p1.x=cx-tx*len2/2;l2.p1.y=cy-ty*len2/2;l2.p2.x=cx+tx*len2/2;l2.p2.y=cy+ty*len2/2; }
  }
  _computeSolvedValue() {
    if(this.refs.length===1){ const{p1,p2}=this.refs[0]; return Math.atan2(p2.y-p1.y,p2.x-p1.x)*180/Math.PI; }
    const[a,b]=this.refs;
    return ((Math.atan2(b.p2.y-b.p1.y,b.p2.x-b.p1.x)-Math.atan2(a.p2.y-a.p1.y,a.p2.x-a.p1.x))*180/Math.PI+360)%360;
  }
}

// ═══════════════════════════════════════════════════════════════════
// CONSTRAINT REGISTRY
// ═══════════════════════════════════════════════════════════════════

const CREG = {
  coincident:CoincidentConstraint, horizontal:HorizontalConstraint, vertical:VerticalConstraint,
  parallel:ParallelConstraint, perpendicular:PerpendicularConstraint, equal:EqualConstraint,
  fixed:FixedConstraint, tangent:TangentConstraint, symmetric:SymmetricConstraint,
  point_on_line:PointOnLineConstraint, point_on_circle:PointOnCircleConstraint,
  distance:DistanceConstraint, radius:RadiusConstraint, angle:AngleConstraint,
};

function makeConstraint(type, refs, value=null, driven=false) {
  const Cls=CREG[type]; if (!Cls) throw new Error(`Unknown: ${type}`);
  return new Cls({refs,value,driven});
}

// ═══════════════════════════════════════════════════════════════════
// ENTITIES
// ═══════════════════════════════════════════════════════════════════

class SketchPoint {
  constructor(x, y, {construction=false,reserved=false,name=null}={}) {
    this.id=genId(); this.x=x; this.y=y; this.construction=construction;
    this.reserved=reserved; this.name=name; this.lines=new Set(); this.circles=new Set();
    this._constraints=new Set(); this._sketch=null; this.type='point';
  }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch||this.reserved) return;
    this._sketch._beginBatch();
    for (const ln of [...this.lines])   ln.delete();
    for (const ci of [...this.circles]) ci.delete();
    for (const c  of [...this._constraints]) c._refDeleted(this);
    this._sketch.points.delete(this.id);
    this._sketch._endBatch();
  }
}

class SketchLine {
  constructor(p1, p2, {construction=false,name=null}={}) {
    this.id=genId(); this.p1=p1; this.p2=p2; this.construction=construction;
    this.name=name; this._constraints=new Set(); this._sketch=null; this.type='line';
    p1.lines.add(this); p2.lines.add(this);
  }
  get length(){ return Math.sqrt((this.p2.x-this.p1.x)**2+(this.p2.y-this.p1.y)**2); }
  get midpoint(){ return {x:(this.p1.x+this.p2.x)/2, y:(this.p1.y+this.p2.y)/2}; }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    this._sketch._beginBatch();
    this.p1.lines.delete(this); this.p2.lines.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    this._sketch.lines.delete(this.id);
    this._sketch._endBatch();
  }
}

class SketchCircle {
  constructor(centre, radius, {construction=false,name=null}={}) {
    this.id=genId(); this.centre=centre; this.radius=radius; this.construction=construction;
    this.name=name; this._constraints=new Set(); this._sketch=null; this.type='circle';
    centre.circles.add(this);
  }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    this._sketch._beginBatch();
    this.centre.circles.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    this._sketch.circles.delete(this.id);
    this._sketch._endBatch();
  }
}

class SketchArc {
  constructor(centre, radius, startPt, endPt, {construction=false,name=null,inverted=false}={}) {
    this.id=genId(); this.centre=centre; this.radius=radius;
    this.startPt=startPt; this.endPt=endPt; this.inverted=inverted;
    this.throughPt=null; // optional: 3rd point arc must pass through (3P/3T)
    this.construction=construction; this.name=name;
    this._constraints=new Set(); this._sketch=null; this.type='arc';
    // Register on all three points for cascade deletion
    centre.circles.add(this);
    startPt.circles.add(this);
    endPt.circles.add(this);
  }
  get startAngle(){ return Math.atan2(this.startPt.y-this.centre.y, this.startPt.x-this.centre.x); }
  get endAngle(){   return Math.atan2(this.endPt.y-this.centre.y,   this.endPt.x-this.centre.x); }
  get constraints(){ return this._constraints; }
  delete() {
    if (!this._sketch) return;
    this._sketch._beginBatch();
    this.centre.circles.delete(this);
    this.startPt.circles.delete(this);
    this.endPt.circles.delete(this);
    for (const c of [...this._constraints]) c._refDeleted(this);
    this._sketch.arcs.delete(this.id);
    this._sketch._endBatch();
  }
}

/** Delete an arc and its dependent construction geometry (spokes + orphaned centre). */
function deleteArcWithDeps(arc, sk) {
  const centre = arc.centre;

  // Collect arc-related points (startPt, endPt, plus any point_on_circle points e.g. 3P middle)
  const arcPts = new Set([arc.startPt, arc.endPt]);
  for (const c of sk.constraints)
    if (c.type==='point_on_circle' && c.refs[1]===arc) arcPts.add(c.refs[0]);

  // Spokes: construction lines named 'spoke' whose one endpoint is the centre
  // and other endpoint is one of the arc's own points
  const spokes = [...sk.lines.values()].filter(l =>
    l.construction && l.name==='spoke' &&
    (l.p1===centre || l.p2===centre) &&
    (arcPts.has(l.p1) || arcPts.has(l.p2))
  );

  sk._beginBatch();
  sk.deleteEntity(arc);
  for (const sp of spokes) if (sk.lines.has(sp.id)) sk.deleteEntity(sp);

  // Remove orphaned centre — user-placed or construction — if nothing else holds it
  if (!centre.reserved && sk.points.has(centre.id)) {
    const inUse =
      [...sk.lines.values()].some(l => l.p1===centre || l.p2===centre) ||
      [...sk.circles.values()].some(c => c.centre===centre) ||
      [...sk.arcs.values()].some(a => a.centre===centre || a.startPt===centre || a.endPt===centre) ||
      centre._constraints.size > 0;
    if (!inUse) sk.deleteEntity(centre);
  }
  sk._endBatch();
}


function circumcentre(a, b, c) {
  const D=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
  if (Math.abs(D)<1e-8) return null;
  const A2=a.x*a.x+a.y*a.y, B2=b.x*b.x+b.y*b.y, C2=c.x*c.x+c.y*c.y;
  return {
    x:(A2*(b.y-c.y)+B2*(c.y-a.y)+C2*(a.y-b.y))/D,
    y:(A2*(c.x-b.x)+B2*(a.x-c.x)+C2*(b.x-a.x))/D
  };
}
// ═══════════════════════════════════════════════════════════════════

const RID = {O:'ro',XA:'rxa',XB:'rxb',YA:'rya',YB:'ryb',XAXIS:'rxaxis',YAXIS:'ryaxis'};
// These reserved entities are selectable as reference geometry
const SELECTABLE_RESERVED = new Set([RID.O, RID.XAXIS, RID.YAXIS]);

function initOrigin(sk) {
  const L=100000;
  const mkP=(x,y,name,id)=>{ const p=new SketchPoint(x,y,{reserved:true,construction:true,name}); p.id=id;p._sketch=sk;sk.points.set(id,p);sk.reserved.add(p); return p; };
  const mkL=(p1,p2,name,id)=>{ const l=new SketchLine(p1,p2,{construction:true,name}); l.id=id;l._sketch=sk;sk.lines.set(id,l);sk.reserved.add(l); return l; };
  const O=mkP(0,0,'O',RID.O);
  mkL(mkP(-L,0,'XA',RID.XA),mkP(L,0,'XB',RID.XB),'X Axis',RID.XAXIS);
  mkL(mkP(0,-L,'YA',RID.YA),mkP(0,L,'YB',RID.YB),'Y Axis',RID.YAXIS);
  return O;
}

// ═══════════════════════════════════════════════════════════════════
// SOLVER
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// PLANEGCS  —  FreeCAD's constraint solver via WebAssembly
// index.html pre-loads the module and sets window.__planegcs = { mod, GcsWrapper }
// Each solve creates a fresh GcsWrapper synchronously, falls back to GS.
// ═══════════════════════════════════════════════════════════════════

function toGcsConstraint(c) {
  if (c.disabled || c.driven) return null;
  const r=c.refs, id=c.id, driving=!c.driven;
  switch (c.type) {
    case 'coincident':      return {type:'p2p_coincident',   id, p1_id:r[0].id, p2_id:r[1].id, driving};
    case 'horizontal':
      return r.length===1 ? {type:'horizontal_l',  id, l_id:r[0].id, driving}
                          : {type:'horizontal_pp', id, p1_id:r[0].id, p2_id:r[1].id, driving};
    case 'vertical':
      return r.length===1 ? {type:'vertical_l',  id, l_id:r[0].id, driving}
                          : {type:'vertical_pp', id, p1_id:r[0].id, p2_id:r[1].id, driving};
    case 'parallel':      return {type:'parallel',         id, l1_id:r[0].id, l2_id:r[1].id, driving};
    case 'perpendicular': return {type:'perpendicular_ll', id, l1_id:r[0].id, l2_id:r[1].id, driving};
    case 'equal': {
      const [a,b]=r;
      if (a.type==='line'  &&b.type==='line')   return {type:'equal_length',    id, l1_id:a.id, l2_id:b.id, driving};
      if (a.type==='circle'&&b.type==='circle') return {type:'equal_radius_cc', id, c1_id:a.id, c2_id:b.id, driving};
      if (a.type==='arc'   &&b.type==='arc')    return {type:'equal_radius_aa', id, a1_id:a.id, a2_id:b.id, driving};
      if (a.type==='circle'&&b.type==='arc')    return {type:'equal_radius_ca', id, c_id:a.id,  a_id:b.id,  driving};
      if (a.type==='arc'   &&b.type==='circle') return {type:'equal_radius_ca', id, c_id:b.id,  a_id:a.id,  driving};
      return null;
    }
    case 'distance': {
      const val=c.value;
      if (r.length===1&&r[0].p1) return {type:'p2p_distance', id, p1_id:r[0].p1.id, p2_id:r[0].p2.id, distance:val, driving};
      if (r.length===2)           return {type:'p2p_distance', id, p1_id:r[0].id,    p2_id:r[1].id,    distance:val, driving};
      return null;
    }
    case 'radius':
      if (r[0].type==='circle') return {type:'circle_radius', id, c_id:r[0].id, radius:c.value, driving};
      if (r[0].type==='arc')    return {type:'arc_radius',    id, a_id:r[0].id, radius:c.value, driving};
      return null;
    case 'angle': {
      const rad=c.value*Math.PI/180;
      if (r.length===2) return {type:'l2l_angle_ll', id, l1_id:r[0].id, l2_id:r[1].id, angle:rad, driving};
      return null;
    }
    case 'tangent': {
      const [a,b]=r;
      const isCurve=e=>e.type==='circle'||e.type==='arc';
      const curve=isCurve(a)?a:b, other=curve===a?b:a;
      if (other.type==='line')
        return {type:'p2l_distance', id, p_id:curve.centre.id, l_id:other.id,
                distance:{o_id:curve.id, prop:'radius'}, driving};
      if (isCurve(other))
        return {type:'tangent_circumf', id,
                p1_id:a.centre.id, p2_id:b.centre.id,
                rd1:{o_id:a.id, prop:'radius'}, rd2:{o_id:b.id, prop:'radius'},
                internal:false, driving};
      return null;
    }
    case 'symmetric':
      if (r.length===3 && r[2].type==='point')
        return {type:'p2p_symmetric_ppp', id, p1_id:r[0].id, p2_id:r[1].id, p_id:r[2].id, driving};
      if (r.length===3 && r[2].type==='line')
        return {type:'p2p_symmetric_ppl', id, p1_id:r[0].id, p2_id:r[1].id, l_id:r[2].id, driving};
      return null;
    case 'point_on_line':   return {type:'point_on_line_pl', id, p_id:r[0].id, l_id:r[1].id, driving};
    case 'point_on_circle': return {type:'p2p_distance',     id, p1_id:r[0].id, p2_id:r[1].centre.id,
                                    distance:{o_id:r[1].id, prop:'radius'}, driving};
    case 'fixed': return null; // handled via point.fixed flag
    default: return null;
  }
}

// ── Debug log buffer ────────────────────────────────────────────────────────
const _debugLog = [];
function dbg(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  _debugLog.push(line);
  if (_debugLog.length > 2000) _debugLog.shift(); // cap at 2000 lines
}
function downloadDebugLog() {
  const content = _debugLog.join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
  a.download = 'sketchtool-debug.log';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function solvePlanegcs(sk) {
  const pg = typeof window!=='undefined' ? window.__planegcs : null;
  if (!pg) { dbg(`solvePlanegcs: no planegcs — init error: ${window.__planegcsError ?? 'unknown'}`); return null; }

  const {mod, GcsWrapper} = pg;

  // Build a fresh GCS, solve, read results back into sk.
  // Returns {status:'ok'|'near_miss'|'conflict', redundantIds:[]}
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

      // Drag: a single temporary coincident constraint to the mouse target.
      // planegcs enforces it only as far as it doesn't conflict with the real
      // constraints, and uses a drag-optimised solving algorithm automatically.
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

function solve(sk) {
  const pgResult = solvePlanegcs(sk);
  if (pgResult !== null) {
    for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();
    return pgResult;
  }

  // ── Gauss-Seidel fallback ────────────────────────────────────────
  const fs=new Set();
  for (const e of sk.reserved) if (e.type==='point') fs.add(e);
  for (const c of sk.constraints) if (c.type==='fixed'&&!c.driven&&!c.disabled) fs.add(c.refs[0]);
  if (sk._dragFixed) fs.add(sk._dragFixed);
  // Propagate fixedness through already-satisfied coincident constraints.
  // Only propagate if the points are close — a newly-placed coincident hasn't been
  // enforced yet, and the point must remain free so the solver can move it.
  { let chg=true; while(chg){ chg=false; for(const c of sk.constraints){
    if(c.type!=='coincident'||c.disabled) continue;
    const[a,b]=c.refs;
    if(Math.hypot(a.x-b.x,a.y-b.y)>1) continue; // unsatisfied — don't propagate yet
    if(fs.has(a)&&!fs.has(b)){fs.add(b);chg=true;}
    if(fs.has(b)&&!fs.has(a)){fs.add(a);chg=true;}
  } } }

  const snap=[...sk.points.values()].map(p=>({p,x:p.x,y:p.y}));

  for (let i=0;i<80;i++) for (const c of sk.constraints) { if (!c.disabled) c.apply(fs); }

  // Radius sync: let a constrained point_on_circle drive the radius when no explicit radius constraint
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

// ═══════════════════════════════════════════════════════════════════
// CAMERA  (Y-up world → Y-down screen)
// ═══════════════════════════════════════════════════════════════════

class Camera {
  constructor(){ this.scale=1; this.tx=0; this.ty=0; }
  toScreen(wx,wy){ return {x:wx*this.scale+this.tx, y:-wy*this.scale+this.ty}; }
  toWorld(sx,sy) { return {x:(sx-this.tx)/this.scale, y:-(sy-this.ty)/this.scale}; }
  pan(dx,dy)  { this.tx+=dx; this.ty+=dy; }
  zoom(f,cx,cy){ this.tx=cx+(this.tx-cx)*f; this.ty=cy+(this.ty-cy)*f; this.scale*=f; }
  recenter(w,h){ this.tx=w/2; this.ty=h/2; this.scale=1; }
  fitToContent(sk, w, h, margin=60) {
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    const expand=(x,y)=>{if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;};

    // Points (skip reserved/construction)
    for(const p of sk.points.values()){
      if(!p.reserved&&!p.construction) expand(p.x,p.y);
    }
    // Circles
    for(const c of sk.circles.values()){
      if(c.construction) continue;
      expand(c.centre.x-c.radius, c.centre.y);
      expand(c.centre.x+c.radius, c.centre.y);
      expand(c.centre.x, c.centre.y-c.radius);
      expand(c.centre.x, c.centre.y+c.radius);
    }
    // Arcs — start/end pts + any cardinal axis the arc passes through
    for(const a of sk.arcs.values()){
      if(a.construction) continue;
      expand(a.startPt.x, a.startPt.y);
      expand(a.endPt.x,   a.endPt.y);
      const sa=a.startAngle, ea=a.endAngle;
      const s=((ea-sa)+2*Math.PI)%(2*Math.PI);
      const drawCCW=a.inverted ? s>Math.PI : s<=Math.PI;
      for(const ang of [0, Math.PI/2, Math.PI, 3*Math.PI/2]){
        const fromStart=((ang-sa)+2*Math.PI)%(2*Math.PI);
        if(drawCCW ? fromStart<=s : fromStart>=s)
          expand(a.centre.x+a.radius*Math.cos(ang), a.centre.y+a.radius*Math.sin(ang));
      }
    }

    if(!isFinite(x0)){ this.recenter(w,h); return; }
    const pw=x1-x0||1, ph=y1-y0||1;
    this.scale=Math.min((w-margin*2)/pw,(h-margin*2)/ph);
    this.tx=w/2-((x0+x1)/2)*this.scale;
    this.ty=h/2+((y0+y1)/2)*this.scale;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SKETCH  (orchestrator)
// ═══════════════════════════════════════════════════════════════════

class Sketch {
  constructor() {
    this.points=new Map(); this.lines=new Map(); this.circles=new Map(); this.arcs=new Map();
    this.constraints=[]; this.reserved=new Set();
    this._undoStack=[]; this.conflictState=null;
    this.lastValidState=null; this.solveResult=null;
    this._listeners=[]; this._seq={point:0,line:0,circle:0,arc:0};
    this.origin=initOrigin(this);
  }
  onChange(fn){ this._listeners.push(fn); }
  _notify()   { for (const fn of this._listeners) fn(); }
  markDirty() {
    if (this._batchDepth > 0) return;
    this._solveAndNotify();
  }
  _beginBatch() { this._batchDepth = (this._batchDepth||0) + 1; }
  _endBatch()   { if (--this._batchDepth === 0) this._solveAndNotify(); }

  _solveAndNotify() {
    const r=solve(this); this.solveResult=r;
    const degenerate=this._checkDegenerate();
    // planegcs returns 'conflict'; GS returns 'overconstrained' — both mean restore
    if (r.status==='overconstrained' || r.status==='conflict' || degenerate) {
      if (!this.conflictState)
        this.conflictState={
          trigger: degenerate ?? this.constraints[this.constraints.length-1] ?? null,
          reason: degenerate ? 'degenerate' : 'conflict',
          ghostState: this._snapPos()
        };
      if (this.lastValidState) this._restorePos(this.lastValidState);
    } else {
      this.conflictState=null;
      this.lastValidState=this._snapPos();
    }
    this._notify();
  }

  /** Returns the offending entity if any geometry has collapsed to a degenerate state. */
  _checkDegenerate() {
    const EPS=0.5; // world units — 0.005mm
    for (const ln of this.lines.values()) {
      if (this.reserved.has(ln)) continue;
      const len=Math.sqrt((ln.p2.x-ln.p1.x)**2+(ln.p2.y-ln.p1.y)**2);
      if (len<EPS) return ln;
    }
    for (const ci of this.circles.values()) {
      if (ci.radius<EPS) return ci;
    }
    for (const a of this.arcs.values()) {
      if (a.radius<EPS) return a;
    }
    // Spatial hash: bucket points by quantised cell, then only check neighbouring cells
    const pts=[...this.points.values()].filter(p=>!p.reserved);
    const hash=new Map();
    const cellKey=(x,y)=>`${Math.floor(x/EPS)},${Math.floor(y/EPS)}`;
    for (const p of pts) {
      const k=cellKey(p.x,p.y);
      if (!hash.has(k)) hash.set(k,[]);
      hash.get(k).push(p);
    }
    for (const p of pts) {
      const cx=Math.floor(p.x/EPS), cy=Math.floor(p.y/EPS);
      for (let dx=-1;dx<=1;dx++) for (let dy=-1;dy<=1;dy++) {
        for (const q of (hash.get(`${cx+dx},${cy+dy}`)??[])) {
          if (q.id<=p.id) continue; // each pair once
          const ddx=q.x-p.x, ddy=q.y-p.y;
          if (ddx*ddx+ddy*ddy < EPS*EPS) {
            // Direct: p-q coincident or distance
            const direct=[...p._constraints].some(c=>
              (c.type==='coincident'||c.type==='distance')&&c.refs.includes(q)
            );
            // Transitive: both p and q are coincident with the same third point (e.g. origin)
            const pTargets=new Set([...p._constraints].filter(c=>c.type==='coincident').flatMap(c=>c.refs.filter(r=>r!==p)));
            const transitive=[...q._constraints].some(c=>c.type==='coincident'&&c.refs.some(r=>r!==q&&pTargets.has(r)));
            if (!direct&&!transitive) return p;
          }
        }
      }
    }
    return null;
  }

  _execute(fn) {
    if (this.conflictState) return null;
    const {result,undo}=fn();
    this._undoStack.push(undo);
    if (this._undoStack.length>50) this._undoStack.shift();
    this._solveAndNotify();
    return result;
  }

  undo() {
    if (!this._undoStack.length) return;
    if (this.conflictState){ this.conflictState=null; if(this.lastValidState) this._restorePos(this.lastValidState); }
    this._undoStack.pop()();
    this._solveAndNotify();
  }

  addPoint(x,y,opts={}){
    return this._execute(()=>{ const p=this._mkPt(x,y,opts); return {result:p, undo:()=>p.delete()}; });
  }
  addLine({p1,p2},opts={}){
    return this._execute(()=>{ const l=this._mkLn(p1,p2,opts); return {result:l, undo:()=>l.delete()}; });
  }
  addCircle({centre,radius},opts={}){
    return this._execute(()=>{ const c=this._mkCi(centre,radius,opts); return {result:c, undo:()=>c.delete()}; });
  }
  addArc({centre,radius,startPt,endPt},opts={}) {
    return this._execute(()=>{ const a=this._mkAr(centre,radius,startPt,endPt,opts); return {result:a,undo:()=>a.delete()}; });
  }
  addConstraint(type,refs,value=null,driven=false) {
    if (!driven&&this.constraints.some(c=>c.type===type&&c.refs.length===refs.length&&c.refs.every((r,i)=>r===refs[i])))
      return null; // exact duplicate
    const c=this._execute(()=>{ const c=this._mkC(type,refs,value,driven); return {result:c, undo:()=>c.delete()}; });
    if (!c) return null; // blocked by conflict state
    // If planegcs flagged this constraint as redundant, roll it back immediately
    if (this.solveResult?.redundantIds?.includes(c.id)) {
      this.constraintError={type:'redundant',constraintType:type};
      this.undo();
      return null;
    }
    this.constraintError=null;
    return c;
  }
  deleteConstraint(c){
    // Restore the original constraint object (keeps ID, varRef, disabled state etc.)
    const sk = this;
    c.delete();
    this._undoStack.push(()=>{
      c._sketch = sk;
      sk.constraints.push(c);
      for (const r of c.refs) r._constraints?.add(c);
      sk._solveAndNotify();
    });
    this._solveAndNotify();
  }
  deleteEntity(e) {
    const sk = this;
    // Capture every constraint that will be cascade-deleted
    const constraintsBefore = [...sk.constraints];
    this._beginBatch();
    e.delete();
    const afterSet = new Set(sk.constraints);
    const deletedConstraints = constraintsBefore.filter(c => !afterSet.has(c));
    this._undoStack.push(() => {
      // Re-insert entity into the correct collection and re-wire point back-refs
      switch(e.type) {
        case 'line':
          sk.lines.set(e.id, e);
          e.p1.lines.add(e); e.p2.lines.add(e);
          break;
        case 'circle':
          sk.circles.set(e.id, e);
          e.centre.circles.add(e);
          break;
        case 'arc':
          sk.arcs.set(e.id, e);
          e.centre.circles.add(e);
          e.startPt.circles.add(e); e.endPt.circles.add(e);
          break;
      }
      // Restore every constraint that was cascade-deleted
      for (const c of deletedConstraints) {
        c._sketch = sk;
        sk.constraints.push(c);
        for (const r of c.refs) r._constraints?.add(c);
      }
      sk._solveAndNotify();
    });
    this._endBatch();
  }
  setConstraintValue(c,v){ const old=c.value; c.value=v; this._undoStack.push(()=>{c.value=old;this._solveAndNotify();}); this._solveAndNotify(); }

  _mkPt(x,y,opts={}){ const name=opts.name??`Point ${++this._seq.point}`; const p=new SketchPoint(x,y,{...opts,name}); p._sketch=this; this.points.set(p.id,p); return p; }
  _mkLn(p1,p2,opts={}){ const name=opts.name??`Line ${++this._seq.line}`; const l=new SketchLine(p1,p2,{...opts,name}); l._sketch=this; this.lines.set(l.id,l); return l; }
  _mkCi(c,r,opts={}){ const name=opts.name??`Circle ${++this._seq.circle}`; const ci=new SketchCircle(c,r,{...opts,name}); ci._sketch=this; this.circles.set(ci.id,ci); return ci; }
  _mkAr(centre,radius,startPt,endPt,opts={}){ const name=opts.name??`Arc ${++this._seq.arc}`; const a=new SketchArc(centre,radius,startPt,endPt,{...opts,name}); a._sketch=this; this.arcs.set(a.id,a); return a; }
  _mkC(type,refs,value,driven){ const c=makeConstraint(type,refs,value,driven); c._attachToSketch(this); this.constraints.push(c); return c; }
  _snapPos(){
    const s={};
    for(const[id,p]of this.points) s[id]={x:p.x,y:p.y};
    for(const[id,ci]of this.circles) s[id]={r:ci.radius};
    for(const[id,a]of this.arcs) s[id]={r:a.radius};
    return s;
  }
  _restorePos(s){
    for(const[id,p]of this.points){const v=s[id];if(v){p.x=v.x;p.y=v.y;}}
    for(const[id,ci]of this.circles){const v=s[id];if(v) ci.radius=v.r;}
    for(const[id,a]of this.arcs){const v=s[id];if(v) a.radius=v.r;}
  }

  // ── Serialisation ──────────────────────────────────────────────────
  toJSON() {
    const pts={}, lns={}, cis={}, ars={}, cs=[];
    for(const[id,p] of this.points) if(!p.reserved) pts[id]={id,x:p.x,y:p.y,name:p.name,construction:!!p.construction};
    for(const[id,l] of this.lines)  if(!this.reserved.has(l)) lns[id]={id,p1:l.p1.id,p2:l.p2.id,name:l.name,construction:!!l.construction};
    for(const[id,c] of this.circles) cis[id]={id,centre:c.centre.id,radius:c.radius,name:c.name,construction:!!c.construction};
    for(const[id,a] of this.arcs)   ars[id]={id,centre:a.centre.id,startPt:a.startPt.id,endPt:a.endPt.id,radius:a.radius,inverted:a.inverted,throughPt:a.throughPt?.id??null,name:a.name,construction:!!a.construction};
    for(const c of this.constraints) if(!c.driven||c.locked) cs.push({id:c.id,type:c.type,refs:c.refs.map(r=>r.id??r),value:c.value,varRef:c.varRef??null,driven:!!c.driven,locked:!!c.locked,disabled:!!c.disabled,name:c.name??null});
    return {points:pts,lines:lns,circles:cis,arcs:ars,constraints:cs};
  }

  static fromJSON(j) {
    const sk = new Sketch();
    const byId = {};
    // Restore points
    for(const[id,p] of Object.entries(j.points??{})){
      const pt=sk._mkPt(p.x,p.y,{construction:p.construction,name:p.name});
      // Override auto-id to match saved id
      sk.points.delete(pt.id); pt.id=id; sk.points.set(id,pt); byId[id]=pt;
    }
    // Restore lines
    for(const[id,l] of Object.entries(j.lines??{})){
      const p1=byId[l.p1],p2=byId[l.p2]; if(!p1||!p2) continue;
      const ln=sk._mkLn(p1,p2,{construction:l.construction,name:l.name});
      sk.lines.delete(ln.id); ln.id=id; sk.lines.set(id,ln); byId[id]=ln;
    }
    // Restore circles
    for(const[id,c] of Object.entries(j.circles??{})){
      const ctr=byId[c.centre]; if(!ctr) continue;
      const ci=sk._mkCi(ctr,c.radius,{construction:c.construction,name:c.name});
      sk.circles.delete(ci.id); ci.id=id; sk.circles.set(id,ci); byId[id]=ci;
    }
    // Restore arcs
    for(const[id,a] of Object.entries(j.arcs??{})){
      const ctr=byId[a.centre],sp=byId[a.startPt],ep=byId[a.endPt]; if(!ctr||!sp||!ep) continue;
      const arc=sk._mkAr(ctr,a.radius,sp,ep,{inverted:a.inverted,construction:a.construction,name:a.name});
      sk.arcs.delete(arc.id); arc.id=id; sk.arcs.set(id,arc); byId[id]=arc;
      if(a.throughPt) arc.throughPt=byId[a.throughPt]??null;
    }
    // Restore constraints
    for(const c of (j.constraints??[])){
      const refs=c.refs.map(r=>byId[r]).filter(Boolean); if(!refs.length) continue;
      const nc=sk._mkC(c.type,refs,c.value,c.driven);
      nc.locked=c.locked; nc.disabled=!!c.disabled; nc.name=c.name; nc.varRef=c.varRef??null;
      nc.id=c.id;
    }
    sk._solveAndNotify();
    return sk;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ANALYTICAL PICKING
// ═══════════════════════════════════════════════════════════════════

function getEntitiesInRect(sk, x0, y0, x1, y1) {
  const minX=Math.min(x0,x1), maxX=Math.max(x0,x1);
  const minY=Math.min(y0,y1), maxY=Math.max(y0,y1);
  const ids=new Set();
  for (const pt of sk.points.values()) {
    if (pt.reserved) continue;
    if (pt.x>=minX&&pt.x<=maxX&&pt.y>=minY&&pt.y<=maxY) ids.add(pt.id);
  }
  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln)) continue;
    if ((ln.p1.x>=minX&&ln.p1.x<=maxX&&ln.p1.y>=minY&&ln.p1.y<=maxY)||
        (ln.p2.x>=minX&&ln.p2.x<=maxX&&ln.p2.y>=minY&&ln.p2.y<=maxY))
      ids.add(ln.id);
  }
  for (const ci of sk.circles.values()) {
    if (ci.centre.x>=minX&&ci.centre.x<=maxX&&ci.centre.y>=minY&&ci.centre.y<=maxY)
      ids.add(ci.id);
  }
  for (const a of sk.arcs.values()) {
    // Include arc if any of its three defining points are in the rect
    for (const pt of [a.centre,a.startPt,a.endPt]) {
      if (pt.x>=minX&&pt.x<=maxX&&pt.y>=minY&&pt.y<=maxY){ ids.add(a.id); break; }
    }
  }
  return ids;
}

/**
 * After placing a brand-new point, check if it's within snapR of:
 *   - an existing point → coincident
 *   - an existing line body → point_on_line
 * Only fires for genuinely new points (snapToPoint already handles exact reuse).
 */
function autoConstrainNewPoint(pt, sk, snapR) {
  // Point proximity → coincident (includes origin)
  for (const q of sk.points.values()) {
    if (q===pt) continue;
    if (q.reserved && !SELECTABLE_RESERVED.has(q.id)) continue;
    const dx=q.x-pt.x, dy=q.y-pt.y;
    if (dx*dx+dy*dy < snapR*snapR) {
      sk.addConstraint('coincident',[pt,q]);
      return;
    }
  }
  // Line proximity → point_on_line (includes axes)
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

/** Compute arc draw flags from geometry.
 *  If arc.throughPt is set, derives direction from that point (3P/3T arcs).
 *  Otherwise falls back to arc.inverted (centre arcs). */
function arcDrawFlags(arc) {
  const sa=arc.startAngle, ea=arc.endAngle;
  const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
  let inverted=arc.inverted;
  if(arc.throughPt){
    const tp=arc.throughPt;
    const ta=Math.atan2(tp.y-arc.centre.y, tp.x-arc.centre.x);
    const tOnCCW=((ta-sa)+2*Math.PI)%(2*Math.PI)<=span;
    inverted=tOnCCW!==(span<=Math.PI);
  }
  const shortIsCCW=span<=Math.PI;
  const drawCCW=inverted ? !shortIsCCW : shortIsCCW;
  return {sa,ea,span,inverted,drawCCW,largeArc:inverted?1:0,sweepFlag:drawCCW?0:1};
}

function pick(wx,wy,sk,snapR) {
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

function snapToPoint(wx,wy,sk,snapR,exclude=null) {
  let best=null, bd=snapR*snapR;
  for (const p of sk.points.values()) {
    if (p.reserved||p===exclude) continue;
    const d=(p.x-wx)**2+(p.y-wy)**2;
    if (d<bd){bd=d;best=p;}
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════
// COLORS & ICONS
// ═══════════════════════════════════════════════════════════════════

const C = {
  bg:'#0d1117', panel:'#090e18', border:'#1e2a3a',
  text:'#c9d1e0', muted:'#3d5068', dim:'#1a2438',
  axisX:'rgba(255,80,80,0.5)', axisY:'rgba(80,255,80,0.5)',
  origin:'#ffffff',
  // Geometry states — white=unconstrained, blue=partial, green=fully constrained
  geomFree:   '#e8eaf0',   // unconstrained — near-white
  geomPartial:'#4488ff',   // exactly constrained (cost === DOF) — blue
  geomFull:   '#3ddc84',   // sketch at DOF=0 — green
  geomOver:   '#ff6040',   // overconstrained (cost > DOF) — orange-red
  geom:       '#4488ff',   // alias used by export / ghost / preview
  sel:        '#ffd740',   // selected — amber, none of the above
  construction:'#2d4a7a',  // construction geometry — dim blue
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

// Entity geometry color.
// Blue = entity's own DOF fully consumed by its constraints.
// White = entity still has freedom.  Green = whole sketch at DOF=0.
// Constraint types that directly govern an entity's own parameters.
const ENTITY_DOF_TYPES = new Set([
  'horizontal','vertical','parallel','perpendicular',
  'equal','distance','radius','angle','tangent','symmetric',
]);

// Compute per-entity DOF state via fixed-point iteration.
// point_on_circle / point_on_line only count toward a point's DOF
// if the referenced entity is itself fully constrained (DOF = 0).
// Returns Map<entityId, 'free'|'blue'|'over'>.
function computeEntityStates(sk) {
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

function entityDOF(entity) {
  if (entity.p1 && entity.p2 && !entity.centre) return 4;
  if (entity.centre && !entity.startPt) return 3;
  return 6;
}

function geomColor(entity, isSel, sk, states, dimmed=false) {
  if (dimmed) return entity.construction ? C.construction : '#2a3a4a'; // greyed in constraints mode
  if (isSel) return C.sel;
  if (entity.construction) return C.construction;
  if (sk?.solveResult?.status === 'ok' && sk?.solveResult?.dof === 0) return C.geomFull;
  const s = states?.get(entity.id);
  if (s === 'blue' || s === 'over') return C.geomPartial; // over shows blue; red reserved for conflict
  return C.geomFree;
}

const CICONS = {
  fixed:'⚓',horizontal:'—',vertical:'|',coincident:'⊙',equal:'=',parallel:'∥',
  perpendicular:'⊥',distance:'↔',radius:'R',angle:'∠',tangent:'⌒',symmetric:'⇔',
  point_on_line:'∈',point_on_circle:'◎',
  attach:'⊙',  // dispatches to coincident / point_on_line / point_on_circle
};

// ═══════════════════════════════════════════════════════════════════
// GRID RENDERER
// ═══════════════════════════════════════════════════════════════════

function GridLines({cam, W, H}) {
  const tl=cam.toWorld(0,0), br=cam.toWorld(W,H);
  const minX=Math.min(tl.x,br.x), maxX=Math.max(tl.x,br.x);
  const minY=Math.min(tl.y,br.y), maxY=Math.max(tl.y,br.y);
  const worldW=maxX-minX;
  const raw=worldW/10;
  const mag=Math.pow(10,Math.floor(Math.log10(Math.max(raw,0.0001))));
  const norm=raw/mag;
  const spacing=mag*(norm<2?1:norm<5?2:5);
  if (spacing<=0) return null;

  const lines=[];
  const sx=Math.ceil(minX/spacing)*spacing;
  for (let wx=sx; wx<=maxX; wx+=spacing) {
    const s1=cam.toScreen(wx,maxY), s2=cam.toScreen(wx,minY);
    lines.push(<line key={`v${wx}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke="#1a2538" strokeWidth={0.5}/>);
  }
  const sy=Math.ceil(minY/spacing)*spacing;
  for (let wy=sy; wy<=maxY; wy+=spacing) {
    const s1=cam.toScreen(minX,wy), s2=cam.toScreen(maxX,wy);
    lines.push(<line key={`h${wy}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke="#1a2538" strokeWidth={0.5}/>);
  }
  return <>{lines}</>;
}

// ═══════════════════════════════════════════════════════════════════
// SVG SKETCH VIEW
// ═══════════════════════════════════════════════════════════════════

function SketchView({sk, cam, sel, lineStart, circleCenter, mouseWorld, W, H, selectMode='tap', onConstraintTap}) {
  const states = computeEntityStates(sk);
  const inConstraintMode = selectMode==='constraints';

  // Helper: render a constraint icon — small normally, large+tappable in constraints mode
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

  // ── Axes ──────────────────────────────────────────────────────────
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
  // Origin cross
  const o=cam.toScreen(0,0);
  elems.push(<g key="orig" opacity={oSel?1:0.5}>
    <line x1={o.x-7} y1={o.y} x2={o.x+7} y2={o.y}
      stroke={oSel?C.sel:'#ffffff'} strokeWidth={oSel?2:1}/>
    <line x1={o.x} y1={o.y-7} x2={o.x} y2={o.y+7}
      stroke={oSel?C.sel:'#ffffff'} strokeWidth={oSel?2:1}/>
    {oSel&&<circle cx={o.x} cy={o.y} r={5} fill="none" stroke={C.sel} strokeWidth={1.5}/>}
  </g>);

  // ── Lines ─────────────────────────────────────────────────────────
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
    // constraint icons — skip construction lines (spokes etc. are implementation detail)
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
    // length on hover/select
    if (isSel) {
      elems.push(<text key={`len${ln.id}`} x={mp.x+nx*2.5} y={mp.y+ny*2.5}
        fontSize={9} fill={C.muted} textAnchor="middle" dominantBaseline="middle"
        style={{pointerEvents:'none'}}>{(ln.length*0.01).toFixed(2)}mm</text>);
    }
  }

  // ── Circles ───────────────────────────────────────────────────────
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

  // ── Arcs ──────────────────────────────────────────────────────────
  for (const arc of sk.arcs.values()) {
    const ss=cam.toScreen(arc.startPt.x,arc.startPt.y);
    const se=cam.toScreen(arc.endPt.x,arc.endPt.y);
    const sr=arc.radius*cam.scale;
    const isSel=sel.has(arc.id)||sel.has(arc.centre.id)||sel.has(arc.startPt.id)||sel.has(arc.endPt.id);
    const stroke=geomColor(arc, inConstraintMode?false:isSel, sk, states, inConstraintMode);
    // Compute draw flags — uses throughPt for 3P/3T arcs, inverted for centre arcs
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

  // ── Points ────────────────────────────────────────────────────────
  for (const pt of sk.points.values()) {
    if (pt.reserved) continue;
    const sp=cam.toScreen(pt.x,pt.y);
    const isSel=sel.has(pt.id);
    const isFixed=sk.constraints.some(c=>c.type==='fixed'&&c.refs[0]===pt&&!c.disabled);
    const isActive=pt===lineStart||pt===circleCenter;
    const skFull = sk?.solveResult?.status==='ok' && sk?.solveResult?.dof===0;
    // Point DOF: sum constraint costs, applying same point_on_X rule
    const ptCost = [...(pt._constraints??[])].reduce((s,c)=>
      s+(!c.disabled&&!c.driven ? c._dofCost??1 : 0), 0);
    const fill = isSel    ? C.sel
               : isFixed  ? C.fixed
               : isActive ? C.geomFull
               : skFull   ? C.geomFull
               : ptCost>=2 ? C.geomPartial   // over and exact both show blue
               : C.geomFree;
    if (isFixed) elems.push(<rect key={`fp${pt.id}`} x={sp.x-7} y={sp.y-7} width={14} height={14} fill="none" stroke={C.fixed} strokeWidth={1} opacity={0.6}/>);
    elems.push(<circle key={pt.id} cx={sp.x} cy={sp.y} r={isSel||isActive?7:5} fill={fill}/>);
    // pt name on select
    if (isSel) elems.push(<text key={`pn${pt.id}`} x={sp.x+9} y={sp.y-8} fontSize={9} fill={C.muted} style={{pointerEvents:'none'}}>{pt.name}</text>);
    // constraint icons near point (coincident, fixed — point_on_line/circle are shown on the other entity)
    let ptIconIdx=0;
    pt._constraints.forEach(c=>{
      if(c.type==='point_on_line') return;
      const ix=ptIconIdx++;
      elems.push(constraintIcon(c, sp.x+14+ix*24, sp.y-14, `ptci${c.id}_${pt.id}`));
    });
  }

  // ── Tool previews ─────────────────────────────────────────────────
  if (lineStart&&mouseWorld) {
    const s1=cam.toScreen(lineStart.x,lineStart.y), s2=cam.toScreen(mouseWorld.x,mouseWorld.y);
    elems.push(<line key="prev_line" x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke={C.geom} strokeWidth={1} strokeDasharray="5 4" opacity={0.5}/>);
    // snap indicator
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

// ═══════════════════════════════════════════════════════════════════
// SHARED BUTTON STYLES
// ═══════════════════════════════════════════════════════════════════

const BTN={background:'none',border:`1px solid #1e2a3a`,borderRadius:6,
  cursor:'pointer',fontFamily:'monospace',fontSize:12,lineHeight:1,
  display:'flex',alignItems:'center',justifyContent:'center',padding:'8px 12px'};
const BTN_SMALL={background:'none',border:'none',cursor:'pointer',
  fontFamily:'monospace',fontSize:14,lineHeight:1,padding:'4px',
  minWidth:32,minHeight:32,display:'flex',alignItems:'center',justifyContent:'center'};

// ═══════════════════════════════════════════════════════════════════
// CONSTRAINT LIST  (content — rendered inside bottom sheet)
// ═══════════════════════════════════════════════════════════════════

function ConstraintList({sk, sel, onDelete, onToggleLocked, onToggleDisabled, onEdit}) {
  const cs=sk.constraints;
  const sorted=[...cs].sort((a,b)=>{
    const aRel=a.refs.some(r=>sel.has(r.id));
    const bRel=b.refs.some(r=>sel.has(r.id));
    return bRel-aRel;
  });
  const EDITABLE = new Set(['distance','radius','angle']);
  return (
    <div style={{flex:1,overflowY:'auto'}}>
      {cs.length===0&&<div style={{fontSize:12,color:C.muted,padding:'16px',textAlign:'center',fontStyle:'italic'}}>No constraints yet</div>}
      {sorted.map(c=>{
        const isRel=sel.has(c.id)||c.refs.some(r=>sel.has(r.id));
        const dim = EDITABLE.has(c.type);
        return (
          <div key={c.id} style={{
            display:'flex',alignItems:'center',gap:6,padding:'9px 12px',
            background:isRel?'#0f1f38':c.disabled?'#0a0e18':'#0a1220',
            borderBottom:`1px solid ${C.border}`,
            borderLeft:`3px solid ${c.disabled?C.muted:C.cc[c.type]||'#334'}`,
            opacity:c.disabled?0.5:1,
          }}>
            <span style={{fontSize:15,color:c.disabled?C.muted:C.cc[c.type]||'#aaa',
              flexShrink:0,width:20,textAlign:'center'}}>{CICONS[c.type]||'?'}</span>
            <span style={{fontSize:11,color:c.disabled?C.muted:c.driven?C.driven:'#7a96b0',
              flex:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
              {c.description}{c.disabled?' (off)':''}
            </span>
            {dim&&onEdit&&(
              <button onClick={()=>onEdit(c)} title="Edit value"
                style={{...BTN_SMALL,color:c.disabled?C.muted:'#5090d0',fontSize:14}}>✎</button>
            )}
            <button onClick={()=>onToggleDisabled(c)} title={c.disabled?'Enable':'Disable'}
              style={{...BTN_SMALL,color:c.disabled?'#50a050':C.muted,fontSize:13}}>
              {c.disabled?'●':'○'}
            </button>
            <button onClick={()=>onToggleLocked(c)} title={c.locked?'Unlock':'Lock'}
              style={{...BTN_SMALL,color:c.locked?'#f0c040':C.muted}}>
              {c.locked?'🔒':'·'}
            </button>
            <button onClick={()=>onDelete(c)}
              style={{...BTN_SMALL,color:'#664444',fontSize:18}}>×</button>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONFLICT BANNER
// ═══════════════════════════════════════════════════════════════════

function ConflictBanner({sk, onUndo}) {
  const trigger=sk.conflictState?.trigger;
  return (
    <div style={{
      position:'absolute',top:0,left:0,right:0,bottom:0,
      background:'rgba(8,12,22,0.72)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:10,backdropFilter:'blur(1px)'
    }}>
      <div style={{
        background:'#130a0a',border:`1px solid #552222`,borderRadius:8,
        padding:'20px 28px',maxWidth:340,textAlign:'center'
      }}>
        <div style={{fontSize:16,color:'#ff5555',marginBottom:8,letterSpacing:'0.05em'}}>⊗ CONFLICT</div>
        {trigger&&<div style={{fontSize:11,color:'#885555',marginBottom:14,fontFamily:'monospace'}}>
          Adding <span style={{color:'#cc6666'}}>{trigger.description}</span> over-constrains the sketch.
        </div>}
        <div style={{fontSize:11,color:'#664444',marginBottom:16}}>
          The sketch is frozen at the last valid state.
        </div>
        <button onClick={onUndo} style={{
          background:'#1a0a0a',border:'1px solid #553333',borderRadius:5,
          color:'#ff7070',padding:'8px 20px',cursor:'pointer',fontSize:12,
          letterSpacing:'0.05em',fontFamily:'monospace'
        }}>↩ Undo last change</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DIMENSION INPUT
// ═══════════════════════════════════════════════════════════════════

function DimInput({pending, onConfirm, onCancel}) {
  const isAngle   = pending.type==='angle';
  const isInteger = pending.type==='_ngon_sides';

  // Convert internal → display
  const toDisplay=(internal,u)=>{
    if(isInteger) return String(Math.round(parseFloat(internal))||6);
    const n=parseFloat(internal); if(isNaN(n)) return '0';
    if(isAngle) return u==='deg'?n.toFixed(2):(n*Math.PI/180).toFixed(5);
    const mm=n*0.01;
    return u==='mm'?mm.toFixed(2):(mm/25.4).toFixed(4);
  };
  // Convert display → internal
  const toInternal=(display,u)=>{
    if(isInteger){ const n=parseInt(display); return isNaN(n)||n<3?null:n; }
    const n=parseFloat(display); if(isNaN(n)||n<=0) return null;
    if(isAngle) return u==='deg'?n:n*180/Math.PI;
    return u==='mm'?n*100:n*2540;
  };

  const [unit,setUnit]=useState(isAngle?'deg':'mm');
  const [val,setVal]=useState(()=>toDisplay(pending.defaultVal??'0',isAngle?'deg':'mm'));
  const inputRef=useRef();
  useEffect(()=>{ inputRef.current?.focus(); inputRef.current?.select(); },[]);

  const handleUnit=u=>{
    const internal=toInternal(val,unit);
    if(internal!==null) setVal(toDisplay(internal,u));
    setUnit(u);
  };
  const confirm=()=>{ const n=toInternal(val,unit); if(n!==null) onConfirm(n); };
  const unitOpts=isInteger?[]:isAngle?['deg','rad']:['mm','in'];

  return (
    <div style={{position:'absolute',inset:0,background:'rgba(4,8,18,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,
      backdropFilter:'blur(2px)'}}>
      <div style={{background:'#0c1525',border:`1px solid ${C.border}`,borderRadius:12,
        padding:'20px',width:300,boxShadow:'0 8px 32px #000e'}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:'0.1em',marginBottom:14,
          fontFamily:'monospace'}}>{pending.label}</div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}>
          <input ref={inputRef} value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') confirm(); if(e.key==='Escape') onCancel(); }}
            style={{flex:1,background:'#070d18',border:`1px solid ${C.border}`,borderRadius:6,
              color:C.text,padding:'10px 12px',fontSize:20,fontFamily:'monospace',outline:'none'}}/>
          {unitOpts.length>0&&<div style={{display:'flex',flexDirection:'column',gap:4}}>
            {unitOpts.map(u=>(
              <button key={u} onClick={()=>handleUnit(u)}
                style={{padding:'7px 10px',borderRadius:5,cursor:'pointer',fontFamily:'monospace',
                  fontSize:11,border:`1px solid ${unit===u?'#2a5080':C.border}`,
                  background:unit===u?'#1a3050':'transparent',
                  color:unit===u?'#60c0ff':C.muted}}>
                {u}
              </button>
            ))}
          </div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel}
            style={{...BTN,flex:1,height:44,color:C.muted,background:C.dim,justifyContent:'center'}}>
            Cancel
          </button>
          <button onClick={confirm}
            style={{...BTN,flex:1,height:44,color:'#60c0ff',background:'#0d2040',
              border:'1px solid #2a5080',justifyContent:'center'}}>
            ✓ Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════════════

function ConfirmDialog({message, detail, confirmLabel='Confirm', onConfirm, onCancel}) {
  return (
    <div style={{position:'absolute',inset:0,background:'rgba(4,7,14,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',zIndex:40}}>
      <div style={{background:'#0c1525',border:`1px solid ${C.border}`,borderRadius:12,
        padding:'24px 20px',maxWidth:300,width:'90%',textAlign:'center'}}>
        <div style={{fontSize:15,color:C.text,marginBottom:8,fontWeight:'bold'}}>{message}</div>
        {detail&&<div style={{fontSize:12,color:C.muted,marginBottom:20}}>{detail}</div>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel}
            style={{...BTN,flex:1,height:44,color:C.muted,background:C.dim}}>Cancel</button>
          <button onClick={onConfirm}
            style={{...BTN,flex:1,height:44,color:'#ff6666',background:'#1a0808',border:'1px solid #442222'}}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXTUAL CONSTRAINT STRIP
// ═══════════════════════════════════════════════════════════════════

function getDimensionModes(pts, lns, cis, ars=[]) {
  const m = [];
  if (cis.length >= 1 || ars.length >= 1) m.push('radius');
  if (pts.length >= 2 || lns.length >= 1) m.push('distance');
  if (lns.length >= 2) m.push('angle');
  return m;
}

function getApplicableConstraints(sk, sel) {
  const pts   =[...sel].filter(id=>sk.points.has(id)&&!sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const lns   =[...sel].filter(id=>sk.lines.has(id) &&!sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const cis   =[...sel].filter(id=>sk.circles.has(id)).map(id=>sk.circles.get(id));
  const ars   =[...sel].filter(id=>sk.arcs.has(id)).map(id=>sk.arcs.get(id));
  // No user geometry — reference-only selection has nothing to constrain
  if (!pts.length && !lns.length && !cis.length && !ars.length) return [];
  const refPts=[...sel].filter(id=>sk.points.has(id)&& sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const refLns=[...sel].filter(id=>sk.lines.has(id) && sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const allPts=[...pts,...refPts], allLns=[...lns,...refLns];
  const t=new Set();
  if (pts.length>=1) t.add('fixed');
  // attach: user pt + any reference including origin/axes
  if (pts.length>=1 && (allPts.length>=2||allLns.length>=1||cis.length>=1)) t.add('attach');
  // H/V/equal only on user geometry
  // H/V: available for a line OR two points
  if (lns.length>=1 || pts.length>=2) { t.add('horizontal'); t.add('vertical'); }
  if (lns.length>=2) t.add('equal');
  // parallel/perp can reference axes
  if (lns.length>=1 && allLns.length>=2) { t.add('parallel'); t.add('perpendicular'); }
  if (cis.length>=1&&lns.length>=1) t.add('tangent');
  if (ars.length>=1&&(lns.length>=1||cis.length>=1||ars.length>=2)) t.add('tangent');
  if (pts.length>=3) t.add('symmetric');
  if (allPts.length>=2||allLns.length>=1||cis.length>=1||ars.length>=1) t.add('dimension');
  return [...t];
}

function ContextualConstraintStrip({sk, sel, onConstraint, conflict, dimType, dimModes, onCycleDim}) {
  const applicable = sel.size>0 ? getApplicableConstraints(sk,sel) : [];
  const bs = type => ({
    minWidth:52,height:46,display:'flex',flexDirection:'column',
    alignItems:'center',justifyContent:'center',gap:2,
    background:'#0a1628',border:`1px solid ${C.border}`,borderRadius:8,
    cursor:conflict?'not-allowed':'pointer',color:C.cc[type]||'#aaa',
    flexShrink:0,opacity:conflict?0.35:1,
  });
  return (
    <div style={{height:58,display:'flex',alignItems:'center',
      borderTop:`1px solid ${C.border}`,background:C.panel,flexShrink:0}}>
      {applicable.length===0
        ? <div style={{flex:1,textAlign:'center',fontSize:11,color:C.muted,padding:'0 16px'}}>
            {sel.size===0?'Tap geometry to select':'No applicable constraints'}
          </div>
        : <div style={{display:'flex',gap:5,overflowX:'auto',padding:'0 10px',flex:1,
            scrollbarWidth:'none',msOverflowStyle:'none'}}>
            {applicable.map(type=>{
              if (type==='dimension') {
                const active = dimModes.includes(dimType) ? dimType : (dimModes[0]||'distance');
                return (
                  <div key="dimension" style={{display:'flex',gap:2,flexShrink:0}}>
                    <button onClick={()=>!conflict&&onConstraint('dimension', active)}
                      disabled={conflict} title={active} style={bs(active)}>
                      <span style={{fontSize:20,lineHeight:1}}>{CICONS[active]}</span>
                    </button>
                    {dimModes.length>1&&(
                      <button onClick={onCycleDim} disabled={conflict} title="Cycle"
                        style={{...bs('fixed'),minWidth:28,background:'transparent',
                          color:C.muted,fontSize:16,border:'none'}}>↻</button>
                    )}
                  </div>
                );
              }
              return (
                <button key={type} title={type} onClick={()=>!conflict&&onConstraint(type)}
                  disabled={conflict} style={bs(type)}>
                  <span style={{fontSize:20,lineHeight:1}}>{CICONS[type]}</span>
                </button>
              );
            })}
          </div>
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BOTTOM SHEET
// ═══════════════════════════════════════════════════════════════════

function BottomSheet({isOpen, onToggle, sk, sel, onDelete, onToggleLocked, onToggleDisabled, onEdit, onCam}) {
  const ptCount=sk.points.size-5, lnCount=sk.lines.size-2, ciCount=sk.circles.size;
  const cCount=sk.constraints.length;
  const disabledCount=sk.constraints.filter(c=>c.disabled).length;
  return (
    <div style={{
      background:C.panel,borderTop:`1px solid ${C.border}`,flexShrink:0,
      height:isOpen?220:38,transition:'height 0.2s ease',
      display:'flex',flexDirection:'column',overflow:'hidden'
    }}>
      {/* Drag handle row */}
      <div onClick={onToggle} style={{height:38,display:'flex',alignItems:'center',
        justifyContent:'space-between',padding:'0 14px',cursor:'pointer',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:36,height:4,borderRadius:2,background:C.muted,opacity:0.5}}/>
          <span style={{fontSize:11,color:'#6a8aaa',fontFamily:'monospace'}}>
            {cCount} constraint{cCount!==1?'s':''}
            {disabledCount>0&&<span style={{color:C.muted}}> · {disabledCount} off</span>}
            {' · '}{ptCount}pt {lnCount}ln {ciCount}ci
          </span>
        </div>
        <div style={{display:'flex',gap:4}}>
          <button onClick={e=>{e.stopPropagation();onCam('recenter');}}
            title="Recenter" style={{...BTN_SMALL,color:C.muted}}>⌖</button>
          <button onClick={e=>{e.stopPropagation();onCam('fit');}}
            title="Fit to content" style={{...BTN_SMALL,color:C.muted}}>⛶</button>
        </div>
      </div>

      {/* Sheet content */}
      {isOpen&&(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ConstraintList sk={sk} sel={sel}
            onDelete={onDelete} onToggleLocked={onToggleLocked}
            onToggleDisabled={onToggleDisabled} onEdit={onEdit}/>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TOP BAR  (mobile — undo, tool pills, DOF)
// ═══════════════════════════════════════════════════════════════════

const TOOLS=[
  {id:'select',icon:'↖'},
  {id:'point', icon:'·'},
  {id:'line',  icon:'╱'},
  {id:'circle',icon:'○'},
];

// Long-press factory — NOT a hook, safe to call anywhere including inside .map().
// Returns pointer event handlers. Each call creates independent closure state.
function makeLongPress(onTap, onLongPress, ms=420, movePx=8) {
  let timer=null, sx=0, sy=0, fired=false, active=false;
  return {
    onPointerDown(e) {
      active=true; fired=false; sx=e.clientX; sy=e.clientY;
      timer=setTimeout(()=>{ timer=null; fired=true; onLongPress(e); }, ms);
    },
    onPointerMove(e) {
      if(!active) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(dx*dx+dy*dy>movePx*movePx){ clearTimeout(timer); timer=null; active=false; }
    },
    onPointerUp(e) {
      if(timer){ clearTimeout(timer); timer=null; }
      if(active&&!fired) onTap(e);
      active=false;
    },
    onPointerCancel(){ clearTimeout(timer); timer=null; active=false; },
  };
}

function AppTopBar({statusText, sk, conflict, onClear, doc, onSwitchPage, cam, dims}) {
  const [hamOpen, setHamOpen] = useState(false);
  const [hamView, setHamView] = useState('main'); // 'main'|'pages'|'varsets'|'varset'|'addPage'|'addVarset'
  const [editVarsetId, setEditVarsetId] = useState(null);
  const [, rerender] = useReducer(x=>x+1, 0);

  const close = () => { setHamOpen(false); setHamView('main'); };

  const dofColor  = conflict ? C.conflict : (sk?.solveResult?.dof===0 ? C.dofOk : C.dofAmber);
  const dofLabel  = conflict ? 'CONFLICT' : (sk?.solveResult?.dof===0 ? 'FULLY CONSTRAINED' : `${sk?.solveResult?.dof??'--'} DOF FREE`);

  const menuItem=(icon,label,action,danger=false,sub=null)=>(
    <button key={label} onClick={()=>{ action(); }}
      style={{display:'flex',alignItems:'center',gap:12,width:'100%',
        padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',
        color:danger?'#884444':C.text,fontSize:13,textAlign:'left'}}>
      <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>{icon}</span>
      <div style={{flex:1}}>
        <div>{label}</div>
        {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
      </div>
    </button>
  );

  const panelStyle = {position:'absolute',top:'100%',left:0,zIndex:30,
    background:'#0a1020',border:`1px solid ${C.border}`,
    borderTop:'none',minWidth:260,boxShadow:'0 8px 24px #000c',maxHeight:'80vh',overflowY:'auto'};

  const sectionHeader = label => (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px 4px',
      fontSize:9,color:C.muted,letterSpacing:'0.15em',borderTop:`1px solid ${C.border}`}}>
      {label}
    </div>
  );

  // ── Pages panel ───────────────────────────────────────────────────
  const PagesPanel = () => {
    const sorted = doc?.sortedPages ?? [];
    return <>
      <button onClick={()=>setHamView('main')} style={{display:'flex',alignItems:'center',gap:8,
        width:'100%',padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
        ← Pages
      </button>
      {sorted.map(page=>(
        <button key={page.id} onClick={()=>{ onSwitchPage(page.id); close(); }}
          style={{display:'flex',alignItems:'center',gap:12,width:'100%',
            padding:'13px 16px',background:page.id===doc.activePage?'#0d2040':'none',
            border:'none',borderBottom:`1px solid ${C.border}`,cursor:'pointer',
            color:page.id===doc.activePage?'#a0c8f0':C.text,fontSize:13,textAlign:'left'}}>
          <span style={{width:12,height:12,borderRadius:'50%',background:page.style.color,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div>{page.name}</div>
            {page.groupId&&<div style={{fontSize:10,color:C.muted}}>{doc.groups.get(page.groupId)?.name}</div>}
          </div>
          <span style={{fontSize:10,color:C.muted}}>z={page.z}</span>
          {page.id===doc.activePage&&<span style={{fontSize:10,color:'#40a8ff'}}>●</span>}
        </button>
      ))}
      {menuItem('＋','New page',()=>{
        const p=doc.addPage(`Page ${doc.pages.size+1}`);
        onSwitchPage(p.id); close();
      })}
    </>;
  };

  // ── Varsets panel ─────────────────────────────────────────────────
  const VarsetsPanel = () => <>
    <button onClick={()=>setHamView('main')} style={{display:'flex',alignItems:'center',gap:8,
      width:'100%',padding:'13px 16px',background:'none',border:'none',
      borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
      ← Varsets
    </button>
    {[...( doc?.varsets.values()??[])].map(vs=>(
      <button key={vs.id} onClick={()=>{ setEditVarsetId(vs.id); setHamView('varset'); }}
        style={{display:'flex',alignItems:'center',gap:12,width:'100%',
          padding:'13px 16px',background:'none',border:'none',
          borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.text,fontSize:13,textAlign:'left'}}>
        <span style={{fontSize:18,width:24,textAlign:'center'}}>📋</span>
        <div style={{flex:1}}>
          <div>{vs.name}</div>
          <div style={{fontSize:10,color:C.muted}}>{vs.variables.size} variable{vs.variables.size!==1?'s':''}</div>
        </div>
        <span style={{fontSize:12,color:C.muted}}>›</span>
      </button>
    ))}
    {menuItem('＋','New varset',()=>{
      const name=prompt('Varset name:','Dimensions');
      if(name?.trim()){ doc.addVarset(name.trim()); rerender(); }
    })}
  </>;

  // ── Single varset editor ──────────────────────────────────────────
  const VarsetPanel = () => {
    const vs = doc?.varsets.get(editVarsetId);
    if (!vs) return null;
    const env = doc.resolveVarEnv();
    return <>
      <button onClick={()=>setHamView('varsets')} style={{display:'flex',alignItems:'center',gap:8,
        width:'100%',padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
        ← {vs.name}
      </button>
      {[...vs.variables.values()].map(v=>{
        const disp = v.unit==='mm' ? (v.value*0.01).toFixed(3)+' mm'
                   : v.unit==='deg' ? v.value+'°'
                   : String(v.value);
        return (
          <div key={v.id} style={{display:'flex',alignItems:'center',gap:8,
            padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:C.text}}>{v.name}</div>
              {v.expr&&<div style={{fontSize:10,color:'#5090d0',marginTop:2}}>{v.expr}</div>}
              {v.description&&<div style={{fontSize:10,color:C.muted}}>{v.description}</div>}
              {v._error&&<div style={{fontSize:10,color:C.conflict}}>{v._error}</div>}
            </div>
            <div style={{fontSize:13,color:'#a0c8f0',fontFamily:'monospace',minWidth:60,textAlign:'right'}}>{disp}</div>
          </div>
        );
      })}
      {menuItem('＋','Add variable',()=>{
        const name=prompt('Variable name:');
        if(!name?.trim()) return;
        const valStr=prompt('Value (in mm if length):','0');
        const val=parseFloat(valStr);
        if(isNaN(val)) return;
        const unit=prompt('Unit (mm/deg/blank):','mm')||null;
        vs.addVariable(name.trim(), unit==='mm'?val*100:val, unit||null);
        doc._notify(); rerender();
      })}
    </>;
  };

  return (
    <div style={{position:'relative',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',
        padding:'0 8px',minHeight:40,gap:4,
        background:'#080d18',borderBottom:`1px solid ${C.border}`}}>
        <button onClick={()=>{ setHamOpen(o=>!o); setHamView('main'); }} title="Menu"
          style={{...BTN_SMALL,color:hamOpen?C.text:'#7a9ab8',fontSize:18}}>☰</button>
        <span style={{flex:1,fontSize:12,color:'#7a9ab8',padding:'0 6px',
          overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
          {statusText}
        </span>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:dofColor,
            boxShadow:`0 0 6px ${dofColor}`}}/>
          <span style={{fontSize:12,color:dofColor,fontWeight:600,fontFamily:'monospace'}}>
            DOF {sk?.solveResult?.dof??'--'} · {dofLabel}
          </span>
        </div>
      </div>

      {hamOpen&&<>
        <div onClick={close} style={{position:'fixed',inset:0,zIndex:29}}/>
        <div style={panelStyle}>
          {hamView==='main'&&<>
            {menuItem('📄','Pages',()=>setHamView('pages'),false,
              `${doc?.pages.size??0} page${doc?.pages.size!==1?'s':''} · active: ${doc?.activePageObj?.name??'—'}`)}
            {menuItem('𝑥','Varsets',()=>setHamView('varsets'),false,
              `${doc?.varsets.size??0} varset${doc?.varsets.size!==1?'s':''}`)}
            {menuItem('⚙︎','Settings',()=>{})}
            {sectionHeader('EXPORT')}
            {menuItem('⬇','FreeCAD (.fcstd)',()=>{
              const bytes=exportFCStd(sk);
              const blob=new Blob([bytes],{type:'application/zip'});
              const url=URL.createObjectURL(blob);
              const a=document.createElement('a');
              a.href=url; a.download=`${doc?.activePageObj?.name??'sketch'}.fcstd`; a.click();
              URL.revokeObjectURL(url); close();
            })}
            <button style={{display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'13px 16px',background:'none',border:'none',
              borderBottom:`1px solid ${C.border}`,cursor:'pointer',
              color:C.text,fontSize:13,textAlign:'left'}}
              onClick={()=>{
                if(!cam||!dims) return;
                const svg=exportSVG(sk,cam,dims.W,dims.H);
                const blob=new Blob([svg],{type:'image/svg+xml'});
                const url=URL.createObjectURL(blob);
                const a=document.createElement('a');
                a.href=url; a.download=`${doc?.activePageObj?.name??'sketch'}.svg`; a.click();
                URL.revokeObjectURL(url); close();
              }}>
              <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>⬇</span>
              SVG (.svg)
            </button>
            <button style={{display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'13px 16px',background:'none',border:'none',
              borderBottom:`1px solid ${C.border}`,cursor:'default',
              color:C.muted,fontSize:13,textAlign:'left',opacity:0.45}}>
              <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>⬇</span>
              DXF (.dxf)
              <span style={{marginLeft:'auto',fontSize:9,letterSpacing:'0.1em'}}>SOON</span>
            </button>
            <div style={{borderTop:`1px solid ${C.border}`}}/>
            {menuItem('✕','Clear sketch',()=>{ onClear(); close(); },true)}
            <div style={{borderTop:`1px solid ${C.border}`}}/>
            {menuItem('🪲',`Debug log (${_debugLog.length} lines)`,()=>setHamView('debuglog'))}
          </>}
          {hamView==='debuglog' && <>
            <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setHamView('main')} style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:16}}>←</button>
              <span style={{fontSize:13,color:C.text}}>Debug Log ({_debugLog.length} lines)</span>
            </div>
            <div style={{padding:'8px 12px',fontSize:10,fontFamily:'monospace',color:'#8ab',lineHeight:1.5,overflowY:'auto',maxHeight:300,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
              <div style={{color:'#ff8',marginBottom:4}}>── first 5 ──</div>
              {_debugLog.slice(0,5).join('\n')}
              {_debugLog.length>10 && <>
                <div style={{color:'#ff8',margin:'4px 0'}}>{'\n'}── last 20 ──</div>
                {_debugLog.slice(-20).join('\n')}
              </>}
            </div>
          </>}
          {hamView==='pages'   && <PagesPanel/>}
          {hamView==='varsets' && <VarsetsPanel/>}
          {hamView==='varset'  && <VarsetPanel/>}
        </div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONSTRAINT APPLICATION HELPER
// ═══════════════════════════════════════════════════════════════════

function applyConstraintFromSelection(type, sk, sel) {
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

// ═══════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════

/** Auto-constrain a list of newly-constructed points to nearby existing geometry. */
function autoConstrainPoints(pts, sk, snapR) {
  for (const p of pts) autoConstrainNewPoint(p, sk, snapR);
}

// Batch-create a closed polygon directly (bypasses command stack — undo TBD)
function _sketchClosedPolygon(sk, corners, snapR=0) {
  const pts = corners.map(c => sk._mkPt(c.x, c.y));
  const lns = pts.map((p, i) => sk._mkLn(p, pts[(i+1) % pts.length]));
  if (snapR) autoConstrainPoints(pts, sk, snapR);
  return {pts, lns}; // caller must call _solveAndNotify
}


/** Project world tap onto nearest point on entity surface. */
function projectOnEntity(entity, wx, wy) {
  if (entity.type==='line') {
    const{p1,p2}=entity, dx=p2.x-p1.x, dy=p2.y-p1.y, lsq=dx*dx+dy*dy;
    if(!lsq) return {x:p1.x,y:p1.y};
    const t=((wx-p1.x)*dx+(wy-p1.y)*dy)/lsq;
    return {x:p1.x+t*dx, y:p1.y+t*dy};
  }
  const dx=wx-entity.centre.x, dy=wy-entity.centre.y, len=Math.sqrt(dx*dx+dy*dy)||1;
  return {x:entity.centre.x+dx/len*entity.radius, y:entity.centre.y+dy/len*entity.radius};
}
/** Outward normal direction at a surface point on entity. */
function entityNormal(entity, pt) {
  if (entity.type==='line') {
    const dx=entity.p2.x-entity.p1.x, dy=entity.p2.y-entity.p1.y, len=Math.sqrt(dx*dx+dy*dy)||1;
    return {x:-dy/len, y:dx/len};
  }
  const dx=pt.x-entity.centre.x, dy=pt.y-entity.centre.y, len=Math.sqrt(dx*dx+dy*dy)||1;
  return {x:dx/len, y:dy/len};
}
/** 2D ray–ray intersection; null if parallel. */
function rayIntersect2D(px,py,dx,dy,qx,qy,ex,ey) {
  const cross=dx*ey-dy*ex;
  if(Math.abs(cross)<1e-8) return null;
  const t=((qx-px)*ey-(qy-py)*ex)/cross;
  return {x:px+t*dx, y:py+t*dy};
}
/** Constrain pt to lie on entity surface. */
function addPointOnEntity(sk,pt,entity) {
  if(entity.type==='line') sk._mkC('point_on_line',[pt,entity]);
  else                      sk._mkC('point_on_circle',[pt,entity]);
}
/** Constrain spoke (centre→tangentPt) perpendicular to entity at contact. */
function addTangencyConstraint(sk,spoke,entity) {
  if(entity.type==='line') sk._mkC('perpendicular',[entity,spoke]);
  else                      sk._mkC('point_on_line',[entity.centre,spoke]);
}

/**
 * Find all single-removal sets that resolve the conflict.
 * Returns [{remove:[constraint], primary:bool, label:string}]
 * primary=true means removing the trigger (= undo equivalent).
 */
function findResolutions(sk) {
  const cs = sk.conflictState; if (!cs) return [];
  const trigger = cs.trigger;
  const results = [];
  const saved = sk._snapPos();
  const orig = [...sk.constraints];

  const test = (skip) => {
    sk.constraints = orig.filter(c => !skip.includes(c));
    const r = solve(sk), d = sk._checkDegenerate();
    sk._restorePos(saved);
    sk.constraints = orig;
    return r.status !== 'overconstrained' && !d;
  };

  if (trigger && test([trigger]))
    results.push({ remove:[trigger], primary:true,
      label: trigger.description });

  for (const c of orig) {
    if (c === trigger || c.locked) continue;
    if (test([c]))
      results.push({ remove:[c], primary:false,
        label: c.description });
  }
  return results;
}


// ═══════════════════════════════════════════════════════════════════
// FCStd EXPORT  (1 world unit = 0.01 mm → divide by 100 for mm values)
// ═══════════════════════════════════════════════════════════════════

function exportFCStd(sk) {
  const S = 0.01; // world → mm scale
  const D2R = Math.PI / 180;
  const UNDEF = -2000;
  const f = n => Number(n).toFixed(13); // FreeCAD uses high-precision floats

  // ── Build ordered geometry list ──────────────────────────────────
  // FreeCAD geometry is indexed sequentially; construction comes last.
  const geoms = [];
  const addG = (entity, type) => geoms.push({entity, type, construction: !!entity.construction});
  for (const ln of sk.lines.values()) { if (!sk.reserved.has(ln)) addG(ln,'line'); }
  for (const ci of sk.circles.values()) addG(ci,'circle');
  for (const arc of sk.arcs.values())   addG(arc,'arc');
  geoms.sort((a,b)=>(a.construction?1:0)-(b.construction?1:0));
  geoms.forEach((g,i)=>g.idx=i);

  // ── Point → {geomIdx, vertexPos} reverse map ─────────────────────
  // FreeCAD vertex positions: 1=start, 2=end, 3=centre/midpoint
  const ptRef = {};
  for (const g of geoms) {
    const i = g.idx;
    if (g.type==='line')   { ptRef[g.entity.p1.id]={gi:i,vp:1}; ptRef[g.entity.p2.id]={gi:i,vp:2}; }
    if (g.type==='circle') { ptRef[g.entity.centre.id]={gi:i,vp:3}; }
    if (g.type==='arc')    { ptRef[g.entity.startPt.id]={gi:i,vp:1}; ptRef[g.entity.endPt.id]={gi:i,vp:2}; ptRef[g.entity.centre.id]={gi:i,vp:3}; }
  }

  // ── Geometry XML ──────────────────────────────────────────────────
  const geomLines = geoms.map(g => {
    const con = g.construction ? ' Construction="1"' : '';
    let inner = '';
    if (g.type==='line') {
      const {p1,p2}=g.entity;
      inner=`<LineSegment StartX="${f(p1.x*S)}" StartY="${f(p1.y*S)}" StartZ="0" EndX="${f(p2.x*S)}" EndY="${f(p2.y*S)}" EndZ="0"/>`;
    } else if (g.type==='circle') {
      const {centre,radius}=g.entity;
      inner=`<Circle CenterX="${f(centre.x*S)}" CenterY="${f(centre.y*S)}" CenterZ="0" NormalX="0" NormalY="0" NormalZ="1" AngleXU="0" Radius="${f(radius*S)}"/>`;
    } else {
      // Arc: FreeCAD always draws CCW from StartAngle to EndAngle.
      // Compute the two angles and ensure CCW direction matches our rendered arc.
      const arc=g.entity;
      const sa=arc.startAngle, ea=arc.endAngle;
      const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
      let inverted=arc.inverted;
      if(arc.throughPt){
        const tp=arc.throughPt;
        const ta=Math.atan2(tp.y-arc.centre.y,tp.x-arc.centre.x);
        const tOnCCW=((ta-sa)+2*Math.PI)%(2*Math.PI)<=span;
        inverted=tOnCCW!==(span<=Math.PI);
      }
      const shortIsCCW=span<=Math.PI;
      const drawCCW=inverted?!shortIsCCW:shortIsCCW;
      // FreeCAD arc goes CCW from StartAngle to EndAngle.
      // If our arc is CCW: use sa→ea (adjusted so ea>sa).
      // If our arc is CW: swap to ea→sa+2π (so FreeCAD goes CCW the long way = our CW the short way).
      let fcStart, fcEnd;
      if(drawCCW){
        fcStart=sa; fcEnd=(ea<=sa)?ea+2*Math.PI:ea;
      } else {
        fcStart=ea; fcEnd=(sa<=ea)?sa+2*Math.PI:sa;
      }
      inner=`<ArcOfCircle CenterX="${f(arc.centre.x*S)}" CenterY="${f(arc.centre.y*S)}" CenterZ="0" NormalX="0" NormalY="0" NormalZ="1" AngleXU="0" Radius="${f(arc.radius*S)}" StartAngle="${f(fcStart)}" EndAngle="${f(fcEnd)}"/>`;
    }
    return `        <Geometry id="${g.idx+1}"${con}>\n          ${inner}\n        </Geometry>`;
  });

  // ── Constraint XML ────────────────────────────────────────────────
  const cxLines = [];
  const addC = (type,value,fi,fp,si=UNDEF,sp=0,ti=UNDEF,tp=0)=>{
    cxLines.push(`        <Constrain Name="" Type="${type}" Value="${f(value)}" First="${fi}" FirstPos="${fp}" Second="${si}" SecondPos="${sp}" Third="${ti}" ThirdPos="${tp}" LabelDistance="0" LabelPosition="0" IsDriving="1" IsInVirtualSpace="0" IsActive="1"/>`);
  };

  const gByEntity = new Map(geoms.map(g=>[g.entity,g]));

  for (const c of sk.constraints) {
    if (c.driven) continue;
    const [r0,r1,r2] = c.refs;
    switch(c.type) {
      case 'fixed': {
        // Block each referenced point
        const ref=ptRef[r0.id]; if(!ref) break;
        addC(17,0,ref.gi,ref.vp);
        break;
      }
      case 'horizontal': { const g=gByEntity.get(r0); if(g) addC(2,0,g.idx,0); break; }
      case 'vertical':   { const g=gByEntity.get(r0); if(g) addC(3,0,g.idx,0); break; }
      case 'parallel':   { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(4,0,g0.idx,0,g1.idx,0); break; }
      case 'perpendicular':{ const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(10,0,g0.idx,0,g1.idx,0); break; }
      case 'equal':      { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(12,0,g0.idx,0,g1.idx,0); break; }
      case 'tangent':    { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(5,0,g0.idx,0,g1.idx,0); break; }
      case 'coincident': {
        const ra=ptRef[r0.id], rb=ptRef[r1.id]; if(!ra||!rb) break;
        addC(1,0,ra.gi,ra.vp,rb.gi,rb.vp); break;
      }
      case 'point_on_line':
      case 'point_on_circle': {
        const ra=ptRef[r0.id], gb=gByEntity.get(r1); if(!ra||!gb) break;
        addC(13,0,ra.gi,ra.vp,gb.idx,0); break;
      }
      case 'distance': { const g=gByEntity.get(r0); if(g) addC(6,c.value*S,g.idx,0); break; }
      case 'radius':   { const g=gByEntity.get(r0); if(g) addC(11,c.value*S,g.idx,0); break; }
      case 'angle': {
        const g0=gByEntity.get(r0),g1=gByEntity.get(r1);
        if(g0&&g1) addC(9,c.value*D2R,g0.idx,0,g1.idx,0); break;
      }
      case 'symmetric': {
        const ra=ptRef[r0.id],rb=ptRef[r1.id]; if(!ra||!rb) break;
        const ga=gByEntity.get(r2); // axis line (optional)
        if(ga) addC(14,0,ra.gi,ra.vp,rb.gi,rb.vp,ga.idx,0);
        else    addC(14,0,ra.gi,ra.vp,rb.gi,rb.vp);
        break;
      }
    }
  }

  // ── Document.xml ──────────────────────────────────────────────────
  const xml = `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="4" ProgramVersion="0.21" FileVersion="1">
  <Properties Count="1">
    <Property name="Label" type="App::PropertyString">
      <String value="Sketch"/>
    </Property>
  </Properties>
  <Objects Count="1">
    <Object type="Sketcher::SketchObject" name="Sketch" id="1"/>
  </Objects>
  <ObjectData Count="1">
    <Object name="Sketch">
      <Properties Count="2">
        <Property name="Geometry" type="Part::PropertyGeometryList">
          <GeometryList count="${geoms.length}">
${geomLines.join('\n')}
          </GeometryList>
        </Property>
        <Property name="Constraints" type="Sketcher::PropertyConstraintList">
          <ConstraintList count="${cxLines.length}">
${cxLines.join('\n')}
          </ConstraintList>
        </Property>
      </Properties>
    </Object>
  </ObjectData>
</Document>`;

  // ── Pack as ZIP (uncompressed, single file) ───────────────────────
  const enc = new TextEncoder();
  const nameBytes = enc.encode('Document.xml');
  const dataBytes = enc.encode(xml);

  // CRC-32
  const crcTable = (() => {
    const t=new Uint32Array(256);
    for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
    return t;
  })();
  const crc32=(buf)=>{let c=0xFFFFFFFF;for(const b of buf)c=crcTable[(c^b)&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
  const crc=crc32(dataBytes);

  const u16=(n)=>[(n&0xFF),(n>>8)&0xFF];
  const u32=(n)=>[(n&0xFF),(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF];

  const lfh=[
    0x50,0x4B,0x03,0x04,   // local file header sig
    0x14,0x00,             // version needed
    0x00,0x00,             // flags
    0x00,0x00,             // compression (stored)
    0x00,0x00,0x00,0x00,   // mod time/date
    ...u32(crc),
    ...u32(dataBytes.length),
    ...u32(dataBytes.length),
    ...u16(nameBytes.length),
    0x00,0x00,             // extra length
    ...nameBytes,
    ...dataBytes,
  ];

  const lfhOffset=0;
  const cdh=[
    0x50,0x4B,0x01,0x02,   // central dir sig
    0x14,0x00,             // version made by
    0x14,0x00,             // version needed
    0x00,0x00,0x00,0x00,   // flags, compression
    0x00,0x00,0x00,0x00,   // mod time/date
    ...u32(crc),
    ...u32(dataBytes.length),
    ...u32(dataBytes.length),
    ...u16(nameBytes.length),
    0x00,0x00,0x00,0x00,   // extra, comment length
    0x00,0x00,             // disk start
    0x00,0x00,             // internal attr
    0x00,0x00,0x00,0x00,   // external attr
    ...u32(lfhOffset),
    ...nameBytes,
  ];

  const eocd=[
    0x50,0x4B,0x05,0x06,   // EOCD sig
    0x00,0x00,0x00,0x00,   // disk number/start
    0x01,0x00,0x01,0x00,   // entry counts
    ...u32(cdh.length),
    ...u32(lfh.length),
    0x00,0x00,             // comment length
  ];

  return new Uint8Array([...lfh,...cdh,...eocd]);
}

// ═══════════════════════════════════════════════════════════════════
// SVG EXPORT  — current view, no background, grid, or axis/origin
// ═══════════════════════════════════════════════════════════════════

function exportSVG(sk, cam, W, H) {
  const px = n => n.toFixed(3);

  const geom = [], construction = [];

  // ── Lines ───────────────────────────────────────────────────────
  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln)) continue;
    const s1=cam.toScreen(ln.p1.x,ln.p1.y), s2=cam.toScreen(ln.p2.x,ln.p2.y);
    const el=`<line x1="${px(s1.x)}" y1="${px(s1.y)}" x2="${px(s2.x)}" y2="${px(s2.y)}" stroke="${ln.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (ln.construction ? construction : geom).push(el);
  }

  // ── Circles ─────────────────────────────────────────────────────
  for (const ci of sk.circles.values()) {
    const sc=cam.toScreen(ci.centre.x,ci.centre.y), r=ci.radius*cam.scale;
    const el=`<circle cx="${px(sc.x)}" cy="${px(sc.y)}" r="${px(r)}" fill="none" stroke="${ci.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (ci.construction ? construction : geom).push(el);
  }

  // ── Arcs ────────────────────────────────────────────────────────
  for (const arc of sk.arcs.values()) {
    const ss=cam.toScreen(arc.startPt.x,arc.startPt.y);
    const se=cam.toScreen(arc.endPt.x,arc.endPt.y);
    const r=arc.radius*cam.scale;
    const {largeArc,sweepFlag}=arcDrawFlags(arc);
    const el=`<path d="M ${px(ss.x)} ${px(ss.y)} A ${px(r)} ${px(r)} 0 ${largeArc} ${sweepFlag} ${px(se.x)} ${px(se.y)}" fill="none" stroke="${arc.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (arc.construction ? construction : geom).push(el);
  }

  const layer = (id, label, visible, elems) =>
    `  <g id="${id}" inkscape:label="${label}" inkscape:groupmode="layer"${visible?'':' visibility="hidden"'}>\n` +
    elems.map(e=>`    ${e}`).join('\n') +
    `\n  </g>`;

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
    `     viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    layer('layer_geometry',     'Geometry',     true,  geom),
    layer('layer_construction', 'Construction', false, construction),
    `</svg>`,
  ].join('\n');
}

// Stable surface for Android WebView bridge — do not rename or move.
// The native HTTP server calls these via JavascriptInterface to serve
// /sketch.fcstd and /sketch.svg without going through the Android share sheet.
if (typeof window !== 'undefined') {
  window.__sketchExports = { exportFCStd, exportSVG };

  window.__sketchDebug = () => {
    const sk = window.__sketchRef?.current;
    if (!sk) { console.warn('No sketch ref — call this after the app mounts'); return; }

    const out = {
      solveResult: sk.solveResult,
      conflictState: !!sk.conflictState,
      constraints: sk.constraints.map(c => ({
        id: c.id, type: c.type, value: c.value,
        driven: c.driven, locked: c.locked, disabled: c.disabled,
        dofCost: c._dofCost,
        refs: c.refs.map(r => ({
          id: r.id, name: r.name,
          ...(r.x !== undefined ? {x: +r.x.toFixed(2), y: +r.y.toFixed(2)} : {}),
          ...(r.radius !== undefined ? {radius: +r.radius.toFixed(2)} : {}),
        })),
      })),
      points: [...sk.points.entries()].filter(([,p])=>!p.reserved).map(([id,p])=>({
        id, name: p.name, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
        constraints: [...(p._constraints??[])].map(c=>({type:c.type,id:c.id,cost:c._dofCost})),
      })),
      circles: [...sk.circles.entries()].map(([id,ci])=>({
        id, radius: +ci.radius.toFixed(2),
        centre: {id:ci.centre.id, x:+ci.centre.x.toFixed(2), y:+ci.centre.y.toFixed(2)},
        constraints: [...(ci._constraints??[])].map(c=>({type:c.type,id:c.id,cost:c._dofCost})),
      })),
    };

    console.log(JSON.stringify(out, null, 2));
    return out;
  };
}

// ═══════════════════════════════════════════════════════════════════
// DOCUMENT MODEL  —  Variable · Varset · Group · Page · SketchDocument
// ═══════════════════════════════════════════════════════════════════

// ── Expression evaluator ─────────────────────────────────────────────
// Supports: + - * / ^ sqrt()  and variable names from env.
// Returns { ok: true, value } or { ok: false, error }.
function evalExpr(expr, env) {
  try {
    // Validate: only allow safe tokens
    const safe = /^[\d\s+\-*/^().]+$/.test(
      expr.replace(/sqrt\s*\(/g,'(').replace(/[a-zA-Z_]\w*/g, n => {
        if (!(n in env)) throw new Error(`Unknown variable: ${n}`);
        return String(env[n]);
      })
    );
    if (!safe) throw new Error('Invalid expression');
    // Substitute variable names with values, translate ^ to **
    const js = expr
      .replace(/[a-zA-Z_]\w*/g, n => n === 'sqrt' ? 'Math.sqrt' : String(env[n] ?? (() => { throw new Error(`Unknown: ${n}`); })()))
      .replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + js + ')')();
    if (!isFinite(result)) throw new Error('Result is not finite');
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Variable ──────────────────────────────────────────────────────────
class SketchVariable {
  constructor({ id, name, value, expr=null, unit=null, description='', min=null, max=null, constant=false }) {
    this.id = id ?? genId();
    this.name = name;
    this.value = value;      // world units — authoritative when expr=null
    this.expr = expr;        // restricted arithmetic string or null
    this.unit = unit;        // 'mm' | 'deg' | null
    this.description = description;
    this.min = min;          // world units
    this.max = max;          // world units
    this.constant = constant; // true = no expr allowed, shown separately
    this._error = null;      // set during resolve
  }

  // Resolve value from expression given env {name: worldValue}.
  // Updates this.value in place. Returns resolved world-unit value.
  resolve(env) {
    if (!this.expr) { this._error = null; return this.value; }
    const res = evalExpr(this.expr, env);
    if (!res.ok) { this._error = res.error; return this.value; } // keep last good
    this._error = null;
    this.value = res.value;
    return this.value;
  }

  // Display value (unit-scaled for UI)
  get displayValue() {
    if (this.unit === 'mm') return +(this.value * 0.01).toFixed(6);
    return this.value; // deg and unitless are 1:1
  }

  // Convert user-entered display value → world units for storage
  static fromDisplay(display, unit) {
    if (unit === 'mm') return display * 100;
    return display;
  }

  toJSON() {
    return { id:this.id, name:this.name, value:this.value, expr:this.expr,
             unit:this.unit, description:this.description,
             min:this.min, max:this.max, constant:this.constant };
  }

  static fromJSON(j) { return new SketchVariable(j); }
}

// ── Varset ────────────────────────────────────────────────────────────
class SketchVarset {
  constructor({ id, name, variables=[] }) {
    this.id = id ?? genId();
    this.name = name;
    this.variables = new Map(variables.map(v => [v.id, v instanceof SketchVariable ? v : SketchVariable.fromJSON(v)]));
  }

  addVariable(name, value, unit=null, opts={}) {
    const v = new SketchVariable({ name, value, unit, ...opts });
    this.variables.set(v.id, v);
    return v;
  }

  removeVariable(id) { this.variables.delete(id); }

  // Resolve all variables in dependency order. Returns env {name: worldValue}.
  // Circular references are flagged on affected variables.
  resolveAll() {
    const vars = [...this.variables.values()];
    const resolved = {};
    const resolving = new Set();
    const resolve = (v) => {
      if (v.name in resolved) return resolved[v.name];
      if (resolving.has(v.id)) { v._error = 'Circular reference'; return v.value; }
      resolving.add(v.id);
      // Gather env from already-resolved vars + constants
      const env = { ...resolved };
      vars.forEach(u => { if (!(u.name in env)) env[u.name] = u.value; });
      resolved[v.name] = v.resolve(env);
      resolving.delete(v.id);
      return resolved[v.name];
    };
    vars.forEach(resolve);
    return resolved;
  }

  // Variables compatible with a constraint type for the var picker
  compatibleWith(constraintType) {
    const needsMm  = ['distance','radius'].includes(constraintType);
    const needsDeg = ['angle'].includes(constraintType);
    return [...this.variables.values()].filter(v => {
      if (v.constant) return true;
      if (needsMm  && v.unit !== 'mm')  return false;
      if (needsDeg && v.unit !== 'deg') return false;
      return true;
    });
  }

  toJSON() {
    return { id:this.id, name:this.name,
             variables:[...this.variables.values()].map(v=>v.toJSON()) };
  }

  static fromJSON(j) { return new SketchVarset(j); }
}

// ── Group ──────────────────────────────────────────────────────────────
class SketchGroup {
  constructor({ id, name, collapsed=false }) {
    this.id = id ?? genId();
    this.name = name;
    this.collapsed = collapsed;
  }

  toJSON() { return { id:this.id, name:this.name, collapsed:this.collapsed }; }
  static fromJSON(j) { return new SketchGroup(j); }
}

// ── Page ───────────────────────────────────────────────────────────────
class SketchPage {
  constructor({ id, name, groupId=null, z=0,
                attachment={ base:'XY', axis:'Z', angle:0 },
                offset={ x:0, y:0, z:0 },
                style={ color:'#40a8ff', lineWeight:1.5, lineDash:[] },
                visible=true,
                camera={ tx:0, ty:0, scale:1.5 },
                sketch=null }) {
    this.id = id ?? genId();
    this.name = name;
    this.groupId = groupId;
    this.z = z;
    this.attachment = { ...attachment };
    this.offset = { ...offset };
    this.style = { ...style };
    this.visible = visible;
    this.camera = { ...camera };
    this.sketch = sketch ?? new Sketch();
  }

  toJSON() {
    return {
      id: this.id, name: this.name, groupId: this.groupId, z: this.z,
      attachment: this.attachment, offset: this.offset,
      style: this.style, visible: this.visible, camera: this.camera,
      sketch: this.sketch.toJSON(),
    };
  }

  static fromJSON(j) {
    return new SketchPage({ ...j, sketch: Sketch.fromJSON(j.sketch) });
  }
}

// ── SketchDocument ─────────────────────────────────────────────────────
class SketchDocument {
  constructor() {
    this.version = 1;
    this.varsets = new Map();
    this.groups  = new Map();
    this.pages   = new Map();
    this.activePage = null;
    this._onChange = null;
    this._saveTimer = null;
  }

  // ── Factory ────────────────────────────────────────────────────────
  static create() {
    const doc = new SketchDocument();
    const page = doc.addPage('Page 1');
    doc.activePage = page.id;
    return doc;
  }

  // ── Pages ──────────────────────────────────────────────────────────
  addPage(name, opts={}) {
    const z = opts.z ?? Math.max(-1, ...[...this.pages.values()].map(p=>p.z)) + 1;
    const page = new SketchPage({ name, z, ...opts });
    this.pages.set(page.id, page);
    if (!this.activePage) this.activePage = page.id;
    return page;
  }

  removePage(id) {
    this.pages.delete(id);
    if (this.activePage === id)
      this.activePage = [...this.pages.keys()][0] ?? null;
    this._notify();
  }

  get activePageObj() { return this.pages.get(this.activePage) ?? null; }
  get activeSketch()  { return this.activePageObj?.sketch ?? null; }

  // Pages sorted by z for compositing (lowest first = bottom of stack)
  get sortedPages() {
    return [...this.pages.values()].sort((a,b) => a.z - b.z);
  }

  // ── Groups ─────────────────────────────────────────────────────────
  addGroup(name) {
    const g = new SketchGroup({ name });
    this.groups.set(g.id, g);
    this._notify();
    return g;
  }

  removeGroup(id) {
    // Ungroup pages belonging to this group
    for (const p of this.pages.values()) if (p.groupId === id) p.groupId = null;
    this.groups.delete(id);
    this._notify();
  }

  // ── Varsets ────────────────────────────────────────────────────────
  addVarset(name) {
    const vs = new SketchVarset({ name, variables:[] });
    this.varsets.set(vs.id, vs);
    this._notify();
    return vs;
  }

  removeVarset(id) { this.varsets.delete(id); this._notify(); }

  // Resolve all varsets → merged env {name: worldValue}
  resolveVarEnv() {
    const env = {};
    for (const vs of this.varsets.values())
      Object.assign(env, vs.resolveAll());
    return env;
  }

  // Resolve a constraint's valueRef to a world-unit number. Returns null if unresolved.
  resolveVarRef(varRef) {
    if (!varRef) return null;
    const vs = this.varsets.get(varRef.varsetId);
    if (!vs) return null;
    const v = vs.variables.get(varRef.variableId);
    if (!v) return null;
    const env = this.resolveVarEnv();
    return env[v.name] ?? null;
  }

  // ── Notifications + auto-save ──────────────────────────────────────
  _notify() {
    this._onChange?.();
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => StorageAdapter.save(this), 500);
  }

  // ── Serialisation ──────────────────────────────────────────────────
  toJSON() {
    return {
      version:    this.version,
      varsets:    [...this.varsets.values()].map(v=>v.toJSON()),
      groups:     [...this.groups.values()].map(g=>g.toJSON()),
      pages:      [...this.pages.values()].map(p=>p.toJSON()),
      activePage: this.activePage,
    };
  }

  static fromJSON(j) {
    const doc = new SketchDocument();
    doc.version = j.version ?? 1;
    for (const v of (j.varsets ?? [])) doc.varsets.set(v.id, SketchVarset.fromJSON(v));
    for (const g of (j.groups  ?? [])) doc.groups.set(g.id,  SketchGroup.fromJSON(g));
    for (const p of (j.pages   ?? [])) doc.pages.set(p.id,   SketchPage.fromJSON(p));
    doc.activePage = j.activePage ?? [...doc.pages.keys()][0] ?? null;
    return doc;
  }
}

// ── StorageAdapter ─────────────────────────────────────────────────────
// localStorage now; swap implementation for Capacitor Filesystem on Android.
const STORAGE_KEY = 'sketchDocument_v1';
const StorageAdapter = {
  save(doc) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc.toJSON())); }
    catch (e) { console.warn('StorageAdapter.save failed:', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return SketchDocument.fromJSON(JSON.parse(raw));
    } catch (e) {
      console.warn('StorageAdapter.load failed:', e);
      return null;
    }
  },
  clear() { localStorage.removeItem(STORAGE_KEY); },
};



export default function SketcherApp() {
  const docRef = useRef(null);
  const camRef = useRef(null);
  const svgRef = useRef(null);
  const [,rerender] = useReducer(x=>x+1,0);

  if (!docRef.current) {
    docRef.current = StorageAdapter.load() ?? SketchDocument.create();
    camRef.current = new Camera();
    docRef.current._onChange = rerender;
    // Restore camera from active page
    const activePage = docRef.current.activePageObj;
    if (activePage?.camera) {
      const c = activePage.camera;
      camRef.current.tx = c.tx; camRef.current.ty = c.ty; camRef.current.scale = c.scale;
    }
    // Wire active sketch notifications
    const sk = docRef.current.activeSketch;
    if (sk) sk.onChange(()=>{ docRef.current._notify(); });
  }

  // Expose active sketch for console debugging: window.__sketchDebug()
  if (typeof window !== 'undefined') window.__sketchRef = { current: docRef.current?.activeSketch };

  const doc = docRef.current;
  const sk  = doc.activeSketch ?? new Sketch();
  const cam = camRef.current;

  // Debug hook — paste in console: copy(__skDebug())
  if (typeof window !== 'undefined') window.__skDebug = () => {
    const s = sk;
    return {
      solveResult: s.solveResult,
      conflictState: s.conflictState ? 'CONFLICT' : null,
      constraints: s.constraints.map(c => ({
        id: c.id, type: c.type, value: c.value,
        disabled: c.disabled, driven: c.driven, locked: c.locked,
        refs: c.refs.map(r => ({ id: r.id, name: r.name,
          x: r.x?.toFixed(2), y: r.y?.toFixed(2), radius: r.radius?.toFixed(2) })),
        _dofCost: c._dofCost,
      })),
      points: [...s.points.values()].filter(p=>!p.reserved).map(p=>({
        id: p.id, name: p.name, x: +p.x.toFixed(2), y: +p.y.toFixed(2),
        constraints: [...(p._constraints??[])].map(c=>c.type+':'+c._dofCost),
      })),
      circles: [...s.circles.values()].map(ci=>({
        id: ci.id, radius: +ci.radius.toFixed(2),
        centre: { id: ci.centre.id, x: +ci.centre.x.toFixed(2), y: +ci.centre.y.toFixed(2) },
        constraints: [...(ci._constraints??[])].map(c=>c.type+':'+c._dofCost),
      })),
    };
  };

  // Persist camera state on every render
  const activePage = doc.activePageObj;
  if (activePage) activePage.camera = { tx:cam.tx, ty:cam.ty, scale:cam.scale };

  // ── Page switching ─────────────────────────────────────────────────
  const switchPage = (pageId) => {
    // Save camera of current page
    if (activePage) activePage.camera = { tx:cam.tx, ty:cam.ty, scale:cam.scale };
    doc.activePage = pageId;
    // Restore camera of new page
    const np = doc.activePageObj;
    if (np?.camera) { camRef.current.tx=np.camera.tx; camRef.current.ty=np.camera.ty; camRef.current.scale=np.camera.scale; }
    // Wire notifications for new sketch
    const nsk = doc.activeSketch;
    if (nsk) nsk.onChange(()=>{ doc._notify(); });
    rerender();
  };

  // ── UI state ──────────────────────────────────────────────────────
  const [tool, setTool]             = useState('line');
  const [selectMode, setSelectMode] = useState('tap'); // 'tap' | 'rect'
  const [sel,  setSel]              = useState(new Set());
  const [dimPending, setDimPending] = useState(null);
  const [mouseWorld, setMouseWorld] = useState(null);
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dimType, setDimType]         = useState('distance'); // current dimension mode

  // Tool in-progress state
  const lineStartRef    = useRef(null);
  const circleCenterRef = useRef(null);
  const draw1Ref        = useRef(null);
  const arcRef          = useRef(null);   // {centre?, startPt?, p1?, p2?} for arc tools
  const arcInvertedRef  = useRef(false);  // flip long/short arc before committing
  const ngonSidesRef    = useRef(6);
  const dragRef    = useRef({active:false,pt:null,startWorld:null,startPtPos:null});
  const panRef     = useRef({active:false,sx:0,sy:0,tx:0,ty:0});
  const rectDragRef= useRef(null);  // {start:{x,y}, end:{x,y}, active:bool}
  const pinchRef   = useRef(null);
  const touchCountRef = useRef(0);

  const conflict = !!sk.conflictState;
  const constraintError = sk.constraintError ?? null;
  // Auto-clear the error banner after 2.5s
  useEffect(()=>{
    if(!constraintError) return;
    const t=setTimeout(()=>{ sk.constraintError=null; rerender(); }, 2500);
    return ()=>clearTimeout(t);
  },[constraintError]); // eslint-disable-line
  const [resolutions, setResolutions] = useState([]);
  const [selectedRes, setSelectedRes] = useState(0);
  useEffect(()=>{
    if(!sk.conflictState){ setResolutions([]); setSelectedRes(0); return; }
    setResolutions(findResolutions(sk));
    setSelectedRes(0);
  },[conflict]); // eslint-disable-line

  const applyResolution = res => {
    sk.conflictState=null;
    res.remove.forEach(c=>{ if(!c.locked) c.delete(); });
    sk._solveAndNotify(); rerender();
  };

  // ── SVG dimensions ────────────────────────────────────────────────
  const [dims, setDims] = useState({W:390,H:420});
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const ro=new ResizeObserver(([e])=>{
      const{width,height}=e.contentRect;
      setDims({W:width,H:height});
      // Use camRef so this stays correct even after doClear replaces/mutates the camera
      if(camRef.current.tx===0&&camRef.current.ty===0) camRef.current.recenter(width,height);
    });
    ro.observe(el);
    const r=el.getBoundingClientRect();
    const W=r.width||390, H=r.height||420;
    setDims({W,H}); camRef.current.recenter(W,H);
    return ()=>ro.disconnect();
  },[]);

  // ── Keyboard (desktop support) ────────────────────────────────────
  useEffect(()=>{
    const onKey=e=>{
      if(e.target.tagName==='INPUT') return;
      const k=e.key.toLowerCase();
      if(k==='escape'){ lineStartRef.current=null; circleCenterRef.current=null; setTool('select'); rerender(); }
      else if(k==='s') setTool('select');
      else if(k==='l') setTool('line');
      else if(k==='c') setTool('circle');
      else if(k==='p') setTool('point');
      else if((k==='delete'||k==='backspace')&&!e.ctrlKey){
        sk._beginBatch();
        for(const id of sel){
          const p=sk.points.get(id),l=sk.lines.get(id),ci=sk.circles.get(id),ar=sk.arcs.get(id);
          if(ar) deleteArcWithDeps(ar,sk);
          else if(p&&!p.reserved) sk.deleteEntity(p);
          else if(l&&!sk.reserved.has(l)) sk.deleteEntity(l);
          else if(ci) sk.deleteEntity(ci);
          else { const con=sk.constraints.find(c=>c.id===id); if(con&&!con.locked) sk.deleteConstraint(con); }
        }
        sk._endBatch();
        setSel(new Set());
      }
      else if((e.ctrlKey||e.metaKey)&&k==='z'){ e.preventDefault(); sk.undo(); }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[sel]);

  // ── Helpers ───────────────────────────────────────────────────────
  const getWorld=useCallback(e=>{
    const r=svgRef.current?.getBoundingClientRect()??{left:0,top:0};
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    return cam.toWorld(cx-r.left,cy-r.top);
  },[]);

  const activateTool=t=>{
    lineStartRef.current=null; circleCenterRef.current=null;
    draw1Ref.current=null; arcRef.current=null; arcInvertedRef.current=false; setTool(t);
  };

  /** Build a tangent arc from 2 or 3 {pt, entity} tangent descriptors. */
  const commitTangentArc=(pts)=>{
    const sk=doc.activeSketch;
    const centroid={x:pts.reduce((s,{pt})=>s+pt.x,0)/pts.length,
                    y:pts.reduce((s,{pt})=>s+pt.y,0)/pts.length};

    // ── Compute initial centre & radius ─────────────────────────────────
    // For 3 entities: binary search on radius. For a given r, the centre
    // must sit at distance r from every entity. We solve for the centre from
    // the first two entities, then measure residual against the third.
    // This converges to the unique inscribed arc without relying on Gauss-Seidel.

    // Returns {cx,cy} of the centre that is at distance r from entity, on the
    // inward side of refPt, using the other entity as context for the 2nd constraint.
    const centreAtDist=(e0,e1,r)=>{
      // For each line: the locus of centres at dist r is a line parallel to it.
      // For each circle/arc: it's a circle at radius (R±r) from its centre.
      // We compute the unique intersection of the two loci closest to centroid.
      const locus=(ent)=>{
        if(ent.type==='line'){
          const{p1,p2}=ent, dx=p2.x-p1.x, dy=p2.y-p1.y, len=Math.sqrt(dx*dx+dy*dy)||1;
          let nx=-dy/len, ny=dx/len;
          if(nx*centroid.x+ny*centroid.y-(nx*p1.x+ny*p1.y)<0){nx=-nx;ny=-ny;}
          // Centre at: p_on_line + r*n  →  nx*cx + ny*cy = nx*p1.x + ny*p1.y + r
          return {type:'line', nx, ny, d: nx*p1.x+ny*p1.y+r};
        } else {
          // circle or arc: centre of entity is ent.centre, radius R
          const R=ent.radius, ox=ent.centre.x, oy=ent.centre.y;
          // Two options: external (R+r) or internal (|R-r|). Pick based on centroid side.
          const dc=Math.sqrt((centroid.x-ox)**2+(centroid.y-oy)**2);
          const ext=dc>R; // centroid is outside entity → external tangency
          return {type:'circle', ox, oy, R: ext? R+r : Math.abs(R-r)};
        }
      };
      const L0=locus(e0), L1=locus(e1);
      // Intersect L0 and L1
      if(L0.type==='line'&&L1.type==='line'){
        // Two parallel-offset lines: ax+by=d0, cx+dy=d1
        const det=L0.nx*L1.ny-L0.ny*L1.nx;
        if(Math.abs(det)<1e-10) return null;
        return {cx:(L0.d*L1.ny-L1.d*L0.ny)/det, cy:(L0.nx*L1.d-L1.nx*L0.d)/det};
      }
      if(L0.type==='circle'&&L1.type==='line'){
        // Circle and line: project circle centre onto line, pick the side nearer centroid
        const{ox,oy,R:Rc}=L0, {nx,ny,d}=L1;
        const dc=nx*ox+ny*oy-d; // signed dist from circle centre to offset line
        if(Math.abs(dc)>Rc) return null;
        const foot={x:ox-nx*dc,y:oy-ny*dc};
        const t=Math.sqrt(Math.max(0,Rc*Rc-dc*dc));
        const tang={x:-ny,y:nx}; // tangent along line
        const c0={x:foot.x+t*tang.x,y:foot.y+t*tang.y};
        const c1={x:foot.x-t*tang.x,y:foot.y-t*tang.y};
        const d0=(c0.x-centroid.x)**2+(c0.y-centroid.y)**2;
        const d1=(c1.x-centroid.x)**2+(c1.y-centroid.y)**2;
        return d0<d1?c0:c1;
      }
      if(L0.type==='line'&&L1.type==='circle') return centreAtDist(e1,e0,r); // swap
      if(L0.type==='circle'&&L1.type==='circle'){
        const{ox:ox0,oy:oy0,R:R0}=L0, {ox:ox1,oy:oy1,R:R1}=L1;
        const dx=ox1-ox0,dy=oy1-oy0,D=Math.sqrt(dx*dx+dy*dy);
        if(D<1e-10||D>R0+R1||D<Math.abs(R0-R1)) return null;
        const a=(R0*R0-R1*R1+D*D)/(2*D);
        const h=Math.sqrt(Math.max(0,R0*R0-a*a));
        const mx=ox0+a*dx/D, my=oy0+a*dy/D;
        const c0={x:mx+h*dy/D,y:my-h*dx/D};
        const c1={x:mx-h*dy/D,y:my+h*dx/D};
        const d0=(c0.x-centroid.x)**2+(c0.y-centroid.y)**2;
        const d1=(c1.x-centroid.x)**2+(c1.y-centroid.y)**2;
        return d0<d1?c0:c1;
      }
      return null;
    };

    // Residual of candidate (cx,cy) against a third entity at radius r
    const residual3=(c,e2,r)=>{
      if(!c) return 1e9;
      if(e2.type==='line'){
        const{p1,p2}=e2,dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.sqrt(dx*dx+dy*dy)||1;
        const nx=-dy/len,ny=dx/len;
        return Math.abs(Math.abs(nx*(c.cx-p1.x)+ny*(c.cy-p1.y))-r);
      }
      const d=Math.sqrt((c.cx-e2.centre.x)**2+(c.cy-e2.centre.y)**2);
      return Math.abs(d-(e2.radius+r));
    };

    let cx, cy;

    if(pts.length===3){
      // Binary search on r to find inscribed arc radius
      const es=pts.map(p=>p.entity);
      // Estimate upper bound from initial normal-ray intersection
      const norms=pts.map(({pt,entity})=>{
        let n=entityNormal(entity,pt);
        if(n.x*(centroid.x-pt.x)+n.y*(centroid.y-pt.y)<0) n={x:-n.x,y:-n.y};
        return {pt,n};
      });
      const C0=rayIntersect2D(norms[0].pt.x,norms[0].pt.y,norms[0].n.x,norms[0].n.y,
                              norms[1].pt.x,norms[1].pt.y,norms[1].n.x,norms[1].n.y);
      const initCx=C0?.x??centroid.x, initCy=C0?.y??centroid.y;
      let rLo=0, rHi=pts.reduce((s,{pt})=>s+Math.sqrt((pt.x-initCx)**2+(pt.y-initCy)**2),0)/pts.length*2||200;
      let bestC={cx:initCx,cy:initCy};
      for(let i=0;i<64;i++){
        const rMid=(rLo+rHi)/2;
        const c=centreAtDist(es[0],es[1],rMid);
        const res=residual3(c,es[2],rMid);
        if(res<1e-4){ bestC=c; rLo=rHi=rMid; break; }
        // Determine which half to keep: measure residual at slightly larger r
        const rTest=rMid+0.01;
        const cT=centreAtDist(es[0],es[1],rTest);
        const resT=residual3(cT,es[2],rTest);
        if(resT<res) rLo=rMid; else rHi=rMid;
        if(c&&res<residual3(bestC,es[2],rMid)) bestC=c;
      }
      cx=bestC?.cx??initCx; cy=bestC?.cy??initCy;
    }

    if(cx===undefined){
      // 2-contact: intersect inward normals from first two points
      const norms=pts.map(({pt,entity})=>{
        let n=entityNormal(entity,pt);
        if(n.x*(centroid.x-pt.x)+n.y*(centroid.y-pt.y)<0) n={x:-n.x,y:-n.y};
        return {pt,n};
      });
      const C0=rayIntersect2D(norms[0].pt.x,norms[0].pt.y,norms[0].n.x,norms[0].n.y,
                              norms[1].pt.x,norms[1].pt.y,norms[1].n.x,norms[1].n.y);
      cx=C0?.x??centroid.x; cy=C0?.y??centroid.y;
    }

    // Reproject tangent points from estimated centre — near-solved start position for solver
    pts.forEach(({pt,entity})=>{ const p=projectOnEntity(entity,cx,cy); pt.x=p.x; pt.y=p.y; });

    const r=pts.reduce((s,{pt})=>s+Math.sqrt((pt.x-cx)**2+(pt.y-cy)**2),0)/pts.length||10;
    const p0=pts[0].pt, pN=pts[pts.length-1].pt;
    sk._beginBatch();
    const Cpt=sk._mkPt(cx,cy,{construction:true,name:'Arc centre'});
    // Use inverted=false as placeholder — for 3-contact arcs it gets corrected post-solve
    const a=sk._mkAr(Cpt,r,p0,pN,{inverted:false});
    if(pts.length===3) a.throughPt=pts[1].pt;
    pts.forEach(({pt,entity})=>{
      addPointOnEntity(sk,pt,entity);
      sk._mkC('tangent',[a,entity]);
      sk._mkC('point_on_circle',[pt,a]);
    });
    sk._endBatch();
    sk._solveAndNotify();
    setSel(new Set([a.id])); activateTool('select');
  };

  // ── Pinch zoom (native touch events) ─────────────────────────────
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const onTouchStart=e=>{
      touchCountRef.current=e.touches.length;
      if(e.touches.length===2){
        const[t1,t2]=e.touches;
        const dx=t1.clientX-t2.clientX, dy=t1.clientY-t2.clientY;
        pinchRef.current={
          dist:Math.sqrt(dx*dx+dy*dy),
          midX:(t1.clientX+t2.clientX)/2,
          midY:(t1.clientY+t2.clientY)/2
        };
      }
    };
    const onTouchMove=e=>{
      e.preventDefault();
      touchCountRef.current=e.touches.length;
      if(e.touches.length===2&&pinchRef.current){
        const[t1,t2]=e.touches;
        const dx=t1.clientX-t2.clientX, dy=t1.clientY-t2.clientY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const midX=(t1.clientX+t2.clientX)/2, midY=(t1.clientY+t2.clientY)/2;
        const r=el.getBoundingClientRect();
        if(pinchRef.current.dist>0) cam.zoom(dist/pinchRef.current.dist, midX-r.left, midY-r.top);
        cam.pan(midX-pinchRef.current.midX, midY-pinchRef.current.midY);
        pinchRef.current={dist,midX,midY};
        rerender();
      }
    };
    const onTouchEnd=e=>{
      touchCountRef.current=e.touches.length;
      if(e.touches.length<2) pinchRef.current=null;
    };
    el.addEventListener('touchstart',onTouchStart,{passive:false});
    el.addEventListener('touchmove',onTouchMove,{passive:false});
    el.addEventListener('touchend',onTouchEnd);
    return ()=>{
      el.removeEventListener('touchstart',onTouchStart);
      el.removeEventListener('touchmove',onTouchMove);
      el.removeEventListener('touchend',onTouchEnd);
    };
  },[]);

  // ── Pointer down ──────────────────────────────────────────────────
  const onPointerDown=useCallback(e=>{
    if(touchCountRef.current>=2) return;  // pinch in progress
    if(e.button===2){ lineStartRef.current=null; circleCenterRef.current=null; rerender(); return; }
    const w=getWorld(e);
    const snapR=18/cam.scale;
    if(conflict) return;
    if(e.altKey){ panRef.current={active:true,sx:e.clientX,sy:e.clientY,tx:cam.tx,ty:cam.ty}; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const hit=pick(w.x,w.y,sk,snapR);

    if(tool==='select'){
      // Constraints mode: icons handle their own taps via stopPropagation;
      // tapping empty space (this handler) just clears the selection.
      if(selectMode==='constraints'){ setSel(new Set()); return; }
      if(selectMode==='rect'){
        // Begin potential rubber-band — decide tap vs drag in onPointerMove/Up
        rectDragRef.current={start:{x:w.x,y:w.y},end:{x:w.x,y:w.y},active:false};
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      // Tap mode
      if(hit?.type==='point'){
        const p=hit.entity;
        const s=new Set(sel); s.has(p.id)?s.delete(p.id):s.add(p.id); setSel(s);
        if(s.has(p.id)){ dragRef.current={active:true,mode:'point',pt:p,startWorld:{x:w.x,y:w.y},startPtPos:{x:p.x,y:p.y}}; e.currentTarget.setPointerCapture(e.pointerId); }
      } else if(hit?.type==='circle'||hit?.type==='arc'){
        const ent=hit.entity;
        const s=new Set(sel); s.has(ent.id)?s.delete(ent.id):s.add(ent.id); setSel(s);
        if(s.has(ent.id)){
          dragRef.current={active:true,mode:'radius',entity:ent,startRadius:ent.radius};
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } else if(hit){
        const s=new Set(sel); s.has(hit.entity.id)?s.delete(hit.entity.id):s.add(hit.entity.id); setSel(s);
      } else {
        setSel(new Set());
        panRef.current={active:true,sx:e.clientX,sy:e.clientY,tx:cam.tx,ty:cam.ty};
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if(tool==='point'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
      autoConstrainNewPoint(pt,sk,snapR);
      return;
    }
    if(tool==='line'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
      autoConstrainNewPoint(pt,sk,snapR);
      const ls=lineStartRef.current;
      if(!ls){ lineStartRef.current=pt; rerender(); }
      else{ sk.addLine({p1:ls,p2:pt}); lineStartRef.current=pt; }
      return;
    }
    if(tool==='circle'){
      const cc=circleCenterRef.current;
      if(!cc){
        // First tap — centre point
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
        autoConstrainNewPoint(pt,sk,snapR);
        circleCenterRef.current=pt; rerender();
      } else {
        // Second tap — radius point: real point on the circle, auto-constrained
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
        const r=Math.sqrt((pt.x-cc.x)**2+(pt.y-cc.y)**2);
        if(r>1){
          const ci=sk.addCircle({centre:cc,radius:r});
          if(ci){
            sk.addConstraint('point_on_circle',[pt,ci]);
            autoConstrainNewPoint(pt,sk,snapR);
          }
        }
        circleCenterRef.current=null;
      }
    }
    if(tool==='centerArc'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
      autoConstrainNewPoint(pt,sk,snapR);
      const arc=arcRef.current;
      if(!arc){ arcRef.current={centre:pt}; rerender(); return; }
      if(!arc.startPt){ arcRef.current={...arc,startPt:pt}; rerender(); return; }
      // Third tap: direction already implicit from where user tapped (mirrors preview)
      const r=Math.sqrt((arc.startPt.x-arc.centre.x)**2+(arc.startPt.y-arc.centre.y)**2);
      if(r>1){
        const sa=Math.atan2(arc.startPt.y-arc.centre.y,arc.startPt.x-arc.centre.x);
        const ea=Math.atan2(pt.y-arc.centre.y,pt.x-arc.centre.x);
        const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
        // inverted=false always draws short arc — matches the preview
        const a=sk._mkAr(arc.centre,r,arc.startPt,pt,{inverted:false});
        const s1=sk._mkLn(arc.centre,arc.startPt,{construction:true,name:'spoke'});
        const s2=sk._mkLn(arc.centre,pt,{construction:true,name:'spoke'});
        sk._mkC('equal',[s1,s2]);
        sk._mkC('point_on_circle',[arc.startPt,a]);
        sk._mkC('point_on_circle',[pt,a]);
        sk._solveAndNotify();
        setSel(new Set([a.id])); activateTool('select');
      }
      arcRef.current=null;
    }
    if(tool==='3pArc'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
      autoConstrainNewPoint(pt,sk,snapR);
      const arc=arcRef.current;
      if(!arc){ arcRef.current={p1:pt}; rerender(); return; }
      if(!arc.p2){ arcRef.current={...arc,p2:pt}; rerender(); return; }
      // Third tap: equal spokes → solver maintains circumcentre
      const cc=circumcentre(arc.p1,arc.p2,pt);
      if(cc){
        const C=sk._mkPt(cc.x,cc.y,{construction:true,name:'Arc centre'});
        const r=Math.sqrt((arc.p1.x-cc.x)**2+(arc.p1.y-cc.y)**2);
        const s1=sk._mkLn(C,arc.p1,{construction:true,name:'spoke'});
        const s2=sk._mkLn(C,arc.p2,{construction:true,name:'spoke'});
        const s3=sk._mkLn(C,pt,{construction:true,name:'spoke'});
        sk._mkC('equal',[s1,s2]); // dist(C,p1) = dist(C,p2)
        sk._mkC('equal',[s1,s3]); // dist(C,p1) = dist(C,p3) → C = circumcentre
        const a=sk._mkAr(C,r,arc.p1,pt,{inverted:false});
        a.throughPt=arc.p2; // arc must pass through the middle tap point
        sk._mkC('point_on_circle',[arc.p1,a]);
        sk._mkC('point_on_circle',[arc.p2,a]);
        sk._mkC('point_on_circle',[pt,a]);
        sk._solveAndNotify();
        setSel(new Set([a.id])); activateTool('select');
      }
      arcRef.current=null;
    }
    if(tool==='tangentArc'){
      // Each tap selects an entity; the tangent point is projected onto that entity.
      // 2 taps → Done to commit.  3 taps → auto-commit.
      const hit=pick(w.x,w.y,sk,snapR*2);
      if(!hit||hit.type==='point') return; // must tap a line, arc, or circle
      const entity=hit.entity;
      const proj=projectOnEntity(entity,w.x,w.y);
      const pt=sk.addPoint(proj.x,proj.y); if(!pt) return;
      addPointOnEntity(sk,pt,entity);
      const state=arcRef.current||{pts:[]};
      const newPts=[...state.pts,{pt,entity}];
      if(newPts.length<3){ arcRef.current={pts:newPts}; rerender(); return; }
      commitTangentArc(newPts); arcRef.current=null;
    }

    if(tool==='3pCircle'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
      autoConstrainNewPoint(pt,sk,snapR);
      const arc=arcRef.current;
      if(!arc){ arcRef.current={p1:pt}; rerender(); return; }
      if(!arc.p2){ arcRef.current={...arc,p2:pt}; rerender(); return; }
      const cc=circumcentre(arc.p1,arc.p2,pt);
      if(cc){
        const C=sk._mkPt(cc.x,cc.y,{construction:true,name:'Circle centre'});
        const r=Math.sqrt((arc.p1.x-cc.x)**2+(arc.p1.y-cc.y)**2);
        const s1=sk._mkLn(C,arc.p1,{construction:true,name:'spoke'});
        const s2=sk._mkLn(C,arc.p2,{construction:true,name:'spoke'});
        const s3=sk._mkLn(C,pt,{construction:true,name:'spoke'});
        sk._mkC('equal',[s1,s2]); sk._mkC('equal',[s1,s3]);
        const ci=sk._mkCi(C,r);
        sk._mkC('point_on_circle',[arc.p1,ci]);
        sk._mkC('point_on_circle',[arc.p2,ci]);
        sk._mkC('point_on_circle',[pt,ci]);
        sk._solveAndNotify();
        setSel(new Set([ci.id])); activateTool('select');
      }
      arcRef.current=null;
    }
    if(tool==='centerRect'||tool==='cornerRect'||tool==='ngon'){
      const d1=draw1Ref.current;
      if(!d1){
        // First tap — create + auto-constrain the anchor point
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y); if(!pt) return;
        autoConstrainNewPoint(pt,sk,snapR);
        draw1Ref.current=pt; rerender(); return;
      }
      // Second tap — use raw world coords, no extra point created
      const d1p=d1;
      if(tool==='centerRect'){
        const dx=w.x-d1p.x, dy=w.y-d1p.y;
        const corners=[{x:d1p.x-dx,y:d1p.y-dy},{x:d1p.x+dx,y:d1p.y-dy},
                        {x:d1p.x+dx,y:d1p.y+dy},{x:d1p.x-dx,y:d1p.y+dy}];
        const{pts,lns}=_sketchClosedPolygon(sk,corners,snapR);
        // 1 perpendicular is sufficient — with the two symmetric constraints the
        // other three corners are algebraically implied (only one right angle is independent)
        sk._mkC('perpendicular',[lns[0],lns[1]]);
        // Centre stays at geometric centre — allows rotation while keeping symmetry
        sk._mkC('symmetric',[pts[0],pts[2],d1p]);
        sk._mkC('symmetric',[pts[1],pts[3],d1p]);
        sk._solveAndNotify();
      } else if(tool==='cornerRect'){
        const p2=sk._mkPt(w.x,d1p.y), p3=sk._mkPt(w.x,w.y), p4=sk._mkPt(d1p.x,w.y);
        const l1=sk._mkLn(d1p,p2), l2=sk._mkLn(p2,p3), l3=sk._mkLn(p3,p4), l4=sk._mkLn(p4,d1p);
        // 3 perpendicular constraints at corners
        sk._mkC('perpendicular',[l1,l2]);
        sk._mkC('perpendicular',[l2,l3]);
        sk._mkC('perpendicular',[l3,l4]);
        autoConstrainPoints([p2,p3,p4],sk,snapR);
        sk._solveAndNotify();
      } else { // ngon
        const r=Math.sqrt((w.x-d1p.x)**2+(w.y-d1p.y)**2);
        const a0=Math.atan2(w.y-d1p.y,w.x-d1p.x), N=ngonSidesRef.current;
        const corners=Array.from({length:N},(_,k)=>({
          x:d1p.x+r*Math.cos(a0+2*Math.PI*k/N),
          y:d1p.y+r*Math.sin(a0+2*Math.PI*k/N)
        }));
        const verts=corners.map(c=>sk._mkPt(c.x,c.y));
        const sides=verts.map((v,i)=>sk._mkLn(v,verts[(i+1)%N]));
        const circ=sk._mkCi(d1p,r,{construction:true});
        verts.forEach(v=>sk._mkC('point_on_circle',[v,circ],null,false));
        for(let i=1;i<sides.length;i++) sk._mkC('equal',[sides[0],sides[i]],null,false);
        autoConstrainPoints(verts,sk,snapR);
        sk._solveAndNotify();
      }
      draw1Ref.current=null;
    }
  },[tool,sel,conflict,getWorld]);

  // ── Pointer move ──────────────────────────────────────────────────
  const onPointerMove=useCallback(e=>{
    if(touchCountRef.current>=2) return;
    const w=getWorld(e); setMouseWorld(w);

    // Rubber-band rect
    if(rectDragRef.current){
      const dx=w.x-rectDragRef.current.start.x, dy=w.y-rectDragRef.current.start.y;
      if(Math.sqrt(dx*dx+dy*dy) > 8/cam.scale){
        rectDragRef.current={...rectDragRef.current, end:{x:w.x,y:w.y}, active:true};
        rerender();
      }
      return;
    }

    if(panRef.current.active){ cam.tx=panRef.current.tx+(e.clientX-panRef.current.sx); cam.ty=panRef.current.ty+(e.clientY-panRef.current.sy); rerender(); return; }
    if(dragRef.current.active){
      const d=dragRef.current;
      if(d.mode==='radius'){
        const c=d.entity.centre;
        const dx=w.x-c.x, dy=w.y-c.y;
        d.entity.radius=Math.max(1,Math.sqrt(dx*dx+dy*dy));
        sk.markDirty();
      } else {
        const{pt,startWorld,startPtPos}=d;
        const tx = startPtPos.x+(w.x-startWorld.x);
        const ty = startPtPos.y+(w.y-startWorld.y);
        // Move pt to the mouse position. For planegcs this is the starting point
        // for the temporary-constraint drag solve. For GS fallback, _dragFixed
        // pins pt here so other points adjust to maintain constraints.
        pt.x = tx; pt.y = ty;
        sk._dragFixed  = pt;
        sk._dragTarget = {x: tx, y: ty};
        dbg(`drag handler: pt=${pt.id} target=(${tx.toFixed(1)},${ty.toFixed(1)})`);
        // If this point is on a circle/arc with no radius constraint, resize it
        for (const c of (pt._constraints ?? [])) {
          if ((c.type==='point_on_circle') && !c.disabled) {
            const curve = c.refs[1];
            const hasR = [...(curve._constraints ?? [])].some(rc => rc.type==='radius' && !rc.disabled);
            if (!hasR) {
              const dx=pt.x-curve.centre.x, dy=pt.y-curve.centre.y;
              curve.radius = Math.max(1, Math.sqrt(dx*dx+dy*dy));
            }
          }
        }
        sk.markDirty();
      }
    }
  },[getWorld]);

  // ── Pointer up ────────────────────────────────────────────────────
  const onPointerUp=useCallback(e=>{
    // Finalise rubber-band rect
    if(rectDragRef.current){
      if(rectDragRef.current.active){
        const{start,end}=rectDragRef.current;
        const found=getEntitiesInRect(sk,start.x,start.y,end.x,end.y);
        setSel(prev=>new Set([...prev,...found]));
      } else {
        // Tap in rect mode — still toggles single entity
        const w=rectDragRef.current.start;
        const hit=pick(w.x,w.y,sk,18/cam.scale);
        if(hit){ setSel(prev=>{const s=new Set(prev);s.has(hit.entity.id)?s.delete(hit.entity.id):s.add(hit.entity.id);return s;}); }
      }
      rectDragRef.current=null; rerender();
    }
    dragRef.current.active=false; panRef.current.active=false;
    if (sk._dragFixed) { sk._dragFixed=null; sk._dragTarget=null; sk._solveAndNotify(); }
    try{ e.currentTarget.releasePointerCapture(e.pointerId); }catch(_){}
  },[]);

  // ── Wheel zoom ────────────────────────────────────────────────────
  const onWheel=useCallback(e=>{
    e.preventDefault();
    const r=svgRef.current?.getBoundingClientRect()??{left:0,top:0};
    cam.zoom(e.deltaY>0?0.88:1.14,e.clientX-r.left,e.clientY-r.top); rerender();
  },[]);

  // ── Camera / sheet actions ────────────────────────────────────────
  const onCam=useCallback(action=>{
    if(action==='recenter') cam.recenter(dims.W,dims.H);
    else if(action==='fit') cam.fitToContent(sk,dims.W,dims.H);
    rerender();
  },[dims]);

  const doClear=()=>{
    const fresh = new Sketch();
    if (activePage) {
      activePage.sketch = fresh;
      fresh.onChange(()=>{ doc._notify(); });
    }
    // Mutate the existing camera rather than replacing it — avoids stale closure issues
    // in the ResizeObserver and anywhere else that captured a reference.
    cam.tx = dims.W/2; cam.ty = dims.H/2; cam.scale = 1;
    // Clear all in-progress drawing state
    lineStartRef.current=null; circleCenterRef.current=null;
    draw1Ref.current=null; arcRef.current=null;
    if(arcInvertedRef) arcInvertedRef.current=false;
    dragRef.current={active:false,pt:null,startWorld:null,startPtPos:null};
    panRef.current={active:false,sx:0,sy:0,tx:0,ty:0};
    setSel(new Set()); setSheetOpen(false); setShowConfirm(false);
    doc._notify();
  };

  // ── Constraint application ────────────────────────────────────────
  const onConstraint=useCallback((type, activeOverride=null)=>{
    if(conflict) return;
    const resolved = type==='dimension' ? (activeOverride??dimType) : type;
    const result=applyConstraintFromSelection(resolved,sk,sel);
    if(result?.needsInput) setDimPending(result);
    else setSel(new Set());
  },[sel,conflict,dimType]);

  const onDimConfirm=useCallback(val=>{
    if(dimPending?.type==='_ngon_sides'){
      ngonSidesRef.current=Math.max(3,Math.min(64,Math.round(val)));
    } else if(dimPending?.editTarget) {
      // Editing existing constraint — update value in place and re-solve
      dimPending.editTarget.value = val;
      sk._solveAndNotify();
    } else if(dimPending){
      sk.addConstraint(dimPending.type,dimPending.refs,val);
    }
    setDimPending(null);
    setSel(new Set());
  },[dimPending]);

  // ── Status text ───────────────────────────────────────────────────
  const statusText=
    conflict?'Conflict — tap ↩ to undo':
    tool==='line'?(lineStartRef.current?'Tap endpoint · right-tap to stop':'Tap to start line'):
    tool==='circle'?(circleCenterRef.current?'Tap to set radius':'Tap centre point'):
    tool==='centerArc'?(!arcRef.current?'Tap arc centre':!arcRef.current?.startPt?'Tap start point':'Tap end point'):
    tool==='3pArc'?(!arcRef.current?'Tap point 1':!arcRef.current?.p2?'Tap point 2':'Tap point 3 on arc'):
    tool==='3pCircle'?(!arcRef.current?'Tap point 1':!arcRef.current?.p2?'Tap point 2':'Tap point 3 on circle'):
    tool==='tangentArc'?(!arcRef.current?.pts?.length?'Tap a line, arc, or circle':'arcRef.current.pts.length===1?"Tap entity 2 · Done after":"Tap entity 3 or Done"'):
    tool==='centerRect'?(draw1Ref.current?'Tap for corner':'Tap for centre'):
    tool==='cornerRect'?(draw1Ref.current?'Tap for opposite corner':'Tap for first corner'):
    tool==='ngon'?(draw1Ref.current?`Tap for radius (${ngonSidesRef.current} sides)`:'Tap for centre'):
    tool==='select'?'Tap · drag points · select + constrain':
    tool==='point'?'Tap to place point':'';

  // bottom menu/sheet state
  const [openMenu, setOpenMenu] = useState(null); // 'draw' | 'camera' | null

  const toolBtn=active=>({
    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
    gap:3,flex:1,minWidth:56,minHeight:58,padding:'6px 4px',
    background:active?'#0d2040':'transparent',
    border:'none',borderTop:`2px solid ${active?'#2a70c0':'transparent'}`,
    cursor:'pointer',color:active?'#a0c8f0':'#7a9ab8',
  });

  const DRAW_TOOLS=[
    {id:'line',  icon:'╱', label:'Line'},
    {id:'point', icon:'●', label:'Point'},
    {id:'rect', icon:'▭', label:'Rect', group:[
      {id:'cornerRect', icon:'▭', label:'Corner'},
      {id:'centerRect', icon:'⊠', label:'Center'},
    ]},
    {id:'ngon',       icon:'⬡', label:'N-Gon'},
    {id:'circle', icon:'○', label:'Circle', group:[
      {id:'circle',   icon:'⊙', label:'Cntr'},
      {id:'3pCircle', icon:'○', label:'3P'},
    ]},
    {id:'arc', icon:'⌒', label:'Arc', group:[
      {id:'centerArc',  icon:'⌓', label:'Cntr'},
      {id:'3pArc',      icon:'⌒', label:'3P'},
      {id:'tangentArc', icon:'⌢', label:'3T'},
    ]},
    {id:'ellipse',    icon:'⬭', label:'Ellipse',  stub:true},
    {id:'bspline',    icon:'∿', label:'B-Spline', stub:true},
  ];

  const [expandedGroup, setExpandedGroup] = useState(null);

  // Map any sub-tool id back to its parent group entry
  const parentGroup = id => DRAW_TOOLS.find(t => t.group?.some(s=>s.id===id));

  // For group buttons: show the active sub-tool's icon/label if current tool is in that group
  const groupActive = t => t.group?.find(s=>s.id===tool) ?? t.group?.[0];

  const isDrawTool = tool!=='select';
  const activeDraw = DRAW_TOOLS.find(t=>t.id===tool || t.group?.some(s=>s.id===tool));

  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100vh',
      background:C.bg,color:C.text,position:'relative',
      fontFamily:"'JetBrains Mono','Fira Code','Courier New',monospace",
      userSelect:'none',overflow:'hidden'}}>

      {/* Thin top bar — status + DOF */}
      <AppTopBar statusText={statusText} sk={sk} conflict={conflict}
        onClear={()=>setShowConfirm(true)}
        doc={doc} onSwitchPage={switchPage}
        cam={cam} dims={dims}/>

      {/* Canvas — fills all available space */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <svg ref={svgRef}
          style={{width:'100%',height:'100%',display:'block',touchAction:'none',
            cursor:tool==='select'?'default':'crosshair'}}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
          onContextMenu={e=>e.preventDefault()}>
          <rect width="100%" height="100%" fill={C.bg}/>
          <GridLines cam={cam} W={dims.W} H={dims.H}/>

          {/* Red ghost — conflict positions rendered under valid geometry */}
          {conflict&&sk.conflictState.ghostState&&(()=>{
            const gs=sk.conflictState.ghostState;
            const gpt=id=>gs[id]??null;
            const ge=[];
            for(const ln of sk.lines.values()){
              if(sk.reserved.has(ln)) continue;
              const p1=gpt(ln.p1.id)||ln.p1, p2=gpt(ln.p2.id)||ln.p2;
              const s1=cam.toScreen(p1.x,p1.y), s2=cam.toScreen(p2.x,p2.y);
              ge.push(<line key={`g${ln.id}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                stroke="#ff4444" strokeWidth={2} opacity={0.55}
                strokeDasharray={ln.construction?'6 3':undefined}/>);
            }
            for(const ci of sk.circles.values()){
              const cP=gpt(ci.centre.id)||ci.centre;
              const r=(gs[ci.id]?.r??ci.radius)*cam.scale;
              const sc=cam.toScreen(cP.x,cP.y);
              ge.push(<circle key={`g${ci.id}`} cx={sc.x} cy={sc.y} r={r}
                fill="none" stroke="#ff4444" strokeWidth={2} opacity={0.55}/>);
            }
            for(const a of sk.arcs.values()){
              const cP=gpt(a.centre.id)||a.centre;
              const sP=gpt(a.startPt.id)||a.startPt;
              const eP=gpt(a.endPt.id)||a.endPt;
              const sr=cam.toScreen(sP.x,sP.y), se=cam.toScreen(eP.x,eP.y);
              const rad=(gs[a.id]?.r??a.radius)*cam.scale;
              const {largeArc:la,sweepFlag:sf}=arcDrawFlags(a);
              ge.push(<path key={`g${a.id}`}
                d={`M ${sr.x} ${sr.y} A ${rad} ${rad} 0 ${la} ${sf} ${se.x} ${se.y}`}
                fill="none" stroke="#ff4444" strokeWidth={2} opacity={0.55}/>);
            }
            return <g>{ge}</g>;
          })()}
          <SketchView sk={sk} cam={cam} sel={sel}
            lineStart={lineStartRef.current} circleCenter={circleCenterRef.current}
            mouseWorld={mouseWorld} W={dims.W} H={dims.H}
            selectMode={selectMode}
            onConstraintTap={cid=>{
              setSel(s=>{ const n=new Set(s); n.has(cid)?n.delete(cid):n.add(cid); return n; });
            }}/>

          {/* CentreArc: radius line (step 1→2) and live arc preview (step 2→3) */}
          {tool==='centerArc'&&arcRef.current&&mouseWorld&&(()=>{
            const{centre,startPt}=arcRef.current;
            const sc=cam.toScreen(centre.x,centre.y);
            if(!startPt){
              // Step 1→2: show radius line from centre to mouse
              const sm=cam.toScreen(mouseWorld.x,mouseWorld.y);
              return <line x1={sc.x} y1={sc.y} x2={sm.x} y2={sm.y}
                stroke={C.geom} strokeWidth={1} strokeDasharray="4 3" opacity={0.5}/>;
            }
            // Step 2→3: live arc + reference circle
            const r=Math.sqrt((startPt.x-centre.x)**2+(startPt.y-centre.y)**2);
            if(r<1) return null;
            const sr=r*cam.scale;
            const ma=Math.atan2(mouseWorld.y-centre.y, mouseWorld.x-centre.x);
            const sa=Math.atan2(startPt.y-centre.y, startPt.x-centre.x);
            const ex=centre.x+r*Math.cos(ma), ey=centre.y+r*Math.sin(ma);
            const span=((ma-sa)+2*Math.PI)%(2*Math.PI);
            const sweepFlag=span<=Math.PI?0:1; // short arc follows cursor
            const ss=cam.toScreen(startPt.x,startPt.y);
            const se=cam.toScreen(ex,ey);
            return <>
              <circle cx={sc.x} cy={sc.y} r={sr}
                fill="none" stroke={C.construction} strokeWidth={1}
                strokeDasharray="3 3" opacity={0.25}/>
              <path d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 0 ${sweepFlag} ${se.x} ${se.y}`}
                fill="none" stroke={C.geom} strokeWidth={2}
                strokeDasharray="5 3" opacity={0.75}/>
              <circle cx={se.x} cy={se.y} r={5} fill={C.geom} opacity={0.7}/>
            </>;
          })()}

          {/* 3P Arc: show circumscribed arc through p1, p2, mouse */}
          {tool==='3pArc'&&arcRef.current?.p2&&mouseWorld&&(()=>{
            const{p1,p2}=arcRef.current;
            const cc=circumcentre(p1,p2,mouseWorld);
            if(!cc) return null;
            const r=Math.sqrt((p1.x-cc.x)**2+(p1.y-cc.y)**2);
            const sr=r*cam.scale;
            const sc=cam.toScreen(cc.x,cc.y);
            const ss=cam.toScreen(p1.x,p1.y);
            const se=cam.toScreen(mouseWorld.x,mouseWorld.y);
            const sa=Math.atan2(p1.y-cc.y,p1.x-cc.x);
            const ea=Math.atan2(mouseWorld.y-cc.y,mouseWorld.x-cc.x);
            const a2=Math.atan2(p2.y-cc.y,p2.x-cc.x);
            const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
            const p2OnCCW=((a2-sa)+2*Math.PI)%(2*Math.PI)<=span;
            const sweepFlag=p2OnCCW?0:1;
            return <>
              <circle cx={sc.x} cy={sc.y} r={sr}
                fill="none" stroke={C.construction} strokeWidth={1}
                strokeDasharray="3 3" opacity={0.2}/>
              <path d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 0 ${sweepFlag} ${se.x} ${se.y}`}
                fill="none" stroke={C.geom} strokeWidth={2}
                strokeDasharray="5 3" opacity={0.75}/>
            </>;
          })()}
          {/* Rubber-band selection rect */}
          {rectDragRef.current?.active&&(()=>{
            const{start,end}=rectDragRef.current;
            const s1=cam.toScreen(start.x,start.y), s2=cam.toScreen(end.x,end.y);
            return <rect x={Math.min(s1.x,s2.x)} y={Math.min(s1.y,s2.y)}
              width={Math.abs(s2.x-s1.x)} height={Math.abs(s2.y-s1.y)}
              fill="rgba(40,100,220,0.08)" stroke="#3a70e0" strokeWidth={1}
              strokeDasharray="4 3" style={{pointerEvents:'none'}}/>;
          })()}
        </svg>

        {/* Done drawing pill */}
        {(lineStartRef.current||circleCenterRef.current||draw1Ref.current||arcRef.current)&&(
          <button onClick={()=>{
            const tPts=arcRef.current?.pts;
            if(tPts?.length>=2){ commitTangentArc(tPts); arcRef.current=null; return; }
            lineStartRef.current=null; circleCenterRef.current=null;
            draw1Ref.current=null; arcRef.current=null; arcInvertedRef.current=false;
            activateTool('select'); rerender();
          }} style={{
            position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',
            background:'#0d2040',border:'2px solid #2a70c0',color:'#60c0ff',
            borderRadius:24,padding:'10px 24px',fontSize:14,fontWeight:600,
            cursor:'pointer',boxShadow:'0 4px 16px #000c',whiteSpace:'nowrap',
            zIndex:4
          }}>✓ Done drawing</button>
        )}

        {/* Selection pills — Delete, Flip arc, Clear */}
        {tool==='select'&&sel.size>0&&!(lineStartRef.current||circleCenterRef.current||draw1Ref.current||arcRef.current)&&(
          <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',
            display:'flex',gap:10,zIndex:4}}>
            <button onClick={()=>{
              sk._beginBatch();
              for(const id of sel){
                const p=sk.points.get(id),l=sk.lines.get(id),ci=sk.circles.get(id),ar=sk.arcs.get(id);
                if(ar) deleteArcWithDeps(ar,sk);
                else if(p&&!p.reserved) sk.deleteEntity(p);
                else if(l&&!sk.reserved.has(l)) sk.deleteEntity(l);
                else if(ci) sk.deleteEntity(ci);
                else { const con=sk.constraints.find(c=>c.id===id); if(con&&!con.locked) sk.deleteConstraint(con); }
              }
              sk._endBatch();
              setSel(new Set());
            }} style={{
              background:'#1a0a0a',border:'2px solid #662222',color:'#ff6666',
              borderRadius:24,padding:'10px 24px',fontSize:14,fontWeight:600,
              cursor:'pointer',boxShadow:'0 4px 16px #000c',whiteSpace:'nowrap'
            }}>🗑 Delete ({sel.size})</button>
            {[...sel].some(id=>sk.arcs.has(id))&&(()=>{
              const selArcs=[...sel].map(id=>sk.arcs.get(id)).filter(Boolean)
                .filter(a=>!a.throughPt); // flip only makes sense for centre arcs
              if(!selArcs.length) return null;
              const allReflex=selArcs.every(a=>a.inverted);
              // Compute sweep angle for display
              const sweepDeg = selArcs.length===1 ? (()=>{
                const a=selArcs[0];
                const {drawCCW,span}=arcDrawFlags(a);
                const deg = drawCCW ? span : 2*Math.PI-span;
                return Math.round(deg*180/Math.PI);
              })() : null;
              return (
                <button onClick={()=>{
                  selArcs.forEach(a=>{ a.inverted=!a.inverted; });
                  // Fit camera to show the full arc extent
                  cam.fitToContent(sk, dims.W, dims.H);
                  rerender();
                }} style={{
                  background:'#0a1a2a',border:'2px solid #2a70c0',color:'#a0d0ff',
                  borderRadius:24,padding:'10px 24px',fontSize:14,fontWeight:600,
                  cursor:'pointer',boxShadow:'0 4px 16px #000c',whiteSpace:'nowrap'
                }}>⇄ {allReflex?'Reflex':'Acute'}{sweepDeg?` (${sweepDeg}°)`:''}</button>
              );
            })()}
            <button onClick={()=>setSel(new Set())} style={{
              background:'#1a1a0a',border:'2px solid #5a5020',color:'#c0a040',
              borderRadius:24,padding:'10px 24px',fontSize:14,fontWeight:600,
              cursor:'pointer',boxShadow:'0 4px 16px #000c',whiteSpace:'nowrap'
            }}>✕ Clear</button>
          </div>
        )}

        {/* Multi ON badge */}
        {/* Conflict toast */}
        {/* Redundant constraint banner — auto-dismissed after 2.5s */}
        {constraintError?.type==='redundant'&&(
          <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10,
            background:'#1a120a',borderTop:'2px solid #886622',
            padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:16}}>⚠</span>
            <span style={{color:'#ffcc77',fontSize:11,fontWeight:600,letterSpacing:'0.08em'}}>
              REDUNDANT CONSTRAINT
            </span>
            <span style={{color:'#aa8844',fontSize:11,marginLeft:4}}>
              — already implied by existing constraints
            </span>
            <button onClick={()=>{sk.constraintError=null;rerender();}}
              style={{marginLeft:'auto',background:'none',border:'none',color:'#886622',
                cursor:'pointer',fontSize:14,padding:'2px 6px'}}>✕</button>
          </div>
        )}

        {conflict&&(
          <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10,
            background:'#120808',borderTop:'2px solid #662222',
            boxShadow:'0 -8px 32px rgba(180,0,0,0.4)',padding:'12px 14px'}}>
            <div style={{color:'#ff6666',fontSize:11,fontWeight:700,
              letterSpacing:'0.12em',marginBottom:3}}>CONFLICT</div>
            <div style={{color:'#cc8888',fontSize:11,fontFamily:'monospace',
              marginBottom:10,opacity:0.85}}>
              {sk.conflictState.trigger?.description||'Overconstrained geometry'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
              {resolutions.map((res,i)=>(
                <button key={i} onClick={()=>setSelectedRes(i)} style={{
                  display:'flex',alignItems:'center',gap:10,
                  background:selectedRes===i?'#2a0808':'transparent',
                  border:`1px solid ${selectedRes===i?'#663333':'#2a1212'}`,
                  borderRadius:8,padding:'9px 12px',cursor:'pointer',
                  color:selectedRes===i?'#ffaaaa':'#664444',
                  textAlign:'left',fontSize:11,fontFamily:'monospace'}}>
                  <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                    background:selectedRes===i?'#ff6666':'#331818'}}/>
                  {res.primary?'↩ ':''}{res.label}{res.primary?' (undo)':''}
                </button>
              ))}
              {resolutions.length===0&&(
                <div style={{color:'#664444',fontSize:11,fontStyle:'italic'}}>
                  No single-removal solution found — try ↩ Undo
                </div>
              )}
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>sk.undo()} style={{
                flex:1,padding:'10px',borderRadius:8,cursor:'pointer',
                background:'#1a0808',border:'1px solid #442222',
                color:'#ff8888',fontSize:12,fontWeight:600}}>↩ Undo</button>
              {resolutions[selectedRes]&&!resolutions[selectedRes].primary&&(
                <button onClick={()=>applyResolution(resolutions[selectedRes])} style={{
                  flex:1,padding:'10px',borderRadius:8,cursor:'pointer',
                  background:'#0d2040',border:'1px solid #2a70c0',
                  color:'#60c0ff',fontSize:12,fontWeight:600}}>Apply</button>
              )}
            </div>
          </div>
        )}

        {/* Dim input — moved to top-level modal */}

        {/* Confirm dialog */}
        {showConfirm&&(
          <ConfirmDialog
            message="Clear sketch?"
            detail="All geometry and constraints will be removed."
            confirmLabel="Clear all"
            onConfirm={doClear}
            onCancel={()=>setShowConfirm(false)}/>
        )}
      </div>

      {/* Contextual constraint strip */}
      {(()=>{
        const selPts=[...sel].filter(id=>sk.points.has(id)&&!sk.points.get(id).reserved).map(id=>sk.points.get(id));
        const selLns=[...sel].filter(id=>sk.lines.has(id)&&!sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
        const selCis=[...sel].filter(id=>sk.circles.has(id)).map(id=>sk.circles.get(id));
        const selArs=[...sel].filter(id=>sk.arcs.has(id)).map(id=>sk.arcs.get(id));
        const dimModes=getDimensionModes(selPts,selLns,selCis,selArs);
        const cycleDim=()=>setDimType(t=>{
          const modes=dimModes.length?dimModes:['distance'];
          return modes[(modes.indexOf(t)+1)%modes.length];
        });
        return <ContextualConstraintStrip sk={sk} sel={sel} onConstraint={onConstraint}
          conflict={conflict} dimType={dimType} dimModes={dimModes} onCycleDim={cycleDim}/>;
      })()}

      {/* Bottom toolbar */}
      <div style={{background:'#080d18',borderTop:`1px solid ${C.border}`,
        flexShrink:0,position:'relative'}}>

        {/* Click-away for menus — fires on press, before any layout shift can redirect clicks */}
        {openMenu&&<div onClick={()=>setOpenMenu(null)}
          style={{position:'fixed',inset:0,zIndex:1}}/>}

        {/* DRAW menu — slides up */}
        {openMenu==='draw'&&(
          <div onPointerDown={e=>e.stopPropagation()}
            style={{position:'absolute',bottom:'100%',left:0,right:0,zIndex:2,
            background:'#0a1020',borderTop:`1px solid ${C.border}`,
            padding:'12px',boxShadow:'0 -4px 20px #000b'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.15em',marginBottom:10}}>DRAW TOOL</div>

            {/* Sub-tool strip — shown when a group is expanded */}
            {expandedGroup&&(()=>{
              const grp=DRAW_TOOLS.find(t=>t.id===expandedGroup);
              if(!grp?.group) return null;
              return (
                <div style={{display:'flex',gap:6,marginBottom:10,
                  padding:'8px 10px',background:'#080e1e',borderRadius:8,
                  border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:9,color:C.muted,alignSelf:'center',marginRight:4,letterSpacing:'0.1em'}}>
                    {grp.label.toUpperCase()}
                  </span>
                  {grp.group.map(s=>(
                    <button key={s.id} onClick={()=>{
                      if(s.stub) return;
                      activateTool(s.id); setOpenMenu(null); setExpandedGroup(null);
                    }} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                      padding:'9px 4px',borderRadius:6,cursor:s.stub?'default':'pointer',
                      border:'1px solid',
                      background:tool===s.id?'#0d2444':'#0d1525',
                      borderColor:tool===s.id?'#2a70c0':C.border,
                      color:s.stub?C.muted:tool===s.id?'#a0c8f0':'#8ab0cc',
                      opacity:s.stub?0.4:1}}>
                      <span style={{fontSize:20}}>{s.icon}</span>
                      <span style={{fontSize:8,letterSpacing:'0.08em'}}>{s.label}</span>
                      {s.stub&&<span style={{fontSize:7,color:C.muted}}>soon</span>}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Main tool grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {DRAW_TOOLS.map(t=>{
                const isGroup=!!t.group;
                const ga=isGroup?groupActive(t):null;
                const displayIcon=isGroup?ga.icon:t.icon;
                const displayLabel=isGroup?ga.label:t.label;
                const isActive=isGroup?(t.group.some(s=>s.id===tool)):tool===t.id;
                const isExpanded=expandedGroup===t.id;

                return (
                  <button key={t.id}
                    {...(isGroup
                      ? makeLongPress(
                          () => {
                            if(t.stub) return;
                            if(isActive) {
                              // second tap on active group → open sub-strip
                              setExpandedGroup(g => g===t.id ? null : t.id);
                            } else {
                              // first tap → activate current sub-tool, close menu
                              activateTool(ga.id); setOpenMenu(null); setExpandedGroup(null);
                            }
                          },
                          () => setExpandedGroup(g => g===t.id ? null : t.id),
                        )
                      : { onClick: () => {
                            if(t.stub) return;
                            if(t.id==='ngon'){
                              activateTool('ngon'); setOpenMenu(null); setExpandedGroup(null);
                              setDimPending({type:'_ngon_sides',refs:[],
                                label:'N-Gon sides:',defaultVal:String(ngonSidesRef.current)});
                              return;
                            }
                            activateTool(t.id); setOpenMenu(null); setExpandedGroup(null);
                          }
                        }
                    )}
                    style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      position:'relative',
                      padding:'12px 4px',borderRadius:8,cursor:t.stub?'default':'pointer',
                      border:'1px solid',
                      background:isActive?'#0d2444':isExpanded?'#0a1830':'#0d1525',
                      borderColor:isActive?'#2a70c0':isExpanded?'#1a3a60':C.border,
                      color:t.stub?C.muted:isActive?'#a0c8f0':'#8ab0cc',
                      opacity:t.stub?0.4:1}}>
                    {/* Corner triangle — long-press hint for group buttons */}
                    {isGroup&&!t.stub&&<span style={{
                      position:'absolute',top:0,right:0,
                      width:9,height:9,
                      background:isActive?'#4488ff':'#3d5068',
                      clipPath:'polygon(100% 0, 0 0, 100% 100%)',
                    }}/>}
                    <span style={{fontSize:22}}>{displayIcon}</span>
                    <span style={{fontSize:9,letterSpacing:'0.08em'}}>
                      {displayLabel.toUpperCase()}{isGroup&&isExpanded?' ▾':''}
                    </span>
                    {t.stub&&<span style={{fontSize:7,color:C.muted}}>soon</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CAMERA menu — slides up */}
        {openMenu==='camera'&&(
          <div style={{position:'absolute',bottom:'100%',right:0,zIndex:2,
            background:'#0a1020',border:`1px solid ${C.border}`,
            borderRadius:'8px 8px 0 0',padding:'10px 14px 8px',
            minWidth:200,boxShadow:'0 -4px 20px #000b'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.15em',marginBottom:10}}>CAMERA</div>
            {[
              {icon:'⌖',label:'Recenter',sub:'Origin to viewport centre',action:()=>{ onCam('recenter'); setOpenMenu(null); }},
              {icon:'⛶',label:'Fit to content',sub:'Pan & zoom to geometry',action:()=>{ onCam('fit'); setOpenMenu(null); }},
            ].map(item=>(
              <button key={item.label} onClick={item.action}
                style={{display:'flex',alignItems:'center',gap:10,width:'100%',
                  background:'#0d1525',border:`1px solid ${C.border}`,borderRadius:6,
                  padding:'10px 12px',cursor:'pointer',marginBottom:6,color:'inherit',textAlign:'left'}}>
                <span style={{fontSize:18,color:'#5090e0',flexShrink:0}}>{item.icon}</span>
                <div>
                  <div style={{fontSize:12,color:C.text}}>{item.label}</div>
                  <div style={{fontSize:9,color:C.muted}}>{item.sub}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Toolbar buttons */}
        <div style={{display:'flex',alignItems:'stretch'}}>

        {/* SELECT menu — slides up */}
        {openMenu==='select'&&(
          <div style={{position:'absolute',bottom:'100%',left:0,zIndex:2,
            background:'#0a1020',borderTop:`1px solid ${C.border}`,
            padding:'12px',boxShadow:'0 -4px 20px #000b'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.15em',marginBottom:10}}>SELECT MODE</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {[
                {id:'tap',         icon:'↖', label:'Tap'},
                {id:'rect',        icon:'⬚', label:'Rect'},
                {id:'constraints', icon:'⊙', label:'Constraints'},
              ].map(m=>(
                <button key={m.id} onClick={()=>{ setSelectMode(m.id); setOpenMenu(null); }}
                  style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                    padding:'12px 4px',borderRadius:8,cursor:'pointer',border:'1px solid',
                    background:selectMode===m.id?'#0d2444':'#0d1525',
                    borderColor:selectMode===m.id?'#2a70c0':C.border,
                    color:selectMode===m.id?'#a0c8f0':'#8ab0cc'}}>
                  <span style={{fontSize:22}}>{m.icon}</span>
                  <span style={{fontSize:9,letterSpacing:'0.1em'}}>{m.label}</span>
                </button>
              ))}
              <button onClick={()=>{
                const all=new Set([
                  ...[...sk.points.keys()].filter(id=>!sk.points.get(id).reserved),
                  ...[...sk.lines.keys()].filter(id=>!sk.reserved.has(sk.lines.get(id))),
                  ...[...sk.circles.keys()]
                ]);
                setSel(all); setOpenMenu(null);
              }} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                padding:'12px 4px',borderRadius:8,cursor:'pointer',border:`1px solid ${C.border}`,
                background:'#0d1525',color:C.muted}}>
                <span style={{fontSize:22}}>◻</span>
                <span style={{fontSize:9,letterSpacing:'0.1em'}}>ALL</span>
              </button>
            </div>
          </div>
        )}

          {/* Select */}
          {(()=>{
            const lp = makeLongPress(
              () => {
                if(tool==='select') {
                  // second tap — open mode picker
                  setOpenMenu(m => m==='select' ? null : 'select');
                } else {
                  // first tap — switch to select, close menu
                  activateTool('select'); setOpenMenu(null);
                }
              },
              () => setOpenMenu(m => m==='select' ? null : 'select'),
            );
            return (
              <button {...lp}
                style={{...toolBtn(tool==='select'), position:'relative'}}>
                {/* Corner triangle — long-press hint */}
                <span style={{
                  position:'absolute',top:0,right:0,
                  width:8,height:8,
                  background:tool==='select'?'#4488ff':'#3d5068',
                  clipPath:'polygon(100% 0, 0 0, 100% 100%)',
                }}/>
                <span style={{fontSize:20}}>{selectMode==='rect'?'⬚':selectMode==='constraints'?'⊙':'↖'}</span>
                <span style={{fontSize:8,letterSpacing:'0.1em'}}>SELECT</span>
              </button>
            );
          })()}

          {/* Draw */}
          <button onClick={()=>{
            if(openMenu==='draw'){ setOpenMenu(null); setExpandedGroup(null); return; }
            if(isDrawTool && (lineStartRef.current||circleCenterRef.current||draw1Ref.current||arcRef.current)){
              lineStartRef.current=null; circleCenterRef.current=null; draw1Ref.current=null;
              activateTool('select'); rerender(); return;
            }
            setOpenMenu('draw');
          }}
            style={toolBtn(openMenu==='draw'||isDrawTool)}>
            <span style={{fontSize:20}}>{activeDraw&&tool!=='select'?activeDraw.icon:'╱'}</span>
            <span style={{fontSize:8,letterSpacing:'0.1em'}}>
              {lineStartRef.current||circleCenterRef.current||draw1Ref.current ? 'CANCEL ✕' : 'DRAW ▾'}
            </span>
          </button>

          {/* Toggle Construction */}
          {(()=>{
            const selEnts=[...sel].map(id=>
              sk.lines.get(id)??sk.circles.get(id)??sk.arcs.get(id)
            ).filter(Boolean).filter(e=>!sk.reserved.has(e));
            const hasConstruction=selEnts.some(e=>e.construction);
            const active=selEnts.length>0;
            return (
              <button onClick={()=>{
                if(!active) return;
                const makeConstr=!hasConstruction;
                selEnts.forEach(e=>{ e.construction=makeConstr; });
                rerender();
              }}
                style={{...toolBtn(false),
                  color:active?(hasConstruction?C.construction:'#8ab0cc'):C.muted,
                  opacity:active?1:0.35}}>
                <span style={{fontSize:18}}>⊙</span>
                <span style={{fontSize:8,letterSpacing:'0.1em'}}>
                  {hasConstruction?'CONSTR ON':'CONSTR OFF'}
                </span>
              </button>
            );
          })()}

          {/* Undo */}
          <button onClick={()=>sk.undo()}
            style={{...toolBtn(false),color:sk._undoStack.length?'#5090d0':C.muted,
              opacity:sk._undoStack.length?1:0.4}}>
            <span style={{fontSize:22}}>↩</span>
            <span style={{fontSize:8,letterSpacing:'0.1em'}}>UNDO</span>
          </button>

          {/* Camera */}
          <button onClick={()=>setOpenMenu(m=>m==='camera'?null:'camera')}
            style={toolBtn(openMenu==='camera')}>
            <span style={{fontSize:18}}>⌖</span>
            <span style={{fontSize:8,letterSpacing:'0.1em'}}>CAMERA ▾</span>
          </button>

        </div>
      </div>

      {/* Bottom sheet (constraint list) */}
      <BottomSheet
        isOpen={sheetOpen} onToggle={()=>setSheetOpen(o=>!o)}
        sk={sk} sel={sel}
        onDelete={c=>sk.deleteConstraint(c)}
        onToggleLocked={c=>{ c.locked=!c.locked; rerender(); }}
        onToggleDisabled={c=>{ c.disabled=!c.disabled; sk._solveAndNotify(); }}
        onEdit={c=>{
          // Re-open DimInput for dimensional constraints
          const lbl = c.type==='radius' ? `${c.refs[0]?.name} radius (mm):` :
                      c.type==='distance' ? `${c.refs[0]?.name} length (mm):` :
                      `Angle (°):`;
          const cur = c.type==='angle' ? c.value : Math.round(c.value);
          setDimPending({ type:c.type, refs:c.refs, label:lbl, defaultVal:String(cur), editTarget:c });
        }}
        onCam={onCam}/>

      {/* Dim input — top-level modal, covers everything */}
      {dimPending&&<DimInput pending={dimPending} onConfirm={onDimConfirm} onCancel={()=>setDimPending(null)}/>}

    </div>
  );
}
