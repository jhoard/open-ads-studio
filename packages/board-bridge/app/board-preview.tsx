import { memo } from "react";
import type { Board } from "../lib/board";
export const BoardPreview=memo(function BoardPreview({board}:{board:Board}) {
  const boxes=board.nodes.filter(n=>n.kind!=="connector"),xs=boxes.map(n=>n.x),ys=boxes.map(n=>n.y);
  const x=Math.min(...xs)-40,y=Math.min(...ys)-40,w=Math.max(...boxes.map(n=>n.x+n.width))-x+40,h=Math.max(...boxes.map(n=>n.y+n.height))-y+40;
  const nodes=board.nodes.slice(0,300),byId=new Map(board.nodes.map(n=>[n.id,n]));
  return <div className="preview"><svg role="img" aria-label={`Layout preview of ${board.name}`} viewBox={`${x} ${y} ${w} ${h}`}>
    {nodes.filter(n=>n.kind==="frame").map(n=><g key={n.id}><rect x={n.x} y={n.y} width={n.width} height={n.height} fill={n.fill} stroke="#bbc2b9" strokeWidth="2"/><text x={n.x+16} y={n.y-12} fontSize="20" fill="#53635c">{n.name}</text></g>)}
    {nodes.filter(n=>n.kind==="connector").map(n=>{const a=byId.get(n.start!.id),b=byId.get(n.end!.id);return a&&b?<line key={n.id} x1={a.x+a.width/2} y1={a.y+a.height/2} x2={b.x+b.width/2} y2={b.y+b.height/2} stroke={n.stroke} strokeWidth="3"/>:null;})}
    {nodes.filter(n=>!["frame","connector"].includes(n.kind)).map(n=><g key={n.id} transform={n.rotation?`rotate(${n.rotation} ${n.x+n.width/2} ${n.y+n.height/2})`:undefined}>
      {n.kind==="image"&&n.image?<image x={n.x} y={n.y} width={n.width} height={n.height} href={`data:${n.image.mimeType};base64,${n.image.base64}`} preserveAspectRatio="none"/>:<>
      {n.kind!=="text"&&<rect x={n.x} y={n.y} width={n.width} height={n.height} rx={n.kind==="sticky"?0:5} fill={n.fill} stroke={n.kind==="shape"?n.stroke:"none"}/>}
      {n.kind==="text"&&n.lines?.length?n.lines.map((line,i)=><text key={i} x={n.x+line.x} y={n.y+line.baseline} fontSize={line.fontSize} fontFamily={n.fontFamily||"Arial"} fill={n.textColor} xmlSpace="preserve">{line.runs.map((r,j)=><tspan key={j} fontWeight={r.bold?700:400} fill={r.color}>{r.text}</tspan>)}</text>):<foreignObject x={n.x} y={n.y} width={Math.max(n.width,1)} height={Math.max(n.height,1)}><div className={`preview-label ${n.kind==="text"?"is-text":""}`} style={{fontFamily:n.fontFamily||"Arial",fontSize:n.fontSize,color:n.textColor,fontWeight:n.bold?700:400,textAlign:n.textAlign||"left",display:"flex",justifyContent:n.textAlign==="center"?"center":n.textAlign==="right"?"flex-end":"flex-start",alignItems:n.textAlignVertical==="middle"?"center":"flex-start"}}><span>{n.runs?.length?n.runs.map((r,i)=><span key={i} style={{fontWeight:r.bold?700:400,color:r.color}}>{r.text}</span>):n.text}</span></div></foreignObject>}</>}
    </g>)}
  </svg><span className="preview-caption">Source layout preview · Miro fonts may vary{board.nodes.length>300?" · first 300 objects shown":""}</span></div>;
});
