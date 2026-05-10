/**
 * Sketch Visual Test Cases
 * Run: node test/sketch-visual.mjs
 * Produces: test/renders/*.png
 */
import { renderCase, renderSheet } from './sketch-render.mjs';
import { Sketch, circumcentre, initPlanegcs } from './sketch-engine.mjs';
import { init_planegcs_module, GcsWrapper } from '../vendor/planegcs/index.js';

// Initialise planegcs before running any tests
const mod = await init_planegcs_module({
  locateFile: () => new URL('../vendor/planegcs/planegcs_dist/planegcs.wasm', import.meta.url).pathname,
});
initPlanegcs({ mod, GcsWrapper });
console.log('[planegcs] ready');

// ── Helper: foot of perpendicular from point to line ──────────────────────
function footPerp(px, py, lx1, ly1, lx2, ly2) {
  const dx=lx2-lx1, dy=ly2-ly1, lsq=dx*dx+dy*dy;
  const t=((px-lx1)*dx+(py-ly1)*dy)/lsq;
  return {x:lx1+t*dx, y:ly1+t*dy};
}

// ── Helper: analytical incircle for 3 line segments ──────────────────────
// lines: [{p1:{x,y},p2:{x,y}}], inside: a point known to be inside
function incircle3(lines, inside) {
  const fs=lines.map(({p1,p2})=>{
    const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.sqrt(dx*dx+dy*dy)||1;
    let nx=-dy/len,ny=dx/len,cv=-(nx*p1.x+ny*p1.y);
    if(nx*inside.x+ny*inside.y+cv<0){nx=-nx;ny=-ny;cv=-cv;}
    return {nx,ny,cv};
  });
  const a=fs[0].nx-fs[1].nx,b=fs[0].ny-fs[1].ny,e=fs[1].cv-fs[0].cv;
  const g=fs[0].nx-fs[2].nx,h=fs[0].ny-fs[2].ny,k=fs[2].cv-fs[0].cv;
  const det=a*h-b*g; if(Math.abs(det)<1e-8) return null;
  const cx=(e*h-b*k)/det, cy=(a*k-e*g)/det;
  const r=Math.abs(fs[0].nx*cx+fs[0].ny*cy+fs[0].cv);
  return {cx,cy,r};
}

const renders = [];
const run = (name, fn, postSolve=null) => { renders.push(renderCase(name, fn, postSolve)); };

// ── Geometric constraints ──────────────────────────────────────────────────

run('01_horizontal', sk => {
  const p1=sk._mkPt(0,50), p2=sk._mkPt(100,120);
  const ln=sk._mkLn(p1,p2);
  sk._mkC('fixed',[p1]);
  sk._mkC('horizontal',[ln]);
});

run('02_vertical', sk => {
  const p1=sk._mkPt(50,0), p2=sk._mkPt(120,100);
  const ln=sk._mkLn(p1,p2);
  sk._mkC('fixed',[p1]);
  sk._mkC('vertical',[ln]);
});

run('03_perpendicular', sk => {
  const o=sk._mkPt(0,0), a=sk._mkPt(150,0), b=sk._mkPt(0,80);
  const l1=sk._mkLn(o,a), l2=sk._mkLn(o,b);
  sk._mkC('fixed',[o]); sk._mkC('fixed',[a]);
  sk._mkC('perpendicular',[l1,l2]);
});

run('04_parallel', sk => {
  const a1=sk._mkPt(0,0), a2=sk._mkPt(150,0);
  const b1=sk._mkPt(20,80), b2=sk._mkPt(70,140);
  const l1=sk._mkLn(a1,a2), l2=sk._mkLn(b1,b2);
  sk._mkC('fixed',[a1]); sk._mkC('fixed',[a2]);
  sk._mkC('parallel',[l1,l2]);
});

run('05_equal_lines', sk => {
  // l1 fixed at length 150 (3×grid). l2 shorter, starts directly below l1's start.
  const a1=sk._mkPt(-100,50), a2=sk._mkPt(50,50);   // l1: length 150, fixed
  const b1=sk._mkPt(-100,-50), b2=sk._mkPt(-40,-50); // l2: shorter, starts at same x as a1
  const l1=sk._mkLn(a1,a2), l2=sk._mkLn(b1,b2);
  sk._mkC('fixed',[a1]); sk._mkC('fixed',[a2]);
  sk._mkC('fixed',[b1]);
  sk._mkC('equal',[l1,l2]);
});

run('06_coincident', sk => {
  const p1=sk._mkPt(0,0), p2=sk._mkPt(120,80);
  sk._mkC('fixed',[p1]);
  sk._mkC('coincident',[p1,p2]);
});

