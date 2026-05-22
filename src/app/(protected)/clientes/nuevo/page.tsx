'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'

const initialFormData = {
  nombre: '',
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
}

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
      alert(error.message)
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

    setFormData({
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    })
  }

  const createCliente = async () => {
    if (!formData.nombre) {
      alert('El nombre del cliente es obligatorio')
      return
    }

    setCreating(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      alert('No se pudo validar el usuario autenticado.')
      setCreating(false)
      return
    }

    const { data, error } = await supabase
      .from('clientes')
      .insert([
        {
          nombre: formData.nombre,
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
            formData.condicion_pago === 'Crédito'
              ? Number(formData.dias_credito)
              : 0,
          tipo_cliente: formData.tipo_cliente,
          vendedor_asignado: user.id,
          origen_frecuente: formData.origen_frecuente,
          asegura_carga: formData.asegura_carga,
          notas_tarifas: formData.notas_tarifas,
        },
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
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

    alert(`Cliente creado correctamente: ${data.codigo_cliente}`)
    setFormData(initialFormData)
    setCreating(false)
    router.push('/clientes')
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

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-6">
          <div className="grid grid-cols-3 gap-4">
            <input name="nombre" placeholder="Nombre" value={formData.nombre} onChange={handleChange} className="border p-3 rounded" />
            <input name="nit" placeholder="RTN / NIT" value={formData.nit} onChange={handleChange} className="border p-3 rounded" />
            <input name="telefono" placeholder="Teléfono" value={formData.telefono} onChange={handleChange} className="border p-3 rounded" />

            <input name="direccion" placeholder="Dirección" value={formData.direccion} onChange={handleChange} className="border p-3 rounded" />
            <input name="ciudad" placeholder="Ciudad" value={formData.ciudad} onChange={handleChange} className="border p-3 rounded" />
            <input name="departamento_estado" placeholder="Departamento / Estado" value={formData.departamento_estado} onChange={handleChange} className="border p-3 rounded" />
            <input name="pais" placeholder="País" value={formData.pais} onChange={handleChange} className="border p-3 rounded" />

            <input name="email_1" placeholder="Email 1" value={formData.email_1} onChange={handleChange} className="border p-3 rounded" />
            <input name="email_2" placeholder="Email 2" value={formData.email_2} onChange={handleChange} className="border p-3 rounded" />
            <input name="email_3" placeholder="Email 3" value={formData.email_3} onChange={handleChange} className="border p-3 rounded" />

            <select name="tipo_persona" value={formData.tipo_persona} onChange={handleChange} className="border p-3 rounded">
              <option value="Natural">Natural</option>
              <option value="Corporativo">Corporativo</option>
            </select>

            <select name="condicion_pago" value={formData.condicion_pago} onChange={handleChange} className="border p-3 rounded">
              <option value="Contado">Contado</option>
              <option value="Crédito">Crédito</option>
            </select>

            {formData.condicion_pago === 'Crédito' && (
              <input
                name="dias_credito"
                placeholder="Días de crédito"
                value={formData.dias_credito}
                onChange={handleChange}
                className="border p-3 rounded"
              />
            )}

            <select name="tipo_cliente" value={formData.tipo_cliente} onChange={handleChange} className="border p-3 rounded">
              <option value="">Tipo de Cliente / Segmento</option>
              <option value="Retail">Retail</option>
              <option value="Industrial">Industrial</option>
              <option value="Agroindustria">Agroindustria</option>
              <option value="Textil">Textil</option>
              <option value="Automotriz">Automotriz</option>
              <option value="Farmacéutico">Farmacéutico</option>
              <option value="Tecnología">Tecnología</option>
              <option value="Forwarder">Forwarder</option>
              <option value="Otro">Otro</option>
            </select>

            <select
              name="vendedor_asignado"
              value={formData.vendedor_asignado}
              onChange={handleChange}
              className="border p-3 rounded"
              disabled={loading}
            >
              <option value="">Vendedor asignado</option>
              {vendedores.map((vendedor) => (
                <option key={vendedor.id} value={vendedor.id}>
                  {vendedor.nombre} {vendedor.apellido}
                </option>
              ))}
            </select>

            <input name="origen_frecuente" placeholder="Origen frecuente" value={formData.origen_frecuente} onChange={handleChange} className="border p-3 rounded" />

            <label className="flex items-center gap-2 border p-3 rounded">
              <input
                type="checkbox"
                name="asegura_carga"
                checked={formData.asegura_carga}
                onChange={handleChange}
              />
              Asegura carga
            </label>
          </div>

          <textarea
            name="observaciones"
            placeholder="Observaciones"
            value={formData.observaciones}
            onChange={handleChange}
            className="w-full border p-3 rounded h-28 mt-4"
          />

          <textarea
            name="notas_tarifas"
            placeholder="Notas o condiciones especiales de tarifas"
            value={formData.notas_tarifas}
            onChange={handleChange}
            className="w-full border p-3 rounded h-28 mt-4"
          />

          <p className="text-sm text-gray-500 mt-4">
            Fecha de creación: se generará automáticamente al crear el cliente.
          </p>

          <button
            type="submit"
            disabled={creating}
            className="bg-black text-white px-6 py-3 rounded-xl mt-6 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {creating ? 'Creando...' : 'Crear Cliente'}
          </button>
        </form>
      </div>
    </>
  )
}
