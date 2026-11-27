export type DatosCotizacion = {
  cliente?: string;
  modalidad?: string;
  origen?: string;
  destino?: string;
  mercancia?: string;
  peso?: string;
  volumen?: string;
  bultos?: string;
  incoterm?: string;
  notas?: string;
};

/** Campos sin los cuales pricing no puede cotizar. Ajústalos a tu gusto. */
export const OBLIGATORIOS: (keyof DatosCotizacion)[] = [
  "cliente",
  "modalidad",
  "origen",
  "destino",
  "mercancia",
];

/** Etiquetas que acepta el mensaje (sin tildes, en minúscula) y el campo al que van. */
const ETIQUETAS: Record<string, keyof DatosCotizacion> = {
  cliente: "cliente",
  modalidad: "modalidad",
  modo: "modalidad",
  servicio: "modalidad",
  origen: "origen",
  pol: "origen",
  destino: "destino",
  pod: "destino",
  mercancia: "mercancia",
  producto: "mercancia",
  commodity: "mercancia",
  peso: "peso",
  "peso kg": "peso",
  volumen: "volumen",
  cbm: "volumen",
  medidas: "volumen",
  bultos: "bultos",
  piezas: "bultos",
  pallets: "bultos",
  incoterm: "incoterm",
  notas: "notas",
  comentarios: "notas",
  observaciones: "notas",
};

export const FORMATO_AYUDA = [
  "Para registrar una solicitud, envíe un mensaje que empiece con COTIZACION, así:",
  "",
  "COTIZACION",
  "Cliente: Distribuidora ABC",
  "Modalidad: LCL",
  "Origen: Shenzhen, China",
  "Destino: San Pedro Sula",
  "Mercancía: Repuestos automotrices",
  "Peso: 1200 kg",
  "Volumen: 4.5 cbm",
  "Bultos: 3 pallets",
  "Incoterm: FOB",
  "Notas: Requiere seguro",
  "",
  "Obligatorios: Cliente, Modalidad, Origen, Destino y Mercancía.",
].join("\n");

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_]/g, "")
    .toLowerCase()
    .trim();
}

/** El mensaje es una solicitud si su primera línea dice COTIZACION (con o sin tilde). */
export function esSolicitud(texto: string): boolean {
  const primeraLinea = texto.trim().split(/\r?\n/)[0] ?? "";
  return normalizar(primeraLinea).startsWith("cotizacion");
}

export function parseSolicitud(texto: string) {
  const datos: DatosCotizacion = {};

  for (const linea of texto.split(/\r?\n/)) {
    const idx = linea.indexOf(":");
    if (idx === -1) continue;

    const campo = ETIQUETAS[normalizar(linea.slice(0, idx).replace(/^[\s\-•]+/, ""))];
    const valor = linea.slice(idx + 1).trim();
    if (campo && valor) datos[campo] = valor;
  }

  const faltantes = OBLIGATORIOS.filter((c) => !datos[c]);
  return { datos, faltantes };
}
