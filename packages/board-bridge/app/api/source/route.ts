import { owner, sameOrigin, jsonBody, apiError } from "../../../lib/session";
import { normalizeRestFile } from "../../../lib/figjam";
export const runtime="nodejs";
export async function POST(request:Request) { try {
  sameOrigin(request);await owner();const {url}=await jsonBody(request);
  if(typeof url!=="string")throw new Error("Paste a FigJam board link.");
  const u=new URL(url),key=u.pathname.match(/^\/board\/([\w-]+)(?:\/|$)/)?.[1];
  if(u.protocol!=="https:"||!["www.figma.com","figma.com"].includes(u.hostname)||!key)throw new Error("Use a FigJam /board/ URL, not a Figma design file.");
  if(!process.env.FIGMA_ACCESS_TOKEN)throw new Error("Board-link reading needs FIGMA_ACCESS_TOKEN. You can use the export plugin without it.");
  const r=await fetch(`https://api.figma.com/v1/files/${key}`,{headers:{"X-Figma-Token":process.env.FIGMA_ACCESS_TOKEN},signal:AbortSignal.timeout(45000),redirect:"error"});
  if(!r.ok)throw new Error(`Figma returned ${r.status}. Check file access, token scope, and rate limits. The plugin export is an alternative.`);
  const raw=await r.text();if(Buffer.byteLength(raw)>16*1024*1024)throw new Error("Board exceeds this MVP's link-reading size limit. Export a selection with the plugin.");
  return Response.json({board:normalizeRestFile(JSON.parse(raw))});
}catch(e){return apiError(e);} }
