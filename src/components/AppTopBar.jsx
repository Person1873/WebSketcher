import { useState, useReducer } from 'react';
import { C } from '../geometry/analysis.js';
import { _debugLog } from '../debug.js';
import { BTN_SMALL } from './styles.js';
import { exportFCStd } from '../export/fcstd.js';
import { exportSVG } from '../export/svg.js';
import { makeLongPress } from './makeLongPress.js';

const PAGE_COLORS = ['#40a8ff','#ff6040','#40e080','#e0c040','#c040e0','#40d0e0','#e08040','#ffffff'];
const LINE_WEIGHTS = [0.5, 1, 1.5, 2.5];
const LINE_DASHES = [[], [4,3], [8,4], [2,2]];

export default function AppTopBar({statusText, sk, conflict, onClear, doc, onSwitchPage, cam, dims}) {
  const [hamOpen, setHamOpen] = useState(false);
  const [hamView, setHamView] = useState('main');
  const [editVarsetId, setEditVarsetId] = useState(null);
  const [editPageId, setEditPageId] = useState(null);
  const [editPageName, setEditPageName] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [, rerender] = useReducer(x=>x+1, 0);

  const close = () => { setHamOpen(false); setHamView('main'); setConfirmState(null); };
  const showConfirm = (message, detail, onConfirm) => setConfirmState({message, detail, onConfirm});

  const dofColor  = conflict ? C.conflict : (sk?.solveResult?.dof===0 ? C.dofOk : C.dofAmber);
  const dofLabel  = conflict ? 'CONFLICT' : (sk?.solveResult?.dof===0 ? 'FULLY CONSTRAINED' : `${sk?.solveResult?.dof??'--'} DOF FREE`);

  const menuItem = (icon, label, action, danger=false, sub=null) => (
    <button key={label} onClick={()=>{ action(); }}
      style={{display:'flex',alignItems:'center',gap:12,width:'100%',
        padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',
        color:danger?'#884444':C.text,fontSize:13,textAlign:'left'}}>
      <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>{icon}</span>
      <div style={{flex:1}}>
        <div>{label}</div>
        {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
      </div>
    </button>
  );

  const panelStyle = {position:'absolute',top:'100%',left:0,zIndex:30,
    background:'#0a1020',border:`1px solid ${C.border}`,
    borderTop:'none',minWidth:260,boxShadow:'0 8px 24px #000c',maxHeight:'80vh',overflowY:'auto'};

  const sectionHeader = label => (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px 4px',
      fontSize:9,color:C.muted,letterSpacing:'0.15em',borderTop:`1px solid ${C.border}`}}>
      {label}
    </div>
  );

  const PagesPanel = () => {
    const sorted = doc?.sortedPages ?? [];
    return <>
      <button onClick={()=>setHamView('main')} style={{display:'flex',alignItems:'center',gap:8,
        width:'100%',padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
        ← Pages
      </button>
      {sorted.map(page => {
        const lp = makeLongPress(
          () => { onSwitchPage(page.id); close(); },
          () => {
            showConfirm(`Delete "${page.name}"?`, 'This cannot be undone.', () => {
              doc.removePage(page.id);
              if (doc.pages.size === 0) {
                const p = doc.addPage('Page 1');
                onSwitchPage(p.id);
              }
              setConfirmState(null);
              rerender();
            });
          }
        );
        return (
          <div key={page.id} style={{display:'flex',alignItems:'center',
            background:page.id===doc.activePage?'#0d2040':'none',
            borderBottom:`1px solid ${C.border}`}}>
            <button {...lp}
              style={{display:'flex',alignItems:'center',gap:12,flex:1,
                padding:'13px 16px',background:'none',border:'none',cursor:'pointer',
                color:page.id===doc.activePage?'#a0c8f0':C.text,fontSize:13,textAlign:'left'}}>
              <span style={{width:12,height:12,borderRadius:'50%',background:page.style.color,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div>{page.name}</div>
                {page.groupId&&<div style={{fontSize:10,color:C.muted}}>{doc.groups.get(page.groupId)?.name}</div>}
              </div>
              <span style={{fontSize:10,color:C.muted}}>z={page.z}</span>
              {page.id===doc.activePage&&<span style={{fontSize:10,color:'#40a8ff',marginLeft:4}}>●</span>}
            </button>
            <button
              onClick={e=>{e.stopPropagation(); page.visible=!page.visible; doc._notify(); rerender();}}
              title={page.visible?'Hide page':'Show page'}
              style={{padding:'8px 10px',background:'none',border:'none',cursor:'pointer',
                fontSize:16,color:page.visible?'#40a8ff':C.muted,flexShrink:0}}>
              {page.visible?'👁':'◌'}
            </button>
            <button
              onClick={e=>{e.stopPropagation();
                setEditPageId(page.id); setEditPageName(page.name); setHamView('pageStyle');}}
              title="Edit style"
              style={{padding:'8px 10px',background:'none',border:'none',cursor:'pointer',
                fontSize:14,color:C.muted,flexShrink:0}}>
              🎨
            </button>
          </div>
        );
      })}
      {menuItem('＋', 'New page', () => {
        const p = doc.addPage(`Page ${doc.pages.size+1}`);
        onSwitchPage(p.id); close();
      })}
    </>;
  };

  const PageStylePanel = () => {
    const page = doc?.pages.get(editPageId);
    if (!page) return null;
    return <>
      <button onClick={()=>setHamView('pages')} style={{display:'flex',alignItems:'center',gap:8,
        width:'100%',padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
        ← {page.name}
      </button>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:C.muted,marginBottom:6,letterSpacing:'0.12em'}}>NAME</div>
        <input value={editPageName} onChange={e=>setEditPageName(e.target.value)}
          onBlur={()=>{ page.name=editPageName; doc._notify(); }}
          style={{width:'100%',background:'#06101e',border:`1px solid ${C.border}`,
            borderRadius:6,padding:'6px 10px',color:C.text,fontSize:13,
            fontFamily:'inherit',boxSizing:'border-box'}}/>
      </div>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:C.muted,marginBottom:8,letterSpacing:'0.12em'}}>COLOR</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {PAGE_COLORS.map(col => (
            <div key={col}
              onClick={()=>{ page.style={...page.style,color:col}; doc._notify(); rerender(); }}
              style={{width:28,height:28,borderRadius:'50%',background:col,cursor:'pointer',
                border:`3px solid ${page.style.color===col?'#fff':'transparent'}`,
                boxSizing:'border-box'}}/>
          ))}
        </div>
      </div>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,color:C.muted,marginBottom:8,letterSpacing:'0.12em'}}>LINE WEIGHT</div>
        <div style={{display:'flex',gap:6}}>
          {LINE_WEIGHTS.map(w => (
            <div key={w}
              onClick={()=>{ page.style={...page.style,lineWeight:w}; doc._notify(); rerender(); }}
              style={{flex:1,height:32,display:'flex',alignItems:'center',justifyContent:'center',
                background:page.style.lineWeight===w?'#0d2040':'#060e1e',
                border:`1px solid ${page.style.lineWeight===w?'#40a8ff':C.border}`,
                borderRadius:6,cursor:'pointer'}}>
              <div style={{width:'70%',height:w,background:page.style.color||'#40a8ff',
                borderRadius:w}}/>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:'12px 16px'}}>
        <div style={{fontSize:10,color:C.muted,marginBottom:8,letterSpacing:'0.12em'}}>LINE STYLE</div>
        <div style={{display:'flex',gap:6}}>
          {LINE_DASHES.map((d, i) => {
            const sel = JSON.stringify(page.style.lineDash??[]) === JSON.stringify(d);
            return (
              <div key={i}
                onClick={()=>{ page.style={...page.style,lineDash:d}; doc._notify(); rerender(); }}
                style={{flex:1,height:32,display:'flex',alignItems:'center',justifyContent:'center',
                  background:sel?'#0d2040':'#060e1e',
                  border:`1px solid ${sel?'#40a8ff':C.border}`,
                  borderRadius:6,cursor:'pointer'}}>
                <svg width="36" height="4" overflow="visible">
                  <line x1="0" y1="2" x2="36" y2="2"
                    stroke={page.style.color||'#40a8ff'} strokeWidth={1.5}
                    strokeDasharray={d.length ? d.join(' ') : undefined}/>
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </>;
  };

  const VarsetsPanel = () => <>
    <button onClick={()=>setHamView('main')} style={{display:'flex',alignItems:'center',gap:8,
      width:'100%',padding:'13px 16px',background:'none',border:'none',
      borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
      ← Varsets
    </button>
    {[...(doc?.varsets.values()??[])].map(vs => {
      const lp = makeLongPress(
        () => { setEditVarsetId(vs.id); setHamView('varset'); },
        () => { showConfirm(`Delete "${vs.name}"?`, 'All variables will be lost.', () => {
          doc.removeVarset(vs.id);
          setConfirmState(null);
          rerender();
        }); }
      );
      return (
        <button key={vs.id} {...lp}
          style={{display:'flex',alignItems:'center',gap:12,width:'100%',
            padding:'13px 16px',background:'none',border:'none',
            borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.text,fontSize:13,textAlign:'left'}}>
          <span style={{fontSize:18,width:24,textAlign:'center'}}>📋</span>
          <div style={{flex:1}}>
            <div>{vs.name}</div>
            <div style={{fontSize:10,color:C.muted}}>{vs.variables.size} variable{vs.variables.size!==1?'s':''}</div>
          </div>
          <span style={{fontSize:12,color:C.muted}}>›</span>
        </button>
      );
    })}
    {menuItem('＋', 'New varset', () => {
      const name = prompt('Varset name:', 'Dimensions');
      if (name?.trim()) { doc.addVarset(name.trim()); rerender(); }
    })}
  </>;

  const VarsetPanel = () => {
    const vs = doc?.varsets.get(editVarsetId);
    if (!vs) return null;
    const env = doc.resolveVarEnv();
    return <>
      <button onClick={()=>setHamView('varsets')} style={{display:'flex',alignItems:'center',gap:8,
        width:'100%',padding:'13px 16px',background:'none',border:'none',
        borderBottom:`1px solid ${C.border}`,cursor:'pointer',color:C.muted,fontSize:12}}>
        ← {vs.name}
      </button>
      {[...vs.variables.values()].map(v => {
        const disp = v.unit==='mm' ? (v.value*0.01).toFixed(3)+' mm'
                   : v.unit==='deg' ? v.value+'°'
                   : String(v.value);
        const lp = makeLongPress(
          () => {},
          () => { showConfirm(`Delete "${v.name}"?`, null, () => {
            vs.variables.delete(v.id);
            doc._notify();
            setConfirmState(null);
            rerender();
          }); }
        );
        return (
          <div key={v.id} {...lp}
            style={{display:'flex',alignItems:'center',gap:8,
              padding:'10px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:C.text}}>{v.name}</div>
              {v.expr&&<div style={{fontSize:10,color:'#5090d0',marginTop:2}}>{v.expr}</div>}
              {v.description&&<div style={{fontSize:10,color:C.muted}}>{v.description}</div>}
              {v._error&&<div style={{fontSize:10,color:C.conflict}}>{v._error}</div>}
            </div>
            <div style={{fontSize:13,color:'#a0c8f0',fontFamily:'monospace',minWidth:60,textAlign:'right'}}>{disp}</div>
          </div>
        );
      })}
      {menuItem('＋', 'Add variable', () => {
        const name = prompt('Variable name:');
        if (!name?.trim()) return;
        const valStr = prompt('Value (in mm if length):', '0');
        const val = parseFloat(valStr);
        if (isNaN(val)) return;
        const unit = prompt('Unit (mm/deg/blank):', 'mm') || null;
        vs.addVariable(name.trim(), unit==='mm' ? val*100 : val, unit||null);
        doc._notify(); rerender();
      })}
    </>;
  };

  return (
    <div style={{position:'relative',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',
        padding:'0 8px',minHeight:40,gap:4,
        background:'#080d18',borderBottom:`1px solid ${C.border}`}}>
        <button onClick={()=>{ setHamOpen(o=>!o); setHamView('main'); }} title="Menu"
          style={{...BTN_SMALL,color:hamOpen?C.text:'#7a9ab8',fontSize:18}}>☰</button>
        <span style={{flex:1,fontSize:12,color:'#7a9ab8',padding:'0 6px',
          overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
          {statusText}
        </span>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:dofColor,
            boxShadow:`0 0 6px ${dofColor}`}}/>
          <span style={{fontSize:12,color:dofColor,fontWeight:600,fontFamily:'monospace'}}>
            DOF {sk?.solveResult?.dof??'--'} · {dofLabel}
          </span>
        </div>
      </div>

      {confirmState && (
        <div style={{position:'fixed',inset:0,background:'rgba(4,7,14,0.88)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
          <div style={{background:'#0c1525',border:`1px solid ${C.border}`,borderRadius:12,
            padding:'24px 20px',maxWidth:300,width:'90%',textAlign:'center'}}>
            <div style={{fontSize:15,color:C.text,marginBottom:8,fontWeight:'bold'}}>{confirmState.message}</div>
            {confirmState.detail&&<div style={{fontSize:12,color:C.muted,marginBottom:20}}>{confirmState.detail}</div>}
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>setConfirmState(null)}
                style={{flex:1,height:44,color:C.muted,background:'#0a1020',
                  border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',fontSize:13}}>
                Cancel
              </button>
              <button onClick={confirmState.onConfirm}
                style={{flex:1,height:44,color:'#ff6666',background:'#1a0808',
                  border:'1px solid #442222',borderRadius:8,cursor:'pointer',fontSize:13}}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {hamOpen && <>
        <div onClick={close} style={{position:'fixed',inset:0,zIndex:29}}/>
        <div style={panelStyle}>
          {hamView==='main' && <>
            {menuItem('📄', 'Pages', ()=>setHamView('pages'), false,
              `${doc?.pages.size??0} page${doc?.pages.size!==1?'s':''} · active: ${doc?.activePageObj?.name??'—'}`)}
            {menuItem('𝑥', 'Varsets', ()=>setHamView('varsets'), false,
              `${doc?.varsets.size??0} varset${doc?.varsets.size!==1?'s':''}`)}
            {menuItem('⚙︎', 'Settings', ()=>{})}
            {sectionHeader('EXPORT')}
            {menuItem('⬇', 'FreeCAD (.fcstd)', ()=>{
              const bytes = exportFCStd(sk);
              const blob = new Blob([bytes], {type:'application/zip'});
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href=url; a.download=`${doc?.activePageObj?.name??'sketch'}.fcstd`; a.click();
              URL.revokeObjectURL(url); close();
            })}
            <button style={{display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'13px 16px',background:'none',border:'none',
              borderBottom:`1px solid ${C.border}`,cursor:'pointer',
              color:C.text,fontSize:13,textAlign:'left'}}
              onClick={()=>{
                if (!cam||!dims) return;
                const svg = exportSVG(sk, cam, dims.W, dims.H);
                const blob = new Blob([svg], {type:'image/svg+xml'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href=url; a.download=`${doc?.activePageObj?.name??'sketch'}.svg`; a.click();
                URL.revokeObjectURL(url); close();
              }}>
              <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>⬇</span>
              SVG (.svg)
            </button>
            <button style={{display:'flex',alignItems:'center',gap:12,width:'100%',
              padding:'13px 16px',background:'none',border:'none',
              borderBottom:`1px solid ${C.border}`,cursor:'default',
              color:C.muted,fontSize:13,textAlign:'left',opacity:0.45}}>
              <span style={{fontSize:18,width:24,textAlign:'center',flexShrink:0}}>⬇</span>
              DXF (.dxf)
              <span style={{marginLeft:'auto',fontSize:9,letterSpacing:'0.1em'}}>SOON</span>
            </button>
            <div style={{borderTop:`1px solid ${C.border}`}}/>
            {menuItem('✕', 'Clear sketch', ()=>{ onClear(); close(); }, true)}
            <div style={{borderTop:`1px solid ${C.border}`}}/>
            {menuItem('🪲', `Debug log (${_debugLog.length} lines)`, ()=>setHamView('debuglog'))}
          </>}
          {hamView==='debuglog' && <>
            <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setHamView('main')} style={{background:'none',border:'none',color:C.text,cursor:'pointer',fontSize:16}}>←</button>
              <span style={{fontSize:13,color:C.text}}>Debug Log ({_debugLog.length} lines)</span>
            </div>
            <div style={{padding:'8px 12px',fontSize:10,fontFamily:'monospace',color:'#8ab',lineHeight:1.5,overflowY:'auto',maxHeight:300,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
              <div style={{color:'#ff8',marginBottom:4}}>── first 5 ──</div>
              {_debugLog.slice(0,5).join('\n')}
              {_debugLog.length>10 && <>
                <div style={{color:'#ff8',margin:'4px 0'}}>{'\n'}── last 20 ──</div>
                {_debugLog.slice(-20).join('\n')}
              </>}
            </div>
          </>}
          {hamView==='pages'      && <PagesPanel/>}
          {hamView==='pageStyle'  && <PageStylePanel/>}
          {hamView==='varsets'    && <VarsetsPanel/>}
          {hamView==='varset'     && <VarsetPanel/>}
        </div>
      </>}
    </div>
  );
}
