import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { readRecord, saveRecord, seal, unseal } from "./storage";
export interface Connection { token:string; expiresAt?:number }
export const appUrl=()=>process.env.BRIDGE_APP_URL||"http://localhost:3001";
export async function owner(create=false) {
  const jar=await cookies(),value=jar.get("bridge_session")?.value;
  if(value)try{const s=await unseal<{id:string;expires:number}>(value);if(s.expires>Date.now())return s.id;}catch{}
  if(!create)throw new Error("Session expired. Refresh this page.");
  const id=randomUUID();jar.set("bridge_session",await seal({id,expires:Date.now()+7*86400000}),{httpOnly:true,sameSite:"lax",secure:appUrl().startsWith("https:"),path:"/",maxAge:7*86400});return id;
}
export async function saveConnection(id:string,c:Connection) { await saveRecord("connections",id,{sealed:await seal(c)}); }
export async function connection(id:string):Promise<Connection|null> {
  const record=await readRecord<{sealed:string}>("connections",id);
  if(record){const c=await unseal<Connection>(record.sealed);if(!c.expiresAt||c.expiresAt>Date.now())return c;}
  // A personal token is for loopback-only development, never a shared hosted service.
  if(process.env.MIRO_ACCESS_TOKEN&&["localhost","127.0.0.1"].includes(new URL(appUrl()).hostname))return {token:process.env.MIRO_ACCESS_TOKEN};
  return null;
}
export function sameOrigin(request:Request) {
  if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(appUrl()).origin)throw new Error("Request origin does not match BRIDGE_APP_URL.");
  if(request.headers.get("sec-fetch-site")==="cross-site")throw new Error("Cross-site request refused.");
}
export async function jsonBody(request:Request) {
  if(Number(request.headers.get("content-length")||0)>32*1024*1024)throw new Error("Export exceeds the 32 MB limit.");
  const text=await request.text();if(Buffer.byteLength(text)>32*1024*1024)throw new Error("Export exceeds the 32 MB limit.");return JSON.parse(text);
}
export const apiError=(e:unknown,status=400)=>Response.json({error:e instanceof Error?e.message:"Request failed."},{status});
