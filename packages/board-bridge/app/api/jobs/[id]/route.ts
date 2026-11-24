import { owner, sameOrigin, jsonBody, connection, apiError } from "../../../../lib/session";
import { getJob, saveJob, summary, refreshPendingPlans } from "../../../../lib/jobs";
import { boardId } from "../../../../lib/board";
import { MiroClient } from "../../../../lib/miro";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(_r:Request,ctx:Context) { try { const {id}=await ctx.params;return Response.json({job:summary(await getJob(id,await owner()))},{headers:{"Cache-Control":"no-store"}}); }catch(e){return apiError(e,404);} }
export async function POST(request:Request,ctx:Context) { try {
  sameOrigin(request);const {id}=await ctx.params,who=await owner(),j=await getJob(id,who),body=await jsonBody(request);
  if(body.action==='verify'){
    if(j.status!=='review')throw new Error('Only migrations awaiting review can be rechecked.');
    j.status='verifying';await saveJob(j);return Response.json({job:summary(j)});
  }
  if(j.status!=="paused")throw new Error("Only paused migrations can be resumed or reconciled.");
  if(body.action==='resolveBoard'){
    if(j.provisioning!=='uncertain')throw new Error('No unconfirmed board creation.');
    if(body.destination){const target=boardId(body.destination),c=await connection(who);if(!c)throw new Error('Reconnect Miro.');const board=await new MiroClient(c.token).board(target);j.boardId=target;j.boardName=board.name;j.provisioning='done';}
    else if(body.confirmNotCreated===true)j.provisioning='pending';else throw new Error('Provide the board URL or confirm it was not created.');
  }else if(body.action==="resolve") {
    const task=j.tasks.find(t=>t.sourceId===body.sourceId&&t.status==="uncertain");if(!task)throw new Error("No unresolved object with that source ID.");
    if(body.miroId) {
      if(j.tasks.some(t=>t.miroId===body.miroId))throw new Error("That destination ID already belongs to another source object.");
      const c=await connection(who);if(!c?.token)throw new Error("Reconnect Miro.");
      const item=await new MiroClient(c.token).item(j.boardId,String(body.miroId),task.kind==="connector");
      const expected={sticky:"sticky_note",text:"text",shape:"shape",frame:"frame",connector:"connector",image:"image"}[task.kind];
      if(item.type!==expected)throw new Error(`Select a ${expected} object to match this source object.`);
      task.miroId=String(item.id);task.status="done";
    }else if(body.confirmNotCreated===true){task.status="pending";}else throw new Error("Provide an existing object ID or explicitly confirm it was not created.");
    delete task.error;
  }else if(body.action!=="resume")throw new Error("Unknown action.");
  if(j.tasks.some(t=>t.status==="uncertain"))throw new Error("Resolve the unconfirmed object before resuming.");
  if(j.provisioning==='uncertain')throw new Error('Resolve the unconfirmed board before resuming.');
  refreshPendingPlans(j);
  j.status="queued";delete j.error;await saveJob(j);return Response.json({job:summary(j)});
}catch(e){return apiError(e);} }
