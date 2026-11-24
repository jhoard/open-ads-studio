import { readFile } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
export const runtime="nodejs";
export async function GET() {
  const files:Record<string,Uint8Array>={};for(const name of ["manifest.json","code.js","ui.html"]){files[name]=await readFile(path.join(process.cwd(),"plugin",name));}
  return new Response(new Uint8Array(zipSync(files)),{headers:{"Content-Type":"application/zip","Content-Disposition":'attachment; filename="board-bridge-figjam-plugin.zip"'}});
}
