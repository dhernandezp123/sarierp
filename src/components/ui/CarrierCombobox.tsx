"use client"

// src/components/ui/CarrierCombobox.tsx
// Combobox de carriers con badge de color de marca.
// Usa el mismo patrón portal de ClienteCombobox para evitar overflow:hidden.

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/src/lib/utils"
import { useDropdownPosition } from "./useComboboxPortal"
import { CARRIERS, getCarrier, type Carrier, type CarrierType } from "@/src/lib/constants/carriers"

interface CarrierComboboxProps {
  value: string                          // code del carrier seleccionado, ej: "MSC"
  onChange: (code: string) => void
  filterType?: CarrierType               // "ocean" | "air" | "ground" — filtra la lista
  placeholder?: string
  className?: string
  disabled?: boolean
}

// Mini badge inline para usar dentro del combobox
function InlineBadge({ carrier }: { carrier: Carrier }) {
  return (
    <span
      style={{ backgroundColor: carrier.bg, color: carrier.text }}
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide"
    >
      {carrier.code}
    </span>
  )
}

export function CarrierCombobox({
  value,
  onChange,
  filterType,
  placeholder = "Carrier / Naviera",
  className,
  disabled = false,
}: CarrierComboboxProps) {
  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const [mounted, setMounted]         = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLUListElement>(null)
  const dropRef    = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const carriers = filterType
    ? CARRIERS.filter((c) => c.type === filterType)
    : CARRIERS

  const selectedCarrier = getCarrier(value)
  const selected =
    selectedCarrier && (!filterType || selectedCarrier.type === filterType)
      ? selectedCarrier
      : null

  const filtered = query.trim()
    ? carriers.filter((c) =>
        `${c.code} ${c.name}`.toLowerCase().includes(query.toLowerCase())
      )
    : carriers

  const pos = useDropdownPosition(open, triggerRef)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current?.contains(target) ||
        dropRef.current?.contains(target)
      ) return
      setOpen(false)
      setQuery("")
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
      setHighlighted(0)
    }
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[highlighted] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [highlighted])

  const selectCarrier = useCallback(
    (carrier: Carrier) => {
      onChange(carrier.code)
      setOpen(false)
      setQuery("")
    },
    [onChange]
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
        break
      case "Enter":
        e.preventDefault()
        if (filtered[highlighted]) selectCarrier(filtered[highlighted])
        break
      case "Escape":
        setOpen(false)
        setQuery("")
        break
    }
  }

  const typeLabel: Record<CarrierType, string> = {
    ocean:  "Marítimo",
    air:    "Aéreo",
    ground: "Terrestre / Courier",
  }

  // Agrupa por tipo para el dropdown
  const types: CarrierType[] = filterType
    ? [filterType]
    : (["ocean", "air", "ground"] as CarrierType[])

  const dropdown = (
    <div
      ref={dropRef}
      style={{
        position: "absolute",
        top:      pos.top,
        left:     pos.left,
        width:    Math.max(pos.width, 320),
        zIndex:   9999,
      }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      {/* Search */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlighted(0) }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar carrier..."
          className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus() }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Lista agrupada */}
      {filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-slate-400">
          No se encontró ningún carrier.
        </div>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
          {query.trim()
            // Con búsqueda activa: lista plana sin grupos
            ? filtered.map((carrier, idx) => (
                <CarrierOption
                  key={carrier.code}
                  carrier={carrier}
                  idx={idx}
                  isSelected={carrier.code === value}
                  isHighlighted={idx === highlighted}
                  onMouseEnter={() => setHighlighted(idx)}
                  onClick={() => selectCarrier(carrier)}
                />
              ))
            // Sin búsqueda: agrupado por tipo
            : types.map((type) => {
                const group = filtered.filter((c) => c.type === type)
                if (group.length === 0) return null
                // Índice global para el highlighting
                const startIdx = filtered.indexOf(group[0])
                return (
                  <li key={type}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {typeLabel[type]}
                    </div>
                    <ul>
                      {group.map((carrier, i) => {
                        const globalIdx = startIdx + i
                        return (
                          <CarrierOption
                            key={carrier.code}
                            carrier={carrier}
                            idx={globalIdx}
                            isSelected={carrier.code === value}
                            isHighlighted={globalIdx === highlighted}
                            onMouseEnter={() => setHighlighted(globalIdx)}
                            onClick={() => selectCarrier(carrier)}
                          />
                        )
                      })}
                    </ul>
                  </li>
                )
              })
          }
        </ul>
      )}
    </div>
  )

  return (
    <div className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-sm text-left transition-colors",
          "hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10",
          "dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-slate-400 ring-2 ring-slate-900/10 dark:border-slate-500"
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2">
            <InlineBadge carrier={selected} />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {selected.name}
            </span>
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  )
}

// ─── Sub-componente fila de carrier ──────────────────────────────────────────

function CarrierOption({
  carrier,
  isSelected,
  isHighlighted,
  onMouseEnter,
  onClick,
}: {
  carrier: Carrier
  idx: number
  isSelected: boolean
  isHighlighted: boolean
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <li
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
        isHighlighted
          ? "bg-slate-100 dark:bg-slate-800"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
        isSelected && "bg-slate-50 dark:bg-slate-800/40"
      )}
    >
      <Check
        className={cn(
          "h-3.5 w-3.5 shrink-0 text-slate-900 dark:text-white",
          isSelected ? "opacity-100" : "opacity-0"
        )}
      />
      <span
        style={{ backgroundColor: carrier.bg, color: carrier.text }}
        className="inline-flex w-12 items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide"
      >
        {carrier.code}
      </span>
      <span
        className={cn(
          "flex-1 truncate",
          isSelected
            ? "font-medium text-slate-900 dark:text-white"
            : "text-slate-700 dark:text-slate-300"
        )}
      >
        {carrier.name}
      </span>
    </li>
  )
}
