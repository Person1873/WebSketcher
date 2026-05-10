import { genId } from '../utils.js';
import { Sketch } from '../sketch.js';
import { SketchVarset } from './varset.js';

class SketchGroup {
  constructor({ id, name, collapsed=false }) {
    this.id = id ?? genId();
    this.name = name;
    this.collapsed = collapsed;
  }
  toJSON() { return { id:this.id, name:this.name, collapsed:this.collapsed }; }
  static fromJSON(j) { return new SketchGroup(j); }
}

class SketchPage {
  constructor({ id, name, groupId=null, z=0,
                attachment={ base:'XY', axis:'Z', angle:0 },
                offset={ x:0, y:0, z:0 },
                style={ color:'#40a8ff', lineWeight:1.5, lineDash:[] },
                visible=true,
                camera={ tx:0, ty:0, scale:1.5 },
                sketch=null }) {
    this.id = id ?? genId();
    this.name = name;
    this.groupId = groupId;
    this.z = z;
    this.attachment = { ...attachment };
    this.offset = { ...offset };
    this.style = { ...style };
    this.visible = visible;
    this.camera = { ...camera };
    this.sketch = sketch ?? new Sketch();
  }

  toJSON() {
    return {
      id: this.id, name: this.name, groupId: this.groupId, z: this.z,
      attachment: this.attachment, offset: this.offset,
      style: this.style, visible: this.visible, camera: this.camera,
      sketch: this.sketch.toJSON(),
    };
  }

  static fromJSON(j) {
    return new SketchPage({ ...j, sketch: Sketch.fromJSON(j.sketch) });
  }
}

const STORAGE_KEY = 'sketchDocument_v1';

export const StorageAdapter = {
  save(doc) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc.toJSON())); }
    catch (e) { console.warn('StorageAdapter.save failed:', e); }
  },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return SketchDocument.fromJSON(JSON.parse(raw));
    } catch (e) {
      console.warn('StorageAdapter.load failed:', e);
      return null;
    }
  },
  clear() { localStorage.removeItem(STORAGE_KEY); },
};

export class SketchDocument {
  constructor() {
    this.version = 1;
    this.varsets = new Map();
    this.groups  = new Map();
    this.pages   = new Map();
    this.activePage = null;
    this._onChange = null;
    this._saveTimer = null;
  }

  static create() {
    const doc = new SketchDocument();
    const page = doc.addPage('Page 1');
    doc.activePage = page.id;
    return doc;
  }

  addPage(name, opts={}) {
    const z = opts.z ?? Math.max(-1, ...[...this.pages.values()].map(p=>p.z)) + 1;
    const page = new SketchPage({ name, z, ...opts });
    this.pages.set(page.id, page);
    if (!this.activePage) this.activePage = page.id;
    return page;
  }

  removePage(id) {
    this.pages.delete(id);
    if (this.activePage === id)
      this.activePage = [...this.pages.keys()][0] ?? null;
    this._notify();
  }

  get activePageObj() { return this.pages.get(this.activePage) ?? null; }
  get activeSketch()  { return this.activePageObj?.sketch ?? null; }

  get sortedPages() {
    return [...this.pages.values()].sort((a,b) => a.z - b.z);
  }

  addGroup(name) {
    const g = new SketchGroup({ name });
    this.groups.set(g.id, g);
    this._notify();
    return g;
  }

  removeGroup(id) {
    for (const p of this.pages.values()) if (p.groupId === id) p.groupId = null;
    this.groups.delete(id);
    this._notify();
  }

  addVarset(name) {
    const vs = new SketchVarset({ name, variables:[] });
    this.varsets.set(vs.id, vs);
    this._notify();
    return vs;
  }

  removeVarset(id) { this.varsets.delete(id); this._notify(); }

  resolveVarEnv() {
    const env = {};
    for (const vs of this.varsets.values())
      Object.assign(env, vs.resolveAll());
    return env;
  }

  resolveVarRef(varRef) {
    if (!varRef) return null;
    const vs = this.varsets.get(varRef.varsetId);
    if (!vs) return null;
    const v = vs.variables.get(varRef.variableId);
    if (!v) return null;
    const env = this.resolveVarEnv();
    return env[v.name] ?? null;
  }

  _notify() {
    this._onChange?.();
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => StorageAdapter.save(this), 500);
  }

  toJSON() {
    return {
      version:    this.version,
      varsets:    [...this.varsets.values()].map(v=>v.toJSON()),
      groups:     [...this.groups.values()].map(g=>g.toJSON()),
      pages:      [...this.pages.values()].map(p=>p.toJSON()),
      activePage: this.activePage,
    };
  }

  static fromJSON(j) {
    const doc = new SketchDocument();
    doc.version = j.version ?? 1;
    for (const v of (j.varsets ?? [])) doc.varsets.set(v.id, SketchVarset.fromJSON(v));
    for (const g of (j.groups  ?? [])) doc.groups.set(g.id,  SketchGroup.fromJSON(g));
    for (const p of (j.pages   ?? [])) doc.pages.set(p.id,   SketchPage.fromJSON(p));
    doc.activePage = j.activePage ?? [...doc.pages.keys()][0] ?? null;
    return doc;
  }
}
