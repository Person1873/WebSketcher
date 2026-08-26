import { C } from '../geometry/analysis.js';
import { BTN_SMALL } from './styles.js';
import ConstraintList from './ConstraintList.jsx';

export default function BottomSheet({isOpen, onToggle, sk, sel, onDelete, onToggleLocked, onToggleDisabled, onToggleDriven, onEdit, onCam}) {
  const ptCount=sk.points.size-5, lnCount=sk.lines.size-2, ciCount=sk.circles.size;
  const cCount=sk.constraints.length;
  const disabledCount=sk.constraints.filter(c=>c.disabled).length;
  return (
    <div style={{
      background:C.panel,borderTop:`1px solid ${C.border}`,flexShrink:0,
      height:isOpen?220:38,transition:'height 0.2s ease',
      display:'flex',flexDirection:'column',overflow:'hidden'
    }}>
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
      {isOpen&&(
        <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <ConstraintList sk={sk} sel={sel}
            onDelete={onDelete} onToggleLocked={onToggleLocked}
            onToggleDisabled={onToggleDisabled} onToggleDriven={onToggleDriven} onEdit={onEdit}/>
        </div>
      )}
    </div>
  );
}
