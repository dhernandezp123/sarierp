export const SARI_MAIL_HOST = 'sari.forwarders.app'
export const SARI_MAILBOX = 'pricing@sarihn.com'
// Stand by at the user's request: enabling requires a reviewed code change.
export const OUTLOOK_INTAKE_STANDBY = true

export type IntakeMessage = {
  id: string
  internetMessageId?: string
  conversationId?: string
  subject?: string
  receivedDateTime?: string
  body?: { content?: string }
  from?: { emailAddress?: { address?: string; name?: string } }
  internetMessageHeaders?: { name: string; value: string }[]
  '@removed'?: unknown
}

// Only explicit requests are accepted automatically. Ambiguous messages require review.
export function classifyIntakeMessage(message: IntakeMessage, mailbox: string) {
  const sender = message.from?.emailAddress?.address?.trim().toLowerCase() || ''
  const headers = new Map((message.internetMessageHeaders || []).map(h => [h.name.toLowerCase(), h.value.toLowerCase()]))
  if (message['@removed'] || !sender || sender === mailbox.toLowerCase()
    || /(?:no-?reply|mailer-daemon|postmaster)@/.test(sender)
    || (headers.has('auto-submitted') && headers.get('auto-submitted') !== 'no')
    || /bulk|list|junk/.test(headers.get('precedence') || '') || headers.has('list-unsubscribe')) return 'ignored'
  const subject = message.subject || ''
  if (/SARIHN-\d{4}-\d+-[A-Z]{2}/i.test(subject) || /^(re|fw|fwd|rv)\s*:/i.test(subject)) return 'review'
  const text = `${subject}\n${message.body?.content || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(solicit\w*|necesit\w*|favor|podri\w*|please|request\w*)\b[\s\S]{0,100}\b(cotiz\w*|quotation|quote|tarifa\w*)\b/.test(text)
    || /^(solicitud de cotizacion|solicitud de tarifa|request for quotation|rfq)\b/.test(text.trim())) return 'request'
  return 'review'
}

export function intakeAcknowledgement(reference: string) {
  return `Hemos recibido tu solicitud bajo el número de referencia ${reference}. En breve regresaremos con los costos correspondientes.`
}

export function validateGraphCursor(value: string, mailbox: string) {
  const url = new URL(value)
  const prefix = `/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta`
  if (url.origin !== 'https://graph.microsoft.com' || decodeURIComponent(url.pathname).toLowerCase() !== decodeURIComponent(prefix).toLowerCase() || url.username || url.password) {
    throw new Error('Cursor de Microsoft Graph inválido')
  }
  return url.toString()
}
