import { FiscalDocumentLayout, type FiscalLayoutData } from './FiscalDocumentLayout'
import { formatMoney } from '@/src/lib/format'
export type InvoicePdfItem = {
  discount_amount?: number
  description: string
  quantity: number
  unit_price: number
  amount: number
  isv_rate: 0 | 15 | 18
  tax_treatment?: 'Gravada' | 'Exenta' | 'Exonerada'
}

export type InvoicePdfData = {
  discount_amount?: number
  parent_fiscal_snapshot?: { invoice_number?: string | null; cai?: string | null; issue_date?: string | null } | null
  // Document
  invoice_number: string
  invoice_type: 'Factura' | 'Proforma' | 'Nota de Crédito' | 'Nota de Débito'
  status: string
  issue_date: string
  due_date: string | null
  reference_equivalence?: { currency: string; rate: number; operation: 'multiply' | 'divide'; amount: number } | null
  payment_method?: string | null
  payment_condition: string | null
  credit_days: number | null
  currency: string
  exchange_rate: number
  notes: string | null

  // Client
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_direccion: string | null
  cliente_email: string | null

  // Items
  items: InvoicePdfItem[]

  // Totals
  subtotal: number
  tax_amount: number
  total: number
  total_lps: number | null
  importe_exento: number
  importe_exonerado: number
  isv_15_amount: number
  isv_18_amount: number
  gravado_15: number
  gravado_18: number

  // Exonerado
  es_exonerado: boolean
  orden_compra_exenta: string | null
  no_constancia_exonerado: string | null
  no_registro_sag: string | null

  // NC / ND
  parent_invoice_number: string | null
  motivo: string | null

  // CAI (solo Factura)
  cai: string | null
  rango_desde: string | null
  rango_hasta: string | null
  fecha_limite_emision: string | null
  lugar_emision: string | null
  point_of_sale?: string | null

  // Company settings
  company_legal_name: string
  company_logo_url?: string | null
  company_trade_name: string | null
  company_rtn: string | null
  company_fiscal_address?: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  company_invoice_footer: string | null
}


export function InvoicePdf({data,logo}:{data:InvoicePdfData;logo?:string|null}) {
 const fiscal=data.invoice_type!=='Proforma',converted=fiscal&&data.currency==='USD'&&data.total_lps!=null
 const discounts=Number(data.discount_amount||0),reference=data.parent_fiscal_snapshot
 const layout:FiscalLayoutData={
  title:data.invoice_type.toUpperCase(),number:data.invoice_number,status:data.status,issue_date:data.issue_date,due_date:data.due_date,
  issuer:{legal_name:data.company_legal_name,trade_name:data.company_trade_name,rtn:data.company_rtn,address:data.company_address,fiscal_address:data.company_fiscal_address,phone:data.company_phone,email:data.company_email,office_name:data.point_of_sale,logo_url:data.company_logo_url},
  party_label:'CLIENTE',party:{name:data.cliente_nombre||'—',identity:data.cliente_rtn,address:data.cliente_direccion,email:data.cliente_email},
  currency:data.currency,lines:data.items.map(item=>({description:item.description,quantity:Number(item.quantity),unit_price:Number(item.unit_price),discount:Number(item.discount_amount||0),amount:Number(item.amount),tax:item.isv_rate?item.isv_rate+'%':item.tax_treatment==='Exonerada'||(data.es_exonerado&&data.importe_exento===0)?'Exonerado':'Exento'})),
  totals:[{label:'Subtotal antes de descuentos',value:Number(data.subtotal)+discounts},{label:'Descuentos y rebajas',value:discounts},
   ...(fiscal?[{label:'Importe exonerado',value:data.importe_exonerado},{label:'Importe exento',value:data.importe_exento},{label:'Importe gravado 15%',value:data.gravado_15},{label:'Importe gravado 18%',value:data.gravado_18},{label:'ISV 15%',value:data.isv_15_amount},{label:'ISV 18%',value:data.isv_18_amount}]:[{label:'ISV',value:data.tax_amount}])],
  total:converted?Number(data.total_lps):Number(data.total),total_currency:converted?'HNL':data.currency,
  notes:data.notes,conditions:[
   'Condición de pago: '+(data.payment_condition||'—')+(data.credit_days?' · '+data.credit_days+' días':''),
   'Método registrado: '+(data.payment_method||'Pendiente de pago'),
   'N.º O/C Exenta: '+(data.orden_compra_exenta||'No aplica'),
   'N.º Constancia Registro de Exonerados: '+(data.no_constancia_exonerado||'No aplica'),
   'N.º Registro SAG: '+(data.no_registro_sag||'No aplica')],
  equivalence:data.reference_equivalence?'Equivalencia informativa: '+formatMoney(Number(data.reference_equivalence.amount),data.reference_equivalence.currency)+' · T/C '+data.reference_equivalence.rate+' · '+(data.reference_equivalence.operation==='multiply'?'multiplicar':'dividir'):null,
  original_amount:converted?'Importe original: '+formatMoney(Number(data.total),data.currency)+' · T/C HNL por USD: '+data.exchange_rate:null,
  reference:reference||data.parent_invoice_number?{number:reference?.invoice_number||data.parent_invoice_number,cai:reference?.cai,issue_date:reference?.issue_date,reason:data.motivo}:null,
  fiscal:fiscal?{cai:data.cai,from:data.rango_desde,to:data.rango_hasta,deadline:data.fecha_limite_emision,office:data.point_of_sale,location:data.lugar_emision}:null,
  invoice_legend:data.invoice_type==='Factura',footer_note:data.company_invoice_footer,
 }
 return FiscalDocumentLayout({data:layout,logo})
}
