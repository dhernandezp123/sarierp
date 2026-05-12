'use client'

import { useEffect, useState } from 'react'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'

export default function NewQuotationPage() {
  const { profile } = useUser()

  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])

  const [formData, setFormData] = useState({
    cliente_id: '',

    quote_type: 'Cotización Marítima FCL',
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

    container_type: '',
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
    fetchLocations()
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

  const fetchLocations = async () => {
    const { data, error } = await supabase
      .from('locations_catalog')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setLocations(data || [])
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

  const saveLocationIfNeeded = async (name: string) => {
    if (!name) return

    await supabase
      .from('locations_catalog')
      .upsert(
        [
          {
            name,
            type: 'Puerto / Lugar',
          },
        ],
        {
          onConflict: 'name,country,type',
        }
      )
  }

  const handleSubmit = async () => {
    if (!formData.cliente_id) {
      alert('Debes seleccionar un cliente')
      return
    }

    try {
      setLoading(true)

      await saveLocationIfNeeded(formData.origen)
      await saveLocationIfNeeded(formData.destino)
      await saveLocationIfNeeded(formData.puerto_origen)
      await saveLocationIfNeeded(formData.puerto_destino)

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

          container_type: formData.container_type,
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
          status: 'Solicitud',
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

        quote_type: 'Cotización Marítima FCL',
        valid_until: '',

        contact_name: '',
        contact_email: '',
        contact_phone: '',
        contact_country: '',

        incoterm: '',
        tipo_transporte: '',

        origen: '',
        destino: '',
        puerto_origen: '',
        puerto_destino: '',
        pickup_address: '',

        container_type: '',
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

      await fetchLocations()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="max-w-6xl">
        <h1 className="text-4xl font-bold mb-8">
          Nueva Cotización
        </h1>

        <div className="bg-white rounded-xl shadow p-8 space-y-8">
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
                    {cliente.codigo_cliente} — {cliente.nombre}
                  </option>
                ))}
              </select>

              <select
                name="quote_type"
                value={formData.quote_type}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="Cotización Marítima FCL">
                  Cotización Marítima FCL
                </option>
                <option value="Cotización Marítima LCL">
                  Cotización Marítima LCL
                </option>
                <option value="Cotización Aérea">
                  Cotización Aérea
                </option>
                <option value="Cotización Terrestre FTL">
                  Cotización Terrestre FTL
                </option>
                <option value="Cotización Terrestre LTL">
                  Cotización Terrestre LTL
                </option>
              </select>

              <input
                type="date"
                name="valid_until"
                value={formData.valid_until}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <select
                name="incoterm"
                value={formData.incoterm}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="">Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>

              <select
                name="tipo_transporte"
                value={formData.tipo_transporte}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="">Transporte</option>
                <option value="Maritimo">Marítimo</option>
                <option value="Aereo">Aéreo</option>
                <option value="Terrestre">Terrestre</option>
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
                placeholder="País"
                value={formData.contact_country}
                disabled
                className="border p-3 rounded bg-gray-100"
              />

              <input
                name="contact_state"
                placeholder="Departamento / Estado"
                value={formData.contact_state}
                disabled
                className="border p-3 rounded bg-gray-100"
                />
                
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">
              Ruta
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <input
                list="locations"
                name="origen"
                placeholder="Origen"
                value={formData.origen}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="locations"
                name="destino"
                placeholder="Destino"
                value={formData.destino}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="locations"
                name="puerto_origen"
                placeholder="Puerto origen"
                value={formData.puerto_origen}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                list="locations"
                name="puerto_destino"
                placeholder="Puerto destino"
                value={formData.puerto_destino}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="preferred_carrier"
                placeholder="Naviera de preferencia"
                value={formData.preferred_carrier}
                onChange={handleChange}
                className="border p-3 rounded"
              />

<input
  name="target_rate"
  placeholder="Target $"
  value={formData.target_rate}
  onChange={handleChange}
  className="border p-3 rounded"
/>

              {formData.incoterm === 'EXW' && (
                <textarea
                  name="pickup_address"
                  placeholder="Dirección de recolección EXW"
                  value={formData.pickup_address}
                  onChange={handleChange}
                  className="border p-3 rounded col-span-2 h-24"
                />
              )}

              <datalist id="locations">
                {locations.map((location) => (
                  <option
                    key={location.id}
                    value={location.name}
                  />
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

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-xl"
          >
            {loading ? 'Guardando...' : 'Crear Cotización'}
          </button>
        </div>
      </div>
    </AppLayout>
  )
}