run('07_point_on_line', sk => {
  const lp1=sk._mkPt(-100,0), lp2=sk._mkPt(100,0);
  const pt=sk._mkPt(30,80);
  const ln=sk._mkLn(lp1,lp2);
  sk._mkC('fixed',[lp1]); sk._mkC('fixed',[lp2]);
  sk._mkC('point_on_line',[pt,ln]);
});

run('08_point_on_circle', sk => {
  const c=sk._mkPt(0,0);
  const ci=sk._mkCi(c,100);
  const pt=sk._mkPt(200,150);
  sk._mkC('fixed',[c]);
  sk._mkC('point_on_circle',[pt,ci]);
});

run('09_symmetric_free', sk => {
  const a=sk._mkPt(-80,30), b=sk._mkPt(60,30), mid=sk._mkPt(0,0);
  sk._mkC('fixed',[mid]);
  sk._mkC('symmetric',[a,b,mid]);
});

run('10_symmetric_fixed_axis', sk => {
  // Regression: was a no-op when axis fixed and both pts free
  const a=sk._mkPt(-40,20), b=sk._mkPt(80,20);
  const O = [...sk.reserved].find(e=>e.name==='O') || sk._mkPt(0,0);
  if(O.reserved) {
    sk._mkC('symmetric',[a,b,O]);
  } else {
    sk._mkC('fixed',[O]);
    sk._mkC('symmetric',[a,b,O]);
  }
});

// ── Dimensional constraints ────────────────────────────────────────────────

run('11_distance_constraint', sk => {
  // Line from fixed origin, constrained to length 150 (3×grid)
  const p1=sk._mkPt(-100,0), p2=sk._mkPt(0,0);
  const ln=sk._mkLn(p1,p2);
  sk._mkC('fixed',[p1]);
  sk._mkC('distance',[ln],150);
});

run('12_radius_constraint', sk => {
  // Circle at fixed centre, constrained to radius 100 (2×grid)
  const c=sk._mkPt(0,0);
  const ci=sk._mkCi(c,50);
  sk._mkC('fixed',[c]);
  sk._mkC('radius',[ci],100);
});

run('13_angle_constraint', sk => {
  // Two lines from fixed origin. l1 fixed horizontal. l2 constrained to 60°.
  const o=sk._mkPt(-100,0), a=sk._mkPt(50,0), b=sk._mkPt(0,100);
  const l1=sk._mkLn(o,a), l2=sk._mkLn(o,b);
  sk._mkC('fixed',[o]); sk._mkC('fixed',[a]);
  sk._mkC('angle',[l1,l2],60);
});

// ── Tangent ────────────────────────────────────────────────────────────────

run('14_tangent_line_circle', sk => {
  const lp1=sk._mkPt(-200,0), lp2=sk._mkPt(200,0);
  const ln=sk._mkLn(lp1,lp2);
  sk._mkC('fixed',[lp1]); sk._mkC('fixed',[lp2]);
  const c=sk._mkPt(0,80);
  const ci=sk._mkCi(c,50);
  sk._mkC('tangent',[ln,ci]);
});

run('15_tangent_circle_circle', sk => {
  const c1=sk._mkPt(0,0), c2=sk._mkPt(200,0);
  sk._mkC('fixed',[c1]);
  const ci1=sk._mkCi(c1,60), ci2=sk._mkCi(c2,60);
  sk._mkC('tangent',[ci1,ci2]);
});

// ── Arcs ───────────────────────────────────────────────────────────────────

run('16_centre_arc', sk => {
  const c=sk._mkPt(0,0), s=sk._mkPt(100,0), e=sk._mkPt(0,100);
  const a=sk._mkAr(c,100,s,e,{inverted:false});
  const sp=sk._mkLn(c,s,{construction:true,name:'spoke'});
  const ep=sk._mkLn(c,e,{construction:true,name:'spoke'});
  sk._mkC('equal',[sp,ep]);
  sk._mkC('point_on_circle',[s,a]);
  sk._mkC('point_on_circle',[e,a]);
  sk._mkC('fixed',[c]);
});

run('17_centre_arc_reflex', sk => {
  const c=sk._mkPt(0,0), s=sk._mkPt(100,0), e=sk._mkPt(0,100);
  const a=sk._mkAr(c,100,s,e,{inverted:true}); // reflex arc
  sk._mkC('fixed',[c]);
  sk._mkC('point_on_circle',[s,a]);
  sk._mkC('point_on_circle',[e,a]);
});

// ── Centre rectangle ───────────────────────────────────────────────────────

