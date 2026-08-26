import { genId } from '../utils.js';

export function adjLen(p1, p2, target, fs) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const f1 = fs.has(p1), f2 = fs.has(p2);
  if (f1 && f2) return;
  if (f1)      { p2.x = p1.x + (dx / len) * target; p2.y = p1.y + (dy / len) * target; }
  else if (f2) { p1.x = p2.x - (dx / len) * target; p1.y = p2.y - (dy / len) * target; }
  else {
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    p1.x = cx - (dx / len) * target / 2; p1.y = cy - (dy / len) * target / 2;
    p2.x = cx + (dx / len) * target / 2; p2.y = cy + (dy / len) * target / 2;
  }
}

export function applyDir(rp1, rp2, p1, p2, fs, perp = false) {
  const dx = rp2.x - rp1.x, dy = rp2.y - rp1.y;
  const len1 = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  let tx = dx / len1, ty = dy / len1;
  if (perp) [tx, ty] = [-ty, tx];
  const dx2 = p2.x - p1.x, dy2 = p2.y - p1.y;
  const len2 = Math.max(0.001, Math.sqrt(dx2 * dx2 + dy2 * dy2));
  const f1 = fs.has(p1), f2 = fs.has(p2);
  if (f1 && f2) return;
  if (f1)      { p2.x = p1.x + tx * len2; p2.y = p1.y + ty * len2; }
  else if (f2) { p1.x = p2.x - tx * len2; p1.y = p2.y - ty * len2; }
  else {
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    p1.x = cx - tx * len2 / 2; p1.y = cy - ty * len2 / 2;
    p2.x = cx + tx * len2 / 2; p2.y = cy + ty * len2 / 2;
  }
}

// --- DOF resolution helpers ---
// More DOF = driven (less constrained). Tie = second entity (b) is driven (a was selected first = driver).
function _pickDrivenPt(a, b)  { return a.dof > b.dof ? a : b; }
function _lineDof(l)           { return l.p1.dof + l.p2.dof; }
function _lineDrivenPt(l)      { return l.p1.dof > l.p2.dof ? l.p1 : l.p2; }
function _curveDof(e)          { return e.type === 'line' ? _lineDof(e) : (e.centre?.dof ?? 0) + e.dof; }

class Constraint {
  constructor({ refs, value = null, driven = false, locked = false, scale = 1 }) {
    this.id = genId(); this.refs = refs; this.value = value;
    this.driven = driven; this.locked = locked; this.disabled = false;
    this.scale = scale;
    this.name = null; this._sketch = null; this.varRef = null;
    this._drivenEntity = null; this._drivenCost = 0;
    for (const r of refs) r._constraints?.add(this);
    if (!driven) this._setupDriven();
  }
  _setupDriven() {}
  _consumeFrom(entity, cost) {
    this._drivenEntity = entity; this._drivenCost = cost;
    entity?._consumedDof?.set(this, cost);
  }
  get dofCost()     { return this.driven ? 0 : this._dofCost; }
  get _dofCost()    { return 1; }
  get description() { return this.type; }
  get solvedValue() { return null; }
  apply(fs) { if (!this.driven) this._apply(fs); }
  _apply(_fs) {}
  get _minRefs() { return this.refs.length; }
  _refDeleted(deletedRef) {
    const remaining = this.refs.filter(r => r !== deletedRef).length;
    if (remaining < this._minRefs) this.delete();
  }
  delete() {
    for (const r of this.refs) r._constraints?.delete(this);
    this._drivenEntity?._consumedDof?.delete(this);
    this._drivenEntity = null;
    if (!this._sketch) return;
    this._sketch.constraints = this._sketch.constraints.filter(c => c !== this);
    this._sketch.markDirty();
    this._sketch = null;
  }
  _attachToSketch(sk) { this._sketch = sk; }
  // Re-consume DOF when constraint is re-attached (undo)
  _reattach(sk) {
    this._sketch = sk;
    if (this._drivenEntity && this._drivenCost)
      this._drivenEntity._consumedDof?.set(this, this._drivenCost);
  }
}

