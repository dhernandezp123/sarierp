// src/lib/constants/carriers.ts
// Carriers con colores oficiales de marca para badges visuales.
// bg: fondo del badge — text: color del texto
// Fuente de colores: identidad corporativa pública de cada naviera/aerolínea.

export type CarrierType = "ocean" | "air" | "ground"

export interface Carrier {
  code: string         // Código corto, usado como key y en el badge
  name: string         // Nombre completo
  type: CarrierType
  bg: string           // Tailwind bg o hex inline style
  text: string         // Tailwind text o hex inline style
  useTailwind: boolean // true = clases Tailwind / false = inline style (colores no en paleta)
}

export const CARRIERS: Carrier[] = [

  // ─── Ocean ────────────────────────────────────────────────────────────────

  {
    code: "HPL",
    name: "Hapag-Lloyd",
    type: "ocean",
    bg: "#F47920",     // Naranja Hapag-Lloyd
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "MSC",
    name: "MSC",
    type: "ocean",
    bg: "#d1a700",     // Violeta MSC
    text: "#000000",
    useTailwind: false,
  },
  {
    code: "MSK",
    name: "Maersk",
    type: "ocean",
    bg: "#42B0D5",     // Azul celeste Maersk
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "CMA",
    name: "CMA CGM",
    type: "ocean",
    bg: "#E30613",     // Rojo CMA CGM
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "EVG",
    name: "Evergreen",
    type: "ocean",
    bg: "#007A3D",     // Verde Evergreen
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "COSCO",
    name: "COSCO",
    type: "ocean",
    bg: "#C8102E",     // Rojo COSCO
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "ONE",
    name: "Ocean Network Express",
    type: "ocean",
    bg: "#E5007E",     // Rosa/Magenta ONE
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "YML",
    name: "Yang Ming",
    type: "ocean",
    bg: "#003087",     // Azul Yang Ming
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "HMM",
    name: "HMM",
    type: "ocean",
    bg: "#0057A8",     // Azul HMM
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "ZIM",
    name: "ZIM",
    type: "ocean",
    bg: "#00205B",     // Azul marino ZIM
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "PIL",
    name: "Pacific International Lines",
    type: "ocean",
    bg: "#E87722",     // Naranja PIL
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "WHL",
    name: "Wan Hai Lines",
    type: "ocean",
    bg: "#C41230",     // Rojo Wan Hai
    text: "#FFFFFF",
    useTailwind: false,
  },

  // ─── Air ──────────────────────────────────────────────────────────────────

  {
    code: "LH",
    name: "Lufthansa Cargo",
    type: "air",
    bg: "#05164D",     // Azul Lufthansa
    text: "#F9BA00",   // Amarillo Lufthansa
    useTailwind: false,
  },
  {
    code: "AA",
    name: "American Airlines Cargo",
    type: "air",
    bg: "#B11116",     // Rojo AA
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "UA",
    name: "United Cargo",
    type: "air",
    bg: "#002244",     // Azul United
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "EK",
    name: "Emirates SkyCargo",
    type: "air",
    bg: "#D71921",     // Rojo Emirates
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "QR",
    name: "Qatar Airways Cargo",
    type: "air",
    bg: "#5C0631",     // Burdeos Qatar
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "CX",
    name: "Cathay Pacific Cargo",
    type: "air",
    bg: "#006564",     // Verde Cathay
    text: "#FFFFFF",
    useTailwind: false,
  },
  {
    code: "FX",
    name: "FedEx",
    type: "air",
    bg: "#4D148C",     // Violeta FedEx
    text: "#FF6600",   // Naranja FedEx
    useTailwind: false,
  },
  {
    code: "5X",
    name: "UPS Airlines",
    type: "air",
    bg: "#351C15",     // Marrón UPS
    text: "#FFB500",   // Dorado UPS
    useTailwind: false,
  },

  // ─── Ground / Consolidadores ──────────────────────────────────────────────

  {
    code: "DHL",
    name: "DHL Express",
    type: "ground",
    bg: "#FFCC00",     // Amarillo DHL
    text: "#D40511",   // Rojo DHL
    useTailwind: false,
  },
  {
    code: "KING",
    name: "King Logistics",
    type: "ground",
    bg: "#1E3A5F",
    text: "#FFFFFF",
    useTailwind: false,
  },
]

// Helpers

export const OCEAN_CARRIERS  = CARRIERS.filter((c) => c.type === "ocean")
export const AIR_CARRIERS    = CARRIERS.filter((c) => c.type === "air")
export const GROUND_CARRIERS = CARRIERS.filter((c) => c.type === "ground")

export function getCarrier(value?: string | null): Carrier | undefined {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()

  return CARRIERS.find(
    (carrier) =>
      carrier.code.toLowerCase() === normalized ||
      carrier.name.toLowerCase() === normalized
  )
}
