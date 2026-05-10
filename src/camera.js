export class Camera {
  constructor() { this.scale = 1; this.tx = 0; this.ty = 0; }
  toScreen(wx, wy) { return { x: wx * this.scale + this.tx, y: -wy * this.scale + this.ty }; }
  toWorld(sx, sy)  { return { x: (sx - this.tx) / this.scale, y: -(sy - this.ty) / this.scale }; }
  pan(dx, dy)      { this.tx += dx; this.ty += dy; }
  zoom(f, cx, cy)  { this.tx = cx + (this.tx - cx) * f; this.ty = cy + (this.ty - cy) * f; this.scale *= f; }
  recenter(w, h)   { this.tx = w / 2; this.ty = h / 2; this.scale = 1; }

  fitToContent(sk, w, h, margin = 60) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const expand = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };

    for (const p of sk.points.values()) {
      if (!p.reserved && !p.construction) expand(p.x, p.y);
    }
    for (const c of sk.circles.values()) {
      if (c.construction) continue;
      expand(c.centre.x - c.radius, c.centre.y);
      expand(c.centre.x + c.radius, c.centre.y);
      expand(c.centre.x, c.centre.y - c.radius);
      expand(c.centre.x, c.centre.y + c.radius);
    }
    for (const a of sk.arcs.values()) {
      if (a.construction) continue;
      expand(a.startPt.x, a.startPt.y);
      expand(a.endPt.x, a.endPt.y);
      const sa = a.startAngle, ea = a.endAngle;
      const s = ((ea - sa) + 2 * Math.PI) % (2 * Math.PI);
      const drawCCW = a.inverted ? s > Math.PI : s <= Math.PI;
      for (const ang of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
        const fromStart = ((ang - sa) + 2 * Math.PI) % (2 * Math.PI);
        if (drawCCW ? fromStart <= s : fromStart >= s)
          expand(a.centre.x + a.radius * Math.cos(ang), a.centre.y + a.radius * Math.sin(ang));
      }
    }

    if (!isFinite(x0)) { this.recenter(w, h); return; }
    const pw = x1 - x0 || 1, ph = y1 - y0 || 1;
    this.scale = Math.min((w - margin * 2) / pw, (h - margin * 2) / ph);
    this.tx = w / 2 - ((x0 + x1) / 2) * this.scale;
    this.ty = h / 2 + ((y0 + y1) / 2) * this.scale;
  }
}
