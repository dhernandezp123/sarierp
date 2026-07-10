'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Edit3, PackagePlus, Plus, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

type Country = {
  id: string
  name: string
  active: boolean | null
}

type Port = {
  id: string
  name: string
  country_id: string | null
  type: string | null
  active: boolean | null
  countries: { name: string } | null
}

type ContainerType = {
  id: string
  name: string
  category: string | null
  active: boolean | null
  created_at: string | null
}

type ContainerForm = {
  name: string
  category: string
  active: boolean
}

type ServiceProductRow = {
  value: string
  label: string
  applies_client_rates: boolean
  active: boolean
  sort_order: number
}

type ClientRateCatalogRow = {
  code: string
  label: string
  category: string
  unit: string | null
  is_destination_rate: boolean
  is_optional_charge: boolean
  optional_item_type: string | null
  taxable: boolean
  active: boolean
  sort_order: number
}

const emptyContainerForm: ContainerForm = {
  name: '',
  category: '',
  active: true,
}

const emptyServiceProductForm = {
  value: '',
  label: '',
  applies_client_rates: false,
  active: true,
  sort_order: 100,
}

const emptyClientRateForm = {
  code: '',
  label: '',
  category: 'Otros Cargos',
  unit: 'flat',
  is_destination_rate: false,
  is_optional_charge: false,
  optional_item_type: '',
  taxable: false,
  active: true,
  sort_order: 100,
}

const portTypes = ['Puerto', 'Ciudad', 'Aeropuerto', 'Frontera']

