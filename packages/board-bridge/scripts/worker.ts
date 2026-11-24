import { config } from "dotenv";
import path from "node:path";
const app=process.cwd().endsWith("board-bridge")?process.cwd():path.resolve("packages/board-bridge");
config({path:[path.join(app,".env.local"),path.join(app,".env")],quiet:true});
const {workerLock,listIds}=await import("../lib/storage");
const {getJob,runJob,saveJob}=await import("../lib/jobs");
const {connection}=await import("../lib/session");
const {MiroClient}=await import("../lib/miro");
const unlock=await workerLock();let stop=false;process.on("SIGINT",()=>{stop=true;});process.on("SIGTERM",()=>{stop=true;});
console.log("Board Bridge worker ready. Watching the local job queue.");
try{while(!stop){for(const id of await listIds("jobs")){
  if(stop)break;const job=await getJob(id);if(!["queued","running","verifying"].includes(job.status))continue;
  const c=await connection(job.owner);
  if(!c?.token){job.status="paused";job.error="Miro connection expired. Reconnect, then resume.";await saveJob(job);continue;}
  console.log(`Processing ${id}: ${job.tasks.length} objects`);await runJob(job,new MiroClient(c.token));console.log(`${id}: ${job.status}`);
}if(!stop)await new Promise(r=>setTimeout(r,1000));}}finally{await unlock();}
