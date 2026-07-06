'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import AgentForm from './AgentForm'

export default function NewAgentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Agente</DialogTitle>
          <DialogDescription>
            Completa los datos del agente o proveedor. Quedará disponible en el
            catálogo de Agentes de Carga.
          </DialogDescription>
        </DialogHeader>

        <AgentForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