run('18_centre_rect', sk => {
  const ctr=sk._mkPt(0,0);
  const dx=80,dy=50;
  const corners=[
    sk._mkPt(-dx,-dy), sk._mkPt(dx,-dy),
    sk._mkPt(dx,dy),   sk._mkPt(-dx,dy)
  ];
  const lns=corners.map((p,i)=>sk._mkLn(p,corners[(i+1)%4]));
  sk._mkC('perpendicular',[lns[0],lns[1]]);
  sk._mkC('perpendicular',[lns[1],lns[2]]);
  sk._mkC('perpendicular',[lns[2],lns[3]]);
  sk._mkC('symmetric',[corners[0],corners[2],ctr]);
  sk._mkC('symmetric',[corners[1],corners[3],ctr]);
  sk._mkC('fixed',[ctr]);
});

run('19_centre_rect_rotated', sk => {
  // Rectangle not aligned to axes — perpendicular keeps it rectangular
  const ctr=sk._mkPt(0,0);
  const angle=Math.PI/6; // 30°
  const dx=80,dy=40;
  const corners=[
    {x:-dx*Math.cos(angle)+dy*Math.sin(angle), y:-dx*Math.sin(angle)-dy*Math.cos(angle)},
    {x: dx*Math.cos(angle)+dy*Math.sin(angle), y: dx*Math.sin(angle)-dy*Math.cos(angle)},
    {x: dx*Math.cos(angle)-dy*Math.sin(angle), y: dx*Math.sin(angle)+dy*Math.cos(angle)},
    {x:-dx*Math.cos(angle)-dy*Math.sin(angle), y:-dx*Math.sin(angle)+dy*Math.cos(angle)},
  ].map(p=>sk._mkPt(p.x,p.y));
  const lns=corners.map((p,i)=>sk._mkLn(p,corners[(i+1)%4]));
  sk._mkC('perpendicular',[lns[0],lns[1]]);
  sk._mkC('perpendicular',[lns[1],lns[2]]);
  sk._mkC('perpendicular',[lns[2],lns[3]]);
  sk._mkC('symmetric',[corners[0],corners[2],ctr]);
  sk._mkC('symmetric',[corners[1],corners[3],ctr]);
  sk._mkC('fixed',[ctr]);
});

// ── Conflict state ─────────────────────────────────────────────────────────

run('20_conflict_overconstrained', sk => {
  const p1=sk._mkPt(0,0), p2=sk._mkPt(100,0);
  const ln=sk._mkLn(p1,p2);
  sk._mkC('fixed',[p1]); sk._mkC('fixed',[p2]);
  sk._mkC('distance',[ln],300); // impossible — fixed pts are 100 apart
});

// ── Post-solve hook: re-derive inverted for any 3-contact arc ─────────────
// For arcs with a constrained middle point, inverted is geometry-determined.
function fixArcInverted(sk) {
  for (const a of sk.arcs.values()) {
    // Find all point_on_circle constraints on this arc (excluding startPt/endPt)
    const midPts = sk.constraints
      .filter(c => c.type==='point_on_circle' && c.refs[1]===a
                && c.refs[0]!==a.startPt && c.refs[0]!==a.endPt)
      .map(c => c.refs[0]);
    if (!midPts.length) continue;
    const pm = midPts[0];
    const sa=a.startAngle, ea=a.endAngle;
    const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
    const a2=Math.atan2(pm.y-a.centre.y, pm.x-a.centre.x);
    const p2OnCCW=((a2-sa)+2*Math.PI)%(2*Math.PI)<=span;
    a.inverted = p2OnCCW !== (span<=Math.PI);
  }
}



run('21_3P_arc', sk => {
  const p1=sk._mkPt(-100,0), p2=sk._mkPt(0,90), p3=sk._mkPt(100,0);
  const cc=circumcentre(p1,p2,p3);
  const r=Math.sqrt((p1.x-cc.x)**2+(p1.y-cc.y)**2);
  const C=sk._mkPt(cc.x,cc.y,{construction:true,name:'C'});
  const s1=sk._mkLn(C,p1,{construction:true,name:'spoke'});
  const s2=sk._mkLn(C,p2,{construction:true,name:'spoke'});
  const s3=sk._mkLn(C,p3,{construction:true,name:'spoke'});
  sk._mkC('equal',[s1,s2]); sk._mkC('equal',[s1,s3]);
  const a1=Math.atan2(p1.y-cc.y,p1.x-cc.x);
  const a2=Math.atan2(p2.y-cc.y,p2.x-cc.x);
  const a3=Math.atan2(p3.y-cc.y,p3.x-cc.x);
  const span=((a3-a1)+2*Math.PI)%(2*Math.PI);
  const inverted=((a2-a1+2*Math.PI)%(2*Math.PI)<=span)!==(span<=Math.PI);
  const arc=sk._mkAr(C,r,p1,p3,{inverted:false});
  arc.throughPt=p2;
  sk._mkC('point_on_circle',[p1,arc]);
  sk._mkC('point_on_circle',[p2,arc]);
  sk._mkC('point_on_circle',[p3,arc]);
}), fixArcInverted;

