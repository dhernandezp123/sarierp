export type InvoiceCourtesy = {
 id:string;draft_id:string;draft_revision:number;line_key:string;source_pricing_item_id:string|null
 status:'Pendiente'|'Aprobada'|'Rechazada'|'Revocada'|'Aplicada';reason:string;requested_by:string;requester_name:string;requested_at:string
 reviewed_by:string|null;review_reason:string|null;is_current:boolean;approval_effective:boolean;draft_status:string;client_name:string
 line_snapshot:{description:string;quantity:number;unit_price:number;currency:string;net_amount?:number;tax_amount?:number;total?:number;discount_amount?:number;isv_rate?:number}
}
export function courtesyAmount(row:InvoiceCourtesy){return Number(row.line_snapshot.total??Number(row.line_snapshot.quantity)*Number(row.line_snapshot.unit_price))}
export function courtesyLineKey(item:{id:string;source_pricing_item_id?:string}){return item.source_pricing_item_id||item.id}
export function courtesyExclusions(rows:InvoiceCourtesy[],revision:number,dirty=false){
 return new Set(dirty?[]:rows.filter(r=>r.draft_revision===revision&&r.is_current&&r.approval_effective&&r.status==='Aprobada').map(r=>r.line_key))
}
export function courtesyStatus(row:InvoiceCourtesy){
 if(row.status==='Aplicada')return 'Aplicada'
 if(!row.is_current)return 'Desactualizada'
 if(row.status==='Aprobada'&&!row.approval_effective)return 'Requiere nueva autorización'
 return row.status
}
