import { html, type BoardNode, type TextRun, type TextLine } from './board';
const number=(s:string|undefined,fallback:number)=>{const n=Number(s);return s!==undefined&&Number.isFinite(n)?n:fallback;};
function attrs(s:string):Record<string,string>{return Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m=>[m[1],m[2]]));}
export function decodeXml(s:string){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v:string)=>{if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):parseInt(v.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[v.toLowerCase()];});}
// Parse only Figma's text/tspan geometry. Never render or execute uploaded SVG.
export function svgTextLines(svg:unknown,fontSize:number):TextLine[]|undefined {
  if(typeof svg!=='string'||svg.length>200000)return;
  const groups:{x:number;baseline:number;fontSize:number;run:TextRun}[]=[];
  for(const text of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)){
    const base=attrs(text[1]);
    for(const span of text[2].matchAll(/<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g)){
      const a={...base,...attrs(span[1])},characters=decodeXml(span[2].replace(/<[^>]*>/g,'')).replace(/[\r\n]/g,'');
      if(!characters.trim())continue;
      const x=number(a.x?.split(/[ ,]/)[0],0),baseline=number(a.y?.split(/[ ,]/)[0],0),size=number(a['font-size'],fontSize);
      const run:TextRun={text:characters,bold:a['font-weight']==='bold'||number(a['font-weight'],400)>=600,color:/^#[\da-f]{6}$/i.test(a.fill||'')?a.fill:undefined};
      groups.push({x,baseline,fontSize:size,run});
    }
  }
  const lines:TextLine[]=[];
  for(const part of groups.sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){
    const last=lines.at(-1);
    if(last&&Math.abs(last.baseline-part.baseline)<.2){last.runs.push(part.run);last.text+=part.run.text;}
    else lines.push({x:part.x,baseline:part.baseline,fontSize:part.fontSize,text:part.run.text,runs:[part.run]});
  }
  return lines.length?lines:undefined;
}
export function richText(n:Pick<BoardNode,'text'|'bold'|'runs'>):string {
  return n.runs?.length?n.runs.map(r=>r.bold?`<strong>${html(r.text)}</strong>`:html(r.text)).join(''):n.bold?`<strong>${html(n.text)}</strong>`:html(n.text);
}
const fonts:Record<string,string>={arial:'arial',roboto:'roboto','open sans':'open_sans',georgia:'georgia','times new roman':'times_new_roman','ibm plex sans':'plex_sans','noto sans':'noto_sans'};
export function miroFont(family?:string){return fonts[(family||'Arial').toLowerCase()]||'roboto';}
export function fontIsMapped(family?:string){return !!family&&!fonts[family.toLowerCase()];}