// ── 3P Circle ─────────────────────────────────────────────────────────────

run('22_3P_circle', sk => {
  const p1=sk._mkPt(-100,0), p2=sk._mkPt(0,90), p3=sk._mkPt(100,0);
  const cc=circumcentre(p1,p2,p3);
  const r=Math.sqrt((p1.x-cc.x)**2+(p1.y-cc.y)**2);
  const C=sk._mkPt(cc.x,cc.y,{construction:true,name:'C'});
  const s1=sk._mkLn(C,p1,{construction:true,name:'spoke'});
  const s2=sk._mkLn(C,p2,{construction:true,name:'spoke'});
  const s3=sk._mkLn(C,p3,{construction:true,name:'spoke'});
  sk._mkC('equal',[s1,s2]); sk._mkC('equal',[s1,s3]);
  const ci=sk._mkCi(C,r);
  sk._mkC('point_on_circle',[p1,ci]);
  sk._mkC('point_on_circle',[p2,ci]);
  sk._mkC('point_on_circle',[p3,ci]);
});

// ── 2T Arc — corner of a rectangle ────────────────────────────────────────
// Two perpendicular lines; arc tangent to both, endpoints on each line.
// Initial positions deliberately off; solver finds exact tangent points.

run('23_2T_arc_rect_corner', sk => {
  // Rectangle corner at origin — horizontal and vertical sides
  const hA=sk._mkPt(-200,0), hB=sk._mkPt(200,0);
  const vA=sk._mkPt(0,-160), vB=sk._mkPt(0,160);
  const hLn=sk._mkLn(hA,hB), vLn=sk._mkLn(vA,vB);
  sk._mkC('fixed',[hA]); sk._mkC('fixed',[hB]);
  sk._mkC('fixed',[vA]); sk._mkC('fixed',[vB]);

  // Tangent points (initial: on lines but not at exact tangent positions)
  const tp1=sk._mkPt(100,0);   // will slide on horizontal line
  const tp2=sk._mkPt(0,100);   // will slide on vertical line
  const Cpt=sk._mkPt(80,80,{construction:true,name:'C'});
  const r=80;
  const arc=sk._mkAr(Cpt,r,tp1,tp2,{inverted:false});

  sk._mkC('tangent',[arc,hLn]);
  sk._mkC('tangent',[arc,vLn]);
  sk._mkC('point_on_line',[tp1,hLn]);
  sk._mkC('point_on_line',[tp2,vLn]);
  sk._mkC('point_on_circle',[tp1,arc]);
  sk._mkC('point_on_circle',[tp2,arc]);
});

// ── 2T Circle — corner of a rectangle ─────────────────────────────────────

run('24_2T_circle_rect_corner', sk => {
  const hA=sk._mkPt(-200,0), hB=sk._mkPt(200,0);
  const vA=sk._mkPt(0,-160), vB=sk._mkPt(0,160);
  const hLn=sk._mkLn(hA,hB), vLn=sk._mkLn(vA,vB);
  sk._mkC('fixed',[hA]); sk._mkC('fixed',[hB]);
  sk._mkC('fixed',[vA]); sk._mkC('fixed',[vB]);

  const Cpt=sk._mkPt(80,80,{construction:true,name:'C'});
  const ci=sk._mkCi(Cpt,80);
  // Tangent points — initial off positions
  const tp1=sk._mkPt(100,0);
  const tp2=sk._mkPt(0,100);

  sk._mkC('tangent',[hLn,ci]);
  sk._mkC('tangent',[vLn,ci]);
  sk._mkC('point_on_line',[tp1,hLn]);
  sk._mkC('point_on_line',[tp2,vLn]);
  sk._mkC('point_on_circle',[tp1,ci]);
  sk._mkC('point_on_circle',[tp2,ci]);
});

// ── 3T Arc — inscribed in equilateral triangle, points selected clockwise ─
// Triangle: A top, B bottom-right, C bottom-left (clockwise winding)
// Sides selected clockwise: AB (right side), BC (bottom), CA (left side)

