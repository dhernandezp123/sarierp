import { parseDateValue } from './format'
import { financialCents } from './finance-report'
export type BankImportMapping={date:number;reference:number;description:number;amount:number;debit:number;credit:number;dateOrder:'DMY'|'YMD';decimal:'.'|',';skip:number;invert:boolean}
export type BankImportLine={date:string;reference:string;description:string;amount:number;currency:string}
export function suggestBankMatch(statement:{id:string;date:string;reference:string;remaining:number}[],cash:{id:string;date:string;reference:string;remaining:number}[]){
 const same=(a:typeof statement[number],b:typeof cash[number])=>a.date===b.date&&financialCents(a.remaining)===financialCents(b.remaining)&&a.reference.trim().toLocaleUpperCase()===b.reference.trim().toLocaleUpperCase()
 for(const line of statement){const candidates=cash.filter(c=>same(line,c));if(candidates.length!==1)continue;const movement=candidates[0];if(statement.filter(s=>same(s,movement)).length===1)return [{side:'statement',id:line.id,amount:line.remaining},{side:'movement',id:movement.id,amount:movement.remaining}]}
 return []
}
export function parseDelimitedTable(input:string):string[][]{
 const text=input.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'),first=text.split('\n',1)[0],delimiter=first.includes('\t')?'\t':first.includes(';')?';':','
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=ch;continue}if(ch==='"'&&!cell&&!closed){quoted=true;continue}if(ch===delimiter||ch==='\n'){row.push(cell);cell='';closed=false;if(ch==='\n'){if(row.some(c=>c.trim()))rows.push(row);row=[];if(rows.length>2001)throw new Error('Importa hasta 2000 movimientos.')}continue}if(closed&&ch.trim())throw new Error('CSV inválido después de comillas.');cell+=ch}
 if(quoted)throw new Error('CSV con comillas sin cerrar.');row.push(cell);if(row.some(c=>c.trim()))rows.push(row)
 return rows
}
export function mapBankImport(table:string[][],mapping:BankImportMapping,currency:string):BankImportLine[]{
 if(!['HNL','USD'].includes(currency)||!Number.isInteger(mapping.skip)||mapping.skip<0||mapping.skip>=table.length)throw new Error('Revisa moneda y filas del encabezado.')
 const rows=table.slice(mapping.skip);if(!rows.length||rows.length>2000)throw new Error('Importa de 1 a 2000 movimientos.')
 function amount(value:string,optional=false){let v=value.trim();if(!v&&optional)return 0;if(!v)throw new Error('Falta el importe.');const negative=/^\(.*\)$/.test(v);v=v.replace(/[()\s]/g,'');const grouping=mapping.decimal==='.'?',':'.';if(v.includes(grouping)&&!new RegExp(`^-?\\d{1,3}(\\${grouping}\\d{3})+(\\${mapping.decimal}\\d{1,2})?$`).test(v))throw new Error('Separadores de importe inválidos.');v=v.split(grouping).join('').replace(mapping.decimal,'.');if(!/^-?\d+(\.\d{1,2})?$/.test(v))throw new Error('Importe inválido; usa hasta dos decimales.');return financialCents(Number(v)*(negative?-1:1))}
 return rows.map((row,index)=>{try{
  const raw=String(row[mapping.date]||'').trim();let date=''
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))date=raw
  else if(/^\d+(\.0+)?$/.test(raw)){const serial=Number(raw);if(serial<61||serial>2958465)throw new Error('Fecha serial de Excel inválida.');date=new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10)}
  else{const parts=raw.split(/[/.\-]/);if(parts.length===3){const[y,m,d]=mapping.dateOrder==='DMY'?[parts[2],parts[1],parts[0]]:parts;date=`${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!parseDateValue(date)||Number(date.slice(0,4))<1000)throw new Error('Fecha inválida.')
  const debit=mapping.amount<0?amount(row[mapping.debit]||'',true):0,credit=mapping.amount<0?amount(row[mapping.credit]||'',true):0
  if(debit&&credit)throw new Error('La fila tiene débito y crédito: separa o revisa el movimiento.')
  const cents=mapping.amount>=0?amount(row[mapping.amount]||''):credit-debit
  if(!cents)throw new Error('El movimiento no tiene importe.');return {date,reference:String(row[mapping.reference]||'').trim().slice(0,200),description:String(row[mapping.description]||'').trim().slice(0,2000),amount:cents*(mapping.invert?-1:1)/100,currency}
 }catch(e){throw new Error(`Fila ${mapping.skip+index+1}: ${e instanceof Error?e.message:'Revisa los datos.'}`)}})
}
