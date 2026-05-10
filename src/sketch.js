import { SketchPoint, SketchLine, SketchCircle, SketchArc, initOrigin } from './entities.js';
import { makeConstraint } from './constraints/classes.js';
import { solve } from './solver/index.js';

export class Sketch {
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

  _checkDegenerate() {
    const EPS=0.5;
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
          if (q.id<=p.id) continue;
          const ddx=q.x-p.x, ddy=q.y-p.y;
          if (ddx*ddx+ddy*ddy < EPS*EPS) {
            const direct=[...p._constraints].some(c=>
              (c.type==='coincident'||c.type==='distance')&&c.refs.includes(q)
            );
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
      return null;
    const c=this._execute(()=>{ const c=this._mkC(type,refs,value,driven); return {result:c, undo:()=>c.delete()}; });
    if (!c) return null;
    if (this.solveResult?.redundantIds?.includes(c.id)) {
      this.constraintError={type:'redundant',constraintType:type};
      this.undo();
      return null;
    }
    this.constraintError=null;
    return c;
  }
  deleteConstraint(c){
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
    const constraintsBefore = [...sk.constraints];
    this._beginBatch();
    e.delete();
    const afterSet = new Set(sk.constraints);
    const deletedConstraints = constraintsBefore.filter(c => !afterSet.has(c));
    this._undoStack.push(() => {
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
    for(const[id,p] of Object.entries(j.points??{})){
      const pt=sk._mkPt(p.x,p.y,{construction:p.construction,name:p.name});
      sk.points.delete(pt.id); pt.id=id; sk.points.set(id,pt); byId[id]=pt;
    }
    for(const[id,l] of Object.entries(j.lines??{})){
      const p1=byId[l.p1],p2=byId[l.p2]; if(!p1||!p2) continue;
      const ln=sk._mkLn(p1,p2,{construction:l.construction,name:l.name});
      sk.lines.delete(ln.id); ln.id=id; sk.lines.set(id,ln); byId[id]=ln;
    }
    for(const[id,c] of Object.entries(j.circles??{})){
      const ctr=byId[c.centre]; if(!ctr) continue;
      const ci=sk._mkCi(ctr,c.radius,{construction:c.construction,name:c.name});
      sk.circles.delete(ci.id); ci.id=id; sk.circles.set(id,ci); byId[id]=ci;
    }
    for(const[id,a] of Object.entries(j.arcs??{})){
      const ctr=byId[a.centre],sp=byId[a.startPt],ep=byId[a.endPt]; if(!ctr||!sp||!ep) continue;
      const arc=sk._mkAr(ctr,a.radius,sp,ep,{inverted:a.inverted,construction:a.construction,name:a.name});
      sk.arcs.delete(arc.id); arc.id=id; sk.arcs.set(id,arc); byId[id]=arc;
      if(a.throughPt) arc.throughPt=byId[a.throughPt]??null;
    }
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
