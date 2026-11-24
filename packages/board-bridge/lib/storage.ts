import { mkdir, readFile, rename, writeFile, readdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
export function dataDir() { return process.env.BRIDGE_DATA_DIR || path.resolve(process.cwd().endsWith("board-bridge") ? process.cwd() : path.join(process.cwd(),"packages/board-bridge"), ".data"); }
async function secret() {
  if (process.env.BRIDGE_SECRET) return createHash("sha256").update(process.env.BRIDGE_SECRET).digest();
  if (process.env.NODE_ENV === "production") throw new Error("Set BRIDGE_SECRET before running production mode.");
  await mkdir(dataDir(),{recursive:true,mode:0o700});
  const file=path.join(dataDir(),"local.key");
  try { await writeFile(file,randomBytes(32),{flag:"wx",mode:0o600}); } catch(e) { if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e; }
  return readFile(file);
}
export async function seal(value:unknown) { const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",await secret(),iv);const b=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),b]).toString("base64url"); }
export async function unseal<T>(value:string):Promise<T> { const b=Buffer.from(value,"base64url");const d=createDecipheriv("aes-256-gcm",await secret(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()); }
export function validId(id:string) { if(!/^[\da-f-]{36}$/i.test(id))throw new Error("Invalid record ID.");return id; }
export async function saveRecord(folder:string,id:string,value:unknown) {
  validId(id);const dir=path.join(dataDir(),folder);await mkdir(dir,{recursive:true,mode:0o700});
  const tmp=path.join(dir,`${id}.${randomUUID()}.tmp`);await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,path.join(dir,`${id}.json`));
}
export async function readRecord<T>(folder:string,id:string):Promise<T|null> { validId(id);try{return JSON.parse(await readFile(path.join(dataDir(),folder,`${id}.json`),"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return null;throw e;} }
export async function listIds(folder:string) { try{return(await readdir(path.join(dataDir(),folder))).filter(s=>/^[\da-f-]{36}\.json$/i.test(s)).map(s=>s.slice(0,-5));}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return[];throw e;} }
export async function workerLock():Promise<()=>Promise<void>> {
  await mkdir(dataDir(),{recursive:true,mode:0o700});const p=path.join(dataDir(),"worker.lock");
  const f=await open(p,"wx",0o600).catch(()=>{throw new Error("Another worker may be running. If it stopped unexpectedly, remove .data/worker.lock before restarting.");});
  await f.writeFile(String(process.pid));return async()=>{await f.close();await unlink(p);};
}
