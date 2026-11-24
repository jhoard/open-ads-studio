import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { seal, unseal, saveRecord, readRecord, validId, workerLock } from "./storage";
test("encrypted records reject tampering, writes persist, and only one worker owns the queue",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"bridge-test-"));const before=process.env.BRIDGE_DATA_DIR;process.env.BRIDGE_DATA_DIR=dir;
  try{const token=await seal({token:"secret-value"});assert.ok(!token.includes("secret-value"));assert.deepEqual(await unseal(token),{token:"secret-value"});
    const bytes=Buffer.from(token,"base64url");bytes[bytes.length-1]^=1;await assert.rejects(()=>unseal(bytes.toString("base64url")));
    const id=randomUUID();await saveRecord("jobs",id,{status:"done"});assert.deepEqual(await readRecord("jobs",id),{status:"done"});assert.throws(()=>validId("../../credentials"));
    const unlock=await workerLock();await assert.rejects(()=>workerLock(),/Another worker/);await unlock();
  }finally{process.env.BRIDGE_DATA_DIR=before;await rm(dir,{recursive:true,force:true});}
});
