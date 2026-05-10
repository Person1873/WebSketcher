import { genId } from '../utils.js';

export function evalExpr(expr, env) {
  try {
    const safe = /^[\d\s+\-*/^().]+$/.test(
      expr.replace(/sqrt\s*\(/g,'(').replace(/[a-zA-Z_]\w*/g, n => {
        if (!(n in env)) throw new Error(`Unknown variable: ${n}`);
        return String(env[n]);
      })
    );
    if (!safe) throw new Error('Invalid expression');
    const js = expr
      .replace(/[a-zA-Z_]\w*/g, n => n === 'sqrt' ? 'Math.sqrt' : String(env[n] ?? (() => { throw new Error(`Unknown: ${n}`); })()))
      .replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + js + ')')();
    if (!isFinite(result)) throw new Error('Result is not finite');
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export class SketchVariable {
  constructor({ id, name, value, expr=null, unit=null, description='', min=null, max=null, constant=false }) {
    this.id = id ?? genId();
    this.name = name;
    this.value = value;
    this.expr = expr;
    this.unit = unit;
    this.description = description;
    this.min = min;
    this.max = max;
    this.constant = constant;
    this._error = null;
  }

  resolve(env) {
    if (!this.expr) { this._error = null; return this.value; }
    const res = evalExpr(this.expr, env);
    if (!res.ok) { this._error = res.error; return this.value; }
    this._error = null;
    this.value = res.value;
    return this.value;
  }

  get displayValue() {
    if (this.unit === 'mm') return +(this.value * 0.01).toFixed(6);
    return this.value;
  }

  static fromDisplay(display, unit) {
    if (unit === 'mm') return display * 100;
    return display;
  }

  toJSON() {
    return { id:this.id, name:this.name, value:this.value, expr:this.expr,
             unit:this.unit, description:this.description,
             min:this.min, max:this.max, constant:this.constant };
  }

  static fromJSON(j) { return new SketchVariable(j); }
}

export class SketchVarset {
  constructor({ id, name, variables=[] }) {
    this.id = id ?? genId();
    this.name = name;
    this.variables = new Map(variables.map(v => [v.id, v instanceof SketchVariable ? v : SketchVariable.fromJSON(v)]));
  }

  addVariable(name, value, unit=null, opts={}) {
    const v = new SketchVariable({ name, value, unit, ...opts });
    this.variables.set(v.id, v);
    return v;
  }

  removeVariable(id) { this.variables.delete(id); }

  resolveAll() {
    const vars = [...this.variables.values()];
    const resolved = {};
    const resolving = new Set();
    const resolve = (v) => {
      if (v.name in resolved) return resolved[v.name];
      if (resolving.has(v.id)) { v._error = 'Circular reference'; return v.value; }
      resolving.add(v.id);
      const env = { ...resolved };
      vars.forEach(u => { if (!(u.name in env)) env[u.name] = u.value; });
      resolved[v.name] = v.resolve(env);
      resolving.delete(v.id);
      return resolved[v.name];
    };
    vars.forEach(resolve);
    return resolved;
  }

  compatibleWith(constraintType) {
    const needsMm  = ['distance','radius'].includes(constraintType);
    const needsDeg = ['angle'].includes(constraintType);
    return [...this.variables.values()].filter(v => {
      if (v.constant) return true;
      if (needsMm  && v.unit !== 'mm')  return false;
      if (needsDeg && v.unit !== 'deg') return false;
      return true;
    });
  }

  toJSON() {
    return { id:this.id, name:this.name,
             variables:[...this.variables.values()].map(v=>v.toJSON()) };
  }

  static fromJSON(j) { return new SketchVarset(j); }
}