class DimensionalConstraint extends Constraint {
  constructor(a) { super(a); this._solvedValue = null; }
  get solvedValue() { return this.driven ? this._solvedValue : this.value; }
  updateSolvedValue() { if (this.driven) this._solvedValue = this._computeSolvedValue(); }
  _computeSolvedValue() { return null; }
}

class GeometricConstraint extends Constraint {
  constructor(a) { super({ ...a, driven: false, value: null }); }
}

class CoincidentConstraint extends GeometricConstraint {
  get type() { return 'coincident'; } get _dofCost() { return 2; }
  get description() { return `${this.refs[0].name} = ${this.refs[1].name}`; }
  _setupDriven() {
    const [p1, p2] = this.refs;
    this._consumeFrom(_pickDrivenPt(p1, p2), 2);
  }
  _apply(fs) {
    const [p1, p2] = this.refs, f1 = fs.has(p1), f2 = fs.has(p2);
    if (f1 && f2) return;
    if (f1) { p2.x = p1.x; p2.y = p1.y; }
    else if (f2) { p1.x = p2.x; p1.y = p2.y; }
    else { p1.x = p2.x = (p1.x + p2.x) / 2; p1.y = p2.y = (p1.y + p2.y) / 2; }
  }
}

class HorizontalConstraint extends GeometricConstraint {
  get type() { return 'horizontal'; }
  get description() {
    if (this.refs.length === 2) return `${this.refs[0].name} ↔ ${this.refs[1].name} horizontal`;
    return `${this.refs[0].name} horizontal`;
  }
  _setupDriven() {
    const pts = this.refs[0].type === 'line'
      ? [this.refs[0].p1, this.refs[0].p2] : [this.refs[0], this.refs[1]];
    this._consumeFrom(_pickDrivenPt(pts[0], pts[1]), 1);
  }
  _apply(fs) {
    if (this.refs.length === 2) {
      const [p1, p2] = this.refs, f1 = fs.has(p1), f2 = fs.has(p2);
      if (f1 && f2) return;
      const my = (p1.y + p2.y) / 2;
      if (!f1) p1.y = f2 ? p2.y : my;
      if (!f2) p2.y = f1 ? p1.y : my;
      return;
    }
    const { p1, p2 } = this.refs[0], f1 = fs.has(p1), f2 = fs.has(p2);
    if (f1 && f2) return;
    const my = (p1.y + p2.y) / 2;
    if (!f1) p1.y = f2 ? p2.y : my;
    if (!f2) p2.y = f1 ? p1.y : my;
  }
}

class VerticalConstraint extends GeometricConstraint {
  get type() { return 'vertical'; }
  get description() {
    if (this.refs.length === 2) return `${this.refs[0].name} ↕ ${this.refs[1].name} vertical`;
    return `${this.refs[0].name} vertical`;
  }
  _setupDriven() {
    const pts = this.refs[0].type === 'line'
      ? [this.refs[0].p1, this.refs[0].p2] : [this.refs[0], this.refs[1]];
    this._consumeFrom(_pickDrivenPt(pts[0], pts[1]), 1);
  }
  _apply(fs) {
    if (this.refs.length === 2) {
      const [p1, p2] = this.refs, f1 = fs.has(p1), f2 = fs.has(p2);
      if (f1 && f2) return;
      const mx = (p1.x + p2.x) / 2;
      if (!f1) p1.x = f2 ? p2.x : mx;
      if (!f2) p2.x = f1 ? p1.x : mx;
      return;
    }
    const { p1, p2 } = this.refs[0], f1 = fs.has(p1), f2 = fs.has(p2);
    if (f1 && f2) return;
    const mx = (p1.x + p2.x) / 2;
    if (!f1) p1.x = f2 ? p2.x : mx;
    if (!f2) p2.x = f1 ? p1.x : mx;
  }
}

