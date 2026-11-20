/** El correo anuncia actividad; los detalles y documentos requieren iniciar sesión. */
export function hrEmailRequest(recipient: string, sender: string, origin: string) {
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  const senderAddress = sender.match(/<([^<>]+)>\s*$/)?.[1]?.trim() || sender.trim()
  const url = new URL(origin)
  if (!email.test(recipient) || !email.test(senderAddress) || /[\r\n]/.test(sender) || url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Correo de RRHH inválido')
  return { from: sender, to: [recipient], subject: 'Tienes un aviso de Recursos Humanos', text: `Hay una actualización de Recursos Humanos disponible en tu cuenta.\n\nIngresa para consultar el aviso: ${url.origin}/rrhh/avisos\n\nLos detalles laborales y documentos se consultan únicamente dentro del sistema.` }
}
