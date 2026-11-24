async function serializeBoard(roots) {
  const nodes = [], seen = new Set();
  const paints = p => Array.isArray(p) ? p.map(v => ({ type:v.type, color:v.color, opacity:v.opacity, visible:v.visible, imageHash:v.imageHash })) : [];
  async function visit(n) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const out = { id:n.id, name:n.name, type:n.type, parentId:n.parent && n.parent.id };
    for (const key of ['x','y','width','height','rotation','absoluteBoundingBox','visible','strokeWeight','cornerRadius'])
      if (key in n && typeof n[key] !== 'symbol') out[key] = n[key];
    out.fills=paints(n.fills);out.strokes=paints(n.strokes);
    if(n.visible===false){nodes.push(out);return;}
    let t = n.type === 'TEXT' ? n : ['STICKY','SHAPE_WITH_TEXT','CONNECTOR'].includes(n.type) ? n.text : null;
    if(t){
      const segments=t.getStyledTextSegments(['fontName','fontSize','fontWeight','fills','lineHeight']);
      out.text={characters:t.characters,fills:paints(t.fills),fontName:typeof t.fontName==='object'?t.fontName.family:segments[0]?.fontName.family,fontSize:typeof t.fontSize==='number'?t.fontSize:segments[0]?.fontSize,fontWeight:typeof t.fontWeight==='number'?t.fontWeight:400,textAlignHorizontal:t.textAlignHorizontal,lineHeight:typeof t.lineHeight==='object'?t.lineHeight:null,segments:segments.map(s=>({characters:s.characters,fontSize:s.fontSize,fontWeight:s.fontWeight,fontFamily:s.fontName.family,fills:paints(s.fills)}))};
      if(n.type==='TEXT')out.text.svg=await n.exportAsync({format:'SVG_STRING',svgOutlineText:false,useAbsoluteBounds:true});
    }
    if(out.fills.some(p=>p.type==='IMAGE'&&p.visible!==false)){
      const bounds=n.absoluteRenderBounds||n.absoluteBoundingBox;
      const bytes=await n.exportAsync({format:'PNG',constraint:{type:'SCALE',value:Math.min(3,2048/Math.max(bounds.width,bounds.height))}});
      if(bytes.length>6*1024*1024)throw Error('An image exceeds 6 MB. Export a smaller selection.');
      out.image={mimeType:'image/png',base64:figma.base64Encode(bytes)};out.imageBounds=bounds;
    }
    if(n.type==='SHAPE_WITH_TEXT')out.shapeType=n.shapeType;
    if(n.type==='CONNECTOR'){out.connectorStart=n.connectorStart;out.connectorEnd=n.connectorEnd;out.lineType=n.connectorLineType;out.startCap=n.connectorStartStrokeCap;out.endCap=n.connectorEndStrokeCap;}
    nodes.push(out);
    if(nodes.length>10000)throw Error('Board is too large. Select a smaller section.');
    if('children' in n)for(const child of n.children)await visit(child);
  }
  for(const root of roots)await visit(root);
  return {format:'figjam-plugin',version:1,exporterVersion:2,name:figma.root.name,nodes};
}
figma.showUI(__html__, { width:360, height:310 });
figma.ui.onmessage = async message => {
  if(message.type!=='export')return;
  try{
    const roots=message.selection&&figma.currentPage.selection.length?figma.currentPage.selection:figma.currentPage.children;
    const data=await serializeBoard(roots);
    if(JSON.stringify(data).length>32*1024*1024)throw Error('Export exceeds 32 MB. Select fewer sections.');
    figma.ui.postMessage({type:'exported',name:figma.root.name,data});
  }catch(e){figma.ui.postMessage({type:'error',message:e.message||'Export failed.'});}
};
