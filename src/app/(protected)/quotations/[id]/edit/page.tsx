'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../../../lib/supabase/client'
import AppLayout from '../../../../../components/layout/app-layout'
import { useUser } from '../../../../../hooks/useUser'

export default function EditQuotationPage() {
  const { profile, loading: userLoading } = useUser()
  const params = useParams()
  const router = useRouter()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isPricing = role === 'Pricing'
  const isFinance = role === 'Finanzas' || role === 'Contabilidad'

  const canEditPricing =
    isAdmin || isPricing
  const canEditCostValidation =
    isAdmin || isFinance
  const canEditFinance =
    isAdmin || isFinance
  const canEditQuotes =
    isAdmin || isSales

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [packageTypes, setPackageTypes] = useState<any[]>([])
  const [containerTypes, setContainerTypes] = useState<any[]>([])
  const [containerLines, setContainerLines] = useState<any[]>([])
  const [editingContainerLineId, setEditingContainerLineId] = useState<string | null>(null)
  const [containerLineForm, setContainerLineForm] = useState({
    container_type_id: '',
    container_type_name: '',
    quantity: '1',
    notes: '',
  })

  const [formData, setFormData] = useState({
    status: '',
    quote_type: '',
    valid_until: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',

    preferred_carrier: '',

    container_type: '',
    package_type: '',
    package_details: '',
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
    if (userLoading) return

    if (!canEditQuotes) {
      setLoading(false)
      return
    }

    fetchCatalogs()

    if (params.id) {
      fetchQuotation(params.id as string)
      fetchContainerLines(params.id as string)
    }
  }, [params.id, userLoading, canEditQuotes])

  const AccessDenied = () => (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="rounded-2xl border bg-white p-8">
        <h1 className="text-2xl font-bold">
          Acceso restringido
        </h1>

        <p className="text-gray-500 mt-2">
          No tienes permiso para ver este módulo.
        </p>
      </div>
    </AppLayout>
  )

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

    const { data: packageTypesData } = await supabase
      .from('package_types')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: containerTypesData, error: containerTypesError } =
      await supabase
        .from('container_types')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

    if (containerTypesError) {
      alert(containerTypesError.message)
      return
    }

    setCountries(countriesData || [])
    setPorts(portsData || [])
    setPackageTypes(packageTypesData || [])
    setContainerTypes(containerTypesData || [])
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
      status: data.status || '',
      quote_type: data.quote_type || '',
      valid_until: data.valid_until || '',

      incoterm: data.incoterm || '',
      tipo_transporte: data.tipo_transporte || '',

      origen: data.origen || '',
      destino: data.destino || '',
      puerto_origen: data.puerto_origen || '',
      puerto_destino: data.puerto_destino || '',
      pickup_address: data.pickup_address || '',

      preferred_carrier: data.preferred_carrier || '',

      container_type: data.container_type || '',
      package_type: data.package_type || '',
      package_details: data.package_details || '',
      peso_kg: data.peso_kg && Number(data.peso_kg) !== 0 ? data.peso_kg.toString() : '',
      gross_weight: data.gross_weight && Number(data.gross_weight) !== 0 ? data.gross_weight.toString() : '',
      volumen_cbm: data.volumen_cbm && Number(data.volumen_cbm) !== 0 ? data.volumen_cbm.toString() : '',
      cantidad_bultos: data.cantidad_bultos && Number(data.cantidad_bultos) !== 0 ? data.cantidad_bultos.toString() : '',
      commodity: data.commodity || '',

      requires_insurance: data.requires_insurance || false,
      commercial_value: data.commercial_value?.toString() || '',

      observaciones: data.observaciones || '',
    })

    setLoading(false)
  }

  const fetchContainerLines = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setContainerLines(data || [])
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

  const saveContainerLine = async () => {
    if (!params.id) return

    if (!containerLineForm.container_type_name) {
      alert('Debes seleccionar un tipo de contenedor / unidad')
      return
    }

    const payload = {
      quotation_id: params.id as string,
      container_type_id: containerLineForm.container_type_id || null,
      container_type_name: containerLineForm.container_type_name,
      quantity: Number(containerLineForm.quantity || 1),
      notes: containerLineForm.notes,
    }

    const { error } = editingContainerLineId
      ? await supabase
          .from('quotation_containers')
          .update(payload)
          .eq('id', editingContainerLineId)
      : await supabase
          .from('quotation_containers')
          .insert(payload)

    if (error) {
      alert(error.message)
      return
    }

    setEditingContainerLineId(null)

    setContainerLineForm({
      container_type_id: '',
      container_type_name: '',
      quantity: '1',
      notes: '',
    })

    await fetchContainerLines(params.id as string)
  }

  const editContainerLine = (line: any) => {
    setContainerLineForm({
      container_type_id: line.container_type_id || '',
      container_type_name: line.container_type_name || '',
      quantity: String(line.quantity || 1),
      notes: line.notes || '',
    })

    setEditingContainerLineId(line.id)
  }

  const deleteContainerLine = async (lineId: string) => {
    if (!params.id) return

    const { error } = await supabase
      .from('quotation_containers')
      .delete()
      .eq('id', lineId)

    if (error) {
      alert(error.message)
      return
    }

    await fetchContainerLines(params.id as string)
  }

  const sendToPricing = async () => {
    if (!params.id) return

    if (!formData.commodity.trim()) {
      alert('Debes ingresar Commodity/Descripción de la carga')
      return
    }

    if (!formData.tipo_transporte) {
      alert('Debes seleccionar el tipo de transporte')
      return
    }

    if (!formData.quote_type) {
      alert('Debes seleccionar el tipo de cotización')
      return
    }

    if (requiresContainerLines && containerLines.length === 0) {
      alert('Debes agregar al menos un contenedor/unidad')
      return
    }

    const { error } = await supabase
      .from('quotations')
      .update({ status: 'Pendiente de Fijar Precios' })
      .eq('id', params.id as string)

    if (error) {
      alert(error.message)
      return
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: params.id as string,
        old_status: formData.status || 'Borrador',
        new_status: 'Pendiente de Fijar Precios',
        changed_by: profile?.id,
      },
    ])

    setFormData({
      ...formData,
      status: 'Pendiente de Fijar Precios',
    })

    alert('Cotización enviada a Pricing correctamente')
    router.push(`/quotations/${params.id}`)
  }

  const handleSave = async () => {
    if (!params.id) return

    if (!formData.commodity.trim()) {
      alert('Debes ingresar Commodity/Descripción de la carga')
      return
    }

    const requiresContainerLines =
      formData.quote_type === 'FCL' || formData.quote_type === 'FTL'

    if (requiresContainerLines && containerLines.length === 0) {
      alert('Debes agregar al menos un contenedor/unidad')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('quotations')
      .update({
        quote_type: formData.quote_type,
        valid_until: formData.valid_until || null,

        incoterm: formData.incoterm,
        tipo_transporte: formData.tipo_transporte,

        origen: formData.origen,
        destino: formData.destino,
        puerto_origen: formData.puerto_origen,
        puerto_destino: formData.puerto_destino,
        pickup_address: formData.pickup_address,

        preferred_carrier: formData.preferred_carrier,

        container_type: formData.container_type,
        package_type: formData.package_type,
        package_details: formData.package_details,
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

    const shouldSendToPricing =
      formData.status === 'Borrador'
        ? window.confirm(
            'Cambios guardados correctamente. ¿Deseas enviar esta cotización a Pricing?'
          )
        : false

    if (shouldSendToPricing) {
      await sendToPricing()
      return
    }

    alert('Cambios guardados correctamente')
    router.push(`/quotations/${params.id}`)
  }

  if (userLoading || loading) {
    return <div className="p-8">Cargando cotización...</div>
  }

  if (!canEditQuotes) {
    return <AccessDenied />
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

  const requiresContainerLines =
    formData.quote_type === 'FCL' || formData.quote_type === 'FTL'

  const requiresLooseCargo =
    formData.quote_type === 'LCL' ||
    formData.quote_type === 'LTL' ||
    formData.quote_type === 'Consolidado' ||
    formData.quote_type === 'Courier'

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
          {!canEditQuotes && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Modo lectura: tu rol no tiene permisos para editar cotizaciones.
            </p>
          )}

          <fieldset disabled={!canEditQuotes} className="contents">
          <section>
            <h2 className="text-xl font-bold mb-4">Información General</h2>

            <div className="grid grid-cols-3 gap-4">
              <select
                name="tipo_transporte"
                value={formData.tipo_transporte || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tipo_transporte: e.target.value,
                    quote_type: '',
                  })
                }
                className="border p-3 rounded"
              >
                <option value="">Transporte</option>
                <option value="Aéreo">Aéreo</option>
                <option value="Marítima">Marítima</option>
                <option value="Terrestre">Terrestre</option>
              </select>

              <select
                name="quote_type"
                value={formData.quote_type || ''}
                onChange={handleChange}
                disabled={!formData.tipo_transporte}
                className="border p-3 rounded"
              >
                <option value="">Tipo de cotización</option>

                {(quoteTypeOptions[formData.tipo_transporte] || []).map((type) => (
                  <option key={type} value={type}>
                    {type}
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

            <div className="space-y-4">
              <input
                name="commodity"
                placeholder="Commodity/Descripción de la carga *"
                value={formData.commodity || ''}
                onChange={handleChange}
                className="border p-3 rounded md:col-span-3 w-full"
              />

              {requiresLooseCargo && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <select
                    name="package_type"
                    value={formData.package_type || ''}
                    onChange={handleChange}
                    className="border p-3 rounded"
                  >
                    <option value="">Tipo de empaque</option>

                    {packageTypes.map((pkg) => (
                      <option key={pkg.id} value={pkg.name}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>

                  <input name="peso_kg" placeholder="Peso KG" value={formData.peso_kg || ''} onChange={handleChange} className="border p-3 rounded" />
                  <input name="gross_weight" placeholder="Peso bruto" value={formData.gross_weight || ''} onChange={handleChange} className="border p-3 rounded" />
                  <input name="volumen_cbm" placeholder="CBM" value={formData.volumen_cbm || ''} onChange={handleChange} className="border p-3 rounded" />
                  <input name="cantidad_bultos" placeholder="Bultos" value={formData.cantidad_bultos || ''} onChange={handleChange} className="border p-3 rounded" />
                  <textarea
                    name="package_details"
                    placeholder="Detalles del empaque / dimensiones / observaciones de carga"
                    value={formData.package_details || ''}
                    onChange={handleChange}
                    className="border rounded-xl px-3 py-2 md:col-span-3"
                  />
                </div>
              )}

              {requiresContainerLines && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select
                      value={containerLineForm.container_type_id}
                      onChange={(e) => {
                        const selectedContainer = containerTypes.find(
                          (container) => container.id === e.target.value
                        )

                        setContainerLineForm({
                          ...containerLineForm,
                          container_type_id: e.target.value,
                          container_type_name: selectedContainer?.name || '',
                        })
                      }}
                      className="border p-3 rounded"
                    >
                      <option value="">Tipo de contenedor / unidad</option>

                      {containerTypes.map((container) => (
                        <option key={container.id} value={container.id}>
                          {container.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      placeholder="Cantidad"
                      value={containerLineForm.quantity}
                      onChange={(e) =>
                        setContainerLineForm({
                          ...containerLineForm,
                          quantity: e.target.value,
                        })
                      }
                      className="border p-3 rounded"
                    />

                    <input
                      placeholder="Notas"
                      value={containerLineForm.notes}
                      onChange={(e) =>
                        setContainerLineForm({
                          ...containerLineForm,
                          notes: e.target.value,
                        })
                      }
                      className="border p-3 rounded"
                    />

                    <button
                      type="button"
                      onClick={saveContainerLine}
                      className="bg-zinc-950 text-white px-4 py-3 rounded"
                    >
                      {editingContainerLineId ? 'Actualizar' : 'Agregar'}
                    </button>
                  </div>

                  {containerLines.length > 0 && (
                    <div className="rounded border divide-y">
                      {containerLines.map((line) => (
                        <div
                          key={line.id}
                          className="flex items-center justify-between gap-4 p-3"
                        >
                          <div>
                            <p className="font-medium">
                              {line.container_type_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              Cantidad: {line.quantity}
                              {line.notes ? ` · ${line.notes}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <button
                              type="button"
                              onClick={() => editContainerLine(line)}
                              className="text-blue-600 font-semibold"
                            >
                              Modificar
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteContainerLine(line.id)}
                              className="text-red-700 font-semibold"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
          </fieldset>

          <div className="flex justify-end gap-4">
            <button
              onClick={() => router.push(`/quotations/${params.id}`)}
              className="bg-gray-200 text-gray-800 px-6 py-3 rounded-xl"
            >
              Cancelar
            </button>

            {canEditQuotes && formData.status === 'Borrador' && (
              <button
                onClick={sendToPricing}
                disabled={saving}
                className="bg-blue-700 text-white px-6 py-3 rounded-xl"
              >
                Enviar a Pricing
              </button>
            )}

            {canEditQuotes && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-zinc-950 text-white px-6 py-3 rounded-xl"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