class ParallelConstraint extends GeometricConstraint {
  get type() { return 'parallel'; }
  get description() { return `${this.refs[0].name} ∥ ${this.refs[1].name}`; }
  _setupDriven() {
    const [l1, l2] = this.refs;
    const driven = _lineDof(l1) > _lineDof(l2) ? l1 : l2;
    this._consumeFrom(_lineDrivenPt(driven), 1);
  }
  _apply(fs) { const [a, b] = this.refs; applyDir(a.p1, a.p2, b.p1, b.p2, fs, false); }
}

class PerpendicularConstraint extends GeometricConstraint {
  get type() { return 'perpendicular'; }
  get description() { return `${this.refs[0].name} ⊥ ${this.refs[1].name}`; }
  _setupDriven() {
    const [l1, l2] = this.refs;
    const driven = _lineDof(l1) > _lineDof(l2) ? l1 : l2;
    this._consumeFrom(_lineDrivenPt(driven), 1);
  }
  _apply(fs) { const [a, b] = this.refs; applyDir(a.p1, a.p2, b.p1, b.p2, fs, true); }
}

class EqualConstraint extends GeometricConstraint {
  get type() { return 'equal'; }
  get description() { return `${this.refs[0].name} = ${this.refs[1].name}`; }
  _setupDriven() {
    const [a, b] = this.refs;
    const da = a.type === 'line' ? _lineDof(a) : a.dof;
    const db = b.type === 'line' ? _lineDof(b) : b.dof;
    const driven = da > db ? a : b;
    if (driven.type === 'line') this._consumeFrom(_lineDrivenPt(driven), 1);
    else                        this._consumeFrom(driven, 1);
  }
  _apply(fs) {
    const [a, b] = this.refs;
    const dx1 = a.p2.x - a.p1.x, dy1 = a.p2.y - a.p1.y;
    const dx2 = b.p2.x - b.p1.x, dy2 = b.p2.y - b.p1.y;
    const avg = (Math.sqrt(dx1 * dx1 + dy1 * dy1) + Math.sqrt(dx2 * dx2 + dy2 * dy2)) / 2;
    adjLen(a.p1, a.p2, avg, fs); adjLen(b.p1, b.p2, avg, fs);
  }
}

class FixedConstraint extends GeometricConstraint {
  constructor(a) { super(a); this.fx = a.refs[0].x; this.fy = a.refs[0].y; }
  get type() { return 'fixed'; } get _dofCost() { return 2; }
  get description() { return `${this.refs[0].name} fixed`; }
  _setupDriven() { this._consumeFrom(this.refs[0], 2); }
  _apply() { this.refs[0].x = this.fx; this.refs[0].y = this.fy; }
}

