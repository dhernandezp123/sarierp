'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../../lib/supabase/client'
import { UnsavedChangesGuard } from '@/src/components/ui/UnsavedChangesGuard'
import { useUser } from '../../../../hooks/useUser'
import { cn } from '../../../../lib/utils'
import {
  CONDICIONES_PAGO,
  TIPOS_CLIENTE,
  TIPOS_EMPRESA,
} from '../../../../lib/constants/clientes'
import {
  CIUDADES_POR_DEPARTAMENTO,
  DEPARTAMENTOS_HN,
  PAISES_FRECUENTES,
} from '../../../../lib/constants/honduras'

const initialFormData = {
  nombre: '',
  contacto: '',
  nit: '',
  telefono: '',
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
  tipo_cliente: '',
  vendedor_asignado: '',
  origen_frecuente: '',
  preferred_miami_rate_destination: 'SPS',
  asegura_carga: false,
  seguro_porcentaje: '',
  notas_tarifas: '',
}

const MIAMI_RATE_DESTINATION_OPTIONS = [
  { value: 'SPS', label: 'SPS — San Pedro Sula' },
  { value: 'TGU', label: 'TGU — Tegucigalpa' },
]

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/10 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400/10 dark:disabled:bg-slate-900'

const isCreditPayment = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .startsWith('credito')

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  className?: string
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

function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          {description}
        </p>
      )}
    </div>
  )
}

