import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exampleBoard } from "./example";
import { makeJob, runJob, refreshPendingPlans, saveJob, unfinishedJob } from "./jobs";
import { MiroClient, MiroError } from "./miro";
test("migration resolves parents and connector IDs, then resume skips confirmed objects",async()=>{
  const job=makeJob("owner",exampleBoard,"target","Target");let count=0;const calls:{endpoint:string;payload:any}[]=[];
  const saved:any[]=[];
  const client={async create(_board:string,endpoint:string,payload:any){calls.push({endpoint,payload});const item={...payload,id:String(++count),type:endpoint==='connectors'?'connector':endpoint};saved.push(item);return item;},async listItems(_id:string,connectors=false){return saved.filter(item=>(item.type==='connector')===connectors);}};
  await runJob(job,client,async()=>{});assert.equal(job.status,"completed");assert.equal(calls.length,8);
  assert.equal(calls.find(c=>c.endpoint==="sticky_notes")!.payload.parent.id,"1");
  const line=calls.find(c=>c.endpoint==="connectors")!;assert.equal(line.payload.startItem.id,"2");assert.equal(line.payload.endItem.id,"3");
  await runJob(job,client,async()=>{});assert.equal(calls.length,8);
});
test("lost write confirmation pauses without replaying a possibly created object",async()=>{
  const job=makeJob("owner",exampleBoard,"target","Target");let calls=0,checkpoint="";
  const client={async create(){calls++;assert.equal(checkpoint,"uncertain");throw new MiroError("Timeout",true);}};
  await runJob(job,client,async j=>{checkpoint=j.tasks[0].status;});
  assert.equal(job.status,"paused");assert.equal(job.tasks[0].status,"uncertain");
  await runJob(job,client,async()=>{});assert.equal(calls,1);
});
test("an explicit rejected request can be resumed",async()=>{
  const job=makeJob("owner",exampleBoard,"target","Target");
  await runJob(job,{async create(){throw new MiroError("Bad request",false,400);}},async()=>{});
  assert.equal(job.tasks[0].status,"failed");assert.equal(job.status,"paused");
});
test("resume updates pending payloads without replaying confirmed objects or unresolved writes",()=>{
  const job=makeJob("owner",exampleBoard,"target","Target");
  job.tasks[0].status="done";job.tasks[0].miroId="123";
  const text=job.tasks.find(t=>t.kind==="text")!;text.status="failed";text.payload.geometry={width:1};
  refreshPendingPlans(job);
  assert.equal(job.tasks[0].status,"done");assert.equal(job.tasks[0].miroId,"123");assert.equal(text.status,"pending");assert.ok(text.payload.geometry.width>1);
  text.status="uncertain";assert.throws(()=>refreshPendingPlans(job),/Reconcile/);
});
test("repeated migration starts find the existing unfinished job only for the same owner and destination",async()=>{
  const previous=process.env.BRIDGE_DATA_DIR,dir=await mkdtemp(path.join(os.tmpdir(),"bridge-dedup-"));process.env.BRIDGE_DATA_DIR=dir;
  try{
    const job=makeJob("owner",exampleBoard,"target","Target");job.status="paused";await saveJob(job);
    assert.equal((await unfinishedJob("owner",structuredClone(exampleBoard),"target"))?.id,job.id);
    assert.equal(await unfinishedJob("other",exampleBoard,"target"),undefined);
    assert.equal(await unfinishedJob("owner",exampleBoard,"other"),undefined);
    job.status="cancelled";await saveJob(job);assert.equal(await unfinishedJob("owner",exampleBoard,"target"),undefined);
  }finally{if(previous===undefined)delete process.env.BRIDGE_DATA_DIR;else process.env.BRIDGE_DATA_DIR=previous;await rm(dir,{recursive:true,force:true});}
});
test("HTTP client retries 429 rejection but never retries ambiguous POST errors",async()=>{
  let calls=0;const transport=(async()=>{calls++;return calls===1?new Response("",{status:429,headers:{"retry-after":"1"}}):Response.json({id:"123"});}) as typeof fetch;
  const waits:number[]=[];const client=new MiroClient("token",transport,async ms=>{waits.push(ms);});
  assert.equal((await client.create("board","shapes",{})).id,"123");assert.equal(calls,2);assert.deepEqual(waits,[1000]);
  let failures=0;const bad=new MiroClient("token",(async()=>{failures++;throw Error("Connection reset");}) as typeof fetch);
  await assert.rejects(()=>bad.create("board","shapes",{}),(e:unknown)=>e instanceof MiroError&&e.ambiguous);assert.equal(failures,1);
});
test("Miro validation errors retain the reason and do not retry rejected writes",async()=>{
  let calls=0;const client=new MiroClient("token",(async()=>{calls++;return Response.json({message:"Width must be greater than 82.0 for font size 48.0"},{status:400});}) as typeof fetch);
  await assert.rejects(()=>client.create("board","texts",{}),(e:unknown)=>e instanceof MiroError&&!e.ambiguous&&/Width must be greater/.test(e.message));
  assert.equal(calls,1);
});
