import type { IssuerSnapshot } from './fiscal-offices'
export type PurchaseItem={description:string;quantity:number;unit_price:number;discount_amount?:number;amount:number;tax_rate:number;tax:number;tax_credit:boolean;account_id:string}
export type WithholdingItem={description:string;base:number;rate:number;amount:number}
export type PurchaseFiscalDocument={
 id:string;document_type?:'Factura de proveedor'|'Boleta de Compra';document_number:string;issue_date:string;due_date?:string;
 currency:string;exchange_rate:number;subtotal?:number;tax_amount?:number;discount_amount?:number;total:number;notes?:string;status:string;payable_id:string;
 issuer_snapshot:IssuerSnapshot|null;supplier_snapshot:{name:string;rtn:string;phone:string;email:string;address?:string};
 source_document_snapshot?:{number?:string;issue_date?:string;cai?:string};
 fiscal_snapshot:{cai:string;rango_desde:string;rango_hasta:string;fecha_limite_emision:string;point_of_sale:string}|null;
 items:(PurchaseItem|WithholdingItem)[]
}
