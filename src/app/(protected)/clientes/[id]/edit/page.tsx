'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../../../lib/supabase/client'
import { useUser } from '../../../../../hooks/useUser'

export default function EditClientePage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vendedores, setVendedores] = useState<any[]>([])

  const [formData, setFormData] = useState({
    nombre: '',
    contacto: '',
    rtn: '',
    telefono: '',
    email_1: '',
    email_2: '',
    direccion: '',
    ciudad: '',
    pais: '',
    condicion_pago: '',
    dias_credito: '',
    tipo_cliente: '',
    asegura_carga: false,
    vendedor_asignado: '',
    origen_frecuente: '',
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
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setFormData({
      nombre: data.nombre || '',
      contacto: data.contacto || data.contact_name || '',
      rtn: data.rtn || data.nit || '',
      telefono: data.telefono || '',
      email_1: data.email_1 || '',
      email_2: data.email_2 || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      pais: data.pais || '',
      condicion_pago: data.condicion_pago || '',
      dias_credito: data.dias_credito?.toString() || '',
      tipo_cliente: data.tipo_cliente || '',
      asegura_carga: Boolean(data.asegura_carga),
      vendedor_asignado: data.vendedor_asignado || '',
      origen_frecuente: data.origen_frecuente || '',
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
      alert(error.message)
      return
    }

    setVendedores(data || [])
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target

    setFormData({
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const id = params.id as string

    console.log('FormData antes de guardar:', formData)
    console.log('Telefono antes de guardar:', formData.telefono)
    console.log('ID usado para actualizar:', id)

    const payload = {
      nombre: formData.nombre,
      contacto: formData.contacto,
      rtn: formData.rtn,
      telefono: formData.telefono,
      email_1: formData.email_1,
      email_2: formData.email_2,
      direccion: formData.direccion,
      ciudad: formData.ciudad,
      pais: formData.pais,
      condicion_pago: formData.condicion_pago,
      dias_credito: Number(formData.dias_credito || 0),
      tipo_cliente: formData.tipo_cliente,
      asegura_carga: formData.asegura_carga,
      vendedor_asignado: formData.vendedor_asignado || null,
      origen_frecuente: formData.origen_frecuente,
      notas_tarifas: formData.notas_tarifas,
    }

    console.log('Payload update cliente:', payload)

    const { data, error } = await supabase
      .from('clientes')
      .update(payload)
      .eq('id', id)
      .select('*')

    console.log('Resultado update cliente:', data)

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    if (!data || data.length === 0) {
      alert('No se actualizó ningún cliente. Revisa el ID usado.')
      setSaving(false)
      return
    }

    setSaving(false)
    alert('Cliente actualizado correctamente')
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
            Actualiza la información comercial y fiscal del cliente.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="nombre" placeholder="Nombre del cliente" value={formData.nombre} onChange={handleChange} className="border p-3 rounded" />
            <input name="contacto" placeholder="Persona de contacto" value={formData.contacto} onChange={handleChange} className="border p-3 rounded" />
            <input name="rtn" placeholder="RTN" value={formData.rtn} onChange={handleChange} className="border p-3 rounded" />
            <input
              name="telefono"
              placeholder="Teléfono"
              value={formData.telefono || ''}
              onChange={(e) =>
                setFormData({ ...formData, telefono: e.target.value })
              }
              className="border p-3 rounded"
            />
            <input name="email_1" placeholder="Email principal" value={formData.email_1} onChange={handleChange} className="border p-3 rounded" />
            <input name="email_2" placeholder="Email secundario" value={formData.email_2} onChange={handleChange} className="border p-3 rounded" />
            <input name="ciudad" placeholder="Ciudad" value={formData.ciudad} onChange={handleChange} className="border p-3 rounded" />
            <input name="pais" placeholder="País" value={formData.pais} onChange={handleChange} className="border p-3 rounded" />

            <select
              name="condicion_pago"
              value={formData.condicion_pago}
              onChange={handleChange}
              className="border p-3 rounded"
            >
              <option value="">Condición de pago</option>
              <option value="Contado">Contado</option>
              <option value="Crédito">Crédito</option>
            </select>

            <select
              name="tipo_cliente"
              value={formData.tipo_cliente}
              onChange={handleChange}
              className="border p-3 rounded"
            >
              <option value="">Tipo de Cliente / Segmento</option>
              <option value="Natural">Natural</option>
              <option value="Corporativo">Corporativo</option>
            </select>

            <select
              name="vendedor_asignado"
              value={formData.vendedor_asignado}
              onChange={handleChange}
              className="border p-3 rounded"
            >
              <option value="">Vendedor asignado</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} {vendedor.apellido}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 border p-3 rounded">
              <input
                type="checkbox"
                name="asegura_carga"
                checked={formData.asegura_carga}
                onChange={handleChange}
              />
              Asegura carga
            </label>

            <input
              name="dias_credito"
              placeholder="Días de crédito"
              value={formData.dias_credito}
              onChange={handleChange}
              className="border p-3 rounded"
            />

            <input
              name="origen_frecuente"
              placeholder="Origen frecuente"
              value={formData.origen_frecuente}
              onChange={handleChange}
              className="border p-3 rounded"
            />

            <textarea
              name="direccion"
              placeholder="Dirección"
              value={formData.direccion}
              onChange={handleChange}
              className="border p-3 rounded md:col-span-2 h-24"
            />

            <textarea
              name="notas_tarifas"
              placeholder="Notas comerciales / tarifas"
              value={formData.notas_tarifas}
              onChange={handleChange}
              className="border p-3 rounded md:col-span-2 h-32"
            />
          </div>

          <div className="flex justify-end gap-3">
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
