import { randomUUID } from "node:crypto";
export class MiroError extends Error { constructor(message:string,public ambiguous:boolean,public status?:number){super(message);} }
export class MiroClient {
  constructor(private token:string,private transport:typeof fetch=fetch,private wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))) {}
  async request(path:string,method="GET",payload?:unknown):Promise<Record<string,any>> {
    for(let attempt=0;attempt<5;attempt++) {
      let response:Response;
      try { response=await this.transport(`https://api.miro.com/v2/${path}`,{method,headers:{Authorization:`Bearer ${this.token}`,...(payload instanceof Blob?{"Content-Type":payload.type}:payload instanceof FormData?{}:{"Content-Type":"application/json"})},body:payload instanceof FormData||payload instanceof Blob?payload:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000),redirect:"error"}); }
      catch { throw new MiroError("Miro did not confirm the request. Check the board before retrying this object.",method!=="GET"); }
      // A 429 explicitly rejected the request; it is safe to retry, unlike a lost POST response.
      if(response.status===429&&attempt<4) { const seconds=Number(response.headers.get("retry-after"));await this.wait(Number.isFinite(seconds)&&seconds>0?Math.min(seconds*1000,60000):Math.min(1000*2**attempt,16000));continue; }
      if(!response.ok) {
        let detail="";
        if(response.status===400)try{const body=await response.json();if(typeof body.message==="string")detail=` ${body.message.slice(0,300)}${body.context?" "+JSON.stringify(body.context).slice(0,1000):""}`;}catch{}
        throw new MiroError(`Miro returned ${response.status}.${detail} ${response.status===401?"Reconnect your Miro account.":response.status===403?"Check your board permissions and app scopes.":"The migration paused; completed objects are saved."}`,method!=="GET"&&response.status>=500,response.status);
      }
      try { return await response.json(); } catch { throw new MiroError("Miro returned an unreadable response. Check the board before retrying.",method!=="GET"); }
    }
    throw new MiroError("Miro rate limit. Wait before resuming.",false,429);
  }
  board(id:string) { return this.request(`boards/${encodeURIComponent(id)}`); }
  create(id:string,endpoint:string,payload:Record<string,any>) {
    if(endpoint==='images'&&payload.asset){
      const {asset,data,...layout}=payload,boundary=`bridge-${randomUUID()}`;
      // Miro requires a JSON form field with application/json, not a file part.
      // Native FormData assigns a filename to a JSON Blob, so construct this small
      // multipart envelope explicitly while retaining the binary image bytes.
      const body=new Blob([
        `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\nContent-Type: application/json\r\n\r\n`,
        JSON.stringify({...layout,title:data.title}),
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="resource"; filename="image.${asset.mimeType==='image/png'?'png':'jpg'}"\r\nContent-Type: ${asset.mimeType}\r\n\r\n`,
        Buffer.from(asset.base64,'base64'),`\r\n--${boundary}--\r\n`,
      ],{type:`multipart/form-data; boundary=${boundary}`});
      return this.request(`boards/${encodeURIComponent(id)}/images`,'POST',body);
    }
    return this.request(`boards/${encodeURIComponent(id)}/${endpoint}`,'POST',payload);
  }
  createBoard(name:string){return this.request('boards','POST',{name});}
  async listItems(id:string,connectors=false){
    const all:Record<string,any>[]=[],seen=new Set<string>();let cursor:string|undefined;
    do{const result=await this.request(`boards/${encodeURIComponent(id)}/${connectors?'connectors':'items'}?limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);if(!Array.isArray(result.data))throw new Error('Miro returned an invalid inventory.');all.push(...result.data);cursor=result.cursor;if(cursor){if(seen.has(cursor)||all.length>15000)throw new Error('Miro inventory pagination did not finish.');seen.add(cursor);}}while(cursor);
    return all;
  }
  item(board:string,id:string,connector=false) { if(!/^\d+$/.test(id))throw new Error("Use the numeric Miro object ID.");return this.request(`boards/${encodeURIComponent(board)}/${connector?"connectors":"items"}/${id}`); }
}
