import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFigJam, normalizeRestFile } from "./figjam";
import { planBoard } from "./miro-plan";
import { boardId, validateBoard, html } from "./board";
import { exampleBoard } from "./example";
test("narrow large-font labels meet Miro width constraints without moving their left edge",()=>{
  const board=normalizeFigJam([
    {id:"frame",type:"SECTION",x:0,y:720,width:1600,height:1538},
    {id:"label",type:"TEXT",parentId:"frame",absoluteBoundingBox:{x:64,y:780,width:52,height:58},text:{characters:"01",fontSize:48}},
  ],"Narrow label");
  const label=planBoard(board).find(t=>t.sourceId==="label")!;
  assert.equal(label.payload.geometry.width,96);
  assert.equal(label.payload.position.x-label.payload.geometry.width/2,64);
});
test("REST extraction preserves nested FigJam text as well as standalone characters",()=>{
  const board=normalizeRestFile({name:"REST",document:{type:"DOCUMENT",children:[{id:"page",type:"CANVAS",children:[
    {id:"sticky",type:"STICKY",width:240,height:240,text:{characters:"Keep this idea",fontSize:32}},
    {id:"label",type:"TEXT",width:300,height:40,characters:"Keep this label",style:{fontSize:28}},
  ]}]}});
  assert.equal(board.nodes.find(n=>n.id==="sticky")!.text,"Keep this idea");
  assert.equal(board.nodes.find(n=>n.id==="label")!.text,"Keep this label");
});
test("nested sections flatten without losing absolute positions or endpoint references",()=>{
  const b=normalizeFigJam([
    {id:"outer",name:"Outer",type:"SECTION",x:100,y:200,width:1000,height:1000},
    {id:"inner",name:"Inner",type:"SECTION",parentId:"outer",absoluteBoundingBox:{x:200,y:300,width:600,height:600}},
    {id:"a",type:"STICKY",parentId:"inner",absoluteBoundingBox:{x:220,y:340,width:240,height:240},text:{characters:"Research"}},
    {id:"b",type:"STICKY",parentId:"inner",absoluteBoundingBox:{x:520,y:340,width:240,height:240},text:{characters:"Prototype"}},
    {id:"ab",type:"CONNECTOR",connectorStart:{endpointNodeId:"a",magnet:"RIGHT"},connectorEnd:{endpointNodeId:"b",magnet:"LEFT"}},
  ],"Nested");
  assert.equal(b.nodes.find(n=>n.id==="inner")!.kind,"shape");
  assert.equal(b.nodes.find(n=>n.id==="a")!.parentId,"outer");
  const plan=planBoard(b);assert.equal(plan[0].kind,"frame");assert.equal(plan.at(-1)!.kind,"connector");
  const sticky=plan.find(n=>n.sourceId==="a")!;
  assert.deepEqual(sticky.payload.position,{x:240,y:260,origin:"center"});
  assert.equal(plan.at(-1)!.startSourceId,"a");
});
test("unsupported images and their connectors are disclosed, never silently flattened",()=>{
  const b=normalizeFigJam([
    {id:"image",type:"RECTANGLE",fills:[{type:"IMAGE"}]},
    {id:"sticky",type:"STICKY",width:240,height:240,text:{characters:"Idea"}},
    {id:"line",type:"CONNECTOR",connectorStart:{endpointNodeId:"image"},connectorEnd:{endpointNodeId:"sticky"}},
  ],"Assets");
  assert.equal(b.nodes.length,1);assert.deepEqual(b.warnings.filter(w=>w.severity==="skipped").map(w=>w.id),["image","line"]);
});
test("invalid hierarchy, duplicate IDs, coordinates and endpoints are rejected",()=>{
  const duplicate=structuredClone(exampleBoard);duplicate.nodes.push(duplicate.nodes[0]);assert.throws(()=>validateBoard(duplicate),/unique/);
  const infinite=structuredClone(exampleBoard);infinite.nodes[0].x=Infinity;assert.throws(()=>validateBoard(infinite),/Invalid x/);
  const cycle=structuredClone(exampleBoard);cycle.nodes[0].parentId=cycle.nodes[1].id;assert.throws(()=>validateBoard(cycle),/Cyclic/);
  const missing=structuredClone(exampleBoard);missing.nodes.find(n=>n.kind==="connector")!.start!.id="absent";assert.throws(()=>validateBoard(missing),/endpoint/);
});
test("Miro input does not become an arbitrary outgoing URL and text cannot inject markup",()=>{
  assert.equal(boardId("https://miro.com/app/board/uXjVtest=/"),"uXjVtest=");
  assert.throws(()=>boardId("https://miro.com.evil.test/app/board/foo"));assert.throws(()=>boardId("http://localhost/app/board/foo"));
  assert.equal(html('<script>alert("x")</script>\n&'),"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>&amp;");
});
