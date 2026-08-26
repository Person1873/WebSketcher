import { useState, useReducer, useEffect, useCallback, useRef } from 'react';
import { Camera } from './camera.js';
import { Sketch } from './sketch.js';
import { SketchDocument, StorageAdapter } from './document/index.js';
import { deleteArcWithDeps, circumcentre } from './entities.js';
import { pick, snapToPoint, getEntitiesInRect, autoConstrainNewPoint } from './geometry/pick.js';
import { arcDrawFlags } from './geometry/helpers.js';
import { C } from './geometry/analysis.js';
import {
  applyConstraintFromSelection, findResolutions,
  projectOnEntity, entityNormal, rayIntersect2D,
  addPointOnEntity, addTangencyConstraint,
  autoConstrainPoints, _sketchClosedPolygon,
} from './constraints/apply.js';
import { getDimensionModes } from './components/ContextualConstraintStrip.jsx';
import { dbg } from './debug.js';
import { makeLongPress } from './components/makeLongPress.js';
import GridLines from './components/GridLines.jsx';
import SketchView from './components/SketchView.jsx';
import BottomSheet from './components/BottomSheet.jsx';
import ContextualConstraintStrip from './components/ContextualConstraintStrip.jsx';
import AppTopBar from './components/AppTopBar.jsx';
import DimInput from './components/DimInput.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';