class TangentConstraint extends GeometricConstraint {
  get type() { return 'tangent'; }
  get description() { return `${this.refs[0].name} ⌒ ${this.refs[1].name}`; }
  _setupDriven() {
    const [a, b] = this.refs;
    const driven = _curveDof(a) > _curveDof(b) ? a : b;
    if (driven.type === 'line') this._consumeFrom(_lineDrivenPt(driven), 1);
    else                        this._consumeFrom(driven.centre, 1);
  }
  _apply(fs) {
    const [a, b] = this.refs, ta = a.type, tb = b.type;
    if (ta === 'line' && (tb === 'circle' || tb === 'arc')) this._lc(a, b, fs);
    else if ((ta === 'circle' || ta === 'arc') && tb === 'line') this._lc(b, a, fs);
    else if ((ta === 'circle' || ta === 'arc') && (tb === 'circle' || tb === 'arc')) this._cc(a, b, fs);
  }
  _lc(line, curve, fs) {
    const { p1, p2 } = line, dx = p2.x - p1.x, dy = p2.y - p1.y, lsq = dx * dx + dy * dy;
    if (lsq < 1e-10) return;
    const t = ((curve.centre.x - p1.x) * dx + (curve.centre.y - p1.y) * dy) / lsq;
    const fx = p1.x + t * dx, fy = p1.y + t * dy;
    const cx = curve.centre.x - fx, cy = curve.centre.y - fy;
    const d = Math.sqrt(cx * cx + cy * cy); if (d < 1e-10) return;
    const nx = cx / d, ny = cy / d;
    const err = d - curve.radius;
    if (!fs.has(curve.centre)) { curve.centre.x -= nx * err; curve.centre.y -= ny * err; }
    else {
      if (!fs.has(p1)) { p1.x += nx * err; p1.y += ny * err; }
      if (!fs.has(p2)) { p2.x += nx * err; p2.y += ny * err; }
    }
  }
  _cc(a, b, fs) {
    const dx = b.centre.x - a.centre.x, dy = b.centre.y - a.centre.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ext = a.radius + b.radius, int = Math.abs(a.radius - b.radius);
    const target = Math.abs(dist - ext) < Math.abs(dist - int) ? ext : int;
    const err = dist - target, ux = dx / dist, uy = dy / dist;
    if (!fs.has(a.centre)) { a.centre.x += ux * err * 0.5; a.centre.y += uy * err * 0.5; }
    if (!fs.has(b.centre)) { b.centre.x -= ux * err * 0.5; b.centre.y -= uy * err * 0.5; }
  }
}

class SymmetricConstraint extends GeometricConstraint {
  get type() { return 'symmetric'; } get _dofCost() { return 2; }
  get description() { return `${this.refs[0].name} ↔ ${this.refs[1].name} about ${this.refs[2].name}`; }
  _setupDriven() {
    const [p1, p2] = this.refs;
    this._consumeFrom(_pickDrivenPt(p1, p2), 2);
  }
  _apply(fs) {
    const [p1, p2, ax] = this.refs, f1 = fs.has(p1), f2 = fs.has(p2), fa = fs.has(ax);
    if (f1 && f2 && fa) return;
    if (fa) {
      if (f1 && f2) return;
      if (f1)      { p2.x = 2 * ax.x - p1.x; p2.y = 2 * ax.y - p1.y; }
      else if (f2) { p1.x = 2 * ax.x - p2.x; p1.y = 2 * ax.y - p2.y; }
      else { p2.x = 2 * ax.x - p1.x; p2.y = 2 * ax.y - p1.y; }
    } else if (f1 && f2) {
      ax.x = (p1.x + p2.x) / 2; ax.y = (p1.y + p2.y) / 2;
    } else if (f1) {
      p2.x = 2 * ax.x - p1.x; p2.y = 2 * ax.y - p1.y;
      ax.x = (p1.x + p2.x) / 2; ax.y = (p1.y + p2.y) / 2;
    } else if (f2) {
      p1.x = 2 * ax.x - p2.x; p1.y = 2 * ax.y - p2.y;
      ax.x = (p1.x + p2.x) / 2; ax.y = (p1.y + p2.y) / 2;
    } else {
      ax.x = (p1.x + p2.x) / 2; ax.y = (p1.y + p2.y) / 2;
    }
  }
}

class PointOnLineConstraint extends GeometricConstraint {
  get type() { return 'point_on_line'; }
  get description() { return `${this.refs[0].name} on ${this.refs[1].name}`; }
  _setupDriven() {
    const [pt, line] = this.refs;
    if (pt.dof > 0) this._consumeFrom(pt, 1);
    else            this._consumeFrom(_lineDrivenPt(line), 1);
  }
  _apply(fs) {
    const [pt, line] = this.refs; if (fs.has(pt)) return;
    const { p1, p2 } = line, dx = p2.x - p1.x, dy = p2.y - p1.y, lsq = dx * dx + dy * dy;
    if (lsq < 1e-10) return;
    const t = ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / lsq;
    pt.x = p1.x + t * dx; pt.y = p1.y + t * dy;
  }
}

