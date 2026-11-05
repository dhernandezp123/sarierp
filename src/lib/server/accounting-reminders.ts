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
 const primary=color(b.primary_color,'#0038BD'),secondary=color(b.secondary_color,'#07111F')
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
 const contact=[b.address,b.phone,b.email].filter(Boolean).join(' · ')
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px 12px;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-top:6px solid ${primary};border-radius:14px"><tr><td style="padding:26px 28px;border-bottom:1px solid #e2e8f0">${logo?`<img src="${escape(logo)}" alt="${escape(name)}" width="190" style="display:block;max-width:190px;max-height:80px;object-fit:contain;margin-bottom:14px">`:''}<div style="font-size:22px;font-weight:700;color:${secondary}">${escape(name)}</div><div style="margin-top:6px;font-size:13px;color:${primary}">Finanzas · Recordatorio de factura</div></td></tr><tr><td style="padding:26px 28px">${warning?`<div style="padding:14px;margin-bottom:20px;border:1px solid #f5cd63;background:#fffbeb;color:#854d0e;border-radius:8px;font-size:13px;font-weight:700">${escape(warning)}</div>`:''}<p style="margin:0 0 16px">${escape(greeting)}</p><p style="margin:0 0 20px;line-height:1.6">${escape(message)}</p><table role="presentation" style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:16px;font-size:13px;color:#64748b">Documento<br><strong style="display:block;margin-top:5px;color:${secondary};font-size:16px">${escape(row.invoice_number)}</strong></td><td style="padding:16px;font-size:13px;color:#64748b">Vencimiento<br><strong style="display:block;margin-top:5px;color:${secondary};font-size:16px">${escape(date)}</strong></td></tr><tr><td colspan="2" style="padding:0 16px 18px;font-size:13px;color:#64748b">${options.test?'Saldo ficticio de ejemplo':'Saldo pendiente'}<br><strong style="display:block;margin-top:5px;color:${primary};font-size:26px">${escape(row.currency)} ${escape(amount)}</strong></td></tr></table>${portal?`<p style="margin:24px 0 12px"><a href="${escape(portal)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">${options.test?'Abrir portal de clientes':'Consultar saldo actualizado'}</a></p><p style="font-size:12px;line-height:1.5;color:#64748b">El acceso al portal requiere iniciar sesión. Este aviso no crea una cuenta ni modifica sus datos.</p>`:''}</td></tr><tr><td style="padding:20px 28px;background:${secondary};color:#fff;border-radius:0 0 12px 12px"><strong>${escape(name)}</strong>${b.legal_name&&b.legal_name!==name?`<p style="margin:6px 0;font-size:12px">${escape(b.legal_name)}</p>`:''}${contact?`<p style="margin:8px 0 0;font-size:12px;line-height:1.6;color:#e2e8f0">${escape(contact)}</p>`:''}</td></tr></table></body></html>`
 return {from:brandedSender,to:[row.recipient_email],subject:`${options.test?'[PRUEBA] ':''}Recordatorio de factura ${row.invoice_number} · ${name}`,text:[warning,greeting,message,summary,portal?`Portal: ${portal}`:'',name,contact].filter(Boolean).join('\n\n'),html}
}