export default function SketcherApp() {
  const docRef = useRef(null);
  const camRef = useRef(null);
  const svgRef = useRef(null);
  const [,rerender] = useReducer(x=>x+1,0);

  if (!docRef.current) {
    docRef.current = StorageAdapter.load() ?? SketchDocument.create();
    camRef.current = new Camera();
    docRef.current._onChange = rerender;
    const activePage = docRef.current.activePageObj;
    if (activePage?.camera) {
      const c = activePage.camera;
      camRef.current.tx = c.tx; camRef.current.ty = c.ty; camRef.current.scale = c.scale;
    }
    const sk = docRef.current.activeSketch;
    if (sk) sk.onChange(()=>{ docRef.current._notify(); });
  }

  if (typeof window !== 'undefined') window.__sketchRef = { current: docRef.current?.activeSketch };

  const doc = docRef.current;
  const sk  = doc.activeSketch ?? new Sketch();
  const cam = camRef.current;

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

  const activePage = doc.activePageObj;
  if (activePage) activePage.camera = { tx:cam.tx, ty:cam.ty, scale:cam.scale };

  const switchPage = (pageId) => {
    if (activePage) activePage.camera = { tx:cam.tx, ty:cam.ty, scale:cam.scale };
    doc.activePage = pageId;
    const np = doc.activePageObj;
    if (np?.camera) { camRef.current.tx=np.camera.tx; camRef.current.ty=np.camera.ty; camRef.current.scale=np.camera.scale; }
    const nsk = doc.activeSketch;
    if (nsk) nsk.onChange(()=>{ doc._notify(); });
    rerender();
  };

  const [tool, setTool]             = useState('line');
  const [selectMode, setSelectMode] = useState('tap');
  const [sel,  setSel]              = useState(new Set());
  const [dimPending, setDimPending] = useState(null);
  const [mouseWorld, setMouseWorld] = useState(null);
  const [sheetOpen, setSheetOpen]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dimType, setDimType]         = useState('distance');

  const lineStartRef    = useRef(null);
  const circleCenterRef = useRef(null);
  const draw1Ref        = useRef(null);
  const arcRef          = useRef(null);
  const arcInvertedRef  = useRef(false);
  const ngonSidesRef    = useRef(6);
  const dragRef    = useRef({active:false,pt:null,startWorld:null,startPtPos:null});
  const panRef     = useRef({active:false,sx:0,sy:0,tx:0,ty:0});
  const rectDragRef= useRef(null);
  const pinchRef   = useRef(null);
  const touchCountRef = useRef(0);

  const conflict = !!sk.conflictState;
  const constraintError = sk.constraintError ?? null;
  useEffect(()=>{
    if(!constraintError) return;
    const t=setTimeout(()=>{ sk.constraintError=null; rerender(); }, 2500);
    return ()=>clearTimeout(t);
  },[constraintError]); // eslint-disable-line
  const [resolutions, setResolutions] = useState([]);
  const [selectedRes, setSelectedRes] = useState(0);
  const [clearCount, setClearCount] = useState(0);
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

  const [dims, setDims] = useState({W:390,H:420});
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const ro=new ResizeObserver(([e])=>{
      const{width,height}=e.contentRect;
      setDims({W:width,H:height});
      if(camRef.current.tx===0&&camRef.current.ty===0) camRef.current.recenter(width,height);
    });
    ro.observe(el);
    const r=el.getBoundingClientRect();
    const W=r.width||390, H=r.height||420;
    setDims({W,H}); camRef.current.recenter(W,H);
    return ()=>ro.disconnect();
  },[]);

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

  const commitTangentArc=(pts)=>{
    const sk=doc.activeSketch;
    const centroid={x:pts.reduce((s,{pt})=>s+pt.x,0)/pts.length,
                    y:pts.reduce((s,{pt})=>s+pt.y,0)/pts.length};

    const centreAtDist=(e0,e1,r)=>{
      const locus=(ent)=>{
        if(ent.type==='line'){
          const{p1,p2}=ent, dx=p2.x-p1.x, dy=p2.y-p1.y, len=Math.sqrt(dx*dx+dy*dy)||1;
          let nx=-dy/len, ny=dx/len;
          if(nx*centroid.x+ny*centroid.y-(nx*p1.x+ny*p1.y)<0){nx=-nx;ny=-ny;}
          return {type:'line', nx, ny, d: nx*p1.x+ny*p1.y+r};
        } else {
          const R=ent.radius, ox=ent.centre.x, oy=ent.centre.y;
          const dc=Math.sqrt((centroid.x-ox)**2+(centroid.y-oy)**2);
          const ext=dc>R;
          return {type:'circle', ox, oy, R: ext? R+r : Math.abs(R-r)};
        }
      };
      const L0=locus(e0), L1=locus(e1);
      if(L0.type==='line'&&L1.type==='line'){
        const det=L0.nx*L1.ny-L0.ny*L1.nx;
        if(Math.abs(det)<1e-10) return null;
        return {cx:(L0.d*L1.ny-L1.d*L0.ny)/det, cy:(L0.nx*L1.d-L1.nx*L0.d)/det};
      }
      if(L0.type==='circle'&&L1.type==='line'){
        const{ox,oy,R:Rc}=L0, {nx,ny,d}=L1;
        const dc=nx*ox+ny*oy-d;
        if(Math.abs(dc)>Rc) return null;
        const foot={x:ox-nx*dc,y:oy-ny*dc};
        const t=Math.sqrt(Math.max(0,Rc*Rc-dc*dc));
        const tang={x:-ny,y:nx};
        const c0={x:foot.x+t*tang.x,y:foot.y+t*tang.y};
        const c1={x:foot.x-t*tang.x,y:foot.y-t*tang.y};
        const d0=(c0.x-centroid.x)**2+(c0.y-centroid.y)**2;
        const d1=(c1.x-centroid.x)**2+(c1.y-centroid.y)**2;
        return d0<d1?c0:c1;
      }
      if(L0.type==='line'&&L1.type==='circle') return centreAtDist(e1,e0,r);
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
      const es=pts.map(p=>p.entity);
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
        const rTest=rMid+0.01;
        const cT=centreAtDist(es[0],es[1],rTest);
        const resT=residual3(cT,es[2],rTest);
        if(resT<res) rLo=rMid; else rHi=rMid;
        if(c&&res<residual3(bestC,es[2],rMid)) bestC=c;
      }
      cx=bestC?.cx??initCx; cy=bestC?.cy??initCy;
    }

    if(cx===undefined){
      const norms=pts.map(({pt,entity})=>{
        let n=entityNormal(entity,pt);
        if(n.x*(centroid.x-pt.x)+n.y*(centroid.y-pt.y)<0) n={x:-n.x,y:-n.y};
        return {pt,n};
      });
      const C0=rayIntersect2D(norms[0].pt.x,norms[0].pt.y,norms[0].n.x,norms[0].n.y,
                              norms[1].pt.x,norms[1].pt.y,norms[1].n.x,norms[1].n.y);
      cx=C0?.x??centroid.x; cy=C0?.y??centroid.y;
    }

    pts.forEach(({pt,entity})=>{ const p=projectOnEntity(entity,cx,cy); pt.x=p.x; pt.y=p.y; });

    const r=pts.reduce((s,{pt})=>s+Math.sqrt((pt.x-cx)**2+(pt.y-cy)**2),0)/pts.length||10;
    let p0=pts[0].pt, pN=pts[pts.length-1].pt;
    if(pts.length===3){
      // Swap start/end so CCW arc contains the middle tangent point (throughPt)
      const sa3=Math.atan2(p0.y-cy, p0.x-cx);
      const ea3=Math.atan2(pN.y-cy, pN.x-cx);
      const ta3=Math.atan2(pts[1].pt.y-cy, pts[1].pt.x-cx);
      const sp3=((ea3-sa3)+2*Math.PI)%(2*Math.PI);
      const midOnCCW=((ta3-sa3)+2*Math.PI)%(2*Math.PI)<=sp3;
      if(!midOnCCW){ const tmp=p0; p0=pN; pN=tmp; }
    }
    sk._beginBatch();
    const Cpt=sk._mkPt(cx,cy,{construction:true,name:'Arc centre'});
    const a=sk._mkAr(Cpt,r,p0,pN,{inverted:false});
    if(pts.length===3) a.throughPt=pts[1].pt;
    pts.forEach(({pt,entity})=>{
      addPointOnEntity(sk,pt,entity);
      sk._mkC('tangent',[a,entity]);
      sk._mkC('point_on_arc',[pt,a]);
    });
    sk._endBatch();
    sk._solveAndNotify();
    setSel(new Set([a.id])); activateTool('select');
  };

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

  const onPointerDown=useCallback(e=>{
    if(touchCountRef.current>=2) return;
    if(e.button===2){ lineStartRef.current=null; circleCenterRef.current=null; rerender(); return; }
    const w=getWorld(e);
    const snapR=18/cam.scale;
    if(conflict && tool!=='select') return;
    if(e.altKey){ panRef.current={active:true,sx:e.clientX,sy:e.clientY,tx:cam.tx,ty:cam.ty}; e.currentTarget.setPointerCapture(e.pointerId); return; }
    const hit=pick(w.x,w.y,sk,snapR);

    if(tool==='select'){
      if(selectMode==='constraints'){ setSel(new Set()); return; }
      if(selectMode==='rect'){
        rectDragRef.current={start:{x:w.x,y:w.y},end:{x:w.x,y:w.y},active:false};
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if(hit?.type==='point'){
        const p=hit.entity;
        const s=new Set(sel); s.has(p.id)?s.delete(p.id):s.add(p.id); setSel(s);
        if(s.has(p.id)){ dragRef.current={active:true,mode:'point',pt:p,startWorld:{x:w.x,y:w.y},startPtPos:{x:p.x,y:p.y}}; e.currentTarget.setPointerCapture(e.pointerId); }
      } else if(hit?.type==='circle'||hit?.type==='arc'){
        const ent=hit.entity;
        const s=new Set(sel); s.has(ent.id)?s.delete(ent.id):s.add(ent.id); setSel(s);
        if(s.has(ent.id)){
          if(hit.type==='arc'){
            const hasR=[...(ent._constraints??[])].some(c=>c.type==='radius'&&!c.disabled);
            if(hasR){
              dragRef.current={active:true,mode:'arc',arc:ent,startWorld:{x:w.x,y:w.y},
                startCentre:{x:ent.centre.x,y:ent.centre.y},
                startP1:{x:ent.startPt.x,y:ent.startPt.y},
                startP2:{x:ent.endPt.x,y:ent.endPt.y},
                startThrough:ent.throughPt?{x:ent.throughPt.x,y:ent.throughPt.y}:null};
            } else {
              const startDist=Math.hypot(w.x-ent.centre.x,w.y-ent.centre.y);
              const sa=Math.atan2(ent.startPt.y-ent.centre.y,ent.startPt.x-ent.centre.x);
              const ea=Math.atan2(ent.endPt.y-ent.centre.y,  ent.endPt.x-ent.centre.x);
              const ta=ent.throughPt?Math.atan2(ent.throughPt.y-ent.centre.y,ent.throughPt.x-ent.centre.x):null;
              dragRef.current={active:true,mode:'arc_radius',arc:ent,startWorld:{x:w.x,y:w.y},
                startRadius:ent.radius,startDist,sa,ea,ta};
            }
          } else {
            dragRef.current={active:true,mode:'radius',entity:ent,startRadius:ent.radius};
          }
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } else if(hit?.type==='line' && !hit.entity.construction){
        const ln=hit.entity;
        const s=new Set(sel); s.has(ln.id)?s.delete(ln.id):s.add(ln.id); setSel(s);
        if(s.has(ln.id)){
          dragRef.current={active:true,mode:'line',line:ln,startWorld:{x:w.x,y:w.y},
            startP1:{x:ln.p1.x,y:ln.p1.y},startP2:{x:ln.p2.x,y:ln.p2.y}};
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
      sk._beginBatch();
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
      if(pt) autoConstrainNewPoint(pt,sk,snapR);
      sk._endBatch();
      if(!pt) return;
      return;
    }
    if(tool==='line'){
      const snap=snapToPoint(w.x,w.y,sk,snapR);
      const wx=snap?.x??w.x, wy=snap?.y??w.y;
      const ls=lineStartRef.current;
      if(!ls){ lineStartRef.current={x:wx,y:wy,pt:snap??null}; rerender(); return; }
      sk._beginBatch();
      const p1=ls.pt??sk.addPoint(ls.x,ls.y);
      if(p1&&!ls.pt) autoConstrainNewPoint(p1,sk,snapR);
      const p2=snap??sk.addPoint(wx,wy);
      if(p2&&!snap) autoConstrainNewPoint(p2,sk,snapR);
      const ln=(p1&&p2)?sk.addLine({p1,p2}):null;
      sk._endBatch();
      if(ln&&p2) lineStartRef.current={x:p2.x,y:p2.y,pt:p2};
      else lineStartRef.current=null;
      return;
    }
    if(tool==='circle'){
      const cc=circleCenterRef.current;
      if(!cc){
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        sk._beginBatch();
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
        if(pt) autoConstrainNewPoint(pt,sk,snapR);
        sk._endBatch();
        if(!pt) return;
        circleCenterRef.current=pt; rerender();
      } else {
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        sk._beginBatch();
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
        sk._endBatch();
        if(!pt) return;
        const r=Math.sqrt((pt.x-cc.x)**2+(pt.y-cc.y)**2);
        if(r>1){
          const ci=sk.addCircle({centre:cc,radius:r});
          if(ci){
            sk._beginBatch();
            sk.addConstraint('point_on_circle',[pt,ci]);
            autoConstrainNewPoint(pt,sk,snapR);
            sk._endBatch();
          }
        }
        circleCenterRef.current=null;
      }
    }
    if(tool==='centerArc'){
      const arc=arcRef.current;
      if(arc?.endPt){
        // Step 4: project click onto arc circle → throughPt for stable orientation
        arcRef.current=null;
        if(!sk.points.has(arc.centre.id)||!sk.points.has(arc.startPt.id)||!sk.points.has(arc.endPt.id)){
          rerender(); return;
        }
        const r=Math.sqrt((arc.startPt.x-arc.centre.x)**2+(arc.startPt.y-arc.centre.y)**2);
        if(r>1){
          const sa=Math.atan2(arc.startPt.y-arc.centre.y, arc.startPt.x-arc.centre.x);
          const ea=Math.atan2(arc.endPt.y-arc.centre.y, arc.endPt.x-arc.centre.x);
          const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
          const ca=Math.atan2(w.y-arc.centre.y, w.x-arc.centre.x);
          const clickOnCCW=((ca-sa)+2*Math.PI)%(2*Math.PI)<=span;
          const inv=clickOnCCW!==(span<=Math.PI);
          // Swap start/end so CCW span always covers the user's chosen arc side
          const [p1,p2]=inv?[arc.endPt,arc.startPt]:[arc.startPt,arc.endPt];
          const tpx=arc.centre.x+r*Math.cos(ca), tpy=arc.centre.y+r*Math.sin(ca);
          const throughPt=sk._mkPt(tpx,tpy,{construction:true,name:'through'});
          const a=sk._mkAr(arc.centre,r,p1,p2,{inverted:false});
          a.throughPt=throughPt;
          sk._mkLn(arc.centre,p1,{construction:true,name:'spoke'});
          sk._mkLn(arc.centre,p2,{construction:true,name:'spoke'});
          sk._mkC('point_on_arc',[throughPt,a]).scale=0.5;
          sk._solveAndNotify();
          setSel(new Set([a.id])); activateTool('select');
        }
        return;
      }
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      sk._beginBatch();
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
      if(pt) autoConstrainNewPoint(pt,sk,snapR);
      sk._endBatch();
      if(!pt) return;
      if(!arc){ arcRef.current={centre:pt}; rerender(); return; }
      if(!arc.startPt){ arcRef.current={...arc,startPt:pt}; rerender(); return; }
      // Step 3: store end point, await side indicator click
      arcRef.current={...arc,endPt:pt}; rerender(); return;
    }
    if(tool==='3pArc'){
      const _near=snapToPoint(w.x,w.y,sk,snapR);
      sk._beginBatch();
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
      if(pt) autoConstrainNewPoint(pt,sk,snapR);
      sk._endBatch();
      if(!pt) return;
      const arc=arcRef.current;
      if(!arc){ arcRef.current={p1:pt}; rerender(); return; }
      if(!arc.p2){ arcRef.current={...arc,p2:pt}; rerender(); return; }
      const cc=circumcentre(arc.p1,arc.p2,pt);
      if(cc){
        const Cpt=sk._mkPt(cc.x,cc.y,{construction:true,name:'Arc centre'});
        const r=Math.sqrt((arc.p1.x-cc.x)**2+(arc.p1.y-cc.y)**2);
        // Swap start/end so CCW span covers the through point (p2 = middle click)
        const sa3=Math.atan2(arc.p1.y-cc.y, arc.p1.x-cc.x);
        const ea3=Math.atan2(pt.y-cc.y, pt.x-cc.x);
        const span3=((ea3-sa3)+2*Math.PI)%(2*Math.PI);
        const ta3=Math.atan2(arc.p2.y-cc.y, arc.p2.x-cc.x);
        const p2OnCCW=((ta3-sa3)+2*Math.PI)%(2*Math.PI)<=span3;
        const [startPt,endPt]=p2OnCCW?[arc.p1,pt]:[pt,arc.p1];
        sk._mkLn(Cpt,startPt,{construction:true,name:'spoke'});
        sk._mkLn(Cpt,endPt,{construction:true,name:'spoke'});
        const a=sk._mkAr(Cpt,r,startPt,endPt,{inverted:false});
        a.throughPt=arc.p2;
        sk._mkC('point_on_arc',[arc.p2,a]).scale=0.5;
        sk._solveAndNotify();
        setSel(new Set([a.id])); activateTool('select');
      }
      arcRef.current=null;
    }
    if(tool==='tangentArc'){
      const hit=pick(w.x,w.y,sk,snapR*2);
      if(!hit||hit.type==='point') return;
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
      sk._beginBatch();
      const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
      if(pt) autoConstrainNewPoint(pt,sk,snapR);
      sk._endBatch();
      if(!pt) return;
      const arc=arcRef.current;
      if(!arc){ arcRef.current={p1:pt}; rerender(); return; }
      if(!arc.p2){ arcRef.current={...arc,p2:pt}; rerender(); return; }
      const cc=circumcentre(arc.p1,arc.p2,pt);
      if(cc){
        const Cpt=sk._mkPt(cc.x,cc.y,{construction:true,name:'Circle centre'});
        const r=Math.sqrt((arc.p1.x-cc.x)**2+(arc.p1.y-cc.y)**2);
        sk._mkLn(Cpt,arc.p1,{construction:true,name:'spoke'});
        sk._mkLn(Cpt,arc.p2,{construction:true,name:'spoke'});
        sk._mkLn(Cpt,pt,{construction:true,name:'spoke'});
        const ci=sk._mkCi(Cpt,r);
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
        const _near=snapToPoint(w.x,w.y,sk,snapR);
        sk._beginBatch();
        const pt=sk.addPoint(_near?.x??w.x,_near?.y??w.y);
        if(pt) autoConstrainNewPoint(pt,sk,snapR);
        sk._endBatch();
        if(!pt) return;
        draw1Ref.current=pt; rerender(); return;
      }
      const d1p=d1;
      if(tool==='centerRect'){
        const dx=w.x-d1p.x, dy=w.y-d1p.y;
        const corners=[{x:d1p.x-dx,y:d1p.y-dy},{x:d1p.x+dx,y:d1p.y-dy},
                        {x:d1p.x+dx,y:d1p.y+dy},{x:d1p.x-dx,y:d1p.y+dy}];
        const{pts,lns}=_sketchClosedPolygon(sk,corners,snapR);
        sk._mkC('perpendicular',[lns[0],lns[1]]);
        sk._mkC('symmetric',[pts[0],pts[2],d1p]);
        sk._mkC('symmetric',[pts[1],pts[3],d1p]);
        sk._solveAndNotify();
      } else if(tool==='cornerRect'){
        const p2=sk._mkPt(w.x,d1p.y), p3=sk._mkPt(w.x,w.y), p4=sk._mkPt(d1p.x,w.y);
        const l1=sk._mkLn(d1p,p2), l2=sk._mkLn(p2,p3), l3=sk._mkLn(p3,p4), l4=sk._mkLn(p4,d1p);
        sk._mkC('perpendicular',[l1,l2]);
        sk._mkC('perpendicular',[l2,l3]);
        sk._mkC('perpendicular',[l3,l4]);
        autoConstrainPoints([p2,p3,p4],sk,snapR);
        sk._solveAndNotify();
      } else {
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

  const onPointerMove=useCallback(e=>{
    if(touchCountRef.current>=2) return;
    const w=getWorld(e); setMouseWorld(w);

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
      if(d.mode==='arc_radius'){
        const curDist=Math.hypot(w.x-d.arc.centre.x,w.y-d.arc.centre.y);
        const newR=Math.max(1,d.startRadius+(curDist-d.startDist));
        d.arc.startPt.x=d.arc.centre.x+newR*Math.cos(d.sa);
        d.arc.startPt.y=d.arc.centre.y+newR*Math.sin(d.sa);
        d.arc.endPt.x=d.arc.centre.x+newR*Math.cos(d.ea);
        d.arc.endPt.y=d.arc.centre.y+newR*Math.sin(d.ea);
        if(d.arc.throughPt&&d.ta!==null){
          d.arc.throughPt.x=d.arc.centre.x+newR*Math.cos(d.ta);
          d.arc.throughPt.y=d.arc.centre.y+newR*Math.sin(d.ta);
        }
        sk._dragFixed  = d.arc.startPt;
        sk._dragTarget = {x:d.arc.startPt.x,y:d.arc.startPt.y};
        sk.markDirty();
      } else if(d.mode==='arc'){
        const dx=w.x-d.startWorld.x, dy=w.y-d.startWorld.y;
        d.arc.centre.x=d.startCentre.x+dx; d.arc.centre.y=d.startCentre.y+dy;
        d.arc.startPt.x=d.startP1.x+dx; d.arc.startPt.y=d.startP1.y+dy;
        d.arc.endPt.x=d.startP2.x+dx;   d.arc.endPt.y=d.startP2.y+dy;
        if(d.arc.throughPt && d.startThrough){
          d.arc.throughPt.x=d.startThrough.x+dx; d.arc.throughPt.y=d.startThrough.y+dy;
        }
        sk._dragFixed  = d.arc.centre;
        sk._dragTarget = {x:d.arc.centre.x, y:d.arc.centre.y};
        sk.markDirty();
      } else if(d.mode==='line'){
        const dx=w.x-d.startWorld.x, dy=w.y-d.startWorld.y;
        d.line.p1.x=d.startP1.x+dx; d.line.p1.y=d.startP1.y+dy;
        d.line.p2.x=d.startP2.x+dx; d.line.p2.y=d.startP2.y+dy;
        sk._dragFixed  = d.line.p1;
        sk._dragTarget = {x:d.line.p1.x, y:d.line.p1.y};
        sk.markDirty();
      } else if(d.mode==='radius'){
        const c=d.entity.centre;
        const dx=w.x-c.x, dy=w.y-c.y;
        d.entity.radius=Math.max(1,Math.sqrt(dx*dx+dy*dy));
        sk.markDirty();
      } else {
        const{pt,startWorld,startPtPos}=d;
        const tx = startPtPos.x+(w.x-startWorld.x);
        const ty = startPtPos.y+(w.y-startWorld.y);
        const pdx = tx - pt.x, pdy = ty - pt.y;
        pt.x = tx; pt.y = ty;
        sk._dragFixed  = pt;
        sk._dragTarget = {x: tx, y: ty};
        for (const arc of sk.arcs.values()) {
          if (arc.centre === pt) {
            arc.startPt.x += pdx; arc.startPt.y += pdy;
            arc.endPt.x   += pdx; arc.endPt.y   += pdy;
            if (arc.throughPt) { arc.throughPt.x += pdx; arc.throughPt.y += pdy; }
          }
        }
        dbg(`drag handler: pt=${pt.id} target=(${tx.toFixed(1)},${ty.toFixed(1)})`);
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

  const onPointerUp=useCallback(e=>{
    if(rectDragRef.current){
      if(rectDragRef.current.active){
        const{start,end}=rectDragRef.current;
        const found=getEntitiesInRect(sk,start.x,start.y,end.x,end.y);
        setSel(prev=>new Set([...prev,...found]));
      } else {
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

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const r=svgRef.current?.getBoundingClientRect()??{left:0,top:0};
    cam.zoom(e.deltaY>0?0.88:1.14,e.clientX-r.left,e.clientY-r.top); rerender();
  },[]);

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
    cam.tx = dims.W/2; cam.ty = dims.H/2; cam.scale = 1;
    lineStartRef.current=null; circleCenterRef.current=null;
    draw1Ref.current=null; arcRef.current=null;
    if(arcInvertedRef) arcInvertedRef.current=false;
    dragRef.current={active:false,pt:null,startWorld:null,startPtPos:null};
    panRef.current={active:false,sx:0,sy:0,tx:0,ty:0};
    setSel(new Set()); setSheetOpen(false); setShowConfirm(false);
    setClearCount(n=>n+1);
    doc._notify();
    StorageAdapter.save(doc);
  };

  const onConstraint=useCallback((type, activeOverride=null)=>{
    if(conflict) sk.undo();
    const resolved = type==='dimension' ? (activeOverride??dimType) : type;
    const result=applyConstraintFromSelection(resolved,sk,sel);
    if(result?.needsInput) setDimPending(result);
    else setSel(new Set());
  },[sel,conflict,dimType]);

  const onDimConfirm=useCallback(val=>{
    if(dimPending?.type==='_ngon_sides'){
      ngonSidesRef.current=Math.max(3,Math.min(64,Math.round(val)));
    } else if(dimPending?.editTarget) {
      dimPending.editTarget.value = val;
      sk._solveAndNotify();
    } else if(dimPending){
      sk.addConstraint(dimPending.type,dimPending.refs,val);
    }
    setDimPending(null);
    setSel(new Set());
  },[dimPending]);

  const statusText=
    conflict?'Conflict — tap ↩ to undo':
    tool==='line'?(lineStartRef.current?'Tap endpoint · right-tap to stop':'Tap to start line'):
    tool==='circle'?(circleCenterRef.current?'Tap to set radius':'Tap centre point'):
    tool==='centerArc'?(!arcRef.current?'Tap arc centre':!arcRef.current?.startPt?'Tap start point':!arcRef.current?.endPt?'Tap end point':'Tap to choose arc side'):
    tool==='3pArc'?(!arcRef.current?'Tap point 1':!arcRef.current?.p2?'Tap point 2':'Tap point 3 on arc'):
    tool==='3pCircle'?(!arcRef.current?'Tap point 1':!arcRef.current?.p2?'Tap point 2':'Tap point 3 on circle'):
    tool==='tangentArc'?(!arcRef.current?.pts?.length?'Tap a line, arc, or circle':'arcRef.current.pts.length===1?"Tap entity 2 · Done after":"Tap entity 3 or Done"'):
    tool==='centerRect'?(draw1Ref.current?'Tap for corner':'Tap for centre'):
    tool==='cornerRect'?(draw1Ref.current?'Tap for opposite corner':'Tap for first corner'):
    tool==='ngon'?(draw1Ref.current?`Tap for radius (${ngonSidesRef.current} sides)`:'Tap for centre'):
    tool==='select'?'Tap · drag points · select + constrain':
    tool==='point'?'Tap to place point':'';

  const [openMenu, setOpenMenu] = useState(null);

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

  const parentGroup = id => DRAW_TOOLS.find(t => t.group?.some(s=>s.id===id));
  const groupActive = t => t.group?.find(s=>s.id===tool) ?? t.group?.[0];

  const isDrawTool = tool!=='select';
  const activeDraw = DRAW_TOOLS.find(t=>t.id===tool || t.group?.some(s=>s.id===tool));

  return (
    <div style={{display:'flex',flexDirection:'column',width:'100%',height:'100vh',
      background:C.bg,color:C.text,position:'relative',
      fontFamily:"'JetBrains Mono','Fira Code','Courier New',monospace",
      userSelect:'none',overflow:'hidden'}}>

      <AppTopBar statusText={statusText} sk={sk} conflict={conflict}
        onClear={()=>setShowConfirm(true)}
        doc={doc} onSwitchPage={switchPage}
        cam={cam} dims={dims}/>

      <div style={{flex:1,position:'relative',overflow:'hidden'}}>
        <svg ref={svgRef}
          style={{width:'100%',height:'100%',display:'block',touchAction:'none',
            cursor:tool==='select'?'default':'crosshair'}}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
          onContextMenu={e=>e.preventDefault()}>
          <rect width="100%" height="100%" fill={C.bg}/>
          <GridLines cam={cam} W={dims.W} H={dims.H}/>

          {doc.sortedPages.filter(p=>p.id!==doc.activePage&&p.visible).map(page=>{
            const psk=page.sketch; if(!psk) return null;
            const {color,lineWeight,lineDash}=page.style;
            const da=lineDash?.length?lineDash.join(' '):undefined;
            const elems=[];
            for(const ln of psk.lines.values()){
              if(psk.reserved.has(ln)) continue;
              const s1=cam.toScreen(ln.p1.x,ln.p1.y), s2=cam.toScreen(ln.p2.x,ln.p2.y);
              elems.push(<line key={ln.id} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
                stroke={color} strokeWidth={lineWeight} strokeDasharray={ln.construction?'5 3':da}/>);
            }
            for(const ci of psk.circles.values()){
              const sc=cam.toScreen(ci.centre.x,ci.centre.y);
              const sr=ci.radius*cam.scale;
              elems.push(<circle key={ci.id} cx={sc.x} cy={sc.y} r={sr}
                fill="none" stroke={color} strokeWidth={lineWeight} strokeDasharray={ci.construction?'5 3':da}/>);
            }
            for(const a of psk.arcs.values()){
              const _sa=a.startAngle, _ea=a.endAngle;
              const ss=cam.toScreen(a.centre.x+a.radius*Math.cos(_sa),a.centre.y+a.radius*Math.sin(_sa));
              const se=cam.toScreen(a.centre.x+a.radius*Math.cos(_ea),a.centre.y+a.radius*Math.sin(_ea));
              const sr=a.radius*cam.scale;
              const {largeArc,sweepFlag}=arcDrawFlags(a);
              elems.push(<path key={a.id}
                d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 ${largeArc} ${sweepFlag} ${se.x} ${se.y}`}
                fill="none" stroke={color} strokeWidth={lineWeight} strokeDasharray={a.construction?'5 3':da}/>);
            }
            return <g key={page.id} opacity={0.35} style={{pointerEvents:'none'}}>{elems}</g>;
          })}

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
              const _r=gs[a.id]?.r??a.radius;
              const _sa=Math.atan2((gpt(a.startPt.id)||a.startPt).y-cP.y,(gpt(a.startPt.id)||a.startPt).x-cP.x);
              const _ea=Math.atan2((gpt(a.endPt.id)||a.endPt).y-cP.y,(gpt(a.endPt.id)||a.endPt).x-cP.x);
              const sr=cam.toScreen(cP.x+_r*Math.cos(_sa),cP.y+_r*Math.sin(_sa));
              const se=cam.toScreen(cP.x+_r*Math.cos(_ea),cP.y+_r*Math.sin(_ea));
              const rad=_r*cam.scale;
              const {largeArc:la,sweepFlag:sf}=arcDrawFlags(a);
              ge.push(<path key={`g${a.id}`}
                d={`M ${sr.x} ${sr.y} A ${rad} ${rad} 0 ${la} ${sf} ${se.x} ${se.y}`}
                fill="none" stroke="#ff4444" strokeWidth={2} opacity={0.55}/>);
            }
            return <g>{ge}</g>;
          })()}
          <SketchView key={clearCount} sk={sk} cam={cam} sel={sel}
            lineStart={lineStartRef.current} circleCenter={circleCenterRef.current}
            mouseWorld={mouseWorld} W={dims.W} H={dims.H}
            selectMode={selectMode}
            onConstraintTap={cid=>{
              setSel(s=>{ const n=new Set(s); n.has(cid)?n.delete(cid):n.add(cid); return n; });
            }}/>

          {tool==='centerArc'&&arcRef.current&&mouseWorld&&(()=>{
            const{centre,startPt,endPt}=arcRef.current;
            const sc=cam.toScreen(centre.x,centre.y);
            if(!startPt){
              const sm=cam.toScreen(mouseWorld.x,mouseWorld.y);
              return <line x1={sc.x} y1={sc.y} x2={sm.x} y2={sm.y}
                stroke={C.geom} strokeWidth={1} strokeDasharray="4 3" opacity={0.5}/>;
            }
            const r=Math.sqrt((startPt.x-centre.x)**2+(startPt.y-centre.y)**2);
            if(r<1) return null;
            const sr=r*cam.scale;
            const ss=cam.toScreen(startPt.x,startPt.y);
            if(!endPt){
              // Step 2→3: arc to mouse position
              const ma=Math.atan2(mouseWorld.y-centre.y, mouseWorld.x-centre.x);
              const sa=Math.atan2(startPt.y-centre.y, startPt.x-centre.x);
              const ex=centre.x+r*Math.cos(ma), ey=centre.y+r*Math.sin(ma);
              const span=((ma-sa)+2*Math.PI)%(2*Math.PI);
              const sweepFlag=span<=Math.PI?0:1;
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
            }
            // Step 3→4: arc fixed, mouse picks which side
            const sa=Math.atan2(startPt.y-centre.y, startPt.x-centre.x);
            const ea=Math.atan2(endPt.y-centre.y, endPt.x-centre.x);
            const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
            const ca=Math.atan2(mouseWorld.y-centre.y, mouseWorld.x-centre.x);
            const clickOnCCW=((ca-sa)+2*Math.PI)%(2*Math.PI)<=span;
            const shortIsCCW=span<=Math.PI;
            const inv=clickOnCCW!==shortIsCCW;
            const drawCCW=inv?!shortIsCCW:shortIsCCW;
            const largeArc=inv?1:0;
            const sweepFlag=drawCCW?0:1;
            const se=cam.toScreen(endPt.x,endPt.y);
            return <>
              <circle cx={sc.x} cy={sc.y} r={sr}
                fill="none" stroke={C.construction} strokeWidth={1}
                strokeDasharray="3 3" opacity={0.25}/>
              <path d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 ${inv?0:1} ${drawCCW?1:0} ${se.x} ${se.y}`}
                fill="none" stroke={C.geom} strokeWidth={1}
                strokeDasharray="3 3" opacity={0.2}/>
              <path d={`M ${ss.x} ${ss.y} A ${sr} ${sr} 0 ${largeArc} ${sweepFlag} ${se.x} ${se.y}`}
                fill="none" stroke={C.geom} strokeWidth={2}
                strokeDasharray="5 3" opacity={0.8}/>
            </>;
          })()}

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
          {rectDragRef.current?.active&&(()=>{
            const{start,end}=rectDragRef.current;
            const s1=cam.toScreen(start.x,start.y), s2=cam.toScreen(end.x,end.y);
            return <rect x={Math.min(s1.x,s2.x)} y={Math.min(s1.y,s2.y)}
              width={Math.abs(s2.x-s1.x)} height={Math.abs(s2.y-s1.y)}
              fill="rgba(40,100,220,0.08)" stroke="#3a70e0" strokeWidth={1}
              strokeDasharray="4 3" style={{pointerEvents:'none'}}/>;
          })()}
        </svg>

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
                .filter(a=>!a.throughPt);
              if(!selArcs.length) return null;
              const allReflex=selArcs.every(a=>a.inverted);
              const sweepDeg = selArcs.length===1 ? (()=>{
                const a=selArcs[0];
                const {drawCCW,span}=arcDrawFlags(a);
                const deg = drawCCW ? span : 2*Math.PI-span;
                return Math.round(deg*180/Math.PI);
              })() : null;
              return (
                <button onClick={()=>{
                  selArcs.forEach(a=>{ a.inverted=!a.inverted; });
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

        {showConfirm&&(
          <ConfirmDialog
            message="Clear sketch?"
            detail="All geometry and constraints will be removed."
            confirmLabel="Clear all"
            onConfirm={doClear}
            onCancel={()=>setShowConfirm(false)}/>
        )}
      </div>

      {conflict&&(
        <div style={{flexShrink:0,maxHeight:'33vh',display:'flex',flexDirection:'column',
          background:'#120808',borderTop:'2px solid #662222',
          boxShadow:'0 -4px 16px rgba(180,0,0,0.3)'}}>
          <div style={{padding:'10px 14px 6px',flexShrink:0}}>
            <div style={{color:'#ff6666',fontSize:11,fontWeight:700,
              letterSpacing:'0.12em',marginBottom:3}}>CONFLICT</div>
            <div style={{color:'#cc8888',fontSize:11,fontFamily:'monospace',opacity:0.85}}>
              {sk.conflictState.trigger?.description||'Overconstrained geometry'}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto',padding:'4px 14px',
            columnWidth:220,columnGap:8,columnFill:'balance'}}>
            {resolutions.map((res,i)=>(
              <button key={i} onClick={()=>setSelectedRes(i)} style={{
                display:'flex',alignItems:'center',gap:10,width:'100%',
                marginBottom:5,breakInside:'avoid',
                background:selectedRes===i?'#2a0808':'transparent',
                border:`1px solid ${selectedRes===i?'#663333':'#2a1212'}`,
                borderRadius:8,padding:'8px 10px',cursor:'pointer',
                color:selectedRes===i?'#ffaaaa':'#664444',
                textAlign:'left',fontSize:11,fontFamily:'monospace'}}>
                <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,
                  background:selectedRes===i?'#ff6666':'#331818'}}/>
                {res.primary?'↩ ':''}{res.label}{res.primary?' (undo)':''}
              </button>
            ))}
            {resolutions.length===0&&(
              <div style={{color:'#664444',fontSize:11,fontStyle:'italic',padding:'4px 0 8px'}}>
                No single-removal solution found — try ↩ Undo
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:10,padding:'8px 14px',flexShrink:0,
            borderTop:'1px solid #2a1212'}}>
            <button onClick={()=>sk.undo()} style={{
              flex:1,padding:'8px',borderRadius:8,cursor:'pointer',
              background:'#1a0808',border:'1px solid #442222',
              color:'#ff8888',fontSize:12,fontWeight:600}}>↩ Undo</button>
            {resolutions[selectedRes]&&!resolutions[selectedRes].primary&&(
              <button onClick={()=>applyResolution(resolutions[selectedRes])} style={{
                flex:1,padding:'8px',borderRadius:8,cursor:'pointer',
                background:'#0d2040',border:'1px solid #2a70c0',
                color:'#60c0ff',fontSize:12,fontWeight:600}}>Apply</button>
            )}
          </div>
        </div>
      )}

      <div style={{position:'relative',zIndex:20,flexShrink:0,display:'flex',flexDirection:'column'}}>
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

      <div style={{background:'#080d18',borderTop:`1px solid ${C.border}`,
        flexShrink:0,position:'relative'}}>

        {openMenu&&<div onClick={()=>setOpenMenu(null)}
          style={{position:'fixed',inset:0,zIndex:1}}/>}

        {openMenu==='draw'&&(
          <div onPointerDown={e=>e.stopPropagation()}
            style={{position:'absolute',bottom:'100%',left:0,right:0,zIndex:2,
            background:'#0a1020',borderTop:`1px solid ${C.border}`,
            padding:'12px',boxShadow:'0 -4px 20px #000b'}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:'0.15em',marginBottom:10}}>DRAW TOOL</div>

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
                              setExpandedGroup(g => g===t.id ? null : t.id);
                            } else {
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

        <div style={{display:'flex',alignItems:'stretch'}}>

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

          {(()=>{
            const lp = makeLongPress(
              () => {
                if(tool==='select') {
                  setOpenMenu(m => m==='select' ? null : 'select');
                } else {
                  activateTool('select'); setOpenMenu(null);
                }
              },
              () => setOpenMenu(m => m==='select' ? null : 'select'),
            );
            return (
              <button {...lp}
                style={{...toolBtn(tool==='select'), position:'relative'}}>
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

          <button onClick={()=>sk.undo()}
            style={{...toolBtn(false),color:sk._undoStack.length?'#5090d0':C.muted,
              opacity:sk._undoStack.length?1:0.4}}>
            <span style={{fontSize:22}}>↩</span>
            <span style={{fontSize:8,letterSpacing:'0.1em'}}>UNDO</span>
          </button>

          <button onClick={()=>setOpenMenu(m=>m==='camera'?null:'camera')}
            style={toolBtn(openMenu==='camera')}>
            <span style={{fontSize:18}}>⌖</span>
            <span style={{fontSize:8,letterSpacing:'0.1em'}}>CAMERA ▾</span>
          </button>

        </div>
      </div>

      <BottomSheet
        isOpen={sheetOpen} onToggle={()=>setSheetOpen(o=>!o)}
        sk={sk} sel={sel}
        onDelete={c=>sk.deleteConstraint(c)}
        onToggleLocked={c=>{ c.locked=!c.locked; rerender(); }}
        onToggleDisabled={c=>{ c.disabled=!c.disabled; sk._solveAndNotify(); }}
        onToggleDriven={c=>{ c.driven=!c.driven; if(c.driven) c.updateSolvedValue?.(); sk._solveAndNotify(); }}
        onEdit={c=>{
          const lbl = c.type==='radius' ? `${c.refs[0]?.name} radius (mm):` :
                      c.type==='distance' ? `${c.refs[0]?.name} length (mm):` :
                      `Angle (°):`;
          const cur = c.type==='angle' ? c.value : Math.round(c.value);
          setDimPending({ type:c.type, refs:c.refs, label:lbl, defaultVal:String(cur), editTarget:c });
        }}
        onCam={onCam}/>
      </div>

      {dimPending&&<DimInput pending={dimPending} onConfirm={onDimConfirm}
        onSetDriven={()=>{
          if(dimPending.editTarget){ dimPending.editTarget.driven=true; dimPending.editTarget.updateSolvedValue?.(); sk._solveAndNotify(); }
          else sk.addConstraint(dimPending.type,dimPending.refs,null,true);
          setDimPending(null); setSel(new Set());
        }}
        onCancel={()=>setDimPending(null)}/>}

    </div>
  );
}
