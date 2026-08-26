export function toGcsConstraint(c) {
  if (c.disabled || c.driven) return null;
  const r = c.refs, id = c.id, driving = !c.driven, scale = c.scale ?? 1;
  const gc = _build(c, r, id, driving);
  if (!gc) return null;
  if (Array.isArray(gc)) return gc.map(g => ({ ...g, scale }));
  return { ...gc, scale };
}

function _build(c, r, id, driving) {
  switch (c.type) {
    case 'coincident':      return { type: 'p2p_coincident',   id, p1_id: r[0].id, p2_id: r[1].id, driving };
    case 'horizontal':
      return r.length === 1 ? { type: 'horizontal_l',  id, l_id: r[0].id, driving }
                            : { type: 'horizontal_pp', id, p1_id: r[0].id, p2_id: r[1].id, driving };
    case 'vertical':
      return r.length === 1 ? { type: 'vertical_l',  id, l_id: r[0].id, driving }
                            : { type: 'vertical_pp', id, p1_id: r[0].id, p2_id: r[1].id, driving };
    case 'parallel':      return { type: 'parallel',         id, l1_id: r[0].id, l2_id: r[1].id, driving };
    case 'perpendicular': return { type: 'perpendicular_ll', id, l1_id: r[0].id, l2_id: r[1].id, driving };
    case 'equal': {
      const [a, b] = r;
      if (a.type === 'line'   && b.type === 'line')   return { type: 'equal_length',    id, l1_id: a.id, l2_id: b.id, driving };
      if (a.type === 'circle' && b.type === 'circle') return { type: 'equal_radius_cc', id, c1_id: a.id, c2_id: b.id, driving };
      if (a.type === 'arc'    && b.type === 'arc')    return { type: 'equal_radius_aa', id, a1_id: a.id, a2_id: b.id, driving };
      if (a.type === 'circle' && b.type === 'arc')    return { type: 'equal_radius_ca', id, c_id: a.id,  a_id: b.id,  driving };
      if (a.type === 'arc'    && b.type === 'circle') return { type: 'equal_radius_ca', id, c_id: b.id,  a_id: a.id,  driving };
      return null;
    }
    case 'distance': {
      const val = c.value;
      if (r.length === 1 && r[0].p1) return { type: 'p2p_distance', id, p1_id: r[0].p1.id, p2_id: r[0].p2.id, distance: val, driving };
      if (r.length === 2)             return { type: 'p2p_distance', id, p1_id: r[0].id,    p2_id: r[1].id,    distance: val, driving };
      return null;
    }
    case 'radius':
      if (r[0].type === 'circle') return { type: 'circle_radius', id, c_id: r[0].id, radius: c.value, driving };
      if (r[0].type === 'arc')    return { type: 'arc_radius',    id, a_id: r[0].id, radius: c.value, driving };
      return null;
    case 'angle': {
      const rad = c.value * Math.PI / 180;
      if (r.length === 2) return { type: 'l2l_angle_ll', id, l1_id: r[0].id, l2_id: r[1].id, angle: rad, driving };
      return null;
    }
    case 'tangent': {
      const [a, b] = r;
      const isCurve = e => e.type === 'circle' || e.type === 'arc';
      const curve = isCurve(a) ? a : b, other = curve === a ? b : a;
      if (other.type === 'line') {
        if (curve.type === 'arc') {
          const d1 = Math.hypot(other.p1.x - curve.centre.x, other.p1.y - curve.centre.y);
          const d2 = Math.hypot(other.p2.x - curve.centre.x, other.p2.y - curve.centre.y);
          const nearPt = Math.abs(d1 - curve.radius) <= Math.abs(d2 - curve.radius) ? other.p1 : other.p2;
          return [
            { type: 'p2l_distance', id, p_id: curve.centre.id, l_id: other.id,
              distance: { o_id: curve.id, prop: 'radius' }, driving },
            { type: 'p2p_distance', id: id + '_ep', p1_id: nearPt.id, p2_id: curve.centre.id,
              distance: { o_id: curve.id, prop: 'radius' }, driving },
          ];
        }
        return { type: 'p2l_distance', id, p_id: curve.centre.id, l_id: other.id,
                 distance: { o_id: curve.id, prop: 'radius' }, driving };
      }
      if (isCurve(other)) {
        if (a.type==='arc' && b.type==='arc')
          return { type: 'tangent_aa', id, a1_id: a.id, a2_id: b.id, driving };
        if (a.type==='circle' && b.type==='circle')
          return { type: 'tangent_cc', id, c1_id: a.id, c2_id: b.id, driving };
        const circle = a.type==='circle' ? a : b, arc = circle===a ? b : a;
        return { type: 'tangent_ca', id, c_id: circle.id, a_id: arc.id, driving };
      }
      return null;
    }
    case 'symmetric':
      if (r.length === 3 && r[2].type === 'point')
        return { type: 'p2p_symmetric_ppp', id, p1_id: r[0].id, p2_id: r[1].id, p_id: r[2].id, driving };
      if (r.length === 3 && r[2].type === 'line')
        return { type: 'p2p_symmetric_ppl', id, p1_id: r[0].id, p2_id: r[1].id, l_id: r[2].id, driving };
      return null;
    case 'point_on_line':   return { type: 'point_on_line_pl', id, p_id: r[0].id, l_id: r[1].id, driving };
    case 'point_on_circle': return { type: 'p2p_distance',     id, p1_id: r[0].id, p2_id: r[1].centre.id,
                                     distance: { o_id: r[1].id, prop: 'radius' }, driving };
    case 'point_on_arc':
      // throughPt marker (scale < 1): radial distance only, no angular range check
      if ((c.scale ?? 1) < 1)
        return { type: 'p2p_distance', id, p1_id: r[0].id, p2_id: r[1].centre.id,
                 distance: { o_id: r[1].id, prop: 'radius' }, driving };
      return { type: 'point_on_arc', id, p_id: r[0].id, a_id: r[1].id, driving };
    case 'fixed': return null;
    default: return null;
  }
}