run('25_3T_arc_triangle_cw', sk => {
  // Equilateral triangle, clockwise: A=top, B=bottom-right, C=bottom-left
  const A={x:0,y:173}, B={x:150,y:-87}, Cv={x:-150,y:-87};
  const pA=sk._mkPt(A.x,A.y), pB=sk._mkPt(B.x,B.y), pC=sk._mkPt(Cv.x,Cv.y);
  sk._mkC('fixed',[pA]); sk._mkC('fixed',[pB]); sk._mkC('fixed',[pC]);
  const lAB=sk._mkLn(pA,pB);  // right side — first tap
  const lBC=sk._mkLn(pB,pC);  // bottom — second tap
  const lCA=sk._mkLn(pC,pA);  // left side — third tap

  // Incircle of equilateral triangle (centroid = incentre = (0,0) for this triangle)
  const ic=incircle3(
    [{p1:A,p2:B},{p1:B,p2:Cv},{p1:Cv,p2:A}],
    {x:0,y:0}
  );

  // Tangent points — initial positions at midpoints of sides (off from solution)
  const tp1=sk._mkPt((A.x+B.x)/2,(A.y+B.y)/2);  // midpoint of AB
  const tp2=sk._mkPt((B.x+Cv.x)/2,(B.y+Cv.y)/2); // midpoint of BC
  const tp3=sk._mkPt((Cv.x+A.x)/2,(Cv.y+A.y)/2); // midpoint of CA

  const Cpt=sk._mkPt(0,0,{construction:true,name:'C'});
  const r=ic?.r||86;

  // Arc from tp1 (AB) to tp3 (CA), through tp2 (BC) — clockwise sweep
  const sa=Math.atan2(tp1.y-Cpt.y,tp1.x-Cpt.x);
  const ea=Math.atan2(tp3.y-Cpt.y,tp3.x-Cpt.x);
  const a2a=Math.atan2(tp2.y-Cpt.y,tp2.x-Cpt.x);
  const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
  const inverted=((a2a-sa+2*Math.PI)%(2*Math.PI)<=span)!==(span<=Math.PI);
  const arc=sk._mkAr(Cpt,r,tp1,tp3,{inverted:false});
  arc.throughPt=tp2;

  sk._mkC('tangent',[arc,lAB]);
  sk._mkC('tangent',[arc,lBC]);
  sk._mkC('tangent',[arc,lCA]);
  sk._mkC('point_on_line',[tp1,lAB]);
  sk._mkC('point_on_line',[tp2,lBC]);
  sk._mkC('point_on_line',[tp3,lCA]);
  sk._mkC('point_on_circle',[tp1,arc]);
  sk._mkC('point_on_circle',[tp2,arc]);
  sk._mkC('point_on_circle',[tp3,arc]);
}), fixArcInverted;

// ── 3T Circle — inscribed in equilateral triangle, points clockwise ────────

run('26_3T_circle_triangle_cw', sk => {
  const A={x:0,y:173}, B={x:150,y:-87}, Cv={x:-150,y:-87};
  const pA=sk._mkPt(A.x,A.y), pB=sk._mkPt(B.x,B.y), pC=sk._mkPt(Cv.x,Cv.y);
  sk._mkC('fixed',[pA]); sk._mkC('fixed',[pB]); sk._mkC('fixed',[pC]);
  const lAB=sk._mkLn(pA,pB);
  const lBC=sk._mkLn(pB,pC);
  const lCA=sk._mkLn(pC,pA);

  const ic=incircle3(
    [{p1:A,p2:B},{p1:B,p2:Cv},{p1:Cv,p2:A}],
    {x:0,y:0}
  );

  const tp1=sk._mkPt((A.x+B.x)/2,(A.y+B.y)/2);
  const tp2=sk._mkPt((B.x+Cv.x)/2,(B.y+Cv.y)/2);
  const tp3=sk._mkPt((Cv.x+A.x)/2,(Cv.y+A.y)/2);
  const Cpt=sk._mkPt(0,0,{construction:true,name:'C'});
  const ci=sk._mkCi(Cpt,ic?.r||86);

  sk._mkC('tangent',[lAB,ci]);
  sk._mkC('tangent',[lBC,ci]);
  sk._mkC('tangent',[lCA,ci]);
  sk._mkC('point_on_line',[tp1,lAB]);
  sk._mkC('point_on_line',[tp2,lBC]);
  sk._mkC('point_on_line',[tp3,lCA]);
  sk._mkC('point_on_circle',[tp1,ci]);
  sk._mkC('point_on_circle',[tp2,ci]);
  sk._mkC('point_on_circle',[tp3,ci]);
});

// ── 3T Arc — same triangle, CCW selection order ───────────────────────────