export default function NuevoClientePage() {
  const { profile } = useUser()
  const router = useRouter()

  const [formData, setFormData] = useState(initialFormData)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const ciudadesDisponibles =
    formData.pais === 'Honduras' && formData.departamento_estado
      ? CIUDADES_POR_DEPARTAMENTO[formData.departamento_estado] ?? []
      : []

  useEffect(() => {
    fetchVendedores()
  }, [])

  const fetchVendedores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('nombre', { ascending: true })
      .order('apellido', { ascending: true })

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setVendedores(data || [])
    setLoading(false)
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const nextFormData = {
      ...formData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }

    if (name === 'pais') {
      nextFormData.departamento_estado = ''
      nextFormData.ciudad = ''
    }

    if (name === 'departamento_estado') {
      nextFormData.ciudad = ''
    }

    if (name === 'condicion_pago') {
      nextFormData.dias_credito = value.match(/\d+/)?.[0] ?? ''
    }

    setFormData(nextFormData)
  }

  const createCliente = async () => {
    if (!formData.nombre) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }

    setCreating(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      toast.error('No se pudo validar el usuario autenticado.')
      setCreating(false)
      return
    }

    const vendedorAsignado = formData.vendedor_asignado || user.id
    const clientePayload = {
      nombre: formData.nombre,
      contacto: formData.contacto,
      nit: formData.nit,
      telefono: formData.telefono,
      direccion: formData.direccion,
      ciudad: formData.ciudad,
      departamento_estado: formData.departamento_estado,
      pais: formData.pais,
      email_1: formData.email_1,
      email_2: formData.email_2,
      email_3: formData.email_3,
      observaciones: formData.observaciones,
      tipo_persona: formData.tipo_persona,
      condicion_pago: formData.condicion_pago,
      dias_credito: isCreditPayment(formData.condicion_pago)
        ? Number(formData.dias_credito || 0)
        : 0,
      tipo_cliente: formData.tipo_cliente,
      vendedor_asignado: vendedorAsignado,
      origen_frecuente: formData.origen_frecuente,
      preferred_miami_rate_destination:
        formData.preferred_miami_rate_destination,
      asegura_carga: formData.asegura_carga,
      seguro_porcentaje: formData.asegura_carga
        ? Number(formData.seguro_porcentaje || 0)
        : null,
      notas_tarifas: formData.notas_tarifas,
    }

    const { error } = await supabase
      .from('clientes')
      .insert([clientePayload])

    if (error) {
      toast.error(error.message)
      setCreating(false)
      return
    }

    const { data: createdCliente } = await supabase
      .from('clientes')
      .select('id, codigo_cliente, nombre')
      .eq('vendedor_asignado', vendedorAsignado)
      .eq('nombre', formData.nombre)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (createdCliente) {
      await supabase.from('cliente_history').insert([
        {
          cliente_id: createdCliente.id,
          changed_by: profile?.id,
          action: 'Cliente creado',
          notes: `Cliente ${createdCliente.codigo_cliente} creado`,
        },
      ])
    }

    toast.success(
      createdCliente?.codigo_cliente
        ? `Cliente creado: ${createdCliente.codigo_cliente}`
        : 'Cliente creado correctamente'
    )
    setCreating(false)
    setFormData(initialFormData)

    setTimeout(() => {
      router.push(createdCliente?.id ? `/clientes/${createdCliente.id}` : '/clientes')
    }, 1200)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    createCliente()
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard />
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Nuevo Cliente
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registra la informacion comercial y de contacto del cliente.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push('/clientes')}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Volver
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Datos principales"
            description="Nombre, contacto y datos de identificacion fiscal"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre / Razon social" required className="lg:col-span-2">
              <input
                name="nombre"
                placeholder="Inversiones XX S. de R.L."
                value={formData.nombre}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="RTN / NIT">
              <input
                name="nit"
                placeholder="RTN / NIT"
                value={formData.nit}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="Contacto principal">
              <input
                name="contacto"
                placeholder="Nombre del contacto"
                value={formData.contacto}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="Telefono">
              <input
                name="telefono"
                placeholder="+504 0000-0000"
                value={formData.telefono}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="Origen frecuente">
              <input
                name="origen_frecuente"
                placeholder="Ej. China, Miami"
                value={formData.origen_frecuente}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Direccion"
            description="Ubicacion fisica del cliente"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Pais">
              <select
                name="pais"
                value={formData.pais}
                onChange={handleChange}
                className={fieldClass}
              >
                {PAISES_FRECUENTES.map((pais) => (
                  <option key={pais} value={pais}>
                    {pais}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Departamento / Estado">
              {formData.pais === 'Honduras' ? (
                <select
                  name="departamento_estado"
                  value={formData.departamento_estado}
                  onChange={handleChange}
                  className={fieldClass}
                >
                  <option value="">Seleccionar departamento</option>
                  {DEPARTAMENTOS_HN.map((departamento) => (
                    <option key={departamento} value={departamento}>
                      {departamento}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="departamento_estado"
                  placeholder="Departamento / Estado / Provincia"
                  value={formData.departamento_estado}
                  onChange={handleChange}
                  className={fieldClass}
                />
              )}
            </Field>

            <Field label="Ciudad">
              {formData.pais === 'Honduras' && ciudadesDisponibles.length > 0 ? (
                <select
                  name="ciudad"
                  value={formData.ciudad}
                  onChange={handleChange}
                  className={fieldClass}
                >
                  <option value="">Seleccionar ciudad</option>
                  {ciudadesDisponibles.map((ciudad) => (
                    <option key={ciudad} value={ciudad}>
                      {ciudad}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name="ciudad"
                  placeholder="Ciudad"
                  value={formData.ciudad}
                  onChange={handleChange}
                  className={fieldClass}
                />
              )}
            </Field>

            <Field label="Direccion" className="sm:col-span-2 lg:col-span-3">
              <input
                name="direccion"
                placeholder="Calle, colonia, numero..."
                value={formData.direccion}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Correos electronicos"
            description="Hasta tres emails de contacto para el cliente"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Email principal">
              <input
                name="email_1"
                type="email"
                placeholder="email@empresa.com"
                value={formData.email_1}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="Email 2">
              <input
                name="email_2"
                type="email"
                placeholder="email2@empresa.com"
                value={formData.email_2}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>

            <Field label="Email 3">
              <input
                name="email_3"
                type="email"
                placeholder="email3@empresa.com"
                value={formData.email_3}
                onChange={handleChange}
                className={fieldClass}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Clasificacion comercial"
            description="Tipo de empresa, condicion de pago y segmentacion"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tipo de empresa">
              <select
                name="tipo_persona"
                value={formData.tipo_persona}
                onChange={handleChange}
                className={fieldClass}
              >
                {TIPOS_EMPRESA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Condicion de pago">
              <select
                name="condicion_pago"
                value={formData.condicion_pago}
                onChange={handleChange}
                className={fieldClass}
              >
                {CONDICIONES_PAGO.map((condicion) => (
                  <option key={condicion} value={condicion}>
                    {condicion}
                  </option>
                ))}
              </select>
            </Field>

            {isCreditPayment(formData.condicion_pago) && (
              <Field label="Dias de credito">
                <input
                  name="dias_credito"
                  type="number"
                  placeholder="30"
                  value={formData.dias_credito}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
            )}

            <Field label="Segmento / Tipo de cliente">
              <select
                name="tipo_cliente"
                value={formData.tipo_cliente}
                onChange={handleChange}
                className={fieldClass}
              >
                <option value="">Seleccionar segmento</option>
                {TIPOS_CLIENTE.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Vendedor asignado">
              <select
                name="vendedor_asignado"
                value={formData.vendedor_asignado}
                onChange={handleChange}
                disabled={loading}
                className={fieldClass}
              >
                <option value="">Seleccionar vendedor</option>
                {vendedores.map((vendedor) => (
                  <option key={vendedor.id} value={vendedor.id}>
                    {vendedor.nombre} {vendedor.apellido}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Destino tarifario Miami">
              <select
                name="preferred_miami_rate_destination"
                value={formData.preferred_miami_rate_destination}
                onChange={handleChange}
                className={fieldClass}
              >
                {MIAMI_RATE_DESTINATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Seguro de carga"
            description="Configuracion de seguro para cotizaciones automaticas"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                name="asegura_carga"
                checked={formData.asegura_carga}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300"
              />
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Cliente asegura carga
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Se aplicara el porcentaje al calcular el seguro
                </p>
              </div>
            </label>

            {formData.asegura_carga && (
              <Field label="Porcentaje de seguro (%)">
                <input
                  type="number"
                  name="seguro_porcentaje"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.seguro_porcentaje}
                  onChange={handleChange}
                  className={fieldClass}
                />
              </Field>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <SectionHeader
            title="Notas"
            description="Observaciones internas y condiciones especiales de tarifas"
          />

          <div className="space-y-4">
            <Field label="Observaciones">
              <textarea
                name="observaciones"
                placeholder="Observaciones generales del cliente..."
                value={formData.observaciones}
                onChange={handleChange}
                rows={3}
                className={cn(fieldClass, 'resize-y')}
              />
            </Field>

            <Field label="Notas o condiciones especiales de tarifas">
              <textarea
                name="notas_tarifas"
                placeholder="Condiciones especiales de precios, acuerdos, etc..."
                value={formData.notas_tarifas}
                onChange={handleChange}
                rows={3}
                className={cn(fieldClass, 'resize-y')}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            El codigo de cliente y la fecha de creacion se generan automaticamente.
          </p>
          <button
            type="submit"
            disabled={creating}
            className={cn(
              'rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100',
              creating && 'cursor-not-allowed'
            )}
          >
            {creating ? 'Creando...' : 'Crear Cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}
