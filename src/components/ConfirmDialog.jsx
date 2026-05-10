import { C } from '../geometry/analysis.js';
import { BTN } from './styles.js';

export default function ConfirmDialog({message, detail, confirmLabel='Confirm', onConfirm, onCancel}) {
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
