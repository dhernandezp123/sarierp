'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { supabase } from '../../../../../lib/supabase/client'
import {
  CONDICIONES_PAGO,
  TIPOS_CLIENTE,
  TIPOS_EMPRESA,
} from '../../../../../lib/constants/clientes'

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-400 dark:focus:ring-slate-400/20 dark:disabled:bg-slate-800 dark:disabled:text-slate-500'

export default function EditClientePage() {
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vendedores, setVendedores] = useState<any[]>([])

  const [formData, setFormData] = useState({
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
    notas_tarifas: '',
  })

  useEffect(() => {
    if (params.id) {
      fetchCliente()
      fetchVendedores()
    }
  }, [params.id])

  const fetchCliente = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', params.id as string)
      .is('deleted_at', null)
      .single()

    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }

    setFormData({
      nombre: data.nombre || '',
      contacto: data.contacto || '',
      nit: data.nit || data.rtn || '',
      telefono: data.telefono || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      departamento_estado: data.departamento_estado || '',
      pais: data.pais || 'Honduras',
      email_1: data.email_1 || '',
      email_2: data.email_2 || '',
      email_3: data.email_3 || '',
      observaciones: data.observaciones || '',
      tipo_persona: data.tipo_persona || 'Corporativo',
      condicion_pago: data.condicion_pago || 'Contado',
      dias_credito: data.dias_credito?.toString() || '',
      tipo_cliente: data.tipo_cliente || '',
      vendedor_asignado: data.vendedor_asignado || '',
      origen_frecuente: data.origen_frecuente || '',
      asegura_carga: Boolean(data.asegura_carga),
      notas_tarifas: data.notas_tarifas || '',
    })

    setLoading(false)
  }

  const fetchVendedores = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('rol', ['Ventas', 'Admin'])

    if (error) {
      toast.error(error.message)
      return
    }

    setVendedores(data || [])
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

  const handleSave = async () => {
    if (!formData.nombre) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }

    setSaving(true)

    const payload = {
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
          ? Number(formData.dias_credito || 0)
          : 0,
      tipo_cliente: formData.tipo_cliente,
      vendedor_asignado: formData.vendedor_asignado || null,
      origen_frecuente: formData.origen_frecuente,
      asegura_carga: formData.asegura_carga,
      notas_tarifas: formData.notas_tarifas,
    }

    const { data, error } = await supabase
      .from('clientes')
      .update(payload)
      .eq('id', params.id as string)
      .select('*')

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    if (!data || data.length === 0) {
      toast.error('No se actualizó ningún cliente. Revisa el ID usado.')
      setSaving(false)
      return
    }

    toast.success('Cliente actualizado correctamente')
    setSaving(false)
    router.push(`/clientes/${params.id}`)
  }

  if (loading) {
    return <div className="p-8">Cargando cliente...</div>
  }

  return (
    <>
      <div className="max-w-5xl space-y-6">
        <button
          type="button"
          onClick={() => router.push(`/clientes/${params.id}`)}
          className="rounded-xl border px-4 py-2 font-semibold"
        >
          Volver al perfil
        </button>

        <div>
          <h1 className="text-4xl font-bold">Editar Cliente</h1>
          <p className="text-gray-500 mt-2">
            Actualiza la información comercial, fiscal y de contacto del cliente.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              name="nombre"
              placeholder="Nombre"
              value={formData.nombre || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="contacto"
              placeholder="Contacto"
              value={formData.contacto || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="nit"
              placeholder="RTN / NIT"
              value={formData.nit || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="telefono"
              placeholder="Teléfono"
              value={formData.telefono || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="direccion"
              placeholder="Dirección"
              value={formData.direccion || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="ciudad"
              placeholder="Ciudad"
              value={formData.ciudad || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="departamento_estado"
              placeholder="Departamento / Estado"
              value={formData.departamento_estado || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="pais"
              placeholder="País"
              value={formData.pais || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="email_1"
              placeholder="Email 1"
              value={formData.email_1 || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="email_2"
              placeholder="Email 2"
              value={formData.email_2 || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <input
              name="email_3"
              placeholder="Email 3"
              value={formData.email_3 || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <select
              name="tipo_persona"
              value={formData.tipo_persona || ''}
              onChange={handleChange}
              className={fieldClass}
            >
              {TIPOS_EMPRESA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </select>

            <select
              name="condicion_pago"
              value={formData.condicion_pago || ''}
              onChange={handleChange}
              className={fieldClass}
            >
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

            <select
              name="tipo_cliente"
              value={formData.tipo_cliente || ''}
              onChange={handleChange}
              className={fieldClass}
            >
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
            >
              <option value="">Vendedor asignado</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} {vendedor.apellido}
                </option>
              ))}
            </select>

            <input
              name="origen_frecuente"
              placeholder="Origen frecuente"
              value={formData.origen_frecuente || ''}
              onChange={handleChange}
              className={fieldClass}
            />

            <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <input
                type="checkbox"
                name="asegura_carga"
                checked={formData.asegura_carga}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700"
              />
              Asegura carga
            </label>
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

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push(`/clientes/${params.id}`)}
              className="rounded-xl border px-6 py-3 font-semibold"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-black px-6 py-3 text-white font-semibold disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
