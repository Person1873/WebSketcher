export function exportFCStd(sk) {
  const S = 0.01;
  const D2R = Math.PI / 180;
  const UNDEF = -2000;
  const f = n => Number(n).toFixed(13);

  const geoms = [];
  const addG = (entity, type) => geoms.push({entity, type, construction: !!entity.construction});
  for (const ln of sk.lines.values()) { if (!sk.reserved.has(ln)) addG(ln,'line'); }
  for (const ci of sk.circles.values()) addG(ci,'circle');
  for (const arc of sk.arcs.values())   addG(arc,'arc');
  geoms.sort((a,b)=>(a.construction?1:0)-(b.construction?1:0));
  geoms.forEach((g,i)=>g.idx=i);

  const ptRef = {};
  for (const g of geoms) {
    const i = g.idx;
    if (g.type==='line')   { ptRef[g.entity.p1.id]={gi:i,vp:1}; ptRef[g.entity.p2.id]={gi:i,vp:2}; }
    if (g.type==='circle') { ptRef[g.entity.centre.id]={gi:i,vp:3}; }
    if (g.type==='arc')    { ptRef[g.entity.startPt.id]={gi:i,vp:1}; ptRef[g.entity.endPt.id]={gi:i,vp:2}; ptRef[g.entity.centre.id]={gi:i,vp:3}; }
  }

  const geomLines = geoms.map(g => {
    const con = g.construction ? ' Construction="1"' : '';
    let inner = '';
    if (g.type==='line') {
      const {p1,p2}=g.entity;
      inner=`<LineSegment StartX="${f(p1.x*S)}" StartY="${f(p1.y*S)}" StartZ="0" EndX="${f(p2.x*S)}" EndY="${f(p2.y*S)}" EndZ="0"/>`;
    } else if (g.type==='circle') {
      const {centre,radius}=g.entity;
      inner=`<Circle CenterX="${f(centre.x*S)}" CenterY="${f(centre.y*S)}" CenterZ="0" NormalX="0" NormalY="0" NormalZ="1" AngleXU="0" Radius="${f(radius*S)}"/>`;
    } else {
      const arc=g.entity;
      const sa=arc.startAngle, ea=arc.endAngle;
      const span=((ea-sa)+2*Math.PI)%(2*Math.PI);
      let inverted=arc.inverted;
      if(arc.throughPt){
        const tp=arc.throughPt;
        const ta=Math.atan2(tp.y-arc.centre.y,tp.x-arc.centre.x);
        const tOnCCW=((ta-sa)+2*Math.PI)%(2*Math.PI)<=span;
        inverted=tOnCCW!==(span<=Math.PI);
      }
      const shortIsCCW=span<=Math.PI;
      const drawCCW=inverted?!shortIsCCW:shortIsCCW;
      let fcStart, fcEnd;
      if(drawCCW){
        fcStart=sa; fcEnd=(ea<=sa)?ea+2*Math.PI:ea;
      } else {
        fcStart=ea; fcEnd=(sa<=ea)?sa+2*Math.PI:sa;
      }
      inner=`<ArcOfCircle CenterX="${f(arc.centre.x*S)}" CenterY="${f(arc.centre.y*S)}" CenterZ="0" NormalX="0" NormalY="0" NormalZ="1" AngleXU="0" Radius="${f(arc.radius*S)}" StartAngle="${f(fcStart)}" EndAngle="${f(fcEnd)}"/>`;
    }
    return `        <Geometry id="${g.idx+1}"${con}>\n          ${inner}\n        </Geometry>`;
  });

  const cxLines = [];
  const addC = (type,value,fi,fp,si=UNDEF,sp=0,ti=UNDEF,tp=0)=>{
    cxLines.push(`        <Constrain Name="" Type="${type}" Value="${f(value)}" First="${fi}" FirstPos="${fp}" Second="${si}" SecondPos="${sp}" Third="${ti}" ThirdPos="${tp}" LabelDistance="0" LabelPosition="0" IsDriving="1" IsInVirtualSpace="0" IsActive="1"/>`);
  };

  const gByEntity = new Map(geoms.map(g=>[g.entity,g]));

  for (const c of sk.constraints) {
    if (c.driven) continue;
    const [r0,r1,r2] = c.refs;
    switch(c.type) {
      case 'fixed': {
        const ref=ptRef[r0.id]; if(!ref) break;
        addC(17,0,ref.gi,ref.vp);
        break;
      }
      case 'horizontal': { const g=gByEntity.get(r0); if(g) addC(2,0,g.idx,0); break; }
      case 'vertical':   { const g=gByEntity.get(r0); if(g) addC(3,0,g.idx,0); break; }
      case 'parallel':   { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(4,0,g0.idx,0,g1.idx,0); break; }
      case 'perpendicular':{ const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(10,0,g0.idx,0,g1.idx,0); break; }
      case 'equal':      { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(12,0,g0.idx,0,g1.idx,0); break; }
      case 'tangent':    { const g0=gByEntity.get(r0),g1=gByEntity.get(r1); if(g0&&g1) addC(5,0,g0.idx,0,g1.idx,0); break; }
      case 'coincident': {
        const ra=ptRef[r0.id], rb=ptRef[r1.id]; if(!ra||!rb) break;
        addC(1,0,ra.gi,ra.vp,rb.gi,rb.vp); break;
      }
      case 'point_on_line':
      case 'point_on_circle': {
        const ra=ptRef[r0.id], gb=gByEntity.get(r1); if(!ra||!gb) break;
        addC(13,0,ra.gi,ra.vp,gb.idx,0); break;
      }
      case 'distance': { const g=gByEntity.get(r0); if(g) addC(6,c.value*S,g.idx,0); break; }
      case 'radius':   { const g=gByEntity.get(r0); if(g) addC(11,c.value*S,g.idx,0); break; }
      case 'angle': {
        const g0=gByEntity.get(r0),g1=gByEntity.get(r1);
        if(g0&&g1) addC(9,c.value*D2R,g0.idx,0,g1.idx,0); break;
      }
      case 'symmetric': {
        const ra=ptRef[r0.id],rb=ptRef[r1.id]; if(!ra||!rb) break;
        const ga=gByEntity.get(r2);
        if(ga) addC(14,0,ra.gi,ra.vp,rb.gi,rb.vp,ga.idx,0);
        else    addC(14,0,ra.gi,ra.vp,rb.gi,rb.vp);
        break;
      }
    }
  }

  const xml = `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="4" ProgramVersion="0.21" FileVersion="1">
  <Properties Count="1">
    <Property name="Label" type="App::PropertyString">
      <String value="Sketch"/>
    </Property>
  </Properties>
  <Objects Count="1">
    <Object type="Sketcher::SketchObject" name="Sketch" id="1"/>
  </Objects>
  <ObjectData Count="1">
    <Object name="Sketch">
      <Properties Count="2">
        <Property name="Geometry" type="Part::PropertyGeometryList">
          <GeometryList count="${geoms.length}">
${geomLines.join('\n')}
          </GeometryList>
        </Property>
        <Property name="Constraints" type="Sketcher::PropertyConstraintList">
          <ConstraintList count="${cxLines.length}">
${cxLines.join('\n')}
          </ConstraintList>
        </Property>
      </Properties>
    </Object>
  </ObjectData>
</Document>`;

  const enc = new TextEncoder();
  const nameBytes = enc.encode('Document.xml');
  const dataBytes = enc.encode(xml);

  const crcTable = (() => {
    const t=new Uint32Array(256);
    for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}
    return t;
  })();
  const crc32=(buf)=>{let c=0xFFFFFFFF;for(const b of buf)c=crcTable[(c^b)&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
  const crc=crc32(dataBytes);

  const u16=(n)=>[(n&0xFF),(n>>8)&0xFF];
  const u32=(n)=>[(n&0xFF),(n>>8)&0xFF,(n>>16)&0xFF,(n>>24)&0xFF];

  const lfh=[
    0x50,0x4B,0x03,0x04,
    0x14,0x00,
    0x00,0x00,
    0x00,0x00,
    0x00,0x00,0x00,0x00,
    ...u32(crc),
    ...u32(dataBytes.length),
    ...u32(dataBytes.length),
    ...u16(nameBytes.length),
    0x00,0x00,
    ...nameBytes,
    ...dataBytes,
  ];

  const lfhOffset=0;
  const cdh=[
    0x50,0x4B,0x01,0x02,
    0x14,0x00,
    0x14,0x00,
    0x00,0x00,0x00,0x00,
    0x00,0x00,0x00,0x00,
    ...u32(crc),
    ...u32(dataBytes.length),
    ...u32(dataBytes.length),
    ...u16(nameBytes.length),
    0x00,0x00,0x00,0x00,
    0x00,0x00,
    0x00,0x00,
    0x00,0x00,0x00,0x00,
    ...u32(lfhOffset),
    ...nameBytes,
  ];

  const eocd=[
    0x50,0x4B,0x05,0x06,
    0x00,0x00,0x00,0x00,
    0x01,0x00,0x01,0x00,
    ...u32(cdh.length),
    ...u32(lfh.length),
    0x00,0x00,
  ];

  return new Uint8Array([...lfh,...cdh,...eocd]);
}
