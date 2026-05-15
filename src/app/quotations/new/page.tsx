'use client'

import { useEffect, useState } from 'react'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'

export default function NewQuotationPage() {
  const { profile } = useUser()

  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])

  const [formData, setFormData] = useState({
    cliente_id: '',

    quote_type: '',
    valid_until: '',

    contact_name: '',
    contact_email: '',
    contact_phone: '',
    contact_state: '',
    contact_country: '',
    preferred_carrier: '',
    target_rate: '',
    commercial_value: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',
    delivery_address: '',

    container_type: '',
    container_qty: '',
    package_type: '',
    package_details: '',
    peso_kg: '',
    gross_weight: '',
    volumen_cbm: '',
    cantidad_bultos: '',
    commodity: '',

    requires_insurance: false,
    fob_value: '',
    freight_value: '',
    insurance_markup_percentage: '10',
    insurance_rate: '1.0',
    insurance_cost: '0',

    observaciones: '',
  })

  useEffect(() => {
    fetchClientes()
    fetchCatalogs()
  }, [])

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('nombre', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setClientes(data || [])
  }

  const fetchCatalogs = async () => {
    const { data: countriesData, error: countriesError } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (countriesError) {
      alert(countriesError.message)
      return
    }

    const { data: portsData, error: portsError } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    if (portsError) {
      alert(portsError.message)
      return
    }

    setCountries(countriesData || [])
    setPorts(portsData || [])
  }

  const calculateInsurance = (data: any) => {
    const fob = Number(data.fob_value || 0)
    const freight = Number(data.freight_value || 0)
    const markup = Number(data.insurance_markup_percentage || 0)
    const rate = Number(data.insurance_rate || 0)

    const cost =
      ((fob + freight) * (1 + markup / 100)) * (rate / 100)

    return cost.toFixed(2)
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target

    const updatedData = {
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }

    if (
      name === 'fob_value' ||
      name === 'freight_value' ||
      name === 'insurance_markup_percentage' ||
      name === 'insurance_rate' ||
      name === 'requires_insurance'
    ) {
      updatedData.insurance_cost = calculateInsurance(updatedData)
    }

    setFormData(updatedData)
  }

  const handleClienteChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const clienteId = e.target.value

    const selectedCliente = clientes.find(
      (cliente) => cliente.id === clienteId
    )

    const updatedData = {
      ...formData,
      cliente_id: clienteId,
      contact_name: selectedCliente?.nombre || '',
      contact_email: selectedCliente?.email_1 || '',
      contact_phone: selectedCliente?.telefono || '',
      contact_state: selectedCliente?.departamento_estado || '',
      contact_country: selectedCliente?.pais || '',
      origen: selectedCliente?.origen_frecuente || formData.origen,
      insurance_rate:
        selectedCliente?.seguro_porcentaje?.toString() || '1.0',
    }

    updatedData.insurance_cost = calculateInsurance(updatedData)

    setFormData(updatedData)
  }

  const handleSubmit = async (status: string) => {
    if (!formData.cliente_id) {
      alert('Debes seleccionar un cliente')
      return
    }

    try {
      setLoading(true)

      const { error } = await supabase.from('quotations').insert([
        {
          cliente_id: formData.cliente_id,

          quote_type: formData.quote_type,
          valid_until: formData.valid_until || null,

          contact_name: formData.contact_name,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,

          preferred_carrier: formData.preferred_carrier,
          target_rate: Number(formData.target_rate),
          commercial_value: Number(formData.commercial_value),

          incoterm: formData.incoterm,
          tipo_transporte: formData.tipo_transporte,

          origen: formData.origen,
          destino: formData.destino,
          puerto_origen: formData.puerto_origen,
          puerto_destino: formData.puerto_destino,
          pickup_address: formData.pickup_address,
          delivery_address: formData.delivery_address,

          container_type: formData.container_type,
          container_qty: Number(formData.container_qty || 0),
          package_type: formData.package_type,
          package_details: formData.package_details,
          peso_kg: Number(formData.peso_kg),
          gross_weight: Number(formData.gross_weight),
          volumen_cbm: Number(formData.volumen_cbm),
          cantidad_bultos: Number(formData.cantidad_bultos),
          commodity: formData.commodity,

          requires_insurance: formData.requires_insurance,
          fob_value: Number(formData.fob_value),
          freight_value: Number(formData.freight_value),
          insurance_markup_percentage: Number(
            formData.insurance_markup_percentage
          ),
          insurance_rate: Number(formData.insurance_rate),
          insurance_cost: Number(formData.insurance_cost),

          observaciones: formData.observaciones,
          status,
          created_by: profile?.id,
        },
      ])

      if (error) {
        alert(error.message)
        return
      }

      alert('Cotización creada correctamente')

      setFormData({
        cliente_id: '',

        quote_type: '',
        valid_until: '',

        contact_name: '',
        contact_email: '',
        contact_phone: '',
        contact_state: '',
        contact_country: '',
        preferred_carrier: '',
        target_rate: '',
        commercial_value: '',

        incoterm: '',
        tipo_transporte: '',

        origen: '',
        destino: '',
        puerto_origen: '',
        puerto_destino: '',
        pickup_address: '',
        delivery_address: '',

        container_type: '',
        container_qty: '',
        package_type: '',
        package_details: '',
        peso_kg: '',
        gross_weight: '',
        volumen_cbm: '',
        cantidad_bultos: '',
        commodity: '',

        requires_insurance: false,
        fob_value: '',
        freight_value: '',
        insurance_markup_percentage: '10',
        insurance_rate: '1.0',
        insurance_cost: '0',

        observaciones: '',
      })

      await fetchCatalogs()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const originCountry = countries.find(
    (country) => country.name === formData.origen
  )

  const destinationCountry = countries.find(
    (country) => country.name === formData.destino
  )

  const originPorts = originCountry
    ? ports.filter((port) => port.country_id === originCountry.id)
    : ports

  const destinationPorts = destinationCountry
    ? ports.filter((port) => port.country_id === destinationCountry.id)
    : ports

  const quoteTypeOptions: Record<string, string[]> = {
    Aéreo: ['Courier', 'Consolidado'],
    Marítima: ['LCL', 'FCL'],
    Terrestre: ['LTL', 'FTL'],
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="max-w-6xl">
        <h1 className="text-4xl font-bold mb-8">
          Nueva Cotización
        </h1>

        <div className="bg-white rounded-xl shadow p-8 space-y-8">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">
              Tipo de Cotización
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <select
                className="border rounded-xl px-3 py-2"
                value={formData.tipo_transporte}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tipo_transporte: e.target.value,
                    quote_type: '',
                  })
                }
              >
                <option value="">Seleccionar transporte</option>
                <option value="Aéreo">Aéreo</option>
                <option value="Marítima">Marítima</option>
                <option value="Terrestre">Terrestre</option>
              </select>

              <select
                className="border rounded-xl px-3 py-2"
                value={formData.quote_type}
                onChange={(e) =>
                  setFormData({ ...formData, quote_type: e.target.value })
                }
                disabled={!formData.tipo_transporte}
              >
                <option value="">Seleccionar tipo</option>

                {(quoteTypeOptions[formData.tipo_transporte] || []).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Información General
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <select
                name="cliente_id"
                value={formData.cliente_id}
                onChange={handleClienteChange}
                className="border p-3 rounded"
              >
                <option value="">Seleccionar cliente</option>

                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.codigo_cliente} Ã¢â‚¬â€ {cliente.nombre}
                  </option>
                ))}
              </select>

              

              <input
                type="date"
                name="valid_until"
                value={formData.valid_until || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <select
                name="incoterm"
                value={formData.incoterm}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="">Seleccionar Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>

              
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Contacto del Cliente
            </h2>

            <div className="grid grid-cols-4 gap-4">
              <input
                name="contact_name"
                placeholder="Contacto"
                value={formData.contact_name}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="contact_email"
                placeholder="Email"
                value={formData.contact_email}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="contact_phone"
                placeholder="Teléfono"
                value={formData.contact_phone}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="contact_country"
                placeholder="Paí­s"
                value={formData.contact_country}
                disabled
                className="border p-3 rounded bg-gray-100"
              />

              <input
                name="contact_state"
                placeholder="Departamento / Estado"
                value={formData.contact_state || ''}
                disabled
                className="border p-3 rounded bg-gray-100"
                />
                
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Información del Embarque
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <input
                list="countries"
                name="origen"
                placeholder="Paí­s de origen"
                value={formData.origen}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="countries"
                name="destino"
                placeholder="Paí­s de destino"
                value={formData.destino}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="originPorts"
                name="puerto_origen"
                placeholder="Puerto origen"
                value={formData.puerto_origen}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="destinationPorts"
                name="puerto_destino"
                placeholder="Puerto destino"
                value={formData.puerto_destino}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="preferred_carrier"
                placeholder="Carrier de preferencia"
                value={formData.preferred_carrier || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              />

<input
  name="target_rate"
  placeholder="Target $"
  value={formData.target_rate || ''}
  onChange={handleChange}
  className="border p-3 rounded"
/>

              <textarea
                className="border rounded-xl px-3 py-2 col-span-2"
                placeholder="Dirección de recolección EXW"
                value={formData.pickup_address}
                onChange={(e) =>
                  setFormData({ ...formData, pickup_address: e.target.value })
                }
              />

              <textarea
                className="border rounded-xl px-3 py-2 col-span-2"
                placeholder="Dirección de entrega"
                value={formData.delivery_address}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_address: e.target.value })
                }
              />
              <datalist id="countries">
                {countries.map((country) => (
                  <option
                    key={country.id}
                    value={country.name}
                  />
                ))}
              </datalist>

              <datalist id="originPorts">
                {originPorts.map((port) => (
                  <option key={port.id} value={port.name} />
                ))}
              </datalist>

              <datalist id="destinationPorts">
                {destinationPorts.map((port) => (
                  <option key={port.id} value={port.name} />
                ))}
              </datalist>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Información de Carga
            </h2>

            <div className="grid grid-cols-3 gap-4">
              <select
  name="container_type"
  value={formData.container_type}
  onChange={handleChange}
  className="border p-3 rounded"
