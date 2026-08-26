"use client"

import { useCallback, useEffect, useState } from "react"
import { CARRIERS, type Carrier } from "@/src/lib/constants/carriers"
import { supabase } from "@/src/lib/supabase/client"

const CARRIER_CATALOG_UPDATED = "carrier-catalog-updated"
let cachedCarriers: Carrier[] | null = null
let pendingRequest: Promise<Carrier[]> | null = null

async function loadCarriers(force = false) {
  if (!force && cachedCarriers) return cachedCarriers
  if (!force && pendingRequest) return pendingRequest

  pendingRequest = (async (): Promise<Carrier[]> => {
    try {
      const { data, error } = await supabase
        .from("carrier_catalog")
        .select("code, name, type, bg_color, text_color")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
      if (error || !data) return cachedCarriers || CARRIERS

      cachedCarriers = data.map((row) => ({
        code: row.code,
        name: row.name,
        type: row.type as Carrier["type"],
        bg: row.bg_color,
        text: row.text_color,
        useTailwind: false,
      }))
      return cachedCarriers
    } finally {
      pendingRequest = null
    }
  })()

  return pendingRequest
}

export function notifyCarrierCatalogUpdated() {
  cachedCarriers = null
  window.dispatchEvent(new Event(CARRIER_CATALOG_UPDATED))
}

export function useCarrierCatalog() {
  const [carriers, setCarriers] = useState<Carrier[]>(cachedCarriers || CARRIERS)

  const refresh = useCallback(async (force = false) => {
    const loaded = await loadCarriers(force)
    setCarriers(loaded || CARRIERS)
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0)
    const handleUpdate = () => void refresh(true)
    window.addEventListener(CARRIER_CATALOG_UPDATED, handleUpdate)
    return () => {
      window.clearTimeout(initialLoad)
      window.removeEventListener(CARRIER_CATALOG_UPDATED, handleUpdate)
    }
  }, [refresh])

  const getCarrier = useCallback((value?: string | null) => {
    if (!value) return undefined
    const normalized = value.trim().toLowerCase()
    return carriers.find(
      (carrier) =>
        carrier.code.toLowerCase() === normalized || carrier.name.toLowerCase() === normalized
    )
  }, [carriers])

  return { carriers, getCarrier, refresh }
}
