import { inflateRawSync } from 'node:zlib'
import { parseDelimitedTable } from '@/src/lib/bank-import'
import { crc32 } from '@/src/lib/xlsx'
const LIMIT=24*1024*1024
function decodeXml(text:string){return text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,code:string)=>{const value=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);return value>0&&value<=0x10ffff?String.fromCodePoint(value):''}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}
function unzip(data:Buffer){
 let end=-1;for(let at=data.length-22;at>=Math.max(0,data.length-65557);at--)if(data.readUInt32LE(at)===0x06054b50){end=at;break}
 if(end<0)throw new Error('El archivo no es un XLSX válido.')
 const count=data.readUInt16LE(end+10),start=data.readUInt32LE(end+16),files=new Map<string,string>();let pos=start,total=0
 if(count>100||count===0||data.readUInt16LE(end+4)!==0||data.readUInt16LE(end+6)!==0)throw new Error('Paquete XLSX no admitido.')
 for(let i=0;i<count;i++){
  if(pos+46>data.length||data.readUInt32LE(pos)!==0x02014b50)throw new Error('Directorio ZIP inválido.')
  const flags=data.readUInt16LE(pos+8),method=data.readUInt16LE(pos+10),size=data.readUInt32LE(pos+20),expanded=data.readUInt32LE(pos+24),n=data.readUInt16LE(pos+28),extra=data.readUInt16LE(pos+30),comment=data.readUInt16LE(pos+32),local=data.readUInt32LE(pos+42)
  const path=data.subarray(pos+46,pos+46+n).toString('utf8');pos+=46+n+extra+comment;total+=expanded
  if(total>LIMIT||flags&1||![0,8].includes(method)||local+30>data.length||/\.\.|vbaProject|externalLinks|embeddings|connections\.xml/i.test(path)||files.has(path))throw new Error('El XLSX tiene contenido o tamaño no admitido.')
  if(data.readUInt32LE(local)!==0x04034b50)throw new Error('Entrada ZIP inválida.')
  const begin=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28)
  if(begin+size>data.length)throw new Error('Entrada ZIP incompleta.')
  const compressed=data.subarray(begin,begin+size),bytes=method===0?compressed:inflateRawSync(compressed,{maxOutputLength:Math.min(LIMIT,expanded+1)})
  if(bytes.length!==expanded||crc32(bytes)!==data.readUInt32LE(pos-46-n-extra-comment+16))throw new Error('Tamaño o integridad ZIP inválida.')
  files.set(path,bytes.toString('utf8'))
 }
 return files
}
export function readBankTable(data:Buffer,extension:string):{name:string;rows:string[][]}[]{
 if(extension==='csv'){let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data)}catch{text=new TextDecoder('windows-1252').decode(data)}return [{name:'CSV',rows:parseDelimitedTable(text)}]}
 if(extension!=='xlsx')throw new Error('Selecciona CSV o XLSX.')
 const files=unzip(data),shared=(files.get('xl/sharedStrings.xml')||'').match(/<si[\s>][\s\S]*?<\/si>/g)?.map(si=>[...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>decodeXml(m[1])).join(''))||[]
 const sheets:{name:string;rows:string[][]}[]=[]
 for(const[path,xml]of files){if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path))continue
  if(/<f(?:\s|>)/.test(xml))throw new Error('El extracto contiene fórmulas. Exporta sus valores como CSV o XLSX sin fórmulas.')
  const rows:string[][]=[]
  for(const match of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)){
   const row:string[]=[]
   for(const cell of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const ref=/\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];if(!ref)throw new Error('Celda sin referencia.')
    const index=[...ref].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;if(index>100)throw new Error('El extracto tiene demasiadas columnas.')
    const body=cell[2]||'',value=/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]||''
    row[index]=/\bt="s"/.test(cell[1])?shared[Number(value)]||'':/\bt="inlineStr"/.test(cell[1])?[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m=>decodeXml(m[1])).join(''):decodeXml(value)
   }
   if(row.some(c=>c.trim()))rows.push(row.map(c=>c||''))
   if(rows.length>2001)throw new Error('Importa hasta 2000 movimientos más encabezado.')
  }
  sheets.push({name:path.split('/').pop()!.replace('.xml',''),rows})
 }
 if(!sheets.length)throw new Error('No se encontraron hojas en el XLSX.')
 return sheets
}
