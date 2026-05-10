export default function GridLines({cam, W, H}) {
  const tl=cam.toWorld(0,0), br=cam.toWorld(W,H);
  const minX=Math.min(tl.x,br.x), maxX=Math.max(tl.x,br.x);
  const minY=Math.min(tl.y,br.y), maxY=Math.max(tl.y,br.y);
  const worldW=maxX-minX;
  const raw=worldW/10;
  const mag=Math.pow(10,Math.floor(Math.log10(Math.max(raw,0.0001))));
  const norm=raw/mag;
  const spacing=mag*(norm<2?1:norm<5?2:5);
  if (spacing<=0) return null;

  const lines=[];
  const sx=Math.ceil(minX/spacing)*spacing;
  for (let wx=sx; wx<=maxX; wx+=spacing) {
    const s1=cam.toScreen(wx,maxY), s2=cam.toScreen(wx,minY);
    lines.push(<line key={`v${wx}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke="#1a2538" strokeWidth={0.5}/>);
  }
  const sy=Math.ceil(minY/spacing)*spacing;
  for (let wy=sy; wy<=maxY; wy+=spacing) {
    const s1=cam.toScreen(minX,wy), s2=cam.toScreen(maxX,wy);
    lines.push(<line key={`h${wy}`} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y}
      stroke="#1a2538" strokeWidth={0.5}/>);
  }
  return <>{lines}</>;
}
