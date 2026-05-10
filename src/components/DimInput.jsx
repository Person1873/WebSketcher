import { useState, useRef, useEffect } from 'react';
import { C } from '../geometry/analysis.js';
import { BTN } from './styles.js';

export default function DimInput({pending, onConfirm, onCancel}) {
  const isAngle   = pending.type==='angle';
  const isInteger = pending.type==='_ngon_sides';

  const toDisplay=(internal,u)=>{
    if(isInteger) return String(Math.round(parseFloat(internal))||6);
    const n=parseFloat(internal); if(isNaN(n)) return '0';
    if(isAngle) return u==='deg'?n.toFixed(2):(n*Math.PI/180).toFixed(5);
    const mm=n*0.01;
    return u==='mm'?mm.toFixed(2):(mm/25.4).toFixed(4);
  };
  const toInternal=(display,u)=>{
    if(isInteger){ const n=parseInt(display); return isNaN(n)||n<3?null:n; }
    const n=parseFloat(display); if(isNaN(n)||n<=0) return null;
    if(isAngle) return u==='deg'?n:n*180/Math.PI;
    return u==='mm'?n*100:n*2540;
  };

  const [unit,setUnit]=useState(isAngle?'deg':'mm');
  const [val,setVal]=useState(()=>toDisplay(pending.defaultVal??'0',isAngle?'deg':'mm'));
  const inputRef=useRef();
  useEffect(()=>{ inputRef.current?.focus(); inputRef.current?.select(); },[]);

  const handleUnit=u=>{
    const internal=toInternal(val,unit);
    if(internal!==null) setVal(toDisplay(internal,u));
    setUnit(u);
  };
  const confirm=()=>{ const n=toInternal(val,unit); if(n!==null) onConfirm(n); };
  const unitOpts=isInteger?[]:isAngle?['deg','rad']:['mm','in'];

  return (
    <div style={{position:'absolute',inset:0,background:'rgba(4,8,18,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,
      backdropFilter:'blur(2px)'}}>
      <div style={{background:'#0c1525',border:`1px solid ${C.border}`,borderRadius:12,
        padding:'20px',width:300,boxShadow:'0 8px 32px #000e'}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:'0.1em',marginBottom:14,
          fontFamily:'monospace'}}>{pending.label}</div>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}>
          <input ref={inputRef} value={val}
            onChange={e=>setVal(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') confirm(); if(e.key==='Escape') onCancel(); }}
            style={{flex:1,background:'#070d18',border:`1px solid ${C.border}`,borderRadius:6,
              color:C.text,padding:'10px 12px',fontSize:20,fontFamily:'monospace',outline:'none'}}/>
          {unitOpts.length>0&&<div style={{display:'flex',flexDirection:'column',gap:4}}>
            {unitOpts.map(u=>(
              <button key={u} onClick={()=>handleUnit(u)}
                style={{padding:'7px 10px',borderRadius:5,cursor:'pointer',fontFamily:'monospace',
                  fontSize:11,border:`1px solid ${unit===u?'#2a5080':C.border}`,
                  background:unit===u?'#1a3050':'transparent',
                  color:unit===u?'#60c0ff':C.muted}}>
                {u}
              </button>
            ))}
          </div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel}
            style={{...BTN,flex:1,height:44,color:C.muted,background:C.dim,justifyContent:'center'}}>
            Cancel
          </button>
          <button onClick={confirm}
            style={{...BTN,flex:1,height:44,color:'#60c0ff',background:'#0d2040',
              border:'1px solid #2a5080',justifyContent:'center'}}>
            ✓ Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
