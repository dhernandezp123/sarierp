import { FiscalDocumentLayout,type FiscalLayoutData } from './FiscalDocumentLayout'
import { formatMoney } from '@/src/lib/format'
import type { PurchaseFiscalDocument } from '@/src/lib/purchase-documents'
export function PurchaseFiscalPdf({data,logo}:{data:PurchaseFiscalDocument;logo?:string|null}){
 const retained=!data.document_type,issuer=data.issuer_snapshot,fiscal=data.fiscal_snapshot,discounts=Number(data.discount_amount||0)
 const layout:FiscalLayoutData={
  title:retained?'COMPROBANTE DE RETENCIÓN':data.document_type==='Factura de proveedor'?'REGISTRO DE COMPRA':'BOLETA DE COMPRA',
  number:data.document_number,status:data.status,issue_date:data.issue_date,due_date:data.due_date,
  cancellation:{reason:data.cancellation_reason,date:data.cancelled_at},
  issuer:issuer||{legal_name:'Registro de compra'},party_label:retained?'SUJETO RETENIDO':'PROVEEDOR',
  party:{name:data.supplier_snapshot.name,identity:data.supplier_snapshot.rtn,address:data.supplier_snapshot.address,phone:data.supplier_snapshot.phone,email:data.supplier_snapshot.email},
  currency:data.currency,retention:retained,lines:data.items.map(item=>'base' in item?{description:item.description,unit_price:Number(item.base),tax:item.rate+'%',amount:Number(item.amount)}:{description:item.description,quantity:Number(item.quantity),unit_price:Number(item.unit_price),discount:Number(item.discount_amount||0),tax:item.tax_rate?item.tax_rate+'%':'Sin ISV',amount:Number(item.amount)+Number(item.tax)}),
  totals:retained?[]:[{label:'Subtotal antes de descuentos',value:Number(data.subtotal)+discounts},{label:'Descuentos y rebajas',value:discounts},{label:'ISV',value:Number(data.tax_amount)}],
  total:Math.round(Number(data.total)*Number(data.exchange_rate)*100)/100,total_currency:'HNL',total_label:retained?'TOTAL RETENIDO':'TOTAL',
  original_amount:data.currency==='USD'?'Importe original: '+formatMoney(Number(data.total),'USD')+' · T/C HNL por USD: '+data.exchange_rate:null,
  reference:retained&&data.source_document_snapshot?{number:data.source_document_snapshot.number,cai:data.source_document_snapshot.cai,issue_date:data.source_document_snapshot.issue_date}:null,
  fiscal:fiscal?{cai:fiscal.cai,from:fiscal.rango_desde,to:fiscal.rango_hasta,deadline:fiscal.fecha_limite_emision,office:fiscal.point_of_sale}:null,
  notes:data.notes,signature:data.document_type==='Boleta de Compra'||retained,
 }
 return FiscalDocumentLayout({data:layout,logo})
}
