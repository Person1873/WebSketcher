export function toGcsConstraint(c) {
  if (c.disabled || c.driven) return null;
  const r = c.refs, id = c.id, driving = !c.driven;
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
      if (other.type === 'line')
        return { type: 'p2l_distance', id, p_id: curve.centre.id, l_id: other.id,
                 distance: { o_id: curve.id, prop: 'radius' }, driving };
      if (isCurve(other))
        return { type: 'tangent_circumf', id,
                 p1_id: a.centre.id, p2_id: b.centre.id,
                 rd1: { o_id: a.id, prop: 'radius' }, rd2: { o_id: b.id, prop: 'radius' },
                 internal: false, driving };
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
    case 'fixed': return null;
    default: return null;
  }
}
