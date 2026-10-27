export type AccountKind='Activo'|'Pasivo'|'Patrimonio'|'Ingreso'|'Gasto'
export type AccountingAccount={id:string;code:string;name:string;kind:AccountKind;parent_id:string|null;postable:boolean;active:boolean}
export type AccountingPeriod={id:string;starts_on:string;ends_on:string;closed:boolean}
export type JournalEntry={id:string;entry_number:number;entry_date:string;description:string;source_type:string;source_id:string|null;reversed_by_id:string|null;reverses_id:string|null;source_currency:string;exchange_rate:number}
export const accountKinds:AccountKind[]=['Activo','Pasivo','Patrimonio','Ingreso','Gasto']
export const accountingPurposes=[
  ['receivable','Cuentas por cobrar','Activo'],['payable','Cuentas por pagar','Pasivo'],['cash','Caja / banco por defecto','Activo'],
  ['customer_advances','Anticipos de clientes','Pasivo'],['sales','Ingresos por defecto','Ingreso'],['purchases','Gastos por defecto','Gasto'],
  ['sales_tax','ISV por pagar','Pasivo'],['purchase_tax','ISV crédito fiscal','Activo'],['exchange_gain','Ganancia cambiaria','Ingreso'],['exchange_loss','Pérdida cambiaria','Gasto'],
  ['withholding_payable','Retenciones por pagar','Pasivo'],
] as const

export type ImportedAccount={code:string;name:string;kind:AccountKind;parent_code:string;postable:boolean;active:boolean}
export function parseAccountCsv(text:string):ImportedAccount[] {
  const input=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'),delimiter=input.slice(0,input.indexOf('\n')<0?undefined:input.indexOf('\n')).includes(';')?';':','
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false
  for(let i=0;i<input.length;i++) {
    const char=input[i]
    if(quoted){if(char==='"'){if(input[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;continue}
    if(char==='"'&&!cell&&!closed){quoted=true;continue}
    if(char===delimiter||char==='\n'){row.push(cell.trim());cell='';closed=false;if(char==='\n'){if(row.some(Boolean))rows.push(row);row=[]}continue}
    if(closed&&char.trim())throw new Error('CSV inválido después de comillas.')
    cell+=char
  }
  if(quoted)throw new Error('CSV con comillas sin cerrar.')
  row.push(cell.trim());if(row.some(Boolean))rows.push(row)
  const header=rows.shift()?.map(h=>h.toLowerCase())
  if(!header||header.join(',')!=='codigo,nombre,tipo,padre,movimiento')throw new Error('Usa las columnas: codigo,nombre,tipo,padre,movimiento.')
  if(!rows.length||rows.length>1000)throw new Error('Importa entre 1 y 1000 cuentas por archivo.')
  const seen=new Set<string>()
  return rows.map((r,index)=>{
    if(r.length!==5||!/^[A-Za-z0-9][A-Za-z0-9.\-]{0,39}$/.test(r[0])||!r[1]||r[1].length>160||!accountKinds.includes(r[2] as AccountKind)||!['si','sí','no'].includes(r[4].toLowerCase()))throw new Error(`Revisa la fila ${index+2}: código, nombre, tipo y movimiento Sí/No.`)
    if(seen.has(r[0]))throw new Error(`Código duplicado: ${r[0]}`)
    seen.add(r[0]);return{code:r[0],name:r[1],kind:r[2] as AccountKind,parent_code:r[3],postable:r[4].toLowerCase()!=='no',active:true}
  })
}
export function validateJournalLines(lines:{account_id:string;debit:number;credit:number}[]) {
  if(lines.length<2||lines.length>500)return 'El asiento requiere entre 2 y 500 líneas.'
  let debit=0,credit=0
  for(const line of lines){
    if(!line.account_id||![line.debit,line.credit].every(n=>Number.isFinite(n)&&n>=0&&Math.abs(n*100-Math.round(n*100))<0.000001)||(line.debit>0)===(line.credit>0))return 'Cada línea requiere una cuenta y solo débito o crédito positivo, con dos decimales.'
    debit+=Math.round(line.debit*100);credit+=Math.round(line.credit*100)
  }
  return debit===credit&&debit>0?null:'El debe y el haber deben ser iguales.'
}
