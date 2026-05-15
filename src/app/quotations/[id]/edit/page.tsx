'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../../lib/supabase/client'
import AppLayout from '../../../../components/layout/app-layout'
import { useUser } from '../../../../hooks/useUser'

export default function EditQuotationPage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])

  const [formData, setFormData] = useState({
    quote_type: '',
    valid_until: '',
    transit_time: '',
    service_frequency: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',

    preferred_carrier: '',
    target_rate: '',
    target_sale: '',
    target_gp: '',

    container_type: '',
    peso_kg: '',
    gross_weight: '',
    volumen_cbm: '',
    cantidad_bultos: '',
    commodity: '',

    requires_insurance: false,
    commercial_value: '',

    observaciones: '',
  })

  useEffect(() => {
    fetchCatalogs()

    if (params.id) {
      fetchQuotation(params.id as string)
    }
  }, [params.id])

  const fetchCatalogs = async () => {
    const { data: countriesData } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: portsData } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    setCountries(countriesData || [])
    setPorts(portsData || [])
  }

  const fetchQuotation = async (id: string) => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setFormData({
      quote_type: data.quote_type || '',
      valid_until: data.valid_until || '',
      transit_time: data.transit_time || '',
      service_frequency: data.service_frequency || '',

      incoterm: data.incoterm || '',
      tipo_transporte: data.tipo_transporte || '',

      origen: data.origen || '',
      destino: data.destino || '',
      puerto_origen: data.puerto_origen || '',
      puerto_destino: data.puerto_destino || '',
      pickup_address: data.pickup_address || '',

      preferred_carrier: data.preferred_carrier || '',
      target_rate: data.target_rate?.toString() || '',
      target_sale: data.target_sale?.toString() || '',
      target_gp: data.target_gp?.toString() || '',

      container_type: data.container_type || '',
      peso_kg: data.peso_kg?.toString() || '',
      gross_weight: data.gross_weight?.toString() || '',
      volumen_cbm: data.volumen_cbm?.toString() || '',
      cantidad_bultos: data.cantidad_bultos?.toString() || '',
      commodity: data.commodity || '',

      requires_insurance: data.requires_insurance || false,
      commercial_value: data.commercial_value?.toString() || '',

      observaciones: data.observaciones || '',
    })

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

  const handleSave = async () => {
    if (!params.id) return

    setSaving(true)

    const { error } = await supabase
      .from('quotations')
      .update({
        quote_type: formData.quote_type,
        valid_until: formData.valid_until || null,
        transit_time: formData.transit_time,
        service_frequency: formData.service_frequency,

        incoterm: formData.incoterm,
        tipo_transporte: formData.tipo_transporte,

        origen: formData.origen,
        destino: formData.destino,
        puerto_origen: formData.puerto_origen,
        puerto_destino: formData.puerto_destino,
        pickup_address: formData.pickup_address,

        preferred_carrier: formData.preferred_carrier,
        target_rate: Number(formData.target_rate || 0),
        target_sale: Number(formData.target_sale || 0),
        target_gp: Number(formData.target_gp || 0),

        container_type: formData.container_type,
        peso_kg: Number(formData.peso_kg || 0),
        gross_weight: Number(formData.gross_weight || 0),
        volumen_cbm: Number(formData.volumen_cbm || 0),
        cantidad_bultos: Number(formData.cantidad_bultos || 0),
        commodity: formData.commodity,

        requires_insurance: formData.requires_insurance,
        commercial_value: Number(formData.commercial_value || 0),

        observaciones: formData.observaciones,
      })
      .eq('id', params.id as string)

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    alert('Cotización actualizada correctamente')
    router.push(`/quotations/${params.id}`)
  }

  if (loading) {
    return <div className="p-8">Cargando cotización...</div>
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

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="max-w-6xl space-y-6">
        <div>
          <h1 className="text-4xl font-bold">Editar Cotización</h1>
          <p className="text-gray-500 mt-2">
            Modifica datos de la cotización sin recrear el flujo completo.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-8 space-y-8">
          <section>
            <h2 className="text-xl font-bold mb-4">Información General</h2>

            <div className="grid grid-cols-3 gap-4">
              <select
                name="quote_type"
                value={formData.quote_type || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="">Tipo de cotización</option>
                <option value="Cotización Marítima FCL">Cotización Marítima FCL</option>
                <option value="Cotización Marítima LCL">Cotización Marítima LCL</option>
                <option value="Cotización Aérea">Cotización Aérea</option>
                <option value="Cotización Terrestre FTL">Cotización Terrestre FTL</option>
                <option value="Cotización Terrestre LTL">Cotización Terrestre LTL</option>
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
                value={formData.incoterm || ''}
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
                value={formData.tipo_transporte || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              >
                <option value="">Transporte</option>
                <option value="Maritimo">Marítimo</option>
                <option value="Aereo">Aéreo</option>
                <option value="Terrestre">Terrestre</option>
              </select>

              <input
                name="transit_time"
                placeholder="Tiempo de tránsito"
                value={formData.transit_time || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              />

              <input
                name="service_frequency"
                placeholder="Frecuencia / Servicio"
                value={formData.service_frequency || ''}
                onChange={handleChange}
                className="border p-3 rounded"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Ruta</h2>

            <div className="grid grid-cols-2 gap-4">
              <input list="countries" name="origen" placeholder="Origen" value={formData.origen || ''} onChange={handleChange} className="border p-3 rounded" />
              <input list="countries" name="destino" placeholder="Destino" value={formData.destino || ''} onChange={handleChange} className="border p-3 rounded" />
              <input list="originPorts" name="puerto_origen" placeholder="Puerto origen" value={formData.puerto_origen || ''} onChange={handleChange} className="border p-3 rounded" />
              <input list="destinationPorts" name="puerto_destino" placeholder="Puerto destino" value={formData.puerto_destino || ''} onChange={handleChange} className="border p-3 rounded" />

              <input
                name="preferred_carrier"
                placeholder="Naviera de preferencia"
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

              <input
                className="border rounded-xl px-3 py-2"
                placeholder="Target Venta USD"
                value={formData.target_sale}
                onChange={(e) =>
                  setFormData({ ...formData, target_sale: e.target.value })
                }
              />

              <input
                className="border rounded-xl px-3 py-2"
                placeholder="Target GP %"
                value={formData.target_gp}
                onChange={(e) =>
                  setFormData({ ...formData, target_gp: e.target.value })
                }
              />

              {formData.incoterm === 'EXW' && (
                <textarea
                  name="pickup_address"
                  placeholder="Dirección de recolección EXW"
                  value={formData.pickup_address || ''}
                  onChange={handleChange}
                  className="border p-3 rounded col-span-2 h-24"
                />
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Carga</h2>

            <div className="grid grid-cols-3 gap-4">
              <select
                name="container_type"
                value={formData.container_type || ''}
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

              <input name="peso_kg" placeholder="Peso KG" value={formData.peso_kg || ''} onChange={handleChange} className="border p-3 rounded" />
              <input name="gross_weight" placeholder="Peso bruto" value={formData.gross_weight || ''} onChange={handleChange} className="border p-3 rounded" />
              <input name="volumen_cbm" placeholder="CBM" value={formData.volumen_cbm || ''} onChange={handleChange} className="border p-3 rounded" />
              <input name="cantidad_bultos" placeholder="Bultos" value={formData.cantidad_bultos || ''} onChange={handleChange} className="border p-3 rounded" />
              <input name="commodity" placeholder="Mercancía" value={formData.commodity || ''} onChange={handleChange} className="border p-3 rounded" />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Seguro de Carga</h2>

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
                value={formData.commercial_value || ''}
                onChange={handleChange}
                className="border p-3 rounded w-full"
              />
            )}
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Observaciones</h2>

            <textarea
              name="observaciones"
              value={formData.observaciones || ''}
              onChange={handleChange}
              className="border p-3 rounded w-full h-32"
            />
          </section>

          <datalist id="countries">
            {countries.map((country) => (
              <option key={country.id} value={country.name} />
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

          <div className="flex justify-end gap-4">
            <button
              onClick={() => router.push(`/quotations/${params.id}`)}
              className="bg-gray-200 text-gray-800 px-6 py-3 rounded-xl"
            >
              Cancelar
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-zinc-950 text-white px-6 py-3 rounded-xl"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