run('27_3T_arc_triangle_ccw', sk => {
  const A={x:0,y:173}, B={x:150,y:-87}, Cv={x:-150,y:-87};
  const pA=sk._mkPt(A.x,A.y), pB=sk._mkPt(B.x,B.y), pC=sk._mkPt(Cv.x,Cv.y);
  sk._mkC('fixed',[pA]); sk._mkC('fixed',[pB]); sk._mkC('fixed',[pC]);
  const lAB=sk._mkLn(pA,pB), lBC=sk._mkLn(pB,pC), lCA=sk._mkLn(pC,pA);
  const ic=incircle3([{p1:A,p2:B},{p1:B,p2:Cv},{p1:Cv,p2:A}],{x:0,y:0});

  // CCW order: CA (left) → BC (bottom) → AB (right)
  const tp1=sk._mkPt((Cv.x+A.x)/2,(Cv.y+A.y)/2);
  const tp2=sk._mkPt((B.x+Cv.x)/2,(B.y+Cv.y)/2);
  const tp3=sk._mkPt((A.x+B.x)/2,(A.y+B.y)/2);
  const Cpt=sk._mkPt(0,0,{construction:true,name:'C'});
  const r=ic?.r||86;

  const sa=Math.atan2(tp1.y,tp1.x), ea=Math.atan2(tp3.y,tp3.x), a2=Math.atan2(tp2.y,tp2.x);
  const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
  const inverted=((a2-sa+2*Math.PI)%(2*Math.PI)<=span)!==(span<=Math.PI);
  const arc=sk._mkAr(Cpt,r,tp1,tp3,{inverted:false});
  arc.throughPt=tp2;

  sk._mkC('tangent',[arc,lCA]); sk._mkC('tangent',[arc,lBC]); sk._mkC('tangent',[arc,lAB]);
  sk._mkC('point_on_line',[tp1,lCA]); sk._mkC('point_on_line',[tp2,lBC]); sk._mkC('point_on_line',[tp3,lAB]);
  sk._mkC('point_on_circle',[tp1,arc]); sk._mkC('point_on_circle',[tp2,arc]); sk._mkC('point_on_circle',[tp3,arc]);
}), fixArcInverted;

// ── 3T Arc & Circle — inscribed in the end of a wide rectangle ───────────
// Rectangle 400×200. Three sides: top, right end, bottom.
// Incircle: centre (100,0), radius 100 — a perfect semicircle.

run('28_3T_arc_rect_end', sk => {
  const tL=sk._mkPt(-200,100), tR=sk._mkPt(200,100);
  const bL=sk._mkPt(-200,-100), bR=sk._mkPt(200,-100);
  sk._mkC('fixed',[tL]); sk._mkC('fixed',[tR]);
  sk._mkC('fixed',[bL]); sk._mkC('fixed',[bR]);
  const top=sk._mkLn(tL,tR), bot=sk._mkLn(bL,bR);
  const end=sk._mkLn(tR,bR);  // shares corners with top/bottom

  // Analytical incircle for these 3 lines: centre (100,0) radius 100
  const ic=incircle3(
    [{p1:{x:-200,y:100},p2:{x:200,y:100}},   // top
     {p1:{x:200,y:100}, p2:{x:200,y:-100}},   // end
     {p1:{x:-200,y:-100},p2:{x:200,y:-100}}], // bottom
    {x:0,y:0});
  const {cx,cy,r}=ic;

  // Analytical tangent points (feet of perpendiculars from incircle centre)
  const exactTp1=footPerp(cx,cy,-200,100,200,100);   // on top
  const exactTp2=footPerp(cx,cy,200,100,200,-100);   // on end
  const exactTp3=footPerp(cx,cy,-200,-100,200,-100); // on bottom

  // Initial positions: exact solution so solver just confirms
  // (perturbation small — reveals solver stability)
  const tp1=sk._mkPt(exactTp1.x-5, exactTp1.y);
  const tp2=sk._mkPt(exactTp2.x,   exactTp2.y+8);
  const tp3=sk._mkPt(exactTp3.x-5, exactTp3.y);
  const Cpt=sk._mkPt(cx-8, cy+5, {construction:true,name:'C'});

  // Compute inverted from analytical centre so arc side is correct
  const sa=Math.atan2(exactTp1.y-cy, exactTp1.x-cx);
  const ea=Math.atan2(exactTp3.y-cy, exactTp3.x-cx);
  const a2=Math.atan2(exactTp2.y-cy, exactTp2.x-cx);
  const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
  const inverted=((a2-sa+2*Math.PI)%(2*Math.PI)<=span)!==(span<=Math.PI);
  const arc=sk._mkAr(Cpt,r,tp1,tp3,{inverted:false});
  arc.throughPt=tp2;

  sk._mkC('tangent',[arc,top]); sk._mkC('tangent',[arc,end]); sk._mkC('tangent',[arc,bot]);
  sk._mkC('point_on_line',[tp1,top]); sk._mkC('point_on_line',[tp2,end]); sk._mkC('point_on_line',[tp3,bot]);
  sk._mkC('point_on_circle',[tp1,arc]); sk._mkC('point_on_circle',[tp2,arc]); sk._mkC('point_on_circle',[tp3,arc]);
}), fixArcInverted;

