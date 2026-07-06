'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { createClienteRecord } from '@/src/lib/clientes'
import { fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import {
  CONDICIONES_PAGO,
  TIPOS_CLIENTE,
  TIPOS_EMPRESA,
} from '@/src/lib/constants/clientes'
import { PAISES_FRECUENTES } from '@/src/lib/constants/honduras'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

const isCreditPayment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .startsWith('credito')

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  )
}

const initialForm = {
  nombre: '',
  nit: '',
  contacto: '',
  telefono: '',
  email_1: '',
  pais: 'Honduras',
  tipo_persona: 'Corporativo',
  condicion_pago: 'Contado',
  dias_credito: '',
  tipo_cliente: '',
  vendedor_asignado: '',
}

export default function NewClientDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile } = useUser()
  const router = useRouter()

  const [form, setForm] = useState(initialForm)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || vendedores.length > 0) return

    const fetchVendedores = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nombre, apellido')
        .eq('is_active', true)
        .order('nombre', { ascending: true })
        .order('apellido', { ascending: true })

      setVendedores(data || [])
    }

    fetchVendedores()
  }, [open, vendedores.length])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    const next = { ...form, [name]: value }

    if (name === 'condicion_pago') {
      next.dias_credito = value.match(/\d+/)?.[0] ?? ''
    }

    setForm(next)
  }

  const handleCreate = async () => {
    setSaving(true)

    const { cliente, error } = await createClienteRecord(
      supabase,
      {
        nombre: form.nombre,
        nit: form.nit,
        contacto: form.contacto,
        telefono: form.telefono,
        email_1: form.email_1,
        pais: form.pais,
        tipo_persona: form.tipo_persona,
        condicion_pago: form.condicion_pago,
        dias_credito: isCreditPayment(form.condicion_pago)
          ? Number(form.dias_credito || 0)
          : 0,
        tipo_cliente: form.tipo_cliente,
        vendedor_asignado: form.vendedor_asignado,
      },
      profile?.id
    )

    setSaving(false)

    if (error) {
      toast.error(error)
      return
    }

    toast.success(
      cliente?.codigo_cliente
        ? `Cliente creado: ${cliente.codigo_cliente}`
        : 'Cliente creado correctamente',
      cliente
        ? {
            action: {
              label: 'Completar perfil',
              onClick: () => router.push(`/clientes/${cliente.id}/edit`),
            },
          }
        : undefined
    )
    setForm(initialForm)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Cliente</DialogTitle>
          <DialogDescription>
            Alta rápida con los datos esenciales. Dirección, correos
            adicionales y seguro se completan luego en el perfil del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Nombre / Razón social *">
            <input
              name="nombre"
              placeholder="Inversiones XX S. de R.L."
              value={form.nombre}
              onChange={handleChange}
              className={fieldClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="RTN / NIT">
              <input
                name="nit"
                placeholder="RTN / NIT"
                value={form.nit}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
            <Field label="Teléfono">
              <input
                name="telefono"
                placeholder="+504 0000-0000"
                value={form.telefono}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Contacto principal">
              <input
                name="contacto"
                placeholder="Nombre del contacto"
                value={form.contacto}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
            <Field label="Email principal">
              <input
                name="email_1"
                type="email"
                placeholder="email@empresa.com"
                value={form.email_1}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="País">
              <select name="pais" value={form.pais} onChange={handleChange} className={fieldClass}>
                {PAISES_FRECUENTES.map((pais) => (
                  <option key={pais} value={pais}>{pais}</option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de empresa">
              <select name="tipo_persona" value={form.tipo_persona} onChange={handleChange} className={fieldClass}>
                {TIPOS_EMPRESA.map((tipo) => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Condición de pago">
              <select name="condicion_pago" value={form.condicion_pago} onChange={handleChange} className={fieldClass}>
                {CONDICIONES_PAGO.map((condicion) => (
                  <option key={condicion} value={condicion}>{condicion}</option>
                ))}
              </select>
            </Field>
            {isCreditPayment(form.condicion_pago) && (
              <Field label="Días de crédito">
                <input
                  name="dias_credito"
                  type="number"
                  placeholder="30"
                  value={form.dias_credito}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
            )}
          </div>

          <Field label="Segmento / Tipo de cliente">
            <select name="tipo_cliente" value={form.tipo_cliente} onChange={handleChange} className={fieldClass}>
              <option value="">Seleccionar segmento</option>
              {TIPOS_CLIENTE.map((tipo) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </Field>

          <Field label="Vendedor asignado">
            <select
              name="vendedor_asignado"
              value={form.vendedor_asignado}
              onChange={handleChange}
              className={fieldClass}
            >
              <option value="">Yo ({profile?.nombre || 'usuario actual'})</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} {vendedor.apellido}
                </option>
              ))}
            </select>
          </Field>

          <p className="text-xs text-slate-400 dark:text-slate-500">
            El código de cliente se genera automáticamente.
          </p>

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className={`w-full ${primaryButtonClass}`}
          >
            {saving ? 'Creando...' : 'Crear Cliente'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
