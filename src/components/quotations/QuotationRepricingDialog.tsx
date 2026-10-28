'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

type QuotationRepricingDialogProps = {
  busy: boolean
  impact: { hasShippingInstruction: boolean; bookingsCount: number; loading: boolean }
  onCancel: () => void
  onConfirm: (reason: string) => void | Promise<void>
}

// Mounted only while open: the draft stays local and resets on the next opening.
// Keystrokes must not render the quotation detail or invalidate its PDF document.
export function QuotationRepricingDialog({ busy, impact, onCancel, onConfirm }: QuotationRepricingDialogProps) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel() }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Reabrir para Repricing</DialogTitle>
          <DialogDescription>
            Regresa esta cotización a Pendiente de Fijar Precios para corregir tarifa, costos o carrier/naviera. El motivo quedará registrado junto con el cambio de estado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(impact.hasShippingInstruction || impact.bookingsCount > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              Esta cotización ya tiene operación asociada. Reabrir pricing no actualizará Routing ni Bookings automáticamente en esta fase.
            </div>
          )}
          {impact.loading && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Revisando impacto operativo...</p>
          )}

          <div>
            <label htmlFor="repricing-reason" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Motivo</label>
            <textarea
              id="repricing-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              placeholder="Ej: Cambio de naviera / actualización de tarifa al zarpe"
              rows={4}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-400"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} disabled={busy}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancelar
            </button>
            <button type="button" onClick={() => onConfirm(reason)} disabled={busy || impact.loading}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50">
              {busy ? 'Reabriendo...' : 'Confirmar reapertura'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
