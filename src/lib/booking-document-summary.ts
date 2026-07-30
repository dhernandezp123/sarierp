export type StructuredBillOfLading = {
  id?: string | null
  bl_type: 'MBL' | 'HBL' | string
  bl_number: string | null
  status?: string | null
  release_type?: string | null
  created_at?: string | null
}

export type BookingDocumentCache = {
  master_bl?: string | null
  house_bl?: string | null
}

export type BookingDocumentReference = {
  id: string | null
  type: 'MBL' | 'HBL'
  number: string
  status: string | null
  releaseType: string | null
  source: 'bills_of_lading' | 'booking_cache'
}

export type BookingDocumentSummary = {
  master: BookingDocumentReference | null
  houses: BookingDocumentReference[]
}

function byNewest(left: StructuredBillOfLading, right: StructuredBillOfLading) {
  return (right.created_at || '').localeCompare(left.created_at || '')
}

function toReference(
  bill: StructuredBillOfLading,
  type: 'MBL' | 'HBL'
): BookingDocumentReference | null {
  const number = bill.bl_number?.trim()
  if (!number) return null

  return {
    id: bill.id || null,
    type,
    number,
    status: bill.status || null,
    releaseType: bill.release_type || null,
    source: 'bills_of_lading',
  }
}

/**
 * Document authority:
 * 1. Structured bills_of_lading records.
 * 2. Booking cache only when no structured record exists for that BL type.
 * Shipping Instruction legacy fields are intentionally not accepted.
 */
export function resolveBookingDocumentSummary(
  cache: BookingDocumentCache,
  bills: StructuredBillOfLading[] | null | undefined
): BookingDocumentSummary {
  const structured = bills || []
  const allMasters = structured.filter((bill) => bill.bl_type === 'MBL')
  const allHouses = structured.filter((bill) => bill.bl_type === 'HBL')
  const activeMasters = allMasters.filter((bill) => bill.status !== 'Archivado')
  const activeHouses = allHouses.filter((bill) => bill.status !== 'Archivado')
  const masters = (activeMasters.length > 0 ? activeMasters : allMasters)
    .sort(byNewest)
  const houses = (activeHouses.length > 0 ? activeHouses : allHouses)
    .sort(byNewest)
    .map((bill) => toReference(bill, 'HBL'))
    .filter((bill): bill is BookingDocumentReference => Boolean(bill))

  const structuredMaster = masters
    .map((bill) => toReference(bill, 'MBL'))
    .find((bill): bill is BookingDocumentReference => Boolean(bill))

  const masterCache = cache.master_bl?.trim()
  const houseCache = cache.house_bl?.trim()

  return {
    master: structuredMaster || (
      masterCache
        ? {
            id: null,
            type: 'MBL',
            number: masterCache,
            status: null,
            releaseType: null,
            source: 'booking_cache',
          }
        : null
    ),
    houses: houses.length > 0
      ? houses
      : houseCache
        ? [{
            id: null,
            type: 'HBL',
            number: houseCache,
            status: null,
            releaseType: null,
            source: 'booking_cache',
          }]
        : [],
  }
}
