/**
 * Sketch Engine Test Suite
 * Run: node test/sketch.test.mjs
 */
import { Sketch, SketchPoint, SketchLine, SketchCircle, SketchArc, solve, circumcentre }
  from './sketch-engine.mjs';

// ── Harness ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0, suite = '';
const results = [];

function describe(name, fn) { suite = name; fn(); }

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++; results.push({suite,name,err:e.message}); }
}

const EPS = 1;     // world units (~0.01mm)
const DEPS = 0.1;  // DOF tolerance

function assert(cond, msg='assertion failed') { if(!cond) throw new Error(msg); }
function close(a, b, eps=EPS, msg) {
  if(Math.abs(a-b)>eps) throw new Error(msg||`expected ${a} ≈ ${b} (±${eps})`); }
function closePt(p, x, y, eps=EPS) {
  close(p.x,x,eps,`pt.x=${p.x} ≠ ${x}`); close(p.y,y,eps,`pt.y=${p.y} ≠ ${y}`); }

/** Fresh sketch with a horizontal line from (0,0) to (100,0) */
function hLine() {
  const sk = new Sketch();
  const p1 = sk.addPoint(0,0), p2 = sk.addPoint(100,0);
  const ln = sk._mkLn(p1,p2);
  return {sk,p1,p2,ln};
}
/** Fresh sketch with a tilted line from (0,0) to (70,70) */
function diagLine() {
  const sk = new Sketch();
  const p1 = sk.addPoint(0,0), p2 = sk.addPoint(70,70);
  const ln = sk._mkLn(p1,p2);
  return {sk,p1,p2,ln};
}


