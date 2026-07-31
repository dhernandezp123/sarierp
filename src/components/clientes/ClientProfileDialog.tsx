'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Contact, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'

import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { cn } from '@/src/lib/utils'
import {
  CONDICIONES_PAGO,
  TIPOS_CLIENTE,
  TIPOS_EMPRESA,
} from '@/src/lib/constants/clientes'
import {
  CIUDADES_POR_DEPARTAMENTO,
  DEPARTAMENTOS_HN,
  PAISES_FRECUENTES,
} from '@/src/lib/constants/honduras'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

type ClientOption = {
  id: string
  codigo_cliente: string | null
  nombre: string | null
}

type Seller = {
  id: string
  nombre: string | null
  apellido: string | null
}

const initialForm = {
  nombre: '',
  contacto: '',
  contacto_2: '',
  nit: '',
  telefono: '',
  telefono_2: '',
  direccion: '',
  ciudad: '',
  departamento_estado: '',
  pais: 'Honduras',
  email_1: '',
  email_2: '',
  email_3: '',
  observaciones: '',
  tipo_persona: 'Corporativo',
  condicion_pago: 'Contado',
  dias_credito: '',
  limite_credito: '',
  moneda_credito: 'USD',
  tipo_cliente: '',
  vendedor_asignado: '',
  origen_frecuente: '',
  preferred_miami_rate_destination: 'SPS',
  asegura_carga: false,
  seguro_porcentaje: '',
  notas_tarifas: '',
}

type ClientForm = typeof initialForm

const fieldClass =
  'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950 dark:disabled:bg-slate-900'

const isCreditPayment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .startsWith('credito')

const textValue = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback

function mapClientToForm(client: Record<string, unknown>): ClientForm {
  return {
    nombre: textValue(client.nombre),
    contacto: textValue(client.contacto),
    contacto_2: textValue(client.contacto_2),
    nit: textValue(client.nit),
    telefono: textValue(client.telefono),
    telefono_2: textValue(client.telefono_2),
    direccion: textValue(client.direccion),
    ciudad: textValue(client.ciudad),
    departamento_estado: textValue(client.departamento_estado),
    pais: textValue(client.pais, 'Honduras'),
    email_1: textValue(client.email_1),
    email_2: textValue(client.email_2),
    email_3: textValue(client.email_3),
    observaciones: textValue(client.observaciones),
    tipo_persona: textValue(client.tipo_persona, 'Corporativo'),
    condicion_pago: textValue(client.condicion_pago, 'Contado'),
    dias_credito: client.dias_credito == null ? '' : String(client.dias_credito),
    limite_credito: client.limite_credito == null ? '' : String(client.limite_credito),
    moneda_credito: textValue(client.moneda_credito, 'USD'),
    tipo_cliente: textValue(client.tipo_cliente),
    vendedor_asignado: textValue(client.vendedor_asignado),
    origen_frecuente: textValue(client.origen_frecuente),
    preferred_miami_rate_destination: textValue(
      client.preferred_miami_rate_destination,
      'SPS'
    ),
    asegura_carga: Boolean(client.asegura_carga),
    seguro_porcentaje:
      client.seguro_porcentaje == null ? '' : String(client.seguro_porcentaje),
    notas_tarifas: textValue(client.notas_tarifas),
  }
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/60 dark:bg-[#0b1220]">
      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      {children}
    </section>
  )
}

