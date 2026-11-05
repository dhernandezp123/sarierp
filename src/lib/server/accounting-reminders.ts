import 'server-only'
import {timingSafeEqual} from 'node:crypto'
export function validAccountingCron(header:string|null,secret:string|undefined){
 if(!secret||secret.length<32||!header)return false
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header)
 return actual.length===expected.length&&timingSafeEqual(actual,expected)
}
export function accountingReminderRequest(row:{recipient_email:string;invoice_number:string;currency:string;balance:number;due_date:string},sender:string,companyName='Empresa logística'){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.recipient_email)||!Number.isFinite(Number(row.balance))||Number(row.balance)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.due_date))throw new Error('Recordatorio inválido')
 const date=row.due_date.split('-').reverse().join('/'),amount=Number(row.balance).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
 return {from:sender,to:[row.recipient_email],subject:`Recordatorio de factura ${row.invoice_number}`,text:`Le recordamos la factura ${row.invoice_number}, con fecha de vencimiento ${date} y saldo pendiente ${row.currency} ${amount}.\n\nSi ya realizó su pago, comuníquese con Contabilidad para verificar su aplicación. Puede consultar el saldo actualizado en su portal de cliente.\n\n${companyName}`}
}