class PointOnCircleConstraint extends GeometricConstraint {
  get type() { return 'point_on_circle'; }
  get description() { return `${this.refs[0].name} on ${this.refs[1].name}`; }
  _setupDriven() {
    const [pt, ci] = this.refs;
    if (pt.dof > 0) this._consumeFrom(pt, 1);
    else            this._consumeFrom(ci, 1);
  }
  _apply(fs) {
    const [pt, ci] = this.refs;
    const dx = pt.x - ci.centre.x, dy = pt.y - ci.centre.y;
    const d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-10) return;
    if (fs.has(pt)) {
      ci.radius = d;
    } else {
      pt.x = ci.centre.x + (dx / d) * ci.radius; pt.y = ci.centre.y + (dy / d) * ci.radius;
    }
  }
}

class PointOnArcConstraint extends GeometricConstraint {
  get type() { return 'point_on_arc'; }
  get description() { return `${this.refs[0].name} on ${this.refs[1].name}`; }
  _setupDriven() {
    const [pt, arc] = this.refs;
    if (pt.dof > 0) this._consumeFrom(pt, 1);
    else            this._consumeFrom(arc, 1);
  }
  _apply(fs) {
    const [pt, arc] = this.refs;
    if (fs.has(pt)) return;
    const dx = pt.x - arc.centre.x, dy = pt.y - arc.centre.y;
    const d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-10) return;
    const ta = Math.atan2(dy, dx);
    const sa = arc.startAngle, ea = arc.endAngle;
    const span = ((ea - sa) + 2*Math.PI) % (2*Math.PI);
    const tFromSa = ((ta - sa) + 2*Math.PI) % (2*Math.PI);
    if (tFromSa <= span) {
      pt.x = arc.centre.x + (dx / d) * arc.radius;
      pt.y = arc.centre.y + (dy / d) * arc.radius;
    } else {
      const distToStart = Math.min(tFromSa, 2*Math.PI - tFromSa);
      const distToEnd   = Math.min(Math.abs(tFromSa - span), 2*Math.PI - Math.abs(tFromSa - span));
      if (distToStart <= distToEnd) { pt.x = arc.startPt.x; pt.y = arc.startPt.y; }
      else                          { pt.x = arc.endPt.x;   pt.y = arc.endPt.y;   }
    }
  }
}

class DistanceConstraint extends DimensionalConstraint {
  get type() { return 'distance'; }
  get description() {
    const v = this.solvedValue, s = v == null ? '?' : `${(v * 0.01).toFixed(2)}mm`;
    return this.refs.length === 1 ? `${this.refs[0].name} = ${s}` : `${this.refs[0].name}↔${this.refs[1].name} = ${s}`;
  }
  _setupDriven() {
    if (this.refs[0].type === 'line') this._consumeFrom(_lineDrivenPt(this.refs[0]), 1);
    else                              this._consumeFrom(_pickDrivenPt(this.refs[0], this.refs[1]), 1);
  }
  _apply(fs) {
    if (this.refs.length === 1) adjLen(this.refs[0].p1, this.refs[0].p2, this.value, fs);
    else adjLen(this.refs[0], this.refs[1], this.value, fs);
  }
  _computeSolvedValue() {
    if (this.refs.length === 1) { const { p1, p2 } = this.refs[0]; return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2); }
    const [a, b] = this.refs; return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }
}

class RadiusConstraint extends DimensionalConstraint {
  get type() { return 'radius'; }
  get description() {
    const v = this.solvedValue, s = v == null ? '?' : `${(v * 0.01).toFixed(2)}mm`;
    return `${this.refs[0].name} r=${s}`;
  }
  _setupDriven() { this._consumeFrom(this.refs[0], 1); }
  _apply() { this.refs[0].radius = this.value; }
  _computeSolvedValue() { return this.refs[0].radius; }
}

