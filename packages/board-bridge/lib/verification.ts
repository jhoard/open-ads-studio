import type { Job } from './jobs';
import type { MiroClient } from './miro';
export interface Validation { state:'passed'|'review'; checked:number; issues:string[]; notes:string[]; checkedAt:string }
export async function verifyJob(job:Job,client:Pick<MiroClient,'listItems'>):Promise<Validation>{
  const items=await client.listItems(job.boardId),connectors=job.tasks.some(t=>t.kind==='connector')?await client.listItems(job.boardId,true):[];
  const actual=new Map([...items,...connectors].map(i=>[i.id,i])),issues:string[]=[];
  const lookup=(source:string)=>job.tasks.find(t=>t.sourceId===source||t.sourceNodeId===source)?.miroId;
  for(const task of job.tasks){
    const item=actual.get(task.miroId);if(!item){issues.push(`Missing destination object for ${task.sourceId}.`);continue;}
    if(task.parentSourceId&&item.parent?.id!==lookup(task.parentSourceId))issues.push(`Parent mismatch for ${task.sourceId}.`);
    if(task.kind==='connector'){
      if(item.startItem?.id!==lookup(task.startSourceId!)||item.endItem?.id!==lookup(task.endSourceId!))issues.push(`Detached connector ${task.sourceId}.`);
      continue;
    }
    const expected=task.payload.position;
    if(!item.position||Math.abs(item.position.x-expected.x)>2||Math.abs(item.position.y-expected.y)>2)issues.push(`Position mismatch for ${task.sourceId}.`);
    const geometry=task.payload.geometry;
    if(item.geometry?.width!==undefined&&Math.abs(item.geometry.width-geometry.width)>2)issues.push(`Width mismatch for ${task.sourceId}.`);
    if(task.kind!=='text'&&task.kind!=='sticky'&&(task.expectedHeight||geometry.height)&&item.geometry?.height!==undefined&&Math.abs(item.geometry.height-(task.expectedHeight||geometry.height))>2)issues.push(`Height mismatch for ${task.sourceId}.`);
    if(task.kind==='image'&&!item.data?.imageUrl)issues.push(`Image resource missing for ${task.sourceId}.`);
  }
  const notes=job.board.warnings.map(w=>w.message);
  // REST does not expose painted text heights. Say so instead of claiming a visual match.
  if(job.tasks.some(t=>t.kind==='text'))notes.push('Text baselines follow the exported source lines. Miro REST cannot verify painted text height; font substitutions need visual review.');
  return {state:issues.length||job.board.warnings.some(w=>w.severity==='skipped')?'review':'passed',checked:job.tasks.length,issues,notes,checkedAt:new Date().toISOString()};
}
