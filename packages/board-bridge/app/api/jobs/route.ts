import { owner, sameOrigin, connection, jsonBody, apiError } from "../../../lib/session";
import { validateBoard, boardId } from "../../../lib/board";
import { MiroClient } from "../../../lib/miro";
import { makeJob, saveJob, summary, unfinishedJob } from "../../../lib/jobs";
export const runtime="nodejs";
export async function POST(request:Request) { try {
  sameOrigin(request);const id=await owner(),c=await connection(id);if(!c?.token)throw new Error("Connect Miro before starting a migration.");
  const body=await jsonBody(request),board=validateBoard(body.board),target=body.destinationMode==="new"?"new":boardId(body.destination);
  const existing=await unfinishedJob(id,board,target);
  if(existing)return Response.json({job:summary(existing)});
  const client=new MiroClient(c.token);
  let name=board.name;
  if(target!=="new"){
    const remote=await client.board(target),items=await client.request(`boards/${encodeURIComponent(target)}/items?limit=10`);
    if(!Array.isArray(items.data)||items.data.length||items.total>0)throw new Error("Choose a new board or an empty destination. Existing content would overlap this migration.");
    name=remote.name||"Miro board";
  }
  const job=makeJob(id,board,target==="new"?"":target,name,target==="new");await saveJob(job);return Response.json({job:summary(job)},{status:201});
}catch(e){return apiError(e);} }