class AngleConstraint extends DimensionalConstraint {
  get type() { return 'angle'; }
  get description() {
    const v = this.solvedValue, s = v == null ? '?' : `${v.toFixed(1)}°`;
    return this.refs.length === 1 ? `${this.refs[0].name} ∠${s}` : `${this.refs[0].name}∠${this.refs[1].name}=${s}`;
  }
  _setupDriven() {
    if (this.refs.length === 1) {
      this._consumeFrom(_lineDrivenPt(this.refs[0]), 1);
    } else {
      const [l1, l2] = this.refs;
      const driven = _lineDof(l1) > _lineDof(l2) ? l1 : l2;
      this._consumeFrom(_lineDrivenPt(driven), 1);
    }
  }
  _apply(fs) { this.refs.length === 1 ? this._abs(fs) : this._rel(fs); }
  _abs(fs) {
    const { p1, p2 } = this.refs[0], rad = this.value * Math.PI / 180;
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const tx = Math.cos(rad), ty = Math.sin(rad);
    const f1 = fs.has(p1), f2 = fs.has(p2); if (f1 && f2) return;
    if (f1)      { p2.x = p1.x + tx * len; p2.y = p1.y + ty * len; }
    else if (f2) { p1.x = p2.x - tx * len; p1.y = p2.y - ty * len; }
    else { const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2; p1.x = cx - tx * len / 2; p1.y = cy - ty * len / 2; p2.x = cx + tx * len / 2; p2.y = cy + ty * len / 2; }
  }
  _rel(fs) {
    const [l1, l2] = this.refs, rad = this.value * Math.PI / 180;
    const dx1 = l1.p2.x - l1.p1.x, dy1 = l1.p2.y - l1.p1.y;
    const ta = Math.atan2(dy1, dx1) + rad;
    const dx2 = l2.p2.x - l2.p1.x, dy2 = l2.p2.y - l2.p1.y;
    const len2 = Math.max(0.001, Math.sqrt(dx2 * dx2 + dy2 * dy2));
    const tx = Math.cos(ta), ty = Math.sin(ta);
    const f1 = fs.has(l2.p1), f2 = fs.has(l2.p2); if (f1 && f2) return;
    if (f1)      { l2.p2.x = l2.p1.x + tx * len2; l2.p2.y = l2.p1.y + ty * len2; }
    else if (f2) { l2.p1.x = l2.p2.x - tx * len2; l2.p1.y = l2.p2.y - ty * len2; }
    else { const cx = (l2.p1.x + l2.p2.x) / 2, cy = (l2.p1.y + l2.p2.y) / 2; l2.p1.x = cx - tx * len2 / 2; l2.p1.y = cy - ty * len2 / 2; l2.p2.x = cx + tx * len2 / 2; l2.p2.y = cy + ty * len2 / 2; }
  }
  _computeSolvedValue() {
    if (this.refs.length === 1) { const { p1, p2 } = this.refs[0]; return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI; }
    const [a, b] = this.refs;
    return ((Math.atan2(b.p2.y - b.p1.y, b.p2.x - b.p1.x) - Math.atan2(a.p2.y - a.p1.y, a.p2.x - a.p1.x)) * 180 / Math.PI + 360) % 360;
  }
}

const CREG = {
  coincident: CoincidentConstraint, horizontal: HorizontalConstraint, vertical: VerticalConstraint,
  parallel: ParallelConstraint, perpendicular: PerpendicularConstraint, equal: EqualConstraint,
  fixed: FixedConstraint, tangent: TangentConstraint, symmetric: SymmetricConstraint,
  point_on_line: PointOnLineConstraint, point_on_circle: PointOnCircleConstraint,
  point_on_arc: PointOnArcConstraint,
  distance: DistanceConstraint, radius: RadiusConstraint, angle: AngleConstraint,
};

export function makeConstraint(type, refs, value = null, driven = false) {
  const Cls = CREG[type]; if (!Cls) throw new Error(`Unknown: ${type}`);
  return new Cls({ refs, value, driven });
}
