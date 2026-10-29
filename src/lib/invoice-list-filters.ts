type InvoiceFilterRow={invoice_type:string;status:string;point_of_sale?:string|null;invoice_number:string|null;cliente_nombre:string|null;cliente_rtn:string|null}
export function filterInvoiceList<T extends InvoiceFilterRow>(rows:T[],filters:{types:string[];statuses:string[];offices:string[];search:string}):T[]{
 const search=filters.search.trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es')
 return rows.filter(row=>(!filters.types.length||filters.types.includes(row.invoice_type))&&(!filters.statuses.length||filters.statuses.includes(row.status))&&(!filters.offices.length||filters.offices.includes(row.point_of_sale||''))
  &&(!search||[row.invoice_number,row.cliente_nombre,row.cliente_rtn].some(text=>(text||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es').includes(search))))
}
