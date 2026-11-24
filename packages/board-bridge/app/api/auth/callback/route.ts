import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { unseal } from "../../../../lib/storage";
import { appUrl, owner, saveConnection } from "../../../../lib/session";
export const runtime="nodejs";
export async function GET(request:Request) {try {
  const u=new URL(request.url),jar=await cookies(),encrypted=jar.get("bridge_oauth")?.value;jar.delete("bridge_oauth");
  if(!encrypted||!u.searchParams.get("code")||!u.searchParams.get("state"))throw new Error("Authorization was not completed.");
  const saved=await unseal<{id:string;state:string;expires:number}>(encrypted),state=u.searchParams.get("state")!;
  if(saved.expires<Date.now()||saved.id!==await owner()||Buffer.byteLength(state)!==Buffer.byteLength(saved.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(saved.state)))throw new Error("Authorization state expired or did not match. Try connecting again.");
  const r=await fetch("https://api.miro.com/v1/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:process.env.MIRO_CLIENT_ID!,client_secret:process.env.MIRO_CLIENT_SECRET!,code:u.searchParams.get("code")!,redirect_uri:`${appUrl()}/api/auth/callback`}),signal:AbortSignal.timeout(20000),redirect:"error"});
  if(!r.ok)throw new Error("Miro rejected the connection. Check the app credentials and redirect URI.");
  const token=await r.json();if(!token.access_token)throw new Error("Miro returned no access token.");
  await saveConnection(saved.id,{token:token.access_token,expiresAt:token.expires_in?Date.now()+token.expires_in*1000:undefined});
  return Response.redirect(`${appUrl()}/?connected=1`);
}catch(e){return Response.redirect(`${appUrl()}/?error=${encodeURIComponent((e as Error).message)}`);} }
