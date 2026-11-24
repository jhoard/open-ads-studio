import { normalizeFigJam } from "./figjam";
// Synthetic public fixture. No customer data is bundled with the application.
export const exampleBoard = normalizeFigJam([
  {id:"section",type:"SECTION",name:"Product planning",x:0,y:0,width:1040,height:620},
  ...[{id:"a",text:"Find the right problem",x:64,color:{r:1,g:.89,b:.6}},{id:"b",text:"Talk to five customers",x:400,color:{r:.7,g:.94,b:.74}},{id:"c",text:"Try a small experiment",x:736,color:{r:.7,g:.84,b:1}}].map(n=>({id:n.id,type:"STICKY",name:n.text,parentId:"section",absoluteBoundingBox:{x:n.x,y:230,width:240,height:240},fills:[{type:"SOLID",color:n.color}],text:{characters:n.text,fontSize:24}})),
  {id:"title",type:"TEXT",name:"A clear next step",parentId:"section",absoluteBoundingBox:{x:64,y:64,width:600,height:64},text:{characters:"A clear next step",fontSize:48,fontWeight:700}},
  {id:"subtitle",type:"TEXT",name:"Keep the work moving",parentId:"section",absoluteBoundingBox:{x:64,y:145,width:850,height:40},text:{characters:"Three editable notes, connected by a small plan.",fontSize:24}},
  ...[{id:"ab",start:"a",end:"b"},{id:"bc",start:"b",end:"c"}].map(n=>({id:n.id,type:"CONNECTOR",parentId:"section",x:0,y:0,width:1,height:1,connectorStart:{endpointNodeId:n.start,magnet:"RIGHT"},connectorEnd:{endpointNodeId:n.end,magnet:"LEFT"},lineType:"STRAIGHT",endCap:"ARROW_LINES"})),
],"Product planning, sample board");
