export type ServiceProductCatalogItem = {
  value: string
  label: string
  appliesClientRates: boolean
  active?: boolean | null
  sortOrder?: number | null
}

export type ClientRateCatalogItem = {
  code: string
  label: string
  category: string
  unit: string | null
  isDestinationRate: boolean
  isOptionalCharge: boolean
  optionalItemType: string | null
  taxable: boolean
  active?: boolean | null
  sortOrder?: number | null
}

export type OptionalClientRateConfig = Record<
  string,
  { itemType: string; taxable: boolean }
>

type SupabaseLike = {
  from: (table: string) => any
}

export const tradeDirections = [
  {
    value: 'import',
    label: 'Importación',
  },
  {
    value: 'export',
    label: 'Exportación',
  },
] as const

export const defaultServiceProducts: ServiceProductCatalogItem[] = [
  {
    value: 'miami_lcl',
    label: 'Miami Consolidado Marítimo LCL',
    appliesClientRates: true,
    sortOrder: 10,
  },
  {
    value: 'miami_air',
    label: 'Miami Consolidado Aéreo',
    appliesClientRates: true,
    sortOrder: 20,
  },
  {
    value: 'other_origin_fcl',
    label: 'FCL Otros Orígenes',
    appliesClientRates: false,
    sortOrder: 30,
  },
  {
    value: 'other_origin_lcl',
    label: 'LCL Otros Orígenes',
    appliesClientRates: false,
    sortOrder: 40,
  },
  {
    value: 'other_origin_air',
    label: 'Aéreo Consolidado',
    appliesClientRates: false,
    sortOrder: 50,
  },
  {
    value: 'usa_ltl_ftl',
    label: 'LTL / FTL USA',
    appliesClientRates: false,
    sortOrder: 60,
  },
  {
    value: 'courier',
    label: 'Courier',
    appliesClientRates: false,
    sortOrder: 70,
  },
]

export const defaultClientRateCatalog: ClientRateCatalogItem[] = [
  {
    code: 'small_maritimo_min_lcl_1000_lbs_45_ft3',
    label: 'Small Mínimo LCL 1000 lbs / 45 ft3',
    category: 'Small Marítimo',
    unit: 'flat',
    isDestinationRate: true,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 10,
  },
  {
    code: 'minimo_maritimo_2mil_lbs_90_ft3',
    label: 'Mínimo LCL 2 mil lbs / 90 ft3',
    category: 'Mínimo Marítimo',
    unit: 'flat',
    isDestinationRate: true,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 20,
  },
  {
    code: 'lcl_maritimo_sps_ft3',
    label: 'LCL Marítimo SPS - FT3',
    category: 'LCL Marítimo',
    unit: 'FT3',
    isDestinationRate: true,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 30,
  },
  {
    code: 'lcl_maritimo_sps_lbs',
    label: 'LCL Marítimo SPS - LBS',
    category: 'LCL Marítimo',
    unit: 'LBS',
    isDestinationRate: true,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 40,
  },
  {
    code: 'consolidado_aereo_kg',
    label: 'Consolidado Aéreo - KG',
    category: 'Consolidado Aéreo',
    unit: 'KG',
    isDestinationRate: true,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 50,
  },
  {
    code: 'delivery_miami',
    label: 'DELIVERY / Miami',
    category: 'Consolidado Aéreo',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 60,
  },
  {
    code: 'documentos_manejo',
    label: 'Documentos / Manejo',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 70,
  },
  {
    code: 'desconsolidar',
    label: 'Desconsolidación',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 80,
  },
  {
    code: 'bl',
    label: 'BL',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 90,
  },
  {
    code: 'guia',
    label: 'Guía',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 100,
  },
  {
    code: 'sed',
    label: 'SED',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 110,
  },
  {
    code: 'recolectas_internas',
    label: 'Recolectas Internas',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: false,
    optionalItemType: null,
    taxable: false,
    sortOrder: 120,
  },
  {
    code: 'fumigacion',
    label: 'Fumigación',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 130,
  },
  {
    code: 'pallet_embalaje',
    label: 'Pallet Embalaje',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 140,
  },
  {
    code: 'segregacion',
    label: 'Segregación',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 150,
  },
  {
    code: 'in_and_out',
    label: 'In and Out',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 160,
  },
  {
    code: 'equipo_especial',
    label: 'Equipo Especial',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 170,
  },
  {
    code: 'oversize',
    label: 'Oversize',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 180,
  },
  {
    code: 'embalaje_madera',
    label: 'Embalaje Madera',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 190,
  },
  {
    code: 'hazmat_imo_charge_line',
    label: 'Hazmat IMO Charge Line',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 200,
  },
  {
    code: 'declaracion_imo',
    label: 'Declaración IMO',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 210,
  },
  {
    code: 'certificado_imo',
    label: 'Certificado IMO',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 220,
  },
  {
    code: 'bonded_fcl_proveedor',
    label: 'Bonded FCL Proveedor',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 230,
  },
  {
    code: 'bonded_documentacion_7512',
    label: 'Bonded Documentación 7512',
    category: 'Otros Cargos',
    unit: 'flat',
    isDestinationRate: false,
    isOptionalCharge: true,
    optionalItemType: 'origin_charge',
    taxable: false,
    sortOrder: 240,
  },
]

export const defaultOptionalClientRateConfig =
  buildOptionalClientRateConfig(defaultClientRateCatalog)

export function usesClientRatesFromCatalog(
  catalog: ServiceProductCatalogItem[],
  product?: string | null
) {
  return catalog.some(
    (item) => item.value === product && item.appliesClientRates
  )
}

export function buildOptionalClientRateConfig(
  catalog: ClientRateCatalogItem[]
): OptionalClientRateConfig {
  return Object.fromEntries(
    catalog
      .filter((item) => item.isOptionalCharge && item.optionalItemType)
      .map((item) => [
        item.code,
        {
          itemType: item.optionalItemType || 'origin_charge',
          taxable: item.taxable,
        },
      ])
  )
}

export async function fetchActiveServiceProducts(client: SupabaseLike) {
  try {
    const { data, error } = await client
      .from('service_products')
      .select('value, label, applies_client_rates, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (error || !data?.length) return defaultServiceProducts

    return data.map((item: any) => ({
      value: item.value,
      label: item.label,
      appliesClientRates: item.applies_client_rates === true,
      active: item.active,
      sortOrder: item.sort_order,
    })) as ServiceProductCatalogItem[]
  } catch {
    return defaultServiceProducts
  }
}

export async function fetchActiveClientRateCatalog(client: SupabaseLike) {
  try {
    const { data, error } = await client
      .from('client_rate_catalog')
      .select('code, label, category, unit, is_destination_rate, is_optional_charge, optional_item_type, taxable, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (error || !data?.length) return defaultClientRateCatalog

    return data.map((item: any) => ({
      code: item.code,
      label: item.label,
      category: item.category,
      unit: item.unit,
      isDestinationRate: item.is_destination_rate === true,
      isOptionalCharge: item.is_optional_charge === true,
      optionalItemType: item.optional_item_type,
      taxable: item.taxable === true,
      active: item.active,
      sortOrder: item.sort_order,
    })) as ClientRateCatalogItem[]
  } catch {
    return defaultClientRateCatalog
  }
}
