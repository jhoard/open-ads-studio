"use client";
import { useState } from "react";
import type { summary } from "../lib/jobs";
export type JobSummary=ReturnType<typeof summary>;
export function download(value:unknown,name:string){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
export function JobPanel({job,refresh}:{job:JobSummary;refresh:()=>void}){
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[existing,setExisting]=useState("");
  const boardUncertain=job.status==="paused"&&job.provisioning==="uncertain";
  const uncertain=job.status==="paused"?job.tasks.find(t=>t.status==="uncertain"):undefined;
  async function action(payload:unknown){setBusy(true);setError("");try{const r=await fetch(`/api/jobs/${job.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw Error(data.error);refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="job-panel" aria-labelledby="migration-heading"><div className="section-heading"><h2 id="migration-heading">Migration progress</h2><span className={`status ${job.status}`}>{job.status}</span></div>
    <p>{job.name} <span className="muted">→ {job.destination}</span></p><progress value={job.done} max={job.total} aria-label="Objects transferred"/><div className="progress-meta"><span>{job.done} of {job.total} objects confirmed</span><button className="text-button" onClick={()=>download(job,`migration-${job.id}.json`)}>Download report ↓</button></div>
    {job.status==="queued"&&<p className="notice">Your migration is queued. You can close this tab and return to check its progress.</p>}
    {job.error&&<p className="notice" role="status">{job.error}</p>}
    {uncertain&&<div className="reconcile"><h3>Check one unconfirmed object</h3><p>Open Miro and find source object {uncertain.sourceId}. Completed objects will stay in place.</p><label htmlFor="existing">If it exists, paste its Miro object ID</label><div className="input-row"><input id="existing" value={existing} onChange={e=>setExisting(e.target.value)} placeholder="Numeric object ID"/><button disabled={!existing||busy} onClick={()=>action({action:"resolve",sourceId:uncertain.sourceId,miroId:existing})}>Use existing</button></div><button className="secondary" disabled={busy} onClick={()=>action({action:"resolve",sourceId:uncertain.sourceId,confirmNotCreated:true})}>I checked Miro: this object was not created</button></div>}
    {job.status==="paused"&&!uncertain&&!boardUncertain&&<button disabled={busy} onClick={()=>action({action:"resume"})}>Resume remaining objects →</button>}
    {error&&<p role="alert" className="error">{error}</p>}
    {boardUncertain&&<div className="reconcile"><h3>Check whether Miro created your board</h3><p>The board creation response was interrupted. Find the new board in Miro before retrying, to avoid creating a duplicate.</p><label htmlFor="existing-board">If it exists, paste its board URL</label><div className="input-row"><input id="existing-board" value={existing} onChange={e=>setExisting(e.target.value)}/><button disabled={!existing||busy} onClick={()=>action({action:"resolveBoard",destination:existing})}>Use this board</button></div><button className="secondary" disabled={busy} onClick={()=>action({action:"resolveBoard",confirmNotCreated:true})}>I checked: no board was created</button></div>}
    {job.status==="verifying"&&<p className="notice">Checking that Miro saved the objects, images, frame positions, and attached connectors…</p>}
    {job.validation&&<div className="validation"><h3>{job.status==="completed"?"Destination checks passed":"Destination needs review"}</h3><p>{job.validation.checked} native objects checked from {job.sourceObjects} source objects.</p>{!!job.validation.issues.length&&<ul>{job.validation.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}{!!job.validation.notes.length&&<details><summary>Compatibility and visual review notes</summary><ul>{job.validation.notes.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}{job.status==="review"&&<button className="secondary" disabled={busy} onClick={()=>action({action:"verify"})}>Recheck destination</button>}</div>}
    {["completed","review"].includes(job.status)&&job.miroUrl&&<a className="button" target="_blank" rel="noopener noreferrer" href={job.miroUrl}>Open your Miro board ↗</a>}
  </section>;
}
