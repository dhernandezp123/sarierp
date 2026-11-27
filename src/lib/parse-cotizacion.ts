export type DatosCotizacion = {
  cliente?: string;
  modalidad?: string;
  origen?: string;
  destino?: string;
  mercancia?: string;
  peso?: string;
  volumen?: string;
  /** Dimensiones de los bultos, p. ej. "37x37x10 cms". */
  medidas?: string;
  bultos?: string;
  incoterm?: string;
  /** Valor declarado / FOB de la mercancía, como lo escribió el vendedor. */
  valor?: string;
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

/** Nombre de cada campo en los mensajes de respuesta, en el orden de la plantilla. */
export const ETIQUETA_CAMPO: Record<Exclude<keyof DatosCotizacion, "notas">, string> = {
  cliente: "Cliente",
  modalidad: "Modalidad",
  origen: "Origen",
  destino: "Destino",
  mercancia: "Mercancía",
  peso: "Peso",
  volumen: "Volumen",
  medidas: "Medidas",
  bultos: "Bultos",
  incoterm: "Incoterm",
  valor: "Valor FOB",
};

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
  medidas: "medidas",
  dimensiones: "medidas",
  bultos: "bultos",
  piezas: "bultos",
  pallets: "bultos",
  incoterm: "incoterm",
  valor: "valor",
  "valor fob": "valor",
  "valor mercancia": "valor",
  "valor declarado": "valor",
  notas: "notas",
  comentarios: "notas",
  observaciones: "notas",
};

/** Sin la línea COTIZACION, un mensaje es solicitud si trae al menos estas etiquetas, incluida Cliente. */
const MINIMO_ETIQUETAS_SIN_ENCABEZADO = 3;

export const FORMATO_AYUDA = [
  "Para registrar una solicitud, envíe un mensaje así (la primera línea COTIZACION es opcional si incluye Cliente y al menos tres datos):",
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
  "Medidas: 120x100x90 cms",
  "Bultos: 3 pallets",
  "Incoterm: FOB",
  "Valor FOB: USD 8,500",
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

/**
 * Separa una etiqueta reconocida escrita dentro de la misma línea tras ".", ";" o "|"
 * ("Notas: Requiere seguro. Valor FOB: $1,180"). Solo corta si lo que sigue es una etiqueta
 * conocida, así "HIDROMAC S.A. Calle 19" o "Atlántico | Barranquilla" no se parten.
 */
function separarEtiquetasInternas(linea: string): string[] {
  const partes: string[] = [];
  let inicio = 0;
  for (const corte of linea.matchAll(/[.;|]\s+/g)) {
    const fin = corte.index! + corte[0].length;
    if (campoDe(linea.slice(fin))) {
      partes.push(linea.slice(inicio, corte.index! + 1).replace(/\s*\|$/, "").trim());
      inicio = fin;
    }
  }
  partes.push(linea.slice(inicio).trim());
  return partes.filter(Boolean);
}

function lineas(texto: string): string[] {
  return texto.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean).flatMap(separarEtiquetasInternas);
}

function primeraLinea(texto: string): string {
  return normalizar(lineas(texto)[0] ?? "");
}

function tieneEncabezado(texto: string): boolean {
  return primeraLinea(texto).startsWith("cotizacion");
}

/** Campo de una línea "Etiqueta: valor", o undefined si la etiqueta no se reconoce. */
function campoDe(linea: string): { campo: keyof DatosCotizacion; valor: string } | undefined {
  const idx = linea.indexOf(":");
  if (idx === -1) return undefined;
  const campo = ETIQUETAS[normalizar(linea.slice(0, idx).replace(/^[\s\-•]+/, ""))];
  return campo ? { campo, valor: linea.slice(idx + 1).trim() } : undefined;
}

/**
 * Es solicitud si la primera línea dice COTIZACION (con o sin tilde), o si sin esa línea trae al
 * menos tres etiquetas reconocidas con valor y una de ellas es Cliente.
 */
export function esSolicitud(texto: string): boolean {
  if (tieneEncabezado(texto)) return true;
  const campos = lineas(texto).map(campoDe).filter((item) => item && item.valor);
  return campos.length >= MINIMO_ETIQUETAS_SIN_ENCABEZADO && campos.some((item) => item!.campo === "cliente");
}

/** "COTIZACION NUEVA" registra la solicitud aunque repita una de las últimas 24 horas. */
export function esSolicitudNueva(texto: string): boolean {
  return /^cotizacion nueva\b/.test(primeraLinea(texto));
}

/**
 * Lee las líneas "Etiqueta: valor". Las líneas sin etiqueta reconocida (sin ":" o con una
 * etiqueta desconocida) se agregan a notas en el orden del mensaje, junto con el valor de
 * "Notas:"; se omiten las vacías y la línea COTIZACION. Una etiqueta repetida no sobrescribe:
 * en medidas y notas se suma; en el resto, la línea repetida completa va a notas.
 */
export function parseSolicitud(texto: string) {
  const datos: DatosCotizacion = {};
  const notas: string[] = [];
  const medidas: string[] = [];
  const todas = lineas(texto);

  for (const contenido of tieneEncabezado(texto) ? todas.slice(1) : todas) {
    const item = campoDe(contenido);
    if (!item) {
      notas.push(contenido);
      continue;
    }
    const { campo, valor } = item;
    if (!valor) continue;
    if (campo === "notas") notas.push(valor);
    else if (campo === "medidas") medidas.push(valor);
    else if (datos[campo]) notas.push(contenido);
    else datos[campo] = valor;
  }

  if (medidas.length) datos.medidas = medidas.join("; ");
  if (notas.length) datos.notas = notas.join("\n");
  const faltantes = OBLIGATORIOS.filter((c) => !datos[c]);
  return { datos, faltantes };
}

/**
 * Respuesta cuando faltan obligatorios: lo que sí se leyó como plantilla lista para copiar,
 * con los campos que faltan vacíos, para que el vendedor solo los complete.
 */
export function mensajeFaltantes(datos: DatosCotizacion, faltantes: (keyof DatosCotizacion)[]): string {
  const nombres = faltantes.map((campo) => ETIQUETA_CAMPO[campo as Exclude<keyof DatosCotizacion, "notas">] ?? campo);
  const plantilla = ["COTIZACION"];
  for (const [campo, etiqueta] of Object.entries(ETIQUETA_CAMPO) as [Exclude<keyof DatosCotizacion, "notas">, string][]) {
    if (datos[campo]) plantilla.push(`${etiqueta}: ${datos[campo]}`);
    else if (faltantes.includes(campo)) plantilla.push(`${etiqueta}: `);
  }
  if (datos.notas) plantilla.push(...datos.notas.split("\n").map((nota) => `Notas: ${nota}`));
  return [
    `Faltan datos obligatorios: ${nombres.join(", ")}.`,
    "Esto es lo que se leyó. Copie el mensaje, complete lo que falta y envíelo de nuevo:",
    "",
    ...plantilla,
  ].join("\n");
}
