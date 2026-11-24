import { randomUUID } from "node:crypto";
import { type Board } from "./board";
import { planBoard, type PlannedItem } from "./miro-plan";
import { listIds, readRecord, saveRecord } from "./storage";
import { verifyJob, type Validation } from "./verification";
import { MiroClient, MiroError } from "./miro";
export interface Task extends PlannedItem { status:"pending"|"done"|"uncertain"|"failed"; miroId?:string; error?:string }
export interface Job { id:string; owner:string; boardId:string; boardName:string; board:Board; tasks:Task[]; status:"queued"|"running"|"paused"|"completed"|"cancelled"|"verifying"|"review"; newBoard?:boolean; provisioning?:"pending"|"uncertain"|"failed"|"done"; validation?:Validation; createdAt:string; updatedAt:string; error?:string }
export function makeJob(owner:string,board:Board,id:string,name:string,newBoard=false):Job { const now=new Date().toISOString();return {id:randomUUID(),owner,boardId:id,boardName:name,newBoard,provisioning:newBoard?"pending":undefined,board,tasks:planBoard(board).map(t=>({...t,status:"pending"})),status:"queued",createdAt:now,updatedAt:now}; }
export async function saveJob(job:Job) { job.updatedAt=new Date().toISOString();await saveRecord("jobs",job.id,job); }
export async function getJob(id:string,owner?:string) { const j=await readRecord<Job>("jobs",id);if(!j||(owner&&j.owner!==owner))throw new Error("Migration not found.");return j; }
export function refreshPendingPlans(job:Job) {
  if(job.tasks.some(t=>t.status==="uncertain"))throw new Error("Reconcile the unconfirmed object before updating requests.");
  const plan=new Map(planBoard(job.board).map(t=>[t.sourceId,t]));
  for(const task of job.tasks)if(task.status!=="done"){
    const next=plan.get(task.sourceId);if(!next)throw new Error("The source object is no longer supported.");
    Object.assign(task,next);task.status="pending";delete task.error;
  }
}
export async function unfinishedJob(owner:string,board:Board,target:string):Promise<Job|undefined> {
  const signature=JSON.stringify(board),matches:Job[]=[];
  for(const id of await listIds("jobs")){
    const job=await readRecord<Job>("jobs",id);
    if(job?.owner===owner&&(job.newBoard?"new":job.boardId)===target&&["queued","running","paused","verifying"].includes(job.status)&&JSON.stringify(job.board)===signature)matches.push(job);
  }
  return matches.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
}
export function summary(j:Job) { return {id:j.id,name:j.board.name,destination:j.boardName,miroUrl:j.boardId?`https://miro.com/app/board/${j.boardId}/`:"",newBoard:j.newBoard,provisioning:j.provisioning,validation:j.validation,sourceObjects:j.board.nodes.length,status:j.status,total:j.tasks.length,done:j.tasks.filter(t=>t.status==="done").length,warnings:j.board.warnings,error:j.error,createdAt:j.createdAt,updatedAt:j.updatedAt,tasks:j.tasks.map(t=>({sourceId:t.sourceId,kind:t.kind,status:t.status,miroId:t.miroId,error:t.error}))}; }
export async function runJob(job:Job,client:Pick<MiroClient,"create"> & Partial<Pick<MiroClient,"createBoard"|"listItems">>,persist:(j:Job)=>Promise<void>=saveJob) {
  if(job.tasks.some(t=>t.status==="uncertain")){job.status="paused";job.error="An object needs reconciliation before this job can continue.";await persist(job);return;}
  if(job.provisioning==='uncertain'){job.status='paused';job.error='Miro did not confirm the new board. Reconcile it before resuming.';await persist(job);return;}
  job.status="running";delete job.error;await persist(job);
  if(job.newBoard&&!job.boardId){
    job.provisioning='uncertain';await persist(job);
    try{if(!client.createBoard)throw new Error('Board creation is unavailable.');const remote=await client.createBoard(job.boardName);if(typeof remote.id!=='string')throw new MiroError('Miro returned no board ID.',true);job.boardId=remote.id;job.provisioning='done';await persist(job);}
    catch(e){job.provisioning=e instanceof MiroError&&!e.ambiguous?'failed':'uncertain';job.status='paused';job.error=(e as Error).message;await persist(job);return;}
  }
  for(const task of job.tasks) {
    if(task.status==="done")continue;
    const payload=structuredClone(task.payload);
    const resolve=(id:string)=>{const other=job.tasks.find(t=>t.sourceId===id||t.sourceNodeId===id);if(!other?.miroId)throw new Error(`Missing destination object for ${id}.`);return other.miroId;};
    try {
      if(task.parentSourceId)payload.parent={id:resolve(task.parentSourceId)};
      if(task.startSourceId)payload.startItem={...payload.startItem,id:resolve(task.startSourceId)};
      if(task.endSourceId)payload.endItem={...payload.endItem,id:resolve(task.endSourceId)};
    }catch(e){task.status="failed";task.error=(e as Error).message;job.status="paused";job.error=task.error;await persist(job);return;}
    // Checkpoint BEFORE the remote write. A crash here requires review, never a blind replay.
    task.status="uncertain";task.error="Write started; Miro confirmation has not been saved.";await persist(job);
    try {
      const result=await client.create(job.boardId,task.endpoint,payload);
      if(typeof result.id!=="string"||!result.id)throw new MiroError("Miro returned no object ID. Check the destination.",true);
      task.miroId=result.id;task.status="done";delete task.error;await persist(job);
    }catch(e){task.status=e instanceof MiroError&&!e.ambiguous?"failed":"uncertain";task.error=(e as Error).message;job.status="paused";job.error=task.error;await persist(job);return;}
  }
  if(client.listItems){
    job.status='verifying';await persist(job);
    try{job.validation=await verifyJob(job,{listItems:client.listItems.bind(client)});job.status=job.validation.state==='passed'?'completed':'review';}
    catch(e){job.validation={state:'review',checked:0,issues:[(e as Error).message],notes:[],checkedAt:new Date().toISOString()};job.status='review';}
  }else{job.status='review';job.validation={state:'review',checked:0,issues:['Destination verification was not available.'],notes:[],checkedAt:new Date().toISOString()};}
  delete job.error;await persist(job);
}