export default function CatalogsPage() {
  const [countries, setCountries] = useState<Country[]>([])
  const [ports, setPorts] = useState<Port[]>([])
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([])
  const [serviceProducts, setServiceProducts] = useState<ServiceProductRow[]>([])
  const [clientRateCatalog, setClientRateCatalog] = useState<ClientRateCatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingContainer, setSavingContainer] = useState(false)
  const [savingServiceProduct, setSavingServiceProduct] = useState(false)
  const [savingClientRate, setSavingClientRate] = useState(false)
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null)
  const [editingServiceProductValue, setEditingServiceProductValue] = useState<string | null>(null)
  const [editingClientRateCode, setEditingClientRateCode] = useState<string | null>(null)
  const [containerSearch, setContainerSearch] = useState('')
  const [clientRateSearch, setClientRateSearch] = useState('')
  const [showInactiveContainers, setShowInactiveContainers] = useState(true)

  const [countryName, setCountryName] = useState('')
  const [portForm, setPortForm] = useState({
    name: '',
    country_id: '',
    type: 'Puerto',
  })
  const [containerForm, setContainerForm] = useState<ContainerForm>(emptyContainerForm)
  const [serviceProductForm, setServiceProductForm] = useState(emptyServiceProductForm)
  const [clientRateForm, setClientRateForm] = useState(emptyClientRateForm)

  const fetchCatalogs = async () => {
    setLoading(true)

    const [
      countriesResult,
      portsResult,
      containerTypesResult,
      serviceProductsResult,
      clientRateCatalogResult,
    ] = await Promise.all([
      supabase
        .from('countries')
        .select('id, name, active')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('ports')
        .select('id, name, country_id, type, active, countries(name)')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('container_types')
        .select('id, name, category, active, created_at')
        .order('name', { ascending: true }),
      supabase
        .from('service_products')
        .select('value, label, applies_client_rates, active, sort_order')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true }),
      supabase
        .from('client_rate_catalog')
        .select('code, label, category, unit, is_destination_rate, is_optional_charge, optional_item_type, taxable, active, sort_order')
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true }),
    ])

    if (countriesResult.error) toast.error(countriesResult.error.message)
    if (portsResult.error) toast.error(portsResult.error.message)
    if (containerTypesResult.error) toast.error(containerTypesResult.error.message)
    if (serviceProductsResult.error) toast.error(serviceProductsResult.error.message)
    if (clientRateCatalogResult.error) toast.error(clientRateCatalogResult.error.message)

    setCountries((countriesResult.data || []) as Country[])
    setPorts((portsResult.data || []) as unknown as Port[])
    setContainerTypes((containerTypesResult.data || []) as ContainerType[])
    setServiceProducts((serviceProductsResult.data || []) as ServiceProductRow[])
    setClientRateCatalog((clientRateCatalogResult.data || []) as ClientRateCatalogRow[])
    setLoading(false)
  }

  useEffect(() => {
    void fetchCatalogs()
  }, [])

  const visibleContainerTypes = useMemo(() => {
    const query = containerSearch.trim().toLowerCase()

    return containerTypes.filter((item) => {
      const matchActive = showInactiveContainers ? true : item.active !== false
      const matchSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query)

      return matchActive && matchSearch
    })
  }, [containerSearch, containerTypes, showInactiveContainers])

  const activeContainerCount = containerTypes.filter((item) => item.active !== false).length
  const inactiveContainerCount = containerTypes.length - activeContainerCount
  const visibleClientRates = useMemo(() => {
    const query = clientRateSearch.trim().toLowerCase()

    return clientRateCatalog.filter((item) => {
      return (
        !query ||
        item.code.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      )
    })
  }, [clientRateCatalog, clientRateSearch])

  const resetContainerForm = () => {
    setContainerForm(emptyContainerForm)
    setEditingContainerId(null)
  }

  const createCountry = async () => {
    if (!countryName.trim()) {
      toast.info('Nombre de país requerido')
      return
    }

    const { error } = await supabase.from('countries').insert({
      name: countryName.trim(),
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('País agregado')
    setCountryName('')
    void fetchCatalogs()
  }

  const createPort = async () => {
    if (!portForm.name.trim()) {
      toast.info('Nombre de puerto requerido')
      return
    }

    if (!portForm.country_id) {
      toast.info('Selecciona un país')
      return
    }

    const { error } = await supabase.from('ports').insert({
      name: portForm.name.trim(),
      country_id: portForm.country_id,
      type: portForm.type,
    })

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Puerto / ciudad agregado')
    setPortForm({
      name: '',
      country_id: '',
      type: 'Puerto',
    })
    void fetchCatalogs()
  }

  const saveContainerType = async () => {
    const name = containerForm.name.trim()
    const category = containerForm.category.trim() || null

    if (!name) {
      toast.info('Nombre del tipo requerido')
      return
    }

    setSavingContainer(true)

    const payload = {
      name,
      category,
      active: containerForm.active,
    }

    const result = editingContainerId
      ? await supabase.from('container_types').update(payload).eq('id', editingContainerId)
      : await supabase.from('container_types').insert(payload)

    setSavingContainer(false)

    if (result.error) {
      toast.error(result.error.message)
      return
    }

    toast.success(editingContainerId ? 'Tipo actualizado' : 'Tipo agregado')
    resetContainerForm()
    void fetchCatalogs()
  }

  const editContainerType = (item: ContainerType) => {
    setEditingContainerId(item.id)
    setContainerForm({
      name: item.name,
      category: item.category || '',
      active: item.active !== false,
    })
  }

  const toggleContainerType = async (item: ContainerType) => {
    const nextActive = item.active === false

    setContainerTypes((current) =>
      current.map((row) => (row.id === item.id ? { ...row, active: nextActive } : row))
    )

    const { error } = await supabase
      .from('container_types')
      .update({ active: nextActive })
      .eq('id', item.id)

    if (error) {
      toast.error(error.message)
      void fetchCatalogs()
      return
    }

    toast.success(nextActive ? 'Tipo visible en cotizaciones' : 'Tipo oculto de cotizaciones')
  }

  const saveServiceProduct = async () => {
    const value = serviceProductForm.value.trim()
    const label = serviceProductForm.label.trim()

    if (!value || !label) {
      toast.info('Código y nombre del producto son requeridos')
      return
    }

    setSavingServiceProduct(true)
    const { error } = await supabase.from('service_products').upsert({
      value,
      label,
      applies_client_rates: serviceProductForm.applies_client_rates,
      active: serviceProductForm.active,
      sort_order: Number(serviceProductForm.sort_order || 100),
    })
    setSavingServiceProduct(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(editingServiceProductValue ? 'Producto actualizado' : 'Producto agregado')
    setEditingServiceProductValue(null)
    setServiceProductForm(emptyServiceProductForm)
    void fetchCatalogs()
  }

  const editServiceProduct = (item: ServiceProductRow) => {
    setEditingServiceProductValue(item.value)
    setServiceProductForm({
      value: item.value,
      label: item.label,
      applies_client_rates: item.applies_client_rates,
      active: item.active !== false,
      sort_order: item.sort_order || 100,
    })
  }

  const toggleServiceProduct = async (item: ServiceProductRow) => {
    const nextActive = item.active === false

    setServiceProducts((current) =>
      current.map((row) => (row.value === item.value ? { ...row, active: nextActive } : row))
    )

    const { error } = await supabase
      .from('service_products')
      .update({ active: nextActive })
      .eq('value', item.value)

    if (error) {
      toast.error(error.message)
      void fetchCatalogs()
      return
    }

    toast.success(nextActive ? 'Producto visible' : 'Producto oculto')
  }

  const saveClientRateCatalogItem = async () => {
    const code = clientRateForm.code.trim()
    const label = clientRateForm.label.trim()
    const category = clientRateForm.category.trim()

    if (!code || !label || !category) {
      toast.info('Código, nombre y categoría son requeridos')
      return
    }

    setSavingClientRate(true)
    const { error } = await supabase.from('client_rate_catalog').upsert({
      code,
      label,
      category,
      unit: clientRateForm.unit.trim() || null,
      is_destination_rate: clientRateForm.is_destination_rate,
      is_optional_charge: clientRateForm.is_optional_charge,
      optional_item_type: clientRateForm.is_optional_charge
        ? clientRateForm.optional_item_type.trim() || 'origin_charge'
        : null,
      taxable: clientRateForm.taxable,
      active: clientRateForm.active,
      sort_order: Number(clientRateForm.sort_order || 100),
    })
    setSavingClientRate(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(editingClientRateCode ? 'Cargo actualizado' : 'Cargo agregado')
    setEditingClientRateCode(null)
    setClientRateForm(emptyClientRateForm)
    void fetchCatalogs()
  }

  const editClientRateCatalogItem = (item: ClientRateCatalogRow) => {
    setEditingClientRateCode(item.code)
    setClientRateForm({
      code: item.code,
      label: item.label,
      category: item.category,
      unit: item.unit || '',
      is_destination_rate: item.is_destination_rate,
      is_optional_charge: item.is_optional_charge,
      optional_item_type: item.optional_item_type || '',
      taxable: item.taxable,
      active: item.active !== false,
      sort_order: item.sort_order || 100,
    })
  }

  const toggleClientRateCatalogItem = async (item: ClientRateCatalogRow) => {
    const nextActive = item.active === false

    setClientRateCatalog((current) =>
      current.map((row) => (row.code === item.code ? { ...row, active: nextActive } : row))
    )

    const { error } = await supabase
      .from('client_rate_catalog')
      .update({ active: nextActive })
      .eq('code', item.code)

    if (error) {
      toast.error(error.message)
      void fetchCatalogs()
      return
    }

    toast.success(nextActive ? 'Cargo visible' : 'Cargo oculto')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Tablas maestras para pricing y cotizaciones de forwarders.
        </p>
      </div>

      <section className={cardClass}>
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              Cotizaciones
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              Tipos de contenedor / transporte
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              Los tipos activos aparecen en la sección de carga para FCL/FTL. Apaga un tipo para ocultarlo sin afectar cotizaciones anteriores.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-64">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Activos</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{activeContainerCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">Ocultos</p>
              <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{inactiveContainerCount}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/70">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {editingContainerId ? 'Editar tipo' : 'Nuevo tipo'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ej. 20GP, 40HC, Reefer, Breakbulk.
                </p>
              </div>
              {editingContainerId && (
                <button
                  type="button"
                  onClick={resetContainerForm}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Cancelar edición"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Nombre
                </span>
                <input
                  value={containerForm.name}
                  onChange={(event) =>
                    setContainerForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className={fieldClass}
                  placeholder="Ej. 40HC"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Categoría
                </span>
                <input
                  value={containerForm.category}
                  onChange={(event) =>
                    setContainerForm((current) => ({ ...current, category: event.target.value }))
                  }
                  className={fieldClass}
                  placeholder="Ej. FCL, FTL, Breakbulk"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span>
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Visible en cotizaciones
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Si está apagado, no aparece como opción nueva.
                  </span>
                </span>
                <Switch
                  checked={containerForm.active}
                  onChange={() =>
                    setContainerForm((current) => ({ ...current, active: !current.active }))
                  }
                />
              </label>

              <button
                type="button"
                onClick={saveContainerType}
                disabled={savingContainer}
                className={`${primaryButtonClass} flex w-full items-center justify-center gap-2`}
              >
                {editingContainerId ? <Check className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                {savingContainer ? 'Guardando...' : editingContainerId ? 'Guardar cambios' : 'Agregar tipo'}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={containerSearch}
                  onChange={(event) => setContainerSearch(event.target.value)}
                  className={`${fieldClass} pl-9`}
                  placeholder="Buscar tipo o categoría"
                />
              </div>
              <label className="flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={showInactiveContainers}
                  onChange={(event) => setShowInactiveContainers(event.target.checked)}
                  className="rounded"
                />
                Ver ocultos
              </label>
            </div>

            {loading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : visibleContainerTypes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <p className="font-semibold text-slate-900 dark:text-white">No hay tipos para mostrar</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Crea un tipo o ajusta el filtro de búsqueda.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Visibilidad
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleContainerTypes.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {item.category || 'Sin categoría'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleContainerType(item)}
                            className="flex items-center gap-2"
                            aria-label={item.active !== false ? 'Ocultar tipo' : 'Mostrar tipo'}
                          >
                            <Switch checked={item.active !== false} />
                            <span
                              className={
                                item.active !== false
                                  ? 'text-sm font-medium text-emerald-700 dark:text-emerald-300'
                                  : 'text-sm font-medium text-slate-500 dark:text-slate-400'
                              }
                            >
                              {item.active !== false ? 'Visible' : 'Oculto'}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => editContainerType(item)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Cotizaciones
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            Productos / servicios
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Estos productos aparecen en nuevas cotizaciones. Los códigos existentes no deben cambiarse si ya tienen cotizaciones históricas.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/70">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {editingServiceProductValue ? 'Editar producto' : 'Nuevo producto'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Usa códigos estables como `other_origin_fcl`.
                </p>
              </div>
              {editingServiceProductValue && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingServiceProductValue(null)
                    setServiceProductForm(emptyServiceProductForm)
                  }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Cancelar edición"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <input
                value={serviceProductForm.value}
                onChange={(event) =>
                  setServiceProductForm((current) => ({ ...current, value: event.target.value }))
                }
                className={fieldClass}
                placeholder="Código"
                disabled={Boolean(editingServiceProductValue)}
              />
              <input
                value={serviceProductForm.label}
                onChange={(event) =>
                  setServiceProductForm((current) => ({ ...current, label: event.target.value }))
                }
                className={fieldClass}
                placeholder="Nombre visible"
              />
              <input
                type="number"
                value={serviceProductForm.sort_order}
                onChange={(event) =>
                  setServiceProductForm((current) => ({ ...current, sort_order: Number(event.target.value) }))
                }
                className={fieldClass}
                placeholder="Orden"
              />
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Usa tarifas Miami del cliente
                </span>
                <Switch
                  checked={serviceProductForm.applies_client_rates}
                  onChange={() =>
                    setServiceProductForm((current) => ({
                      ...current,
                      applies_client_rates: !current.applies_client_rates,
                    }))
                  }
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Visible
                </span>
                <Switch
                  checked={serviceProductForm.active}
                  onChange={() =>
                    setServiceProductForm((current) => ({ ...current, active: !current.active }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={saveServiceProduct}
                disabled={savingServiceProduct}
                className={`${primaryButtonClass} flex w-full items-center justify-center gap-2`}
              >
                <Check className="h-4 w-4" />
                {savingServiceProduct ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Miami</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Visible</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {serviceProducts.map((item) => (
                  <tr key={item.value} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{item.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.value}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {item.applies_client_rates ? 'Sí' : 'No'}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => void toggleServiceProduct(item)} className="flex items-center gap-2">
                        <Switch checked={item.active !== false} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {item.active !== false ? 'Visible' : 'Oculto'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => editServiceProduct(item)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Pricing Miami
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
            Tarifas y cargos por cliente
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Define qué cargos aparecen en el perfil del cliente y cuáles pueden agregarse como cargos opcionales en Pricing.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/70">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {editingClientRateCode ? 'Editar cargo' : 'Nuevo cargo'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  El código se guarda en `client_rates.rate_code`.
                </p>
              </div>
              {editingClientRateCode && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingClientRateCode(null)
                    setClientRateForm(emptyClientRateForm)
                  }}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Cancelar edición"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              <input
                value={clientRateForm.code}
                onChange={(event) =>
                  setClientRateForm((current) => ({ ...current, code: event.target.value }))
                }
                className={fieldClass}
                placeholder="Código"
                disabled={Boolean(editingClientRateCode)}
              />
              <input
                value={clientRateForm.label}
                onChange={(event) =>
                  setClientRateForm((current) => ({ ...current, label: event.target.value }))
                }
                className={fieldClass}
                placeholder="Nombre visible"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={clientRateForm.category}
                  onChange={(event) =>
                    setClientRateForm((current) => ({ ...current, category: event.target.value }))
                  }
                  className={fieldClass}
                  placeholder="Categoría"
                />
                <input
                  value={clientRateForm.unit}
                  onChange={(event) =>
                    setClientRateForm((current) => ({ ...current, unit: event.target.value }))
                  }
                  className={fieldClass}
                  placeholder="Unidad"
                />
              </div>
              <input
                type="number"
                value={clientRateForm.sort_order}
                onChange={(event) =>
                  setClientRateForm((current) => ({ ...current, sort_order: Number(event.target.value) }))
                }
                className={fieldClass}
                placeholder="Orden"
              />
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tarifa por destino SPS/TGU</span>
                <Switch
                  checked={clientRateForm.is_destination_rate}
                  onChange={() =>
                    setClientRateForm((current) => ({
                      ...current,
                      is_destination_rate: !current.is_destination_rate,
                    }))
                  }
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cargo opcional en Pricing</span>
                <Switch
                  checked={clientRateForm.is_optional_charge}
                  onChange={() =>
                    setClientRateForm((current) => ({
                      ...current,
                      is_optional_charge: !current.is_optional_charge,
                    }))
                  }
                />
              </label>
              {clientRateForm.is_optional_charge && (
                <select
                  value={clientRateForm.optional_item_type}
                  onChange={(event) =>
                    setClientRateForm((current) => ({ ...current, optional_item_type: event.target.value }))
                  }
                  className={fieldClass}
                >
                  <option value="">Origen</option>
                  <option value="origin_charge">Origen</option>
                  <option value="destination_charge">Destino</option>
                  <option value="documentation">Documentación</option>
                  <option value="other">Otro</option>
                </select>
              )}
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Visible</span>
                <Switch
                  checked={clientRateForm.active}
                  onChange={() =>
                    setClientRateForm((current) => ({ ...current, active: !current.active }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={saveClientRateCatalogItem}
                disabled={savingClientRate}
                className={`${primaryButtonClass} flex w-full items-center justify-center gap-2`}
              >
                <Check className="h-4 w-4" />
                {savingClientRate ? 'Guardando...' : 'Guardar cargo'}
              </button>
            </div>
          </div>

          <div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={clientRateSearch}
                onChange={(event) => setClientRateSearch(event.target.value)}
                className={`${fieldClass} pl-9`}
                placeholder="Buscar cargo, código o categoría"
              />
            </div>
            <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cargo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reglas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Visible</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClientRates.map((item) => (
                    <tr key={item.code} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{item.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.code} · {item.category} · {item.unit || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {item.is_destination_rate ? 'Destino SPS/TGU' : 'Global'}
                        {item.is_optional_charge ? ' · Opcional' : ''}
                        {item.taxable ? ' · ISV' : ''}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => void toggleClientRateCatalogItem(item)} className="flex items-center gap-2">
                          <Switch checked={item.active !== false} />
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            {item.active !== false ? 'Visible' : 'Oculto'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => editClientRateCatalogItem(item)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Países</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Catálogo activo de países usado por rutas y clientes.
            </p>
          </div>

          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <input
              className={fieldClass}
              placeholder="Nuevo país"
              value={countryName}
              onChange={(event) => setCountryName(event.target.value)}
            />
            <button
              type="button"
              onClick={createCountry}
              className={`${secondaryButtonClass} flex items-center justify-center gap-2 sm:w-36`}
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {countries.map((country) => (
              <div
                key={country.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <span className="font-medium text-slate-900 dark:text-white">{country.name}</span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Activo
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Puertos / Ciudades</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Orígenes y destinos disponibles para las cotizaciones.
            </p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <input
              className={fieldClass}
              placeholder="Puerto o ciudad"
              value={portForm.name}
              onChange={(event) =>
                setPortForm((current) => ({ ...current, name: event.target.value }))
              }
            />

            <select
              className={fieldClass}
              value={portForm.country_id}
              onChange={(event) =>
                setPortForm((current) => ({ ...current, country_id: event.target.value }))
              }
            >
              <option value="">País</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>

            <select
              className={fieldClass}
              value={portForm.type}
              onChange={(event) =>
                setPortForm((current) => ({ ...current, type: event.target.value }))
              }
            >
              {portTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={createPort}
            className={`${secondaryButtonClass} mb-5 flex w-full items-center justify-center gap-2`}
          >
            <Plus className="h-4 w-4" />
            Agregar Puerto / Ciudad
          </button>

          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    País
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tipo
                  </th>
                </tr>
              </thead>
              <tbody>
                {ports.map((port) => (
                  <tr key={port.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{port.name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{port.countries?.name || 'N/A'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{port.type || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean
  onChange?: () => void
}) {
  return (
    <span
      role={onChange ? 'switch' : undefined}
      aria-checked={onChange ? checked : undefined}
      onClick={onChange}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
        checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      } ${onChange ? 'cursor-pointer' : ''}`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </span>
  )
}
