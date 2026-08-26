import { C, CICONS } from '../geometry/analysis.js';

export function getDimensionModes(pts, lns, cis, ars=[]) {
  const m = [];
  if (cis.length >= 1 || ars.length >= 1) m.push('radius');
  if (pts.length >= 2 || lns.length >= 1) m.push('distance');
  if (lns.length >= 2) m.push('angle');
  return m;
}

export function getApplicableConstraints(sk, sel) {
  const pts   =[...sel].filter(id=>sk.points.has(id)&&!sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const lns   =[...sel].filter(id=>sk.lines.has(id) &&!sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const cis   =[...sel].filter(id=>sk.circles.has(id)).map(id=>sk.circles.get(id));
  const ars   =[...sel].filter(id=>sk.arcs.has(id)).map(id=>sk.arcs.get(id));
  if (!pts.length && !lns.length && !cis.length && !ars.length) return [];
  const refPts=[...sel].filter(id=>sk.points.has(id)&& sk.points.get(id).reserved).map(id=>sk.points.get(id));
  const refLns=[...sel].filter(id=>sk.lines.has(id) && sk.reserved.has(sk.lines.get(id))).map(id=>sk.lines.get(id));
  const allPts=[...pts,...refPts], allLns=[...lns,...refLns];
  const curves = cis.length + ars.length;
  const t=new Set();
  if (pts.length>=1) t.add('fixed');
  if (allPts.length>=1 && (allPts.length>=2||allLns.length>=1||cis.length>=1||ars.length>=1)) t.add('attach');
  if (lns.length>=1 || (allPts.length>=2 && pts.length>=1)) { t.add('horizontal'); t.add('vertical'); }
  if (lns.length>=2 || cis.length>=2 || ars.length>=2 || (cis.length>=1&&ars.length>=1)) t.add('equal');
  if (lns.length>=1 && allLns.length>=2) { t.add('parallel'); t.add('perpendicular'); }
  if (curves>=1 && (allLns.length>=1||curves>=2)) t.add('tangent');
  if ((allPts.length>=3 && pts.length>=2) || (pts.length>=2 && allLns.length>=1)) t.add('symmetric');
  if (allPts.length>=2||allLns.length>=1||cis.length>=1||ars.length>=1) t.add('dimension');
  return [...t];
}

export default function ContextualConstraintStrip({sk, sel, onConstraint, conflict, dimType, dimModes, onCycleDim}) {
  const applicable = sel.size>0 ? getApplicableConstraints(sk,sel) : [];
  const bs = type => ({
    minWidth:52,height:46,display:'flex',flexDirection:'column',
    alignItems:'center',justifyContent:'center',gap:2,
    background:'#0a1628',border:`1px solid ${C.border}`,borderRadius:8,
    cursor:'pointer',color:C.cc[type]||'#aaa',
    flexShrink:0,
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
                    <button onClick={()=>onConstraint('dimension', active)}
                      title={active} style={bs(active)}>
                      <span style={{fontSize:20,lineHeight:1}}>{CICONS[active]}</span>
                    </button>
                    {dimModes.length>1&&(
                      <button onClick={onCycleDim} title="Cycle"
                        style={{...bs('fixed'),minWidth:28,background:'transparent',
                          color:C.muted,fontSize:16,border:'none'}}>↻</button>
                    )}
                  </div>
                );
              }
              return (
                <button key={type} title={type} onClick={()=>onConstraint(type)}
                  style={bs(type)}>
                  <span style={{fontSize:20,lineHeight:1}}>{CICONS[type]}</span>
                </button>
              );
            })}
          </div>
      }
    </div>
  );
}
