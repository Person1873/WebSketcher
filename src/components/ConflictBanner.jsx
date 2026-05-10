export default function ConflictBanner({sk, onUndo}) {
  const trigger=sk.conflictState?.trigger;
  return (
    <div style={{
      position:'absolute',top:0,left:0,right:0,bottom:0,
      background:'rgba(8,12,22,0.72)',display:'flex',alignItems:'center',
      justifyContent:'center',zIndex:10,backdropFilter:'blur(1px)'
    }}>
      <div style={{
        background:'#130a0a',border:`1px solid #552222`,borderRadius:8,
        padding:'20px 28px',maxWidth:340,textAlign:'center'
      }}>
        <div style={{fontSize:16,color:'#ff5555',marginBottom:8,letterSpacing:'0.05em'}}>⊗ CONFLICT</div>
        {trigger&&<div style={{fontSize:11,color:'#885555',marginBottom:14,fontFamily:'monospace'}}>
          Adding <span style={{color:'#cc6666'}}>{trigger.description}</span> over-constrains the sketch.
        </div>}
        <div style={{fontSize:11,color:'#664444',marginBottom:16}}>
          The sketch is frozen at the last valid state.
        </div>
        <button onClick={onUndo} style={{
          background:'#1a0a0a',border:'1px solid #553333',borderRadius:5,
          color:'#ff7070',padding:'8px 20px',cursor:'pointer',fontSize:12,
          letterSpacing:'0.05em',fontFamily:'monospace'
        }}>↩ Undo last change</button>
      </div>
    </div>
  );
}
