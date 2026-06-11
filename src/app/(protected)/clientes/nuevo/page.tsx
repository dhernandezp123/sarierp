'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { cn } from '../../../../lib/utils'
import {
  CONDICIONES_PAGO,
  TIPOS_CLIENTE,
  TIPOS_EMPRESA,
} from '../../../../lib/constants/clientes'

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
  asegura_carga: false,
  seguro_porcentaje: '',
  notas_tarifas: '',
}

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400/20 dark:disabled:bg-slate-800 dark:disabled:text-slate-500'

const buttonClass =
  'bg-black text-white px-6 py-3 rounded-xl mt-6 disabled:bg-gray-400'

export default function NuevoClientePage() {
  const { profile } = useUser()
  const router = useRouter()

  const [formData, setFormData] = useState(initialFormData)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchVendedores()
  }, [])

  const fetchVendedores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('rol', ['Ventas', 'Admin'])

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
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }

    if (name === 'condicion_pago') {
      const diasCredito = value.match(/\d+/)?.[0] ?? ''
      nextFormData.dias_credito = diasCredito
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

    const { data, error } = await supabase
      .from('clientes')
      .insert([
        {
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
          dias_credito:
            formData.condicion_pago.startsWith('Crédito')
              ? Number(formData.dias_credito)
              : 0,
          tipo_cliente: formData.tipo_cliente,
          vendedor_asignado: user.id,
          origen_frecuente: formData.origen_frecuente,
          asegura_carga: formData.asegura_carga,
          seguro_porcentaje: formData.asegura_carga
            ? Number(formData.seguro_porcentaje || 0)
            : null,
          notas_tarifas: formData.notas_tarifas,
        },
      ])
      .select()
      .single()

    if (error) {
      toast.error(error.message)
      setCreating(false)
      return
    }

    await supabase
      .from('cliente_history')
      .insert([
        {
          cliente_id: data.id,
          changed_by: profile?.id,
          action: 'Cliente creado',
          notes: `Cliente ${data.codigo_cliente} creado`,
        },
      ])

    toast.success(`Cliente creado correctamente: ${data.codigo_cliente}`)
    setCreating(false)
    setFormData(initialFormData)

    setTimeout(() => {
      router.push('/clientes')
    }, 1200)
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    createCliente()
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Nuevo Cliente</h1>
            <p className="text-gray-500 mt-2">
              Registra la información comercial y de contacto del cliente.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push('/clientes')}
            className="rounded-xl border px-6 py-3 font-semibold hover:bg-slate-50"
          >
            Volver
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <div className="grid grid-cols-3 gap-4">
            <input name="nombre" placeholder="Nombre" value={formData.nombre || ''} onChange={handleChange} className={fieldClass} />
            <input
              type="text"
              name="contacto"
              placeholder="Contacto"
              value={formData.contacto || ''}
              onChange={handleChange}
              className={fieldClass}
            />
            <input name="nit" placeholder="RTN / NIT" value={formData.nit || ''} onChange={handleChange} className={fieldClass} />
            <input name="telefono" placeholder="Teléfono" value={formData.telefono || ''} onChange={handleChange} className={fieldClass} />

            <input name="direccion" placeholder="Dirección" value={formData.direccion || ''} onChange={handleChange} className={fieldClass} />
            <input name="ciudad" placeholder="Ciudad" value={formData.ciudad || ''} onChange={handleChange} className={fieldClass} />
            <input name="departamento_estado" placeholder="Departamento / Estado" value={formData.departamento_estado || ''} onChange={handleChange} className={fieldClass} />
            <input name="pais" placeholder="País" value={formData.pais || ''} onChange={handleChange} className={fieldClass} />

            <input name="email_1" placeholder="Email 1" value={formData.email_1 || ''} onChange={handleChange} className={fieldClass} />
            <input name="email_2" placeholder="Email 2" value={formData.email_2 || ''} onChange={handleChange} className={fieldClass} />
            <input name="email_3" placeholder="Email 3" value={formData.email_3 || ''} onChange={handleChange} className={fieldClass} />

            <select name="tipo_persona" value={formData.tipo_persona || ''} onChange={handleChange} className={fieldClass}>
              {TIPOS_EMPRESA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>

            <select name="condicion_pago" value={formData.condicion_pago || ''} onChange={handleChange} className={fieldClass}>
              {CONDICIONES_PAGO.map((condicion) => (
                <option key={condicion} value={condicion}>
                  {condicion}
                </option>
              ))}
            </select>

            {formData.condicion_pago.startsWith('Crédito') && (
              <input
                name="dias_credito"
                placeholder="Días de crédito"
                value={formData.dias_credito || ''}
                onChange={handleChange}
                className={fieldClass}
              />
            )}

            <select name="tipo_cliente" value={formData.tipo_cliente || ''} onChange={handleChange} className={fieldClass}>
              <option value="">Tipo de Cliente / Segmento</option>
              {TIPOS_CLIENTE.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>

            <select
              name="vendedor_asignado"
              value={formData.vendedor_asignado || ''}
              onChange={handleChange}
              className={fieldClass}
              disabled={loading}
            >
              <option value="">Vendedor asignado</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} {vendedor.apellido}
                </option>
              ))}
            </select>

            <input name="origen_frecuente" placeholder="Origen frecuente" value={formData.origen_frecuente || ''} onChange={handleChange} className={fieldClass} />

            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <input
                type="checkbox"
                name="asegura_carga"
                checked={formData.asegura_carga}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700"
              />
              Cliente asegura carga
            </label>

            {formData.asegura_carga && (
              <input
                type="number"
                name="seguro_porcentaje"
                min="0"
                step="0.01"
                placeholder="Porcentaje de seguro (%)"
                value={formData.seguro_porcentaje || ''}
                onChange={handleChange}
                className={fieldClass}
              />
            )}
          </div>

          <textarea
            name="observaciones"
            placeholder="Observaciones"
            value={formData.observaciones || ''}
            onChange={handleChange}
            className={`${fieldClass} mt-4 min-h-24 resize-y`}
          />

          <textarea
            name="notas_tarifas"
            placeholder="Notas o condiciones especiales de tarifas"
            value={formData.notas_tarifas || ''}
            onChange={handleChange}
            className={`${fieldClass} mt-4 min-h-24 resize-y`}
          />

          <p className="text-sm text-gray-500 mt-4">
            Fecha de creación: se generará automáticamente al crear el cliente.
          </p>

          <button
            type="submit"
            disabled={creating}
            className={cn(
              buttonClass,
              creating && 'cursor-not-allowed opacity-60'
            )}
          >
            {creating ? 'Creando...' : 'Crear Cliente'}
          </button>
          </div>
        </form>
      </div>
    </>
  )
}
