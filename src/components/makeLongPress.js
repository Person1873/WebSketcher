export function makeLongPress(onTap, onLongPress, ms=420, movePx=8) {
  let timer=null, sx=0, sy=0, fired=false, active=false;
  return {
    onPointerDown(e) {
      active=true; fired=false; sx=e.clientX; sy=e.clientY;
      timer=setTimeout(()=>{ timer=null; fired=true; onLongPress(e); }, ms);
    },
    onPointerMove(e) {
      if(!active) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      if(dx*dx+dy*dy>movePx*movePx){ clearTimeout(timer); timer=null; active=false; }
    },
    onPointerUp(e) {
      if(timer){ clearTimeout(timer); timer=null; }
      if(active&&!fired) onTap(e);
      active=false;
    },
    onPointerCancel(){ clearTimeout(timer); timer=null; active=false; },
  };
}
