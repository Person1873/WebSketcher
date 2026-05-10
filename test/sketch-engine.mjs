

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
    this.driven=driven; this.locked=locked; this.name=null; this._sketch=null;
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
  get description(){ return `${this.refs[0].name} horizontal`; }
  _apply(fs) {
    const {p1,p2}=this.refs[0], f1=fs.has(p1), f2=fs.has(p2);
    if (f1&&f2) return;
    const my=(p1.y+p2.y)/2;
    if (!f1) p1.y=f2?p2.y:my;
    if (!f2) p2.y=f1?p1.y:my;
  }
}

class VerticalConstraint extends GeometricConstraint {
  get type(){ return 'vertical'; }
  get description(){ return `${this.refs[0].name} vertical`; }
  _apply(fs) {
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
    if (fa) {
      if (f1&&f2) return;
      if (f1)      { p2.x=2*ax.x-p1.x; p2.y=2*ax.y-p1.y; }
      else if (f2) { p1.x=2*ax.x-p2.x; p1.y=2*ax.y-p2.y; }
      else {
        // ax fixed, both free — translate both so ax becomes their midpoint
        const ex=ax.x-(p1.x+p2.x)/2, ey=ax.y-(p1.y+p2.y)/2;
        p1.x+=ex; p1.y+=ey; p2.x+=ex; p2.y+=ey;
      }
    } else { ax.x=(p1.x+p2.x)/2; ax.y=(p1.y+p2.y)/2; }
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
    const[pt,ci]=this.refs; if (fs.has(pt)) return;
    const dx=pt.x-ci.centre.x, dy=pt.y-ci.centre.y;
    const d=Math.sqrt(dx*dx+dy*dy); if (d<1e-10) return;
    pt.x=ci.centre.x+(dx/d)*ci.radius; pt.y=ci.centre.y+(dy/d)*ci.radius;
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

// planegcs integration — set via initPlanegcs() before running tests
let _planegcs = null;
export function initPlanegcs(pg) { _planegcs = pg; }

function toGcsConstraint(c) {
  if (c.disabled || c.driven) return null;
  const r=c.refs, id=c.id, driving=!c.driven, temporary=!!c.temporary;
  switch (c.type) {
    case 'coincident':    return {type:'p2p_coincident',   id, p1_id:r[0].id, p2_id:r[1].id, driving, temporary};
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
    case 'symmetric':
      if (r.length===3&&r[2].type==='point')
        return {type:'p2p_symmetric_ppp', id, p1_id:r[0].id, p2_id:r[1].id, p_id:r[2].id, driving};
      return null;
    case 'point_on_line':   return {type:'point_on_line_pl', id, p_id:r[0].id, l_id:r[1].id, driving};
    case 'point_on_circle': return {type:'p2p_distance', id, p1_id:r[0].id, p2_id:r[1].centre.id,
                                    distance:{o_id:r[1].id, prop:'radius'}, driving};
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
    case 'fixed': return null; // handled via point.fixed flag
    default: return null;
  }
}

function solvePlanegcs(sk) {
  if (!_planegcs) return null;
  const {mod, GcsWrapper} = _planegcs;
  try {
    const gcs = new GcsWrapper(new mod.GcsSystem());
    try {
      const fixedIds=new Set();
      for (const p of sk.points.values()) if (p.reserved) fixedIds.add(p.id);
      for (const c of sk.constraints) if (c.type==='fixed'&&!c.disabled) fixedIds.add(c.refs[0].id);

      for (const [id,p] of sk.points)
        gcs.push_primitive({type:'point', id, x:p.x, y:p.y, fixed:fixedIds.has(id)});
      for (const [id,l] of sk.lines)
        gcs.push_primitive({type:'line', id, p1_id:l.p1.id, p2_id:l.p2.id});
      for (const [id,ci] of sk.circles)
        gcs.push_primitive({type:'circle', id, c_id:ci.centre.id, radius:ci.radius});
      for (const [id,arc] of sk.arcs) {
        const sa=Math.atan2(arc.startPt.y-arc.centre.y, arc.startPt.x-arc.centre.x);
        const ea=Math.atan2(arc.endPt.y-arc.centre.y,   arc.endPt.x-arc.centre.x);
        gcs.push_primitive({type:'arc', id, c_id:arc.centre.id, radius:arc.radius,
          start_angle:sa, end_angle:ea, start_id:arc.startPt.id, end_id:arc.endPt.id});
      }
      for (const c of sk.constraints) {
        const gc=toGcsConstraint(c);
        if (gc) try { gcs.push_primitive(gc); } catch(e) { console.warn('[planegcs] skip',c.type,e.message); }
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
      try { redundantIds=Array.from(gcs.get_gcs_redundant_constraints?.()??[]); } catch(_){}
      gcs.destroy_gcs_module();

      let dof=0;
      for (const p of sk.points.values()) if (!p.reserved) dof+=2;
      for (const ci of sk.circles.values()) dof+=1;
      for (const a  of sk.arcs.values())   dof+=1;
      for (const c  of sk.constraints)     if (!c.temporary) dof-=c.dofCost;

      if (conflicting.length>0) return {status:'conflict', dof, residualMM:0, redundantIds};
      if (status===2)           return {status:'near_miss', dof, residualMM:0, redundantIds};
      return {status:'ok', dof, residualMM:0, redundantIds};
    } catch(e) {
      try { gcs.destroy_gcs_module(); } catch(_){}
      throw e;
    }
  } catch(e) {
    console.warn('[planegcs] failed, using GS fallback:', e.message);
    return null;
  }
}

function solve(sk) {
  const pgResult = solvePlanegcs(sk);
  if (pgResult !== null) {
    for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();
    return pgResult;
  }
  // GS fallback
  const fs=new Set();
  for (const e of sk.reserved) if (e.type==='point') fs.add(e);
  for (const c of sk.constraints) if (c.type==='fixed'&&!c.driven) fs.add(c.refs[0]);

  const snap=[...sk.points.values()].map(p=>({p,x:p.x,y:p.y}));
  for (let i=0;i<120;i++) for (const c of sk.constraints) c.apply(fs);
  for (const c of sk.constraints) if (c.updateSolvedValue) c.updateSolvedValue();

  let residual=0;
  for (const {p,x,y} of snap) { const d=Math.sqrt((p.x-x)**2+(p.y-y)**2); if(d>residual) residual=d; }

  let dof=0;
  for (const p of sk.points.values()) if (!p.reserved) dof+=2;
  for (const ci of sk.circles.values()) dof+=1; // stored radius = 1 extra DOF
  for (const a of sk.arcs.values()) dof+=1;     // arc radius = 1 extra DOF
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
    if (r.status==='overconstrained' || degenerate) {
      if (!this.conflictState)
        this.conflictState={
          trigger: degenerate ?? this.constraints[this.constraints.length-1] ?? null,
          reason: degenerate ? 'degenerate' : 'overconstrained',
          ghostState: this._snapPos()   // positions at conflict — for red ghost rendering
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
      return null; // redundant
    return this._execute(()=>{ const c=this._mkC(type,refs,value,driven); return {result:c, undo:()=>c.delete()}; });
  }
  deleteConstraint(c){
    const d={type:c.type,refs:c.refs,value:c.value,driven:c.driven,locked:c.locked};
    c.delete();
    this._undoStack.push(()=>{ const nc=this._mkC(d.type,d.refs,d.value,d.driven); nc.locked=d.locked; this._solveAndNotify(); });
    this._solveAndNotify();
  }
  deleteEntity(e) {
    this._beginBatch();
    e.delete();
    this._undoStack.push(()=>{});
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
      const sa=a.startAngle, ea=a.endAngle;
      const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
      const drawCCW = a.inverted ? span>Math.PI : span<=Math.PI;
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
  geom:'#00bcd4', sel:'#ff7040', construction:'#2a4a8a',
  ghost:'rgba(255,60,60,0.45)', ghostPt:'rgba(255,80,80,0.7)',
  fixed:'#f0c040', driven:'#7b9fd4',
  dofOk:'#4dffaa', dofUnder:'#ffd060', dofOver:'#ff5555', dofAmber:'#ff9922',
  cc:{ fixed:'#f0c040',horizontal:'#60d0ff',vertical:'#60d0ff',coincident:'#c080ff',
       equal:'#80ff80',parallel:'#80ff80',perpendicular:'#80ff80',distance:'#ff8040',
       radius:'#ff8040',angle:'#ff8040',tangent:'#80d0ff',symmetric:'#c080ff',
       point_on_line:'#a0a0ff',point_on_circle:'#a0a0ff',
       attach:'#c080ff' }  // same colour family as coincident
};

const CICONS = {
  fixed:'⚓',horizontal:'—',vertical:'|',coincident:'⊙',equal:'=',parallel:'∥',
  perpendicular:'⊥',distance:'↔',radius:'R',angle:'∠',tangent:'⌒',symmetric:'⇔',
  point_on_line:'∈',point_on_circle:'◎',
  attach:'⊙',  // dispatches to coincident / point_on_line / point_on_circle
};

// ═══════════════════════════════════════════════════════════════════
// GRID RENDERER
// ═══════════════════════════════════════════════════════════════════

export { Sketch, SketchPoint, SketchLine, SketchCircle, SketchArc, solve, circumcentre };