>
  <option value="">Tipo de contenedor / unidad</option>
  <option value="Contenedor 20FR">Contenedor 20FR</option>
  <option value="Contenedor 20DR">Contenedor 20DR</option>
  <option value="Contenedor 20OT">Contenedor 20OT</option>
  <option value="Contenedor 40DR">Contenedor 40DR</option>
  <option value="Contenedor 40HC">Contenedor 40HC</option>
  <option value="Contenedor 40FR">Contenedor 40FR</option>
  <option value="Contenedor 45-102DR">Contenedor 45-102DR</option>
  <option value="Contenedor 40HR">Contenedor 40HR</option>
  <option value="Contenedor 40OT">Contenedor 40OT</option>
  <option value="Contenedor 40NOR">Contenedor 40NOR</option>
  <option value="Contenedor 20OT OH">Contenedor 20OT OH</option>
  <option value="Contenedor 53'">Contenedor 53'</option>
  <option value="Contenedor 20GP">Contenedor 20GP</option>
  <option value="Camion 8 tons">Camion 8 tons</option>
  <option value="Contenedor 48' FTL">Contenedor 48' FTL</option>
</select>

              <input
                className="border rounded-xl px-3 py-2"
                placeholder="Cantidad de contenedores / unidades"
                value={formData.container_qty}
                onChange={(e) =>
                  setFormData({ ...formData, container_qty: e.target.value })
                }
              />

              <select
                className="border rounded-xl px-3 py-2"
                value={formData.package_type}
                onChange={(e) =>
                  setFormData({ ...formData, package_type: e.target.value })
                }
              >
                <option value="">Tipo de empaque</option>
                <option value="Cajas">Cajas</option>
                <option value="Pallets">Pallets</option>
                <option value="Envases">Envases</option>
                <option value="Tubos">Tubos</option>
                <option value="Cajas metálicas">Cajas metálicas</option>
                <option value="Cilindros">Cilindros</option>
                <option value="Rollos">Rollos</option>
                <option value="Sacos">Sacos</option>
                <option value="Granel">Granel</option>
                <option value="Otro">Otro</option>
              </select>

              <input
                name="peso_kg"
                placeholder="Peso KG"
                value={formData.peso_kg}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="gross_weight"
                placeholder="Peso bruto"
                value={formData.gross_weight}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="volumen_cbm"
                placeholder="CBM"
                value={formData.volumen_cbm}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="cantidad_bultos"
                placeholder="Bultos"
                value={formData.cantidad_bultos}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="commodity"
                placeholder="Mercancía"
                value={formData.commodity}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <textarea
                className="border rounded-xl px-3 py-2 col-span-3"
                placeholder="Detalles del empaque / dimensiones / observaciones de carga"
                value={formData.package_details}
                onChange={(e) =>
                  setFormData({ ...formData, package_details: e.target.value })
                }
              />
            </div>
          </section>

          <section>
  <h2 className="text-xl font-semibold mb-4">
    Seguro de Carga
  </h2>

  <label className="flex items-center gap-2 mb-4">
    <input
      type="checkbox"
      name="requires_insurance"
      checked={formData.requires_insurance}
      onChange={handleChange}
    />
    Cliente solicita seguro de carga
  </label>

  {formData.requires_insurance && (
    <input
      name="commercial_value"
      placeholder="Valor comercial / Valor FOB"
      value={formData.commercial_value}
      onChange={handleChange}
      className="border p-3 rounded w-full"
    />
  )}
</section>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Observaciones para Pricing
            </h2>

            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleChange}
              className="border p-3 rounded w-full h-32"
            />
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => handleSubmit('Borrador')}
              disabled={loading}
              className="rounded-xl border px-6 py-3 font-semibold hover:bg-slate-50"
            >
              Guardar Cotización
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('Pendiente de Fijar Precios')}
              disabled={loading}
              className="rounded-xl bg-slate-950 text-white px-6 py-3 font-semibold hover:bg-slate-800"
            >
              Enviar a Pricing
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
