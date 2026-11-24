import { owner, sameOrigin, jsonBody, apiError } from "../../../lib/session";
import { validateBoard } from "../../../lib/board";
import { normalizeFigJam } from "../../../lib/figjam";
import { planBoard } from "../../../lib/miro-plan";
export const runtime="nodejs";
export async function POST(request:Request) { try {
  sameOrigin(request);await owner();const raw=await jsonBody(request);
  const board=raw.format==="figjam-plugin"&&raw.version===1?normalizeFigJam(raw.nodes,String(raw.name||"FigJam board")):validateBoard(raw);
  return Response.json({board,counts:board.nodes.reduce((a,n)=>({...a,[n.kind]:(a[n.kind]||0)+1}),{} as Record<string,number>),requests:planBoard(board).length});
}catch(e){return apiError(e);} }