run('29_3T_circle_rect_end', sk => {
  const tL=sk._mkPt(-200,100), tR=sk._mkPt(200,100);
  const bL=sk._mkPt(-200,-100), bR=sk._mkPt(200,-100);
  sk._mkC('fixed',[tL]); sk._mkC('fixed',[tR]);
  sk._mkC('fixed',[bL]); sk._mkC('fixed',[bR]);
  const top=sk._mkLn(tL,tR), bot=sk._mkLn(bL,bR);
  const end=sk._mkLn(tR,bR);

  const ic=incircle3(
    [{p1:{x:-200,y:100},p2:{x:200,y:100}},
     {p1:{x:200,y:100}, p2:{x:200,y:-100}},
     {p1:{x:-200,y:-100},p2:{x:200,y:-100}}],
    {x:0,y:0});
  const {cx,cy,r}=ic;

  const exactTp1=footPerp(cx,cy,-200,100,200,100);
  const exactTp2=footPerp(cx,cy,200,100,200,-100);
  const exactTp3=footPerp(cx,cy,-200,-100,200,-100);

  const tp1=sk._mkPt(exactTp1.x-5, exactTp1.y);
  const tp2=sk._mkPt(exactTp2.x,   exactTp2.y+8);
  const tp3=sk._mkPt(exactTp3.x-5, exactTp3.y);
  const Cpt=sk._mkPt(cx-8, cy+5, {construction:true,name:'C'});
  const ci=sk._mkCi(Cpt,r);

  sk._mkC('tangent',[top,ci]); sk._mkC('tangent',[end,ci]); sk._mkC('tangent',[bot,ci]);
  sk._mkC('point_on_line',[tp1,top]); sk._mkC('point_on_line',[tp2,end]); sk._mkC('point_on_line',[tp3,bot]);
  sk._mkC('point_on_circle',[tp1,ci]); sk._mkC('point_on_circle',[tp2,ci]); sk._mkC('point_on_circle',[tp3,ci]);
});

// ── 3T Arc — realistic start: tangent points at feet of perp (projectOnEntity) ──
// The actual tool calls projectOnEntity(entity, cx, cy) which places tangent
// points at the foot of perpendicular from the incircle centre to each line.
// These tests verify solver stability with small perturbations from that position.

// ── 3T Arc/Circle — exact analytical initial positions ────────────────────
// The tool now uses binary search to place tangent points at exact feet of
// perpendiculars before the solver runs. These tests mirror that: exact
// incircle positions as "before", solver confirms with residual ≈ 0.

run('30_3T_arc_exact_triangle', sk => {
  const A={x:0,y:173}, B={x:150,y:-87}, Cv={x:-150,y:-87};
  const pA=sk._mkPt(A.x,A.y), pB=sk._mkPt(B.x,B.y), pC=sk._mkPt(Cv.x,Cv.y);
  sk._mkC('fixed',[pA]); sk._mkC('fixed',[pB]); sk._mkC('fixed',[pC]);
  const lAB=sk._mkLn(pA,pB), lBC=sk._mkLn(pB,pC), lCA=sk._mkLn(pC,pA);
  const ic=incircle3([{p1:A,p2:B},{p1:B,p2:Cv},{p1:Cv,p2:A}],{x:0,y:0});
  const f1=footPerp(ic.cx,ic.cy,A.x,A.y,B.x,B.y);
  const f2=footPerp(ic.cx,ic.cy,B.x,B.y,Cv.x,Cv.y);
  const f3=footPerp(ic.cx,ic.cy,Cv.x,Cv.y,A.x,A.y);

  const tp1=sk._mkPt(f1.x,f1.y), tp2=sk._mkPt(f2.x,f2.y), tp3=sk._mkPt(f3.x,f3.y);
  const Cpt=sk._mkPt(ic.cx,ic.cy,{construction:true,name:'C'});
  const arc=sk._mkAr(Cpt,ic.r,tp1,tp3,{inverted:false});
  arc.throughPt=tp2;

  sk._mkC('tangent',[arc,lAB]); sk._mkC('tangent',[arc,lBC]); sk._mkC('tangent',[arc,lCA]);
  sk._mkC('point_on_line',[tp1,lAB]); sk._mkC('point_on_line',[tp2,lBC]); sk._mkC('point_on_line',[tp3,lCA]);
  sk._mkC('point_on_circle',[tp1,arc]); sk._mkC('point_on_circle',[tp2,arc]); sk._mkC('point_on_circle',[tp3,arc]);
}, fixArcInverted);

