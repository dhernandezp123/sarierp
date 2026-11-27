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
  "Obligatorios: Cliente, Modalidad, Origen, Destino y Mercancía. Las líneas sin etiqueta se guardan como notas.",
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
  "Si repite una solicitud con los mismos datos en 24 horas no se registra de nuevo; para enviarla igual, empiece con COTIZACION NUEVA.",
].join("\n");

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function primeraLinea(texto: string): string {
  return normalizar(texto.trim().split(/\r?\n/)[0] ?? "");
}

/** El mensaje es una solicitud si su primera línea dice COTIZACION (con o sin tilde). */
export function esSolicitud(texto: string): boolean {
  return primeraLinea(texto).startsWith("cotizacion");
}

/** "COTIZACION NUEVA" registra la solicitud aunque repita una de las últimas 24 horas. */
export function esSolicitudNueva(texto: string): boolean {
  return /^cotizacion nueva\b/.test(primeraLinea(texto));
}

/**
 * Lee las líneas "Etiqueta: valor". Las líneas sin etiqueta reconocida (sin ":" o con una
 * etiqueta desconocida) se agregan a notas en el orden del mensaje, junto con el valor de
 * "Notas:"; se omiten las vacías y la primera línea (COTIZACION).
 */
export function parseSolicitud(texto: string) {
  const datos: DatosCotizacion = {};
  const notas: string[] = [];
  let primera = true;

  for (const linea of texto.split(/\r?\n/)) {
    const contenido = linea.trim();
    if (!contenido) continue;
    if (primera) {
      primera = false;
      continue;
    }

    const idx = contenido.indexOf(":");
    const campo = idx === -1 ? undefined : ETIQUETAS[normalizar(contenido.slice(0, idx).replace(/^[\s\-•]+/, ""))];
    if (!campo) {
      notas.push(contenido);
      continue;
    }

    const valor = contenido.slice(idx + 1).trim();
    if (!valor) continue;
    if (campo === "notas") notas.push(valor);
    else datos[campo] = valor;
  }

  if (notas.length) datos.notas = notas.join("\n");
  const faltantes = OBLIGATORIOS.filter((c) => !datos[c]);
  return { datos, faltantes };
}
