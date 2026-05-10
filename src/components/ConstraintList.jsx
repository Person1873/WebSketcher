import { C, CICONS } from '../geometry/analysis.js';
import { BTN_SMALL } from './styles.js';

export default function ConstraintList({sk, sel, onDelete, onToggleLocked, onToggleDisabled, onEdit}) {
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