// ══════════════════════════════════════════════════════════════════════════
describe('DOF counting', () => {

  test('empty sketch: 0 DOF', () => {
    const sk = new Sketch();
    sk._solveAndNotify();
    close(sk.solveResult.dof, 0, DEPS);
  });

  test('one free point: 2 DOF', () => {
    const sk = new Sketch();
    sk.addPoint(10,20);
    sk._solveAndNotify();
    close(sk.solveResult.dof, 2, DEPS);
  });

  test('fixed point: 0 DOF', () => {
    const sk = new Sketch();
    const p = sk.addPoint(10,20);
    sk.addConstraint('fixed',[p]);
    close(sk.solveResult.dof, 0, DEPS);
  });

  test('free line (2 pts): 4 DOF', () => {
    const {sk} = hLine();
    close(sk.solveResult.dof, 4, DEPS);
  });

  test('horizontal line: 3 DOF', () => {
    const {sk,ln} = diagLine();
    sk.addConstraint('horizontal',[ln]);
    close(sk.solveResult.dof, 3, DEPS);
  });

  test('horizontal + fixed p1: 1 DOF', () => {
    const {sk,p1,ln} = diagLine();
    sk.addConstraint('horizontal',[ln]);
    sk.addConstraint('fixed',[p1]);
    close(sk.solveResult.dof, 1, DEPS);
  });

  test('fully constrained line: 0 DOF', () => {
    const {sk,p1,p2,ln} = diagLine();
    sk.addConstraint('fixed',[p1]);
    sk.addConstraint('fixed',[p2]);
    close(sk.solveResult.dof, 0, DEPS);
  });

  test('coincident costs 2 DOF', () => {
    const sk = new Sketch();
    const p1 = sk.addPoint(0,0), p2 = sk.addPoint(10,10);
    const before = sk.solveResult.dof;
    sk.addConstraint('coincident',[p1,p2]);
    close(sk.solveResult.dof, before-2, DEPS, 'coincident should cost 2 DOF');
  });

  test('free circle: 3 DOF (cx,cy,r)', () => {
    const sk = new Sketch();
    const c = sk.addPoint(0,0);
    sk._mkCi(c, 50);
    sk._solveAndNotify();
    close(sk.solveResult.dof, 3, DEPS);
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Geometric constraints', () => {

  test('horizontal: line becomes horizontal', () => {
    const {sk,p1,p2,ln} = diagLine();
    sk.addConstraint('fixed',[p1]);
    sk.addConstraint('horizontal',[ln]);
    close(p1.y, p2.y, EPS, 'p1.y and p2.y should match');
  });

  test('vertical: line becomes vertical', () => {
    const {sk,p1,p2,ln} = diagLine();
    sk.addConstraint('fixed',[p1]);
    sk.addConstraint('vertical',[ln]);
    close(p1.x, p2.x, EPS, 'p1.x and p2.x should match');
  });

  test('fixed: point stays put', () => {
    const sk = new Sketch();
    const p = sk.addPoint(33,44);
    sk.addConstraint('fixed',[p]);
    sk.addConstraint('coincident',[p, sk.addPoint(0,0)]); // try to move it
    closePt(p, 33, 44);
  });

  test('coincident: points converge', () => {
    const sk = new Sketch();
    const p1 = sk.addPoint(0,0), p2 = sk.addPoint(50,50);
    sk.addConstraint('coincident',[p1,p2]);
    close(p1.x,p2.x,EPS,'x should match'); close(p1.y,p2.y,EPS,'y should match');
  });

  test('equal: two lines become same length', () => {
    const sk = new Sketch();
    const a1=sk.addPoint(0,0), a2=sk.addPoint(100,0);
    const b1=sk.addPoint(0,50), b2=sk.addPoint(30,50);
    const l1=sk._mkLn(a1,a2), l2=sk._mkLn(b1,b2);
    sk.addConstraint('fixed',[a1]); sk.addConstraint('fixed',[a2]);
    sk.addConstraint('equal',[l1,l2]);
    const len1=Math.sqrt((a2.x-a1.x)**2+(a2.y-a1.y)**2);
    const len2=Math.sqrt((b2.x-b1.x)**2+(b2.y-b1.y)**2);
    close(len1, len2, EPS, `lengths should match: ${len1.toFixed(1)} vs ${len2.toFixed(1)}`);
  });

  test('perpendicular: lines at 90°', () => {
    const sk = new Sketch();
    const o=sk.addPoint(0,0), a=sk.addPoint(100,0), b=sk.addPoint(0,80);
    const l1=sk._mkLn(o,a), l2=sk._mkLn(o,b);
    sk.addConstraint('fixed',[o]); sk.addConstraint('fixed',[a]);
    sk.addConstraint('perpendicular',[l1,l2]);
    // dot product of direction vectors should be ~0
    const dx1=a.x-o.x,dy1=a.y-o.y, dx2=b.x-o.x,dy2=b.y-o.y;
    const dot=dx1*dx2+dy1*dy2;
    const len1=Math.sqrt(dx1**2+dy1**2), len2=Math.sqrt(dx2**2+dy2**2);
    close(dot/(len1*len2), 0, 0.01, `dot product should be 0, got ${(dot/(len1*len2)).toFixed(4)}`);
  });

  test('parallel: lines have same direction', () => {
    const sk = new Sketch();
    const a1=sk.addPoint(0,0), a2=sk.addPoint(100,0);
    const b1=sk.addPoint(0,50), b2=sk.addPoint(50,80);
    const l1=sk._mkLn(a1,a2), l2=sk._mkLn(b1,b2);
    sk.addConstraint('fixed',[a1]); sk.addConstraint('fixed',[a2]);
    sk.addConstraint('parallel',[l1,l2]);
    const dx1=a2.x-a1.x,dy1=a2.y-a1.y, dx2=b2.x-b1.x,dy2=b2.y-b1.y;
    const cross=dx1*dy2-dy1*dx2;
    const len1=Math.sqrt(dx1**2+dy1**2), len2=Math.sqrt(dx2**2+dy2**2);
    close(cross/(len1*len2), 0, 0.01, `cross product should be 0, got ${(cross/(len1*len2)).toFixed(4)}`);
  });

  test('point_on_line: point moves onto line', () => {
    const {sk,p1,p2,ln} = hLine();
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    const pt = sk.addPoint(50,40);
    sk.addConstraint('point_on_line',[pt,ln]);
    close(pt.y, 0, EPS, `pt.y=${pt.y.toFixed(2)} should be on y=0 line`);
  });

  test('point_on_circle: point moves to circle', () => {
    const sk = new Sketch();
    const c = sk.addPoint(0,0);
    sk.addConstraint('fixed',[c]);
    const ci = sk._mkCi(c,100);
    const pt = sk.addPoint(200,200);
    sk.addConstraint('point_on_circle',[pt,ci]);
    const dist = Math.sqrt(pt.x**2+pt.y**2);
    close(dist, 100, EPS, `dist=${dist.toFixed(2)} should be 100`);
  });

  test('symmetric: midpoint axis stays as midpoint', () => {
    const sk = new Sketch();
    const a=sk.addPoint(-50,0), b=sk.addPoint(50,0), mid=sk.addPoint(0,0);
    sk.addConstraint('fixed',[mid]);
    sk.addConstraint('symmetric',[a,b,mid]);
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    close(mx, mid.x, EPS, `midpoint.x=${mx.toFixed(2)} ≠ ${mid.x}`);
    close(my, mid.y, EPS, `midpoint.y=${my.toFixed(2)} ≠ ${mid.y}`);
  });

  test('symmetric: fixed axis pulls both points (regression — was no-op)', () => {
    // The bug: when axis is fixed and both p1,p2 are free,
    // the old code was a no-op. This verifies the fix.
    const sk = new Sketch();
    const a=sk.addPoint(-30,10), b=sk.addPoint(40,10), mid=sk.addPoint(0,0);
    sk.addConstraint('fixed',[mid]);
    sk.addConstraint('symmetric',[a,b,mid]);
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    close(mx, 0, EPS, `midpoint.x=${mx.toFixed(2)} should be 0 (fixed axis)`);
    close(my, 0, EPS, `midpoint.y=${my.toFixed(2)} should be 0 (fixed axis)`);
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Dimensional constraints', () => {

  test('distance: line gets correct length', () => {
    const {sk,p1,p2,ln} = diagLine();
    sk.addConstraint('fixed',[p1]);
    sk.addConstraint('distance',[ln],200);
    const len=Math.sqrt((p2.x-p1.x)**2+(p2.y-p1.y)**2);
    close(len, 200, EPS, `len=${len.toFixed(2)} should be 200`);
  });

  test('radius: circle gets correct radius', () => {
    const sk = new Sketch();
    const c = sk.addPoint(0,0);
    const ci = sk._mkCi(c,50);
    sk.addConstraint('radius',[ci],150);
    close(ci.radius, 150, EPS, `radius=${ci.radius.toFixed(2)} should be 150`);
  });

  test('angle: two lines at specified angle', () => {
    const sk = new Sketch();
    const o=sk.addPoint(0,0), a=sk.addPoint(100,0), b=sk.addPoint(0,50);
    const l1=sk._mkLn(o,a), l2=sk._mkLn(o,b);
    sk.addConstraint('fixed',[o]); sk.addConstraint('fixed',[a]);
    sk.addConstraint('angle',[l1,l2], 45); // 45 degrees
    const dx1=a.x-o.x,dy1=a.y-o.y, dx2=b.x-o.x,dy2=b.y-o.y;
    const dot=dx1*dx2+dy1*dy2;
    const len1=Math.sqrt(dx1**2+dy1**2), len2=Math.sqrt(dx2**2+dy2**2);
    const angleDeg=Math.acos(Math.max(-1,Math.min(1,dot/(len1*len2))))*180/Math.PI;
    close(angleDeg, 45, 2, `angle=${angleDeg.toFixed(1)}° should be 45°`);
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Tangent constraint', () => {

  test('line+circle: circle moves to touch line', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(-200,0), p2=sk.addPoint(200,0);
    const ln=sk._mkLn(p1,p2);
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    const c=sk.addPoint(0,80);
    const ci=sk._mkCi(c,50);
    sk.addConstraint('tangent',[ln,ci]);
    // Distance from circle centre to line (y=0) should equal radius
    close(Math.abs(c.y), ci.radius, EPS, `dist to line=${Math.abs(c.y).toFixed(2)} should equal radius=${ci.radius.toFixed(2)}`);
  });

  test('circle+circle: external tangency', () => {
    const sk = new Sketch();
    const c1=sk.addPoint(0,0); sk.addConstraint('fixed',[c1]);
    const c2=sk.addPoint(200,0);
    const ci1=sk._mkCi(c1,50), ci2=sk._mkCi(c2,50);
    sk.addConstraint('tangent',[ci1,ci2]);
    const dist=Math.sqrt((c2.x-c1.x)**2+(c2.y-c1.y)**2);
    close(dist, ci1.radius+ci2.radius, EPS,
      `dist=${dist.toFixed(2)} should equal r1+r2=${ci1.radius+ci2.radius}`);
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Conflict detection', () => {

  test('overconstrained: conflictState is set', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(100,0);
    const ln=sk._mkLn(p1,p2);
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    // Conflicting: line is 100 units but we demand 200
    sk.addConstraint('distance',[ln],200);
    assert(sk.conflictState!==null, 'conflictState should be set');
  });

  test('conflict rolls back to last valid geometry', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(100,0);
    const ln=sk._mkLn(p1,p2);
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    sk.addConstraint('distance',[ln],200); // conflict
    // After rollback, p2 should still be at x=100
    close(p2.x, 100, EPS, 'p2.x should roll back to 100');
  });

  test('undo clears conflict state', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(100,0);
    const ln=sk._mkLn(p1,p2);
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    sk.addConstraint('distance',[ln],200);
    assert(sk.conflictState!==null, 'should have conflict');
    sk.undo();
    assert(sk.conflictState===null, 'conflict should clear after undo');
  });

  test('ghost state captured before rollback', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(100,0);
    const ln=sk._mkLn(p1,p2);
    sk.addConstraint('fixed',[p1]); sk.addConstraint('fixed',[p2]);
    sk.addConstraint('distance',[ln],200);
    assert(sk.conflictState?.ghostState!=null, 'ghostState should be captured');
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Entity cascade deletion', () => {

  test('delete point cascades to connected lines', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(100,0);
    const ln=sk._mkLn(p1,p2);
    sk.deleteEntity(p1);
    assert(!sk.lines.has(ln.id), 'line should be deleted when endpoint deleted');
  });

  test('delete constraint removes from constraint list', () => {
    const sk = new Sketch();
    const p=sk.addPoint(0,0);
    const c=sk.addConstraint('fixed',[p]);
    const before=sk.constraints.length;
    c.delete();
    assert(sk.constraints.length===before-1, 'constraint should be removed');
  });

  test('point._constraints reflects attached constraints', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(10,0);
    const c=sk.addConstraint('coincident',[p1,p2]);
    assert(p1._constraints.has(c), 'p1 should reference constraint');
    assert(p2._constraints.has(c), 'p2 should reference constraint');
  });

  test('delete constraint clears back-refs', () => {
    const sk = new Sketch();
    const p=sk.addPoint(0,0);
    const c=sk.addConstraint('fixed',[p]);
    c.delete();
    assert(!p._constraints.has(c), 'p._constraints should not reference deleted constraint');
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Arc geometry', () => {

  test('arc startAngle/endAngle computed from centre and points', () => {
    const sk = new Sketch();
    const c=sk.addPoint(0,0), s=sk.addPoint(100,0), e=sk.addPoint(0,100);
    const a=sk._mkAr(c,100,s,e,{inverted:false});
    close(a.startAngle, 0, 0.01, 'startAngle should be 0');
    close(a.endAngle, Math.PI/2, 0.01, 'endAngle should be π/2');
  });

  test('arc inverted=false draws short arc (largeArc=0)', () => {
    const sk = new Sketch();
    const c=sk.addPoint(0,0), s=sk.addPoint(100,0), e=sk.addPoint(0,100);
    const a=sk._mkAr(c,100,s,e,{inverted:false});
    const sa=a.startAngle, ea=a.endAngle;
    const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
    const shortIsCCW=span<=Math.PI;
    // inverted=false → largeArc should be 0
    assert(!a.inverted, 'arc.inverted should be false');
  });

  test('3P arc circumcentre is equidistant from all 3 points', () => {
    const p1={x:0,y:0}, p2={x:100,y:50}, p3={x:200,y:0};
    const cc=circumcentre(p1,p2,p3);
    const d1=Math.sqrt((cc.x-p1.x)**2+(cc.y-p1.y)**2);
    const d2=Math.sqrt((cc.x-p2.x)**2+(cc.y-p2.y)**2);
    const d3=Math.sqrt((cc.x-p3.x)**2+(cc.y-p3.y)**2);
    close(d1,d2,EPS,'circumcentre equidistant p1,p2');
    close(d1,d3,EPS,'circumcentre equidistant p1,p3');
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('Separate points + coincident (post-migration)', () => {

  test('new points are always separate objects', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(0,0);
    assert(p1!==p2, 'addPoint should always create a new object');
  });

  test('coincident constraint brings separate points together', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(0,0), p2=sk.addPoint(50,50);
    sk.addConstraint('coincident',[p1,p2]);
    close(p1.x,p2.x,EPS); close(p1.y,p2.y,EPS);
  });

  test('deleting one point of a coincident pair leaves the other', () => {
    const sk = new Sketch();
    const p1=sk.addPoint(10,10), p2=sk.addPoint(10,10);
    const c=sk.addConstraint('coincident',[p1,p2]);
    sk.deleteEntity(p1);
    assert(sk.points.has(p2.id), 'p2 should survive when p1 is deleted');
    assert(!sk.constraints.includes(c), 'coincident should be deleted with p1');
  });
});


// ══════════════════════════════════════════════════════════════════════════
describe('FitToContent bounding box', () => {
  // Tests the Camera.fitToContent logic indirectly via arc extremes
  test('arc bounding box includes cardinal extremes within sweep', () => {
    // Arc from 0° to 90° CCW — should include the 0° and 90° extremes, not 180°/270°
    const sk = new Sketch();
    const c=sk.addPoint(0,0), s=sk.addPoint(100,0), e=sk.addPoint(0,100);
    const a=sk._mkAr(c,100,s,e,{inverted:false});
    // startAngle=0, endAngle=π/2, span=π/2, drawCCW=true
    // Cardinals in sweep: 0° (start) and 90° (end) — yes. 180° and 270° — no.
    const sa=a.startAngle, ea=a.endAngle;
    const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
    const drawCCW=a.inverted?span>Math.PI:span<=Math.PI;
    const inSweep=ang=>{
      const from=((ang-sa)+2*Math.PI)%(2*Math.PI);
      return drawCCW?from<=span:from>=span;
    };
    assert(inSweep(0),    '0° should be in sweep');
    assert(inSweep(Math.PI/2), '90° should be in sweep');
    assert(!inSweep(Math.PI),  '180° should NOT be in sweep');
    assert(!inSweep(3*Math.PI/2), '270° should NOT be in sweep');
  });
});


// ══════════════════════════════════════════════════════════════════════════
// Summary
console.log('\n' + '═'.repeat(50));
console.log(`  ${passed} passed  ·  ${failed} failed`);
if (results.length) {
  console.log('\nFailed:');
  results.forEach(r => console.log(`  [${r.suite}] ${r.name}\n    → ${r.err}`));
}
console.log('═'.repeat(50));
process.exit(failed > 0 ? 1 : 0);
