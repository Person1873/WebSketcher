export function arcDrawFlags(arc, sa, ea) {
  if (sa === undefined) sa = arc.startAngle;
  if (ea === undefined) ea = arc.endAngle;
  const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
  let inverted=arc.inverted;
  if(arc.throughPt){
    const tp=arc.throughPt;
    const ta=Math.atan2(tp.y-arc.centre.y, tp.x-arc.centre.x);
    const tOnCCW=((ta-sa)+2*Math.PI)%(2*Math.PI)<=span;
    inverted=tOnCCW!==(span<=Math.PI);
  }
  const shortIsCCW=span<=Math.PI;
  const drawCCW=inverted ? !shortIsCCW : shortIsCCW;
  return {sa,ea,span,inverted,drawCCW,largeArc:inverted?1:0,sweepFlag:drawCCW?0:1};
}
