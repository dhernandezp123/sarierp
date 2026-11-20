import { toast } from 'sonner'
export function notifyHrRequest(requestId: string) {
  void fetch('/api/hr/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }), keepalive: true })
    .then(response => { if (!response.ok) toast.warning('La solicitud se guardó. El correo sigue pendiente; consulta Avisos de RRHH.') })
    .catch(() => toast.warning('La solicitud se guardó. El correo sigue pendiente; consulta Avisos de RRHH.'))
}
