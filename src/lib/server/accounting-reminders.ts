import 'server-only'
import {timingSafeEqual} from 'node:crypto'
import type {CompanyBranding} from '@/src/lib/company-branding'
export {loadTenantAccountingEmailBranding as loadAccountingEmailBranding} from '@/src/lib/company-settings'
export type AccountingEmailBranding=Partial<CompanyBranding>&{origin:string}
export function validAccountingCron(header:string|null,secret:string|undefined){
 if(!secret||secret.length<32||!header)return false
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(header)
 return actual.length===expected.length&&timingSafeEqual(actual,expected)
}
export function accountingReminderRequest(row:{recipient_email:string;invoice_number:string;currency:string;balance:number;due_date:string;invoice_id?:string},sender:string,branding:AccountingEmailBranding|string='Empresa logística',options:{test?:boolean;clientName?:string}={}){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.recipient_email)||!Number.isFinite(Number(row.balance))||Number(row.balance)<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.due_date))throw new Error('Recordatorio inválido')
 const date=row.due_date.split('-').reverse().join('/'),amount=Number(row.balance).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
 const b:AccountingEmailBranding=typeof branding==='string'?{trade_name:branding,origin:''}:branding,name=b.trade_name?.trim()||b.legal_name?.trim()||'Empresa logística'
 const senderAddress=sender.match(/<([^<>]+)>\s*$/)?.[1]?.trim()||sender.trim()
 if(/[\r\n]/.test(sender)||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderAddress))throw new Error('Remitente de correo inválido.')
 const brandedSender=`"${name.replaceAll('\\','\\\\').replaceAll('"','\\"').replace(/[\r\n]/g,' ')}" <${senderAddress}>`
 const escape=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
 const color=(v:string|null|undefined,fallback:string)=>v&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback
 const isSari=Boolean(b.origin&&new URL(b.origin).hostname==='sari.forwarders.app')
 const primary=isSari?'#B3282D':color(b.primary_color,'#0038BD'),secondary=color(b.secondary_color,'#07111F')
 const configuredSupport=isSari?'zonia.contabilidad@sarihn.com':b.email?.trim()
 const supportEmail=configuredSupport&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredSupport)?configuredSupport:''
 let logo='',portal=''
 if(b.origin){
  const origin=new URL(b.origin);if(origin.protocol!=='https:'||origin.username||origin.password)throw new Error('Origen de marca inválido.')
  portal=new URL(row.invoice_id&&/^[0-9a-f-]{36}$/i.test(row.invoice_id)?`/portal/facturas/${row.invoice_id}`:'/portal',origin).href
  if(b.logo_url){try{const url=new URL(b.logo_url,origin);if(url.protocol==='https:'&&!url.username&&!url.password)logo=url.href}catch{ /* Se conserva el nombre comercial si no hay imagen valida. */ }}
 }
 const warning=options.test?'PRUEBA CONTROLADA — SIN COBRO REAL. Este correo no es una factura ni solicita pago. Todos los importes del ejemplo son ficticios.':''
 const greeting=options.clientName?`Buen día, ${options.clientName}.`:'Buen día.'
 const summary=`Factura ${row.invoice_number} · Vencimiento ${date} · Saldo ${row.currency} ${amount}`
 const message=options.test?'Esta es la prueba autorizada del diseño y entrega de los recordatorios contables. No requiere realizar ningún pago.':'Le recordamos el vencimiento de su factura. Si ya realizó su pago, comuníquese con Contabilidad para verificar su aplicación.'
 const contact=[b.address,isSari?null:b.email].filter(Boolean).join(' · ')
 const automaticNotice='Este correo es generado automáticamente por el sistema. Por favor, no respondas a este mensaje. Para consultas sobre tus facturas, utiliza los canales de contacto indicados arriba.'
 const html=`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:28px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#263244">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-top:4px solid ${primary};border-radius:16px">
 <tr><td align="center" style="padding:32px 24px 26px;text-align:center;border-bottom:1px solid #eef0f3">
  ${logo?`<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 22px"><tr><td align="center"><img src="${escape(logo)}" alt="${escape(name)}" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0"></td></tr></table>`:`<p style="margin:0 0 20px;font-size:22px;font-weight:700;color:${secondary}">${escape(name)}</p>`}
  <p style="margin:0 0 8px;font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${primary};font-weight:700">Departamento de Contabilidad</p>
  <h1 style="margin:0;font-size:25px;line-height:32px;color:${secondary};font-weight:700">Recordatorio de factura</h1>
 </td></tr>
 <tr><td style="padding:26px 24px 10px">
  ${warning?`<div style="padding:12px 14px;margin:0 0 24px;border:1px solid #f3dfab;background:#fffbef;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#8a651d">${escape(warning)}</div>`:''}
  <p style="margin:0 0 12px;font-size:15px;line-height:24px;font-weight:700;color:${secondary}">${escape(greeting)}</p>
  <p style="margin:0 0 24px;font-size:14px;line-height:23px;color:#536174">${escape(message)}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:12px;background:#fafbfc">
   <tr><td style="width:55%;padding:18px 16px 16px;vertical-align:top;font-size:11px;line-height:17px;color:#738093">FACTURA<br><strong style="display:block;margin-top:5px;font-size:14px;line-height:21px;font-weight:700;color:${secondary};word-break:break-word">${escape(row.invoice_number)}</strong></td><td style="padding:18px 16px 16px;vertical-align:top;font-size:11px;line-height:17px;color:#738093">VENCIMIENTO<br><strong style="display:block;margin-top:5px;font-size:14px;line-height:21px;font-weight:700;color:${secondary};white-space:nowrap">${escape(date)}</strong></td></tr>
   <tr><td colspan="2" align="center" style="padding:22px 16px 24px;text-align:center;border-top:1px solid #e9edf2"><p style="margin:0 0 7px;font-size:12px;line-height:18px;color:#738093">${options.test?'Saldo ficticio de ejemplo':'Saldo pendiente'}</p><p style="margin:0;font-size:30px;line-height:38px;font-weight:700;color:${primary}">${escape(row.currency)} ${escape(amount)}</p></td></tr>
  </table>
  ${portal?`<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:24px auto 10px"><tr><td align="center" style="border-radius:8px;background:${primary}"><a href="${escape(portal)}" style="display:inline-block;padding:14px 24px;border:1px solid ${primary};border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none">${options.test?'Abrir portal de clientes':'Consultar mi factura'}</a></td></tr></table><p style="margin:0 0 24px;text-align:center;font-size:11px;line-height:18px;color:#8390a2">Ingresa con tu cuenta para consultar el detalle.</p>`:''}
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0 0;border-top:1px solid #e9edf2"><tr><td style="padding:22px 0 12px"><h2 style="margin:0 0 10px;font-size:14px;line-height:21px;color:${secondary}">Consultas y aclaraciones</h2><p style="margin:0 0 12px;font-size:13px;line-height:22px;color:#536174">En caso de que tengas dudas con tus facturas, puedes comunicarte al departamento correspondiente o con tu Ejecutivo de Ventas asignado.</p>${supportEmail?`<p style="margin:0;font-size:13px;line-height:22px;color:#536174">Envía tus dudas a <a href="mailto:${escape(supportEmail)}" style="font-weight:700;color:${primary};text-decoration:underline;word-break:break-word">${escape(supportEmail)}</a>.</p>`:''}</td></tr></table>
 </td></tr>
 <tr><td align="center" style="padding:22px 24px;text-align:center;border-top:1px solid #eef0f3;background:#fafbfc;border-radius:0 0 16px 16px"><p style="margin:0 0 5px;font-size:12px;line-height:19px;font-weight:700;color:#536174">${escape(name)}</p>${b.legal_name&&b.legal_name!==name?`<p style="margin:0 0 5px;font-size:10px;line-height:17px;color:#8a96a6">${escape(b.legal_name)}</p>`:''}${contact?`<p style="margin:0;font-size:10px;line-height:17px;color:#8a96a6">${escape(contact)}</p>`:''}</td></tr>
 <tr><td align="center" style="padding:0 24px 22px;text-align:center;background:#fafbfc"><p style="margin:0;font-size:11px;line-height:18px;color:#738093">${escape(automaticNotice)}</p></td></tr>
</table></body></html>`
 return {from:brandedSender,...(supportEmail?{reply_to:supportEmail}:{}),to:[row.recipient_email],subject:`${options.test?'[PRUEBA] ':''}Recordatorio de factura ${row.invoice_number} · ${name}`,text:[warning,greeting,message,summary,portal?`Portal: ${portal}`:'','En caso de que tengas dudas con tus facturas, puedes comunicarte al departamento correspondiente o con tu Ejecutivo de Ventas asignado.',supportEmail?`Envía tus dudas a ${supportEmail}.`:'',name,contact,automaticNotice].filter(Boolean).join('\n\n'),html}
}
