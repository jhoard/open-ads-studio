import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { appUrl, owner, apiError } from "../../../../lib/session";
import { seal } from "../../../../lib/storage";
export const runtime="nodejs";
export async function GET() {try {
  if(!process.env.MIRO_CLIENT_ID||!process.env.MIRO_CLIENT_SECRET)return Response.redirect(`${appUrl()}/?error=${encodeURIComponent("Miro connections are temporarily unavailable. Your board preview is still available.")}`);
  const id=await owner(true),state=randomBytes(24).toString("hex"),jar=await cookies();
  jar.set("bridge_oauth",await seal({id,state,expires:Date.now()+600000}),{httpOnly:true,sameSite:"lax",secure:appUrl().startsWith("https:"),maxAge:600,path:"/"});
  const u=new URL("https://miro.com/oauth/authorize");u.search=new URLSearchParams({response_type:"code",client_id:process.env.MIRO_CLIENT_ID,redirect_uri:`${appUrl()}/api/auth/callback`,state}).toString();return Response.redirect(u);
}catch(e){return apiError(e);} }
