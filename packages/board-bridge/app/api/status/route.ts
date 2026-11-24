import { owner, connection, apiError } from "../../../lib/session";
import { listIds, readRecord } from "../../../lib/storage";
import { type Job, summary } from "../../../lib/jobs";
export const runtime="nodejs";
export async function GET() { try {
  const id=await owner(true),c=await connection(id);const jobs=[];
  for(const key of await listIds("jobs")){const j=await readRecord<Job>("jobs",key);if(j?.owner===id)jobs.push(summary(j));}
  return Response.json({connected:!!c?.token,oauthConfigured:!!(process.env.MIRO_CLIENT_ID&&process.env.MIRO_CLIENT_SECRET),figmaConfigured:!!process.env.FIGMA_ACCESS_TOKEN,jobs:jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30)},{headers:{"Cache-Control":"no-store"}});
}catch(e){return apiError(e);} }