run('31_3T_arc_exact_rect', sk => {
  const tL=sk._mkPt(-200,100), tR=sk._mkPt(200,100);
  const bL=sk._mkPt(-200,-100), bR=sk._mkPt(200,-100);
  sk._mkC('fixed',[tL]); sk._mkC('fixed',[tR]);
  sk._mkC('fixed',[bL]); sk._mkC('fixed',[bR]);
  const top=sk._mkLn(tL,tR), bot=sk._mkLn(bL,bR), end=sk._mkLn(tR,bR);
  const ic=incircle3(
    [{p1:{x:-200,y:100},p2:{x:200,y:100}},
     {p1:{x:200,y:100}, p2:{x:200,y:-100}},
     {p1:{x:-200,y:-100},p2:{x:200,y:-100}}],{x:0,y:0});
  const f1=footPerp(ic.cx,ic.cy,-200,100,200,100);
  const f2=footPerp(ic.cx,ic.cy,200,100,200,-100);
  const f3=footPerp(ic.cx,ic.cy,-200,-100,200,-100);

  const tp1=sk._mkPt(f1.x,f1.y), tp2=sk._mkPt(f2.x,f2.y), tp3=sk._mkPt(f3.x,f3.y);
  const Cpt=sk._mkPt(ic.cx,ic.cy,{construction:true,name:'C'});
  const arc=sk._mkAr(Cpt,ic.r,tp1,tp3,{inverted:false});
  arc.throughPt=tp2;

  sk._mkC('tangent',[arc,top]); sk._mkC('tangent',[arc,end]); sk._mkC('tangent',[arc,bot]);
  sk._mkC('point_on_line',[tp1,top]); sk._mkC('point_on_line',[tp2,end]); sk._mkC('point_on_line',[tp3,bot]);
  sk._mkC('point_on_circle',[tp1,arc]); sk._mkC('point_on_circle',[tp2,arc]); sk._mkC('point_on_circle',[tp3,arc]);
}, fixArcInverted);

// ── Constrained drag: temporary constraint test ────────────────────────────
// ── Case 32: constrained drag via temporary constraint ─────────────────────
// 200×200 center rectangle (br at 100,-100).  postSolve adds a temporary
// p2p_coincident pulling br to (150,-150).  The solver should honour the
// height constraint and slide br only in the free direction.
run('32_constrained_drag_temporary', sk => {
  const d1p    = sk._mkPt(0, 0,  {name:'d1p'});
  const origin = sk._mkPt(0, 0); sk._mkC('fixed',[origin]);
  sk._mkC('coincident',[d1p, origin]);

  const br = sk._mkPt( 100, -100, {name:'br'});
  const bl = sk._mkPt(-100, -100, {name:'bl'});
  const tl = sk._mkPt(-100,  100, {name:'tl'});
  const tr = sk._mkPt( 100,  100, {name:'tr'});

  const bottom = sk._mkLn(br, bl);
  const left   = sk._mkLn(bl, tl);
  const top    = sk._mkLn(tl, tr);
  const right  = sk._mkLn(tr, br);

  sk._mkC('symmetric',[br, tl, d1p]);
  sk._mkC('symmetric',[bl, tr, d1p]);
  sk._mkC('horizontal',[bottom]);
  sk._mkC('distance',[right], 200);
}, sk => {
  const br     = [...sk.points.values()].find(p => p.name === 'br');
  // Simulate drag: move br to the mouse position first,
  // then add a temporary coincident so planegcs resolves it
  // onto the constraint manifold.
  br.x = 150; br.y = -150;
  const target = sk._mkPt(150, -150); sk._mkC('fixed',[target]);
  const c = sk._mkC('coincident',[br, target]);
  c.temporary = true;
  sk._solveAndNotify();
});

// ── Case 33: reference — fully constrained 250×200 center rectangle ─────────
// The passing condition for case 32: br should end up at (125,-100),
// matching this geometry exactly.
run('33_reference_250x200', sk => {
  const d1p    = sk._mkPt(0, 0,  {name:'d1p'});
  const origin = sk._mkPt(0, 0); sk._mkC('fixed',[origin]);
  sk._mkC('coincident',[d1p, origin]);

  const br = sk._mkPt( 125, -100, {name:'br'});
  const bl = sk._mkPt(-125, -100, {name:'bl'});
  const tl = sk._mkPt(-125,  100, {name:'tl'});
  const tr = sk._mkPt( 125,  100, {name:'tr'});

  const bottom = sk._mkLn(br, bl);
  const left   = sk._mkLn(bl, tl);
  const top    = sk._mkLn(tl, tr);
  const right  = sk._mkLn(tr, br);

  sk._mkC('symmetric',[br, tl, d1p]);
  sk._mkC('symmetric',[bl, tr, d1p]);
  sk._mkC('horizontal',[bottom]);   // long edge horizontal
  sk._mkC('distance',[right],  200);   // height fixed at 200
  sk._mkC('distance',[bottom], 250);   // width fixed at 250
});

renders.forEach(p => console.log(' ', p.replace('/home/claude/test/renders/','')));

const sheetPath = await renderSheet(renders);
console.log('\nSheet:', sheetPath);
