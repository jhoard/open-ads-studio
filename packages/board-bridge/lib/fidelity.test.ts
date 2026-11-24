import test from 'node:test';
import assert from 'node:assert/strict';
import { svgTextLines, richText } from './text-layout';
import { normalizeFigJam } from './figjam';
import { validateBoard } from './board';
import { planBoard } from './miro-plan';
import { makeJob, runJob } from './jobs';
import { MiroClient, MiroError } from './miro';
import { exampleBoard } from './example';
import { verifyJob } from './verification';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0X8AAAAASUVORK5CYII=';
test('SVG text paint order is sorted spatially, preserving mixed bold and escaped characters',()=>{
 const lines=svgTextLines('<svg><text font-size="22"><tspan x="80" y="21"> &amp; copy</tspan></text><text font-size="22" font-weight="bold"><tspan x="0" y="21">Title</tspan><tspan x="0" y="54">Next</tspan></text></svg>',22)!;
 assert.deepEqual(lines.map(l=>l.text),['Title & copy','Next']);
 assert.equal(richText({text:lines[0].text,bold:false,runs:lines[0].runs}),'<strong>Title</strong> &amp; copy');
});
test('complete exports retain images, source baselines, uppercase display, and frame hierarchy',()=>{
 const board=normalizeFigJam([{id:'f',type:'SECTION',x:100,y:720,width:1000,height:1000},{id:'t',type:'TEXT',parentId:'f',absoluteBoundingBox:{x:164,y:780,width:300,height:60},text:{characters:'The goal',fontName:'Figtree',fontSize:22,svg:'<svg><text fill="#00737E" font-size="22" font-weight="600"><tspan x="0" y="24">THE GOAL</tspan></text></svg>'}},{id:'i',type:'RECTANGLE',parentId:'f',absoluteBoundingBox:{x:200,y:900,width:100,height:80},fills:[{type:'IMAGE'}],image:{mimeType:'image/png',base64:png}}],'Complete');
 assert.equal(board.nodes.length,3);assert.equal(board.warnings.some(w=>w.severity==='skipped'),false);
 const plan=planBoard(board),image=plan.find(t=>t.kind==='image')!,line=plan.find(t=>t.kind==='text')!;
 assert.equal(image.parentSourceId,'f');assert.equal(image.payload.asset.base64,png);
 assert.equal(line.sourceNodeId,'t');assert.equal(line.payload.style.color,'#00737E');assert.match(line.payload.data.content,/THE GOAL/);
 assert.ok(Math.abs(line.payload.position.y-(60+24-22*.36))<.001);
 const bad=structuredClone(board);bad.nodes.find(n=>n.kind==='image')!.image!.base64='not-an-image';assert.throws(()=>validateBoard(bad),/embedded image/);
});
test('binary image upload sends a resource and geometry in multipart form',async()=>{
 let payload:Blob|undefined;
 const client=new MiroClient('secret',(async(_url,init)=>{assert.match((init?.headers as any)['Content-Type'],/^multipart\/form-data; boundary=/);payload=init!.body as Blob;return Response.json({id:'1'});}) as typeof fetch);
 await client.create('board','images',{asset:{mimeType:'image/png',base64:png},data:{title:'Screenshot'},position:{x:50,y:40,origin:'center'},geometry:{width:100,height:80},parent:{id:'frame'}});
 const body=await payload!.text();assert.match(body,/name="data"\r\nContent-Type: application\/json/);assert.match(body,/"title":"Screenshot"/);assert.match(body,/"parent":\{"id":"frame"\}/);assert.match(body,/name="resource"; filename="image.png"/);assert.match(body,/Content-Type: image\/png/);
});
test('new board creation is checkpointed and a lost confirmation is never replayed',async()=>{
 const job=makeJob('owner',exampleBoard,'','Source',true);let calls=0,checkpoint='';
 const client={async create(){throw Error('must not write items');},async createBoard(){calls++;assert.equal(checkpoint,'uncertain');throw new MiroError('lost response',true);}};
 await runJob(job,client,async j=>{checkpoint=j.provisioning!;});assert.equal(job.status,'paused');assert.equal(job.provisioning,'uncertain');
 await runJob(job,client,async()=>{});assert.equal(calls,1);
});
test('destination verification catches missing images, moved items and detached connectors',async()=>{
 const job=makeJob('owner',exampleBoard,'board','Board');job.tasks.forEach((t,i)=>{t.status='done';t.miroId=String(i+1);});
 const items=job.tasks.map(t=>({id:t.miroId,...t.payload,parent:t.parentSourceId?{id:job.tasks.find(p=>p.sourceId===t.parentSourceId)!.miroId}:undefined}));
 const result=await verifyJob(job,{async listItems(_id,connectors=false){return items.filter(i=>('startItem' in i)===connectors).map(i=>({...i,position:{x:99999,y:99999}}));}});
 assert.equal(result.state,'review');assert.ok(result.issues.some(i=>i.startsWith('Position mismatch')));assert.ok(result.issues.some(i=>i.startsWith('Detached connector')));
});
test('unavailable inventory and missing image resources cannot be marked completed',async()=>{
 const board=normalizeFigJam([{id:'i',type:'RECTANGLE',width:100,height:100,image:{mimeType:'image/png',base64:png}}],'Image');
 const job=makeJob('owner',board,'target','Target');
 await runJob(job,{async create(){return {id:'1'};},async listItems(){return [{id:'1',type:'image',position:job.tasks[0].payload.position,geometry:{width:100,height:100},data:{}}];}},async()=>{});
 assert.equal(job.status,'review');assert.ok(job.validation?.issues.some(i=>i.startsWith('Image resource missing')));
 const other=makeJob('owner',board,'target','Target');await runJob(other,{async create(){return{id:'2'};}},async()=>{});assert.equal(other.status,'review');
});
test('new-board provisioning happens once and confirmed items survive rechecks',async()=>{
 const board=normalizeFigJam([{id:'s',type:'RECTANGLE',width:100,height:100}],'New board');
 const job=makeJob('owner',board,'','New board',true);let boards=0,writes=0;
 const client={async createBoard(){boards++;return{id:'target'};},async create(){writes++;return{id:'1'};},async listItems(){return [{id:'1',type:'shape',...job.tasks[0].payload}];}};
 await runJob(job,client,async()=>{});assert.equal(job.status,'completed');assert.equal(job.boardId,'target');assert.equal(job.provisioning,'done');
 await runJob(job,client,async()=>{});assert.equal(boards,1);assert.equal(writes,1);
});
