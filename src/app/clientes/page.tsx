'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/client'
import AppLayout from '../../components/layout/app-layout'
import { useUser } from '../../hooks/useUser'

export default function ClientesPage() {
  const { profile } = useUser()

  const [activeTab, setActiveTab] = useState('datos')
  const [clientes, setClientes] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [formData, setFormData] = useState({
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
  })

  useEffect(() => {
    fetchClientes()
    fetchVendedores()
  }, [])

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        profiles:vendedor_asignado (
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setClientes(data || [])
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

  const createCliente = async () => {
    if (!formData.nombre) {
      alert('El nombre del cliente es obligatorio')
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
            formData.condicion_pago === 'Credito'
              ? Number(formData.dias_credito)
              : 0,
          tipo_cliente: formData.tipo_cliente,
          vendedor_asignado: formData.vendedor_asignado || null,
          origen_frecuente: formData.origen_frecuente,
          asegura_carga: formData.asegura_carga,
          notas_tarifas: formData.notas_tarifas,
        },
      ])
      .select()
      .single()

    if (error) {
      alert(error.message)
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

    setFormData({
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
    })

    await fetchClientes()
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <h1 className="text-4xl font-bold mb-8">Clientes</h1>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setActiveTab('datos')}
            className={`px-4 py-2 rounded ${
              activeTab === 'datos'
                ? 'bg-black text-white'
                : 'bg-gray-100'
            }`}
          >
            Datos
          </button>

          <button
            onClick={() => setActiveTab('tarifas')}
            className={`px-4 py-2 rounded ${
              activeTab === 'tarifas'
                ? 'bg-black text-white'
                : 'bg-gray-100'
            }`}
          >
            Tarifas
          </button>

          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2 rounded ${
              activeTab === 'historial'
                ? 'bg-black text-white'
                : 'bg-gray-100'
            }`}
          >
            Historial
          </button>
        </div>

        {activeTab === 'datos' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              Nuevo Cliente
            </h2>

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
                <option value="Credito">Crédito</option>
              </select>

              {formData.condicion_pago === 'Credito' && (
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

              <select name="vendedor_asignado" value={formData.vendedor_asignado} onChange={handleChange} className="border p-3 rounded">
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

            <p className="text-sm text-gray-500 mt-4">
              Fecha de creación: se generará automáticamente al crear el cliente.
            </p>

            <button
              onClick={createCliente}
              className="bg-black text-white px-6 py-3 rounded-xl mt-6"
            >
              Crear Cliente
            </button>
          </div>
        )}

        {activeTab === 'tarifas' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Tarifas</h2>

            <textarea
              name="notas_tarifas"
              placeholder="Notas o condiciones especiales de tarifas"
              value={formData.notas_tarifas}
              onChange={handleChange}
              className="w-full border p-3 rounded h-40"
            />

            <p className="text-gray-500 mt-4">
              Más adelante aquí conectaremos tarifas por ruta, origen/destino, modalidad y vigencia.
            </p>
          </div>
        )}

        {activeTab === 'historial' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              Historial
            </h2>

            <p className="text-gray-500">
              El historial se mostrará al seleccionar un cliente existente.
              Por ahora se guarda el evento inicial de creación.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-2xl font-bold mb-4">
          Clientes Registrados
        </h2>

        {loading ? (
          <p>Cargando clientes...</p>
        ) : clientes.length === 0 ? (
          <p className="text-gray-500">No hay clientes registrados.</p>
        ) : (
          <div className="space-y-3">
            {clientes.map((cliente) => (
              <div key={cliente.id} className="border rounded-lg p-4">
                <div className="flex justify-between">
                  <div>
                    <p className="font-bold">
                      {cliente.codigo_cliente} — {cliente.nombre}
                    </p>

                    <p className="text-sm text-gray-500">
                      RTN/NIT: {cliente.nit || 'N/A'}
                    </p>

                    <p className="text-sm text-gray-500">
                      {cliente.ciudad || 'N/A'}, {cliente.pais || 'N/A'}
                    </p>

                    <p className="text-sm text-gray-500">
                      Vendedor: {cliente.profiles
                        ? `${cliente.profiles.nombre} ${cliente.profiles.apellido}`
                        : 'No asignado'}
                    </p>
                  </div>

                  <div className="text-right text-sm text-gray-500">
                    <p>{cliente.tipo_persona}</p>
                    <p>{cliente.condicion_pago}</p>
                    {cliente.condicion_pago === 'Credito' && (
                      <p>{cliente.dias_credito} días</p>
                    )}
                    <p>
                      Creado: {new Date(cliente.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}