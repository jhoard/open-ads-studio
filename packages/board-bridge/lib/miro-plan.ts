import { type Board, type BoardNode, html } from './board';
import { richText, miroFont, fontIsMapped } from './text-layout';
export interface PlannedItem { sourceId:string; sourceNodeId?:string; kind:BoardNode['kind']; endpoint:string; payload:Record<string,any>; parentSourceId?:string; startSourceId?:string; endSourceId?:string; expectedHeight?:number }
const palette:Record<string,string>={yellow:'#f9e299',light_green:'#b3efbd',red:'#ffafa3',violet:'#d5b3ff',light_blue:'#b3d5ff',cyan:'#a8e8e2',pink:'#ffcee0',gray:'#e6e6e6'};
function stickyColor(hex:string){const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),a=rgb(hex);return Object.keys(palette).sort((x,y)=>rgb(palette[x]).reduce((s,v,i)=>s+(v-a[i])**2,0)-rgb(palette[y]).reduce((s,v,i)=>s+(v-a[i])**2,0))[0];}
export function planBoard(board:Board):PlannedItem[]{
  const index=new Map(board.nodes.map(n=>[n.id,n]));
  const ordered=[...board.nodes].sort((a,b)=>Number(b.kind==='frame')-Number(a.kind==='frame')||Number(a.kind==='connector')-Number(b.kind==='connector'));
  return ordered.flatMap<PlannedItem>(n=>{
    const parent=n.parentId?index.get(n.parentId):undefined;
    const position=(x:number,y:number)=>({x:x-(parent?.x||0),y:y-(parent?.y||0),origin:'center'});
    const base=(x:number,y:number)=>({position:position(x,y),...(parent?{parent:{id:'PENDING'}}:{})});
    const common={sourceId:n.id,sourceNodeId:n.id,kind:n.kind,parentSourceId:n.parentId};
    if(n.kind==='frame')return [{...common,endpoint:'frames',payload:{data:{title:n.name,format:'custom',type:'freeform'},style:{fillColor:n.fill},position:position(n.x+n.width/2,n.y+n.height/2),geometry:{width:n.width,height:n.height}}}];
    if(n.kind==='image')return [{...common,endpoint:'images',expectedHeight:n.height,payload:{...base(n.x+n.width/2,n.y+n.height/2),data:{title:n.name},geometry:{width:n.width,rotation:n.rotation},asset:n.image}}];
    if(n.kind==='sticky')return [{...common,endpoint:'sticky_notes',payload:{...base(n.x+n.width/2,n.y+n.height/2),data:{content:richText(n),shape:n.width/n.height>1.16?'rectangle':'square'},style:{fillColor:stickyColor(n.fill),textAlign:n.textAlign||'center',textAlignVertical:'middle'},geometry:{width:n.width}}}];
    if(n.kind==='text'){
      if(n.lines?.length)return n.lines.map((line,i)=>{
        // Preserve Figma's visual line breaks and baseline spacing as native editable
        // lines. Extra transparent width prevents rewrapping in the destination font.
        const neighbor=board.nodes.find(other=>other.parentId===n.parentId&&other.kind==='shape'&&other.x>=n.x+n.width&&other.y<n.y+n.height&&other.y+other.height>n.y);
        const x=n.x+line.x,available=Math.max(30,Math.min(parent?parent.x+parent.width-x:Infinity,neighbor?neighbor.x-x-10:Infinity));
        const scale=fontIsMapped(n.fontFamily)?Math.min(1,available/(n.width*1.12),(n.fontSize>=32&&neighbor ? .8 : 1)):1;
        const size=Math.max(1,Math.round(line.fontSize*scale)),width=Math.max(Math.min((n.width-line.x)*1.4,available),size*2,30);
        return {...common,sourceId:`${n.id}#${i}`,endpoint:'texts',expectedHeight:size*1.22,payload:{...base(x+width/2,n.y+line.baseline-size*.36),data:{content:richText({text:line.text,bold:n.bold,runs:line.runs})},style:{color:line.runs[0]?.color||n.textColor,fontFamily:miroFont(n.fontFamily),fontSize:String(size),textAlign:'left'},geometry:{width,rotation:n.rotation}}};
      });
      const width=Math.max(n.width,n.fontSize*2,30);
      return [{...common,endpoint:'texts',payload:{...base(n.x+width/2,n.y+n.height/2),data:{content:richText(n)},style:{color:n.textColor,fontFamily:miroFont(n.fontFamily),fontSize:String(n.fontSize),textAlign:n.textAlign||'left'},geometry:{width,rotation:n.rotation}}}];
    }
    if(n.kind==='shape')return [{...common,endpoint:'shapes',payload:{...base(n.x+n.width/2,n.y+n.height/2),data:{content:richText(n),shape:n.shape},style:{fillColor:n.fill,borderColor:n.stroke,borderWidth:String(Math.max(1,n.strokeWidth)),color:n.textColor,fontFamily:miroFont(n.fontFamily),fontSize:String(n.fontSize),textAlign:n.textAlign||'center',textAlignVertical:n.textAlignVertical||'middle'},geometry:{width:Math.max(8,n.width),height:Math.max(8,n.height),rotation:n.rotation}}}];
    return [{...common,endpoint:'connectors',parentSourceId:undefined,startSourceId:n.start!.id,endSourceId:n.end!.id,payload:{startItem:{id:'PENDING',snapTo:n.start!.side},endItem:{id:'PENDING',snapTo:n.end!.side},shape:n.lineType,style:{strokeColor:n.stroke,strokeWidth:String(Math.min(4,n.strokeWidth)),startStrokeCap:n.startArrow?'stealth':'none',endStrokeCap:n.endArrow?'stealth':'none'},...(n.text?{captions:[{content:html(n.text),position:'50%'}]}:{})}}];
  });
}
