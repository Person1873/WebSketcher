import { C } from '../geometry/analysis.js';
import { arcDrawFlags } from '../geometry/helpers.js';

export function exportSVG(sk, cam, W, H) {
  const px = n => n.toFixed(3);
  const geom = [], construction = [];

  for (const ln of sk.lines.values()) {
    if (sk.reserved.has(ln)) continue;
    const s1=cam.toScreen(ln.p1.x,ln.p1.y), s2=cam.toScreen(ln.p2.x,ln.p2.y);
    const el=`<line x1="${px(s1.x)}" y1="${px(s1.y)}" x2="${px(s2.x)}" y2="${px(s2.y)}" stroke="${ln.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (ln.construction ? construction : geom).push(el);
  }

  for (const ci of sk.circles.values()) {
    const sc=cam.toScreen(ci.centre.x,ci.centre.y), r=ci.radius*cam.scale;
    const el=`<circle cx="${px(sc.x)}" cy="${px(sc.y)}" r="${px(r)}" fill="none" stroke="${ci.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (ci.construction ? construction : geom).push(el);
  }

  for (const arc of sk.arcs.values()) {
    const ss=cam.toScreen(arc.startPt.x,arc.startPt.y);
    const se=cam.toScreen(arc.endPt.x,arc.endPt.y);
    const r=arc.radius*cam.scale;
    const {largeArc,sweepFlag}=arcDrawFlags(arc);
    const el=`<path d="M ${px(ss.x)} ${px(ss.y)} A ${px(r)} ${px(r)} 0 ${largeArc} ${sweepFlag} ${px(se.x)} ${px(se.y)}" fill="none" stroke="${arc.construction?C.construction:C.geomPartial}" stroke-width="1.5"/>`;
    (arc.construction ? construction : geom).push(el);
  }

  const layer = (id, label, visible, elems) =>
    `  <g id="${id}" inkscape:label="${label}" inkscape:groupmode="layer"${visible?'':' visibility="hidden"'}>\n` +
    elems.map(e=>`    ${e}`).join('\n') +
    `\n  </g>`;

  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"`,
    `     viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    layer('layer_geometry',     'Geometry',     true,  geom),
    layer('layer_construction', 'Construction', false, construction),
    `</svg>`,
  ].join('\n');
}