export default function ClientProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile } = useUser()
  const router = useRouter()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [form, setForm] = useState<ClientForm>(initialForm)
  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingClient, setLoadingClient] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedClient = clients.find((client) => client.id === selectedClientId)
  const availableCities = useMemo(
    () =>
      form.pais === 'Honduras' && form.departamento_estado
        ? CIUDADES_POR_DEPARTAMENTO[form.departamento_estado] ?? []
        : [],
    [form.departamento_estado, form.pais]
  )

  useEffect(() => {
    if (!open) return

    let active = true

    const loadLists = async () => {
      setLoadingLists(true)

      const [clientsResult, sellersResult] = await Promise.all([
        supabase
          .from('clientes')
          .select('id, codigo_cliente, nombre')
          .is('deleted_at', null)
          .order('nombre', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, nombre, apellido')
          .eq('is_active', true)
          .order('nombre', { ascending: true })
          .order('apellido', { ascending: true }),
      ])

      if (!active) return

      if (clientsResult.error) {
        toast.error(`No se pudieron cargar los clientes: ${clientsResult.error.message}`)
      } else {
        setClients((clientsResult.data || []) as ClientOption[])
      }

      if (sellersResult.error) {
        toast.error(`No se pudieron cargar los vendedores: ${sellersResult.error.message}`)
      } else {
        setSellers((sellersResult.data || []) as Seller[])
      }

      setLoadingLists(false)
    }

    loadLists()

    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (!open || !selectedClientId) return

    let active = true

    const loadClient = async () => {
      setLoadingClient(true)

      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', selectedClientId)
        .is('deleted_at', null)
        .single()

      if (!active) return

      if (error) {
        toast.error(`No se pudo cargar el cliente: ${error.message}`)
        setSelectedClientId('')
      } else {
        setForm(mapClientToForm(data as Record<string, unknown>))
      }

      setLoadingClient(false)
    }

    loadClient()

    return () => {
      active = false
    }
  }, [open, selectedClientId])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedClientId('')
      setForm(initialForm)
      setSaving(false)
    }

    onOpenChange(nextOpen)
  }

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = event.target
    const field = name as keyof ClientForm
    const fieldValue =
      type === 'checkbox' ? (event.target as HTMLInputElement).checked : value
    const next = { ...form, [field]: fieldValue } as ClientForm

    if (field === 'pais') {
      next.departamento_estado = ''
      next.ciudad = ''
    }

    if (field === 'departamento_estado') next.ciudad = ''
    if (field === 'condicion_pago') {
      next.dias_credito = value.match(/\d+/)?.[0] ?? ''
    }

    setForm(next)
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedClientId) return
    if (!form.nombre.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('clientes')
      .update({
        nombre: form.nombre.trim(),
        contacto: form.contacto,
        contacto_2: form.contacto_2 || null,
        nit: form.nit,
        telefono: form.telefono,
        telefono_2: form.telefono_2 || null,
        direccion: form.direccion,
        ciudad: form.ciudad,
        departamento_estado: form.departamento_estado,
        pais: form.pais,
        email_1: form.email_1,
        email_2: form.email_2,
        email_3: form.email_3,
        observaciones: form.observaciones,
        tipo_persona: form.tipo_persona,
        condicion_pago: form.condicion_pago,
        dias_credito: isCreditPayment(form.condicion_pago)
          ? Number(form.dias_credito || 0)
          : 0,
        limite_credito: form.limite_credito ? Number(form.limite_credito) : null,
        moneda_credito: form.moneda_credito || 'USD',
        tipo_cliente: form.tipo_cliente,
        vendedor_asignado: form.vendedor_asignado || null,
        origen_frecuente: form.origen_frecuente,
        preferred_miami_rate_destination: form.preferred_miami_rate_destination,
        asegura_carga: form.asegura_carga,
        seguro_porcentaje: form.asegura_carga
          ? Number(form.seguro_porcentaje || 0)
          : null,
        notas_tarifas: form.notas_tarifas,
      })
      .eq('id', selectedClientId)

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    const { error: historyError } = await supabase.from('cliente_history').insert([
      {
        cliente_id: selectedClientId,
        changed_by: profile?.id,
        action: 'Cliente actualizado',
        notes: 'Datos del cliente actualizados desde acciones rápidas',
      },
    ])

    if (historyError) {
      toast.warning('El cliente se actualizó, pero no se pudo registrar el historial.')
    } else {
      toast.success('Cliente actualizado correctamente')
    }

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClientId ? { ...client, nombre: form.nombre.trim() } : client
      )
    )
    setSaving(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12 dark:border-slate-700">
          <DialogTitle>Ver / editar cliente</DialogTitle>
          <DialogDescription>
            Busca un cliente, consulta su perfil y actualiza sus datos sin salir de esta pantalla.
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/50">
          <Field label="Cliente">
            <ClienteCombobox
              clientes={clients}
              value={selectedClientId}
              onChange={setSelectedClientId}
              placeholder={loadingLists ? 'Cargando clientes...' : 'Buscar por nombre o código...'}
              disabled={loadingLists}
              className={fieldClass}
            />
          </Field>
        </div>

        {!selectedClientId ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-3 rounded-2xl bg-slate-100 p-3 dark:bg-slate-800">
              <Contact className="h-6 w-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Selecciona un cliente para ver su perfil
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Puedes buscarlo por nombre o código de cliente.
            </p>
          </div>
        ) : loadingClient ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Cargando perfil...
          </div>
        ) : (
          <>
            <form
              id="quick-client-profile-form"
              onSubmit={handleSave}
              className="min-h-0 space-y-4 overflow-y-auto bg-slate-50/40 p-5 dark:bg-slate-950/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    {form.nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {selectedClient?.codigo_cliente || 'Sin código asignado'}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Perfil editable
                </span>
              </div>

              <Section title="Datos principales">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Nombre / Razón social" required className="lg:col-span-2">
                    <input name="nombre" value={form.nombre} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="RTN / NIT">
                    <input name="nit" value={form.nit} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Contacto principal">
                    <input name="contacto" value={form.contacto} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Teléfono">
                    <input name="telefono" value={form.telefono} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Origen frecuente">
                    <input name="origen_frecuente" value={form.origen_frecuente} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Contacto secundario">
                    <input name="contacto_2" value={form.contacto_2} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Teléfono secundario">
                    <input name="telefono_2" value={form.telefono_2} onChange={handleChange} className={fieldClass} />
                  </Field>
                </div>
              </Section>

              <Section title="Dirección y correos">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="País">
                    <select name="pais" value={form.pais} onChange={handleChange} className={fieldClass}>
                      {PAISES_FRECUENTES.map((country) => <option key={country} value={country}>{country}</option>)}
                    </select>
                  </Field>
                  <Field label="Departamento / Estado">
                    {form.pais === 'Honduras' ? (
                      <select name="departamento_estado" value={form.departamento_estado} onChange={handleChange} className={fieldClass}>
                        <option value="">Seleccionar departamento</option>
                        {DEPARTAMENTOS_HN.map((department) => <option key={department} value={department}>{department}</option>)}
                      </select>
                    ) : (
                      <input name="departamento_estado" value={form.departamento_estado} onChange={handleChange} className={fieldClass} />
                    )}
                  </Field>
                  <Field label="Ciudad">
                    {form.pais === 'Honduras' && availableCities.length > 0 ? (
                      <select name="ciudad" value={form.ciudad} onChange={handleChange} className={fieldClass}>
                        <option value="">Seleccionar ciudad</option>
                        {availableCities.map((city) => <option key={city} value={city}>{city}</option>)}
                      </select>
                    ) : (
                      <input name="ciudad" value={form.ciudad} onChange={handleChange} className={fieldClass} />
                    )}
                  </Field>
                  <Field label="Dirección" className="sm:col-span-2 lg:col-span-3">
                    <input name="direccion" value={form.direccion} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Email principal">
                    <input type="email" name="email_1" value={form.email_1} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Email 2">
                    <input type="email" name="email_2" value={form.email_2} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Email 3">
                    <input type="email" name="email_3" value={form.email_3} onChange={handleChange} className={fieldClass} />
                  </Field>
                </div>
              </Section>

              <Section title="Clasificación comercial">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Tipo de empresa">
                    <select name="tipo_persona" value={form.tipo_persona} onChange={handleChange} className={fieldClass}>
                      {TIPOS_EMPRESA.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </Field>
                  <Field label="Condición de pago">
                    <select name="condicion_pago" value={form.condicion_pago} onChange={handleChange} className={fieldClass}>
                      {CONDICIONES_PAGO.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
                    </select>
                  </Field>
                  {isCreditPayment(form.condicion_pago) && (
                    <Field label="Días de crédito">
                      <input type="number" min="0" name="dias_credito" value={form.dias_credito} onChange={handleChange} className={fieldClass} />
                    </Field>
                  )}
                  <Field label="Límite de crédito">
                    <input type="number" min="0" step="0.01" name="limite_credito" value={form.limite_credito} onChange={handleChange} className={fieldClass} />
                  </Field>
                  <Field label="Moneda del límite">
                    <select name="moneda_credito" value={form.moneda_credito} onChange={handleChange} className={fieldClass}>
                      <option value="USD">USD</option>
                      <option value="HNL">HNL</option>
                    </select>
                  </Field>
                  <Field label="Segmento / Tipo de cliente">
                    <select name="tipo_cliente" value={form.tipo_cliente} onChange={handleChange} className={fieldClass}>
                      <option value="">Seleccionar segmento</option>
                      {TIPOS_CLIENTE.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </Field>
                  <Field label="Vendedor asignado">
                    <select name="vendedor_asignado" value={form.vendedor_asignado} onChange={handleChange} className={fieldClass}>
                      <option value="">Seleccionar vendedor</option>
                      {sellers.map((seller) => (
                        <option key={seller.id} value={seller.id}>
                          {[seller.nombre, seller.apellido].filter(Boolean).join(' ') || 'Sin nombre'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Destino tarifario Miami">
                    <select name="preferred_miami_rate_destination" value={form.preferred_miami_rate_destination} onChange={handleChange} className={fieldClass}>
                      <option value="SPS">SPS — San Pedro Sula</option>
                      <option value="TGU">TGU — Tegucigalpa</option>
                    </select>
                  </Field>
                </div>
              </Section>

              <Section title="Seguro y notas">
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
                      <input type="checkbox" name="asegura_carga" checked={form.asegura_carga} onChange={handleChange} className="h-4 w-4 rounded border-slate-300" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Cliente asegura carga</span>
                    </label>
                    {form.asegura_carga && (
                      <Field label="Porcentaje de seguro (%)">
                        <input type="number" min="0" step="0.01" name="seguro_porcentaje" value={form.seguro_porcentaje} onChange={handleChange} className={fieldClass} />
                      </Field>
                    )}
                  </div>
                  <Field label="Observaciones">
                    <textarea name="observaciones" rows={3} value={form.observaciones} onChange={handleChange} className={cn(fieldClass, 'h-auto resize-y py-2.5')} />
                  </Field>
                  <Field label="Notas o condiciones especiales de tarifas">
                    <textarea name="notas_tarifas" rows={3} value={form.notas_tarifas} onChange={handleChange} className={cn(fieldClass, 'h-auto resize-y py-2.5')} />
                  </Field>
                </div>
              </Section>
            </form>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-[#0b1220]">
              <p className="hidden text-xs text-slate-400 sm:block">
                Los cambios quedarán registrados en el historial del cliente.
              </p>
              <button
                type="submit"
                form="quick-client-profile-form"
                disabled={saving}
                className="ml-auto rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